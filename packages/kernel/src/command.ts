/**
 * 명령 — 실행취소·버전·감사·일괄생성이 전부 여기서 나온다.
 *
 * 규칙: 문서는 `apply()`를 거치지 않고는 바뀌지 않는다.
 * 거부는 예외가 아니라 값으로 돌아온다. UI가 코드를 메시지로 번역한다.
 */

import {
  type AasDoc,
  type AasNode,
  type AasNodeType,
  type Json,
  type NodeId,
  type OpSlot,
  MODEL_TYPE,
  canContain,
  childrenOf,
  parentOf,
  subtreeOf,
} from './model.js';

export type Cmd =
  | { t: 'insert'; parent: NodeId | null; index: number; node: AasNode }
  | { t: 'remove'; node: NodeId }
  | { t: 'move'; node: NodeId; parent: NodeId | null; index: number }
  | { t: 'set'; node: NodeId; path: string; value: Json }
  | { t: 'batch'; label: string; cmds: Cmd[] };

export type Reject =
  | { code: 'CONTAINMENT'; parent: AasNodeType; child: AasNodeType }
  | { code: 'CYCLE' }
  | { code: 'ALREADY_PARENTED' }
  | { code: 'LIST_TYPE_MISMATCH'; expected: string; got: string }
  | { code: 'UNKNOWN_NODE'; node: NodeId }
  | { code: 'DUPLICATE_NODE'; node: NodeId }
  | { code: 'ROOT_NOT_ALLOWED'; child: AasNodeType }
  | { code: 'INVALID_PATH'; path: string };

export interface ApplyResult {
  doc: AasDoc;
  /** 역명령. 여러 개일 때는 배열 순서대로 적용하면 원문서로 돌아온다. */
  undo: Cmd[];
  rejected?: Reject;
}

/* ── 얕은 복사 헬퍼 — 구조 공유로 불변 갱신 ─────────────── */

function cloneDoc(doc: AasDoc): AasDoc {
  return {
    schema: doc.schema,
    nodes: { ...doc.nodes },
    order: { ...doc.order },
    parent: { ...doc.parent },
    roots: [...doc.roots],
    ...(doc.raw ? { raw: doc.raw } : {}),
  };
}

function detach(doc: AasDoc, id: NodeId): number {
  const p = parentOf(doc, id);
  const list = p === null ? doc.roots : (doc.order[p] ?? []);
  const idx = list.indexOf(id);
  if (idx < 0) return -1;
  const next = list.slice(0, idx).concat(list.slice(idx + 1));
  if (p === null) doc.roots = next;
  else doc.order[p] = next;
  return idx;
}

function attach(doc: AasDoc, id: NodeId, parent: NodeId | null, index: number): void {
  const list = parent === null ? doc.roots : (doc.order[parent] ?? []);
  const i = Math.max(0, Math.min(index, list.length));
  const next = list.slice(0, i).concat([id], list.slice(i));
  if (parent === null) doc.roots = next;
  else doc.order[parent] = next;
  doc.parent[id] = parent;
}

/**
 * AASd-120 — SubmodelElementList의 직속 자식은 idShort를 가질 수 없다.
 * 문서에서 비워 두고, 화면 표시 이름은 `Layout.label`이 담당한다.
 * (프로토타입은 직렬화 시점에만 생략해서 왕복이 깨졌다.)
 */
function normalizeForParent(node: AasNode, parent: NodeId | null, doc: AasDoc): AasNode {
  const p = parent === null ? null : doc.nodes[parent];
  let next = node;
  if (!!p && p.t === 'sml' && node.idShort !== '') next = { ...next, idShort: '' };
  /* opSlot은 부모가 Operation일 때만 의미가 있다. 아니면 지우고, 맞으면 기본값을 채운다. */
  const underOp = !!p && p.t === 'op';
  if (underOp && !next.opSlot) next = { ...next, opSlot: 'in' };
  if (!underOp && next.opSlot) {
    const { opSlot: _drop, ...rest } = next as AasNode & { opSlot?: unknown };
    next = rest as AasNode;
  }
  return next;
}

/**
 * Operation의 자식 순서는 슬롯 그룹 순서(in → out → inout)로 정규화한다.
 *
 * 왜 필요한가: JSON은 Operation의 자식을 inputVariables·outputVariables·inoutputVariables
 * 세 배열로 나눠 담는다. 슬롯이 뒤섞인 하나의 순서는 JSON으로 표현할 수 없으므로,
 * 문서 쪽을 표현 가능한 형태로 맞춘다. 그룹 안의 상대 순서는 그대로 보존된다(안정 정렬).
 */
const OP_SLOT_RANK: Record<OpSlot, number> = { in: 0, out: 1, inout: 2 };

function resortOpChildren(doc: AasDoc, parent: NodeId | null): void {
  if (parent === null) return;
  const p = doc.nodes[parent];
  if (!p || p.t !== 'op') return;
  const kids = doc.order[parent] ?? [];
  const ranked = kids.map((id, i) => ({
    id,
    r: OP_SLOT_RANK[doc.nodes[id]?.opSlot ?? 'in'],
    i,
  }));
  ranked.sort((a, b) => a.r - b.r || a.i - b.i);
  doc.order[parent] = ranked.map((x) => x.id);
}

/** 루트에 올 수 있는 노드 — Shell과 독립 Submodel만 */
function canBeRoot(t: AasNodeType): boolean {
  return t === 'shell' || t === 'submodel';
}

function listTypeOk(doc: AasDoc, parent: NodeId | null, childType: AasNodeType): Reject | null {
  if (parent === null) return null;
  const p = doc.nodes[parent];
  if (!p || p.t !== 'sml') return null;
  const expected = p.typeValueListElement;
  const got = MODEL_TYPE[childType];
  return expected && expected !== got ? { code: 'LIST_TYPE_MISMATCH', expected, got } : null;
}

function placementCheck(
  doc: AasDoc,
  parent: NodeId | null,
  childType: AasNodeType,
): Reject | null {
  if (parent === null) {
    return canBeRoot(childType) ? null : { code: 'ROOT_NOT_ALLOWED', child: childType };
  }
  const p = doc.nodes[parent];
  if (!p) return { code: 'UNKNOWN_NODE', node: parent };
  if (!canContain(p.t, childType)) {
    return { code: 'CONTAINMENT', parent: p.t, child: childType };
  }
  return listTypeOk(doc, parent, childType);
}

/* ── set 경로 ────────────────────────────────────────────
 * 노드의 얕은 필드 하나를 지정한다. 중첩은 'raw.<key>'만 허용한다.
 * 문서 구조(부모·순서·id)는 set으로 바꿀 수 없다 — move/insert/remove가 담당한다.
 */
const FORBIDDEN_SET_PATHS = new Set(['id', 't']);

function readPath(node: AasNode, path: string): Json | undefined {
  const rec = node as unknown as Record<string, Json | undefined>;
  if (path.startsWith('raw.')) {
    const key = path.slice(4);
    const raw = node.raw ?? {};
    return raw[key];
  }
  return rec[path];
}

function writePath(node: AasNode, path: string, value: Json): AasNode {
  if (path.startsWith('raw.')) {
    const key = path.slice(4);
    const raw = { ...(node.raw ?? {}) };
    if (value === undefined || value === null) delete raw[key];
    else raw[key] = value;
    const next = { ...node } as AasNode;
    if (Object.keys(raw).length) (next as { raw?: Record<string, Json> }).raw = raw;
    else delete (next as { raw?: Record<string, Json> }).raw;
    return next;
  }
  const next = { ...node } as unknown as Record<string, unknown>;
  if (value === null) delete next[path];
  else next[path] = value;
  return next as unknown as AasNode;
}

/* ── apply ──────────────────────────────────────────────── */

export function apply(doc: AasDoc, cmd: Cmd): ApplyResult {
  switch (cmd.t) {
    case 'insert': {
      if (doc.nodes[cmd.node.id]) {
        return { doc, undo: [], rejected: { code: 'DUPLICATE_NODE', node: cmd.node.id } };
      }
      const bad = placementCheck(doc, cmd.parent, cmd.node.t);
      if (bad) return { doc, undo: [], rejected: bad };

      const d = cloneDoc(doc);
      d.nodes[cmd.node.id] = normalizeForParent(cmd.node, cmd.parent, d);
      d.order[cmd.node.id] = [];
      attach(d, cmd.node.id, cmd.parent, cmd.index);
      resortOpChildren(d, cmd.parent);
      return { doc: d, undo: [{ t: 'remove', node: cmd.node.id }] };
    }

    case 'remove': {
      const target = doc.nodes[cmd.node];
      if (!target) return { doc, undo: [], rejected: { code: 'UNKNOWN_NODE', node: cmd.node } };

      const ids = subtreeOf(doc, cmd.node);
      const d = cloneDoc(doc);
      const idx = detach(d, cmd.node);
      const parent = parentOf(doc, cmd.node);

      /* 역명령: 서브트리를 전위 순서로 되살린다 (부모가 항상 먼저 존재) */
      const undo: Cmd[] = [];
      for (const id of ids) {
        const node = doc.nodes[id]!;
        const p = id === cmd.node ? parent : parentOf(doc, id);
        const i =
          id === cmd.node
            ? idx
            : (p === null ? doc.roots : childrenOf(doc, p)).indexOf(id);
        undo.push({ t: 'insert', parent: p, index: i, node });
      }

      for (const id of ids) {
        delete d.nodes[id];
        delete d.order[id];
        delete d.parent[id];
      }
      return { doc: d, undo };
    }

    case 'move': {
      if (!doc.nodes[cmd.node]) {
        return { doc, undo: [], rejected: { code: 'UNKNOWN_NODE', node: cmd.node } };
      }
      const node = doc.nodes[cmd.node]!;
      const bad = placementCheck(doc, cmd.parent, node.t);
      if (bad) return { doc, undo: [], rejected: bad };

      /* 자기 서브트리 안으로는 못 들어간다 */
      if (cmd.parent !== null) {
        let p: NodeId | null = cmd.parent;
        while (p) {
          if (p === cmd.node) return { doc, undo: [], rejected: { code: 'CYCLE' } };
          p = parentOf(doc, p);
        }
      }

      const oldParent = parentOf(doc, cmd.node);
      const oldIndex = (oldParent === null ? doc.roots : childrenOf(doc, oldParent)).indexOf(
        cmd.node,
      );
      const d = cloneDoc(doc);
      if (oldParent !== null) d.order[oldParent] = [...(d.order[oldParent] ?? [])];
      detach(d, cmd.node);
      attach(d, cmd.node, cmd.parent, cmd.index);
      const normalized = normalizeForParent(node, cmd.parent, d);
      d.nodes[cmd.node] = normalized;
      resortOpChildren(d, cmd.parent);

      /* List 안으로 옮기면서 idShort를 비웠다면, 되돌릴 때 이름도 복구해야 한다.
         이 한 줄이 없으면 apply → undo가 원문서로 돌아오지 않는다. */
      const undo: Cmd[] = [];

      /**
       * **opSlot은 옮기기 전에 되돌린다.**
       *
       * Operation 밖으로 나가면 opSlot이 지워진다. 그 상태로 먼저 되돌려 넣으면
       * `normalizeForParent`가 기본값 'in'을 채우고 `resortOpChildren`이 그 값으로
       * 자리를 다시 매긴다 — 그 뒤에 슬롯을 고쳐도 그룹 안 상대 순서는 이미 어긋나 있다.
       * 정렬은 안정적이므로 **슬롯이 먼저 맞아야** 자리가 맞는다.
       */
      if (normalized.opSlot !== node.opSlot) {
        undo.push({ t: 'set', node: cmd.node, path: 'opSlot', value: node.opSlot ?? null });
      }
      undo.push({ t: 'move', node: cmd.node, parent: oldParent, index: oldIndex });
      if (normalized.idShort !== node.idShort) {
        undo.push({ t: 'set', node: cmd.node, path: 'idShort', value: node.idShort });
      }
      return { doc: d, undo };
    }

    case 'set': {
      const node = doc.nodes[cmd.node];
      if (!node) return { doc, undo: [], rejected: { code: 'UNKNOWN_NODE', node: cmd.node } };
      if (FORBIDDEN_SET_PATHS.has(cmd.path) || cmd.path.includes('..')) {
        return { doc, undo: [], rejected: { code: 'INVALID_PATH', path: cmd.path } };
      }
      const before = readPath(node, cmd.path);
      const d = cloneDoc(doc);
      d.nodes[cmd.node] = writePath(node, cmd.path, cmd.value);
      if (cmd.path === 'opSlot') {
        const p = parentOf(d, cmd.node);
        if (p !== null) d.order[p] = [...(d.order[p] ?? [])];
        resortOpChildren(d, p);
      }
      const undo: Cmd[] = [{ t: 'set', node: cmd.node, path: cmd.path, value: before ?? null }];

      /**
       * 슬롯을 바꾸면 형제 순서가 다시 매겨진다. 값을 되돌리는 것만으로는
       * 자리가 돌아오지 않는다 — 정렬이 안정적이라 옮겨진 상대 순서가 그대로 남는다.
       * 그래서 원래 자리로 한 번 더 옮긴다. 부모의 순서는 늘 정규화되어 있으므로
       * (슬롯, 색인) 두 가지면 원래 순서가 복원된다.
       */
      if (cmd.path === 'opSlot') {
        const p = parentOf(doc, cmd.node);
        const at = p === null ? -1 : (doc.order[p] ?? []).indexOf(cmd.node);
        if (p !== null && at >= 0) undo.push({ t: 'move', node: cmd.node, parent: p, index: at });
      }

      return { doc: d, undo };
    }

    case 'batch': {
      let cur = doc;
      const undos: Cmd[] = [];
      for (const c of cmd.cmds) {
        const r = apply(cur, c);
        if (r.rejected) {
          /* 전부 아니면 전무 — 여기까지 적용한 것을 되돌린다 */
          let back = cur;
          for (const u of undos) back = apply(back, u).doc;
          return { doc, undo: [], rejected: r.rejected };
        }
        cur = r.doc;
        undos.unshift(...r.undo);
      }
      return { doc: cur, undo: [{ t: 'batch', label: `undo:${cmd.label}`, cmds: undos }] };
    }
  }
}

/** 여러 명령을 순서대로 적용. 하나라도 거부되면 원문서와 사유를 돌려준다. */
export function applyAll(doc: AasDoc, cmds: Cmd[]): ApplyResult {
  return apply(doc, { t: 'batch', label: 'applyAll', cmds });
}

/** 역명령 배열을 순서대로 적용해 되돌린다. */
export function undoAll(doc: AasDoc, undo: Cmd[]): AasDoc {
  let cur = doc;
  for (const u of undo) cur = apply(cur, u).doc;
  return cur;
}
