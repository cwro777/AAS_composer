/**
 * 템플릿 레지스트리 — 정의(JSON)를 읽고, 문서에 삽입할 명령 배열로 만든다.
 *
 * 삽입 결과에는 `origin`(templateId·version)이 남는다. L3 적합성 검사가 이 값을 본다.
 */

import {
  type AasDoc,
  type Cmd,
  type NodeId,
  newNode,
  parentOf,
  uniqueIdentifier,
} from '@aas/kernel';

import type { ElementDef, MigrationDef, TemplateDef, Verified } from './types.js';

import nameplate from './idta/nameplate.json' with { type: 'json' };
import technical from './idta/technical.json' with { type: 'json' };
import handover from './idta/handover.json' with { type: 'json' };
import timeseries from './idta/timeseries.json' with { type: 'json' };
import carbon from './idta/carbon.json' with { type: 'json' };
import operational from './idta/operational.json' with { type: 'json' };
import hierarchical from './idta/hierarchical.json' with { type: 'json' };
import aidMqtt from './idta/aid-mqtt.json' with { type: 'json' };
import aidOpcua from './idta/aid-opcua.json' with { type: 'json' };
import nameplate20to30 from './migrations/nameplate-2-0__3-0.json' with { type: 'json' };

export type { ElementDef, MigrationDef, TemplateDef, Verified } from './types.js';

const DEFS = [
  nameplate,
  technical,
  handover,
  timeseries,
  carbon,
  operational,
  hierarchical,
  aidMqtt,
  aidOpcua,
] as unknown as TemplateDef[];

const BY_ID = new Map<string, TemplateDef>(DEFS.map((d) => [d.id, d]));

export function listTemplates(): TemplateDef[] {
  return [...DEFS];
}

export function getTemplate(id: string): TemplateDef | undefined {
  return BY_ID.get(id);
}

/** 사양서에서 대조하지 못한 항목 — UI가 배지로 드러내고 배포 전 확인이 필요하다. */
export function unverifiedOf(def: TemplateDef): Array<{ path: string; source?: string }> {
  const out: Array<{ path: string; source?: string }> = [];
  if (def.submodel.verified === 'none') {
    out.push({ path: def.submodel.idShort, source: '(서브모델 semanticId)' });
  }
  const walk = (els: ElementDef[], prefix: string): void => {
    for (const e of els) {
      const path = `${prefix}/${e.idShort}`;
      if (e.verified === 'none') out.push({ path, ...(e.source ? { source: e.source } : {}) });
      if (e.children?.length) walk(e.children, path);
    }
  };
  walk(def.elements, def.submodel.idShort);
  return out;
}

export interface InstantiateOptions {
  /** 노드 id 생성기. 결정적인 id가 필요한 테스트에서 주입한다. */
  newId: () => NodeId;
  /** 서브모델 인스턴스의 전역 식별자. 없으면 idPattern으로 만든다. */
  namespace?: string;
  assetSlug?: string;
  /** 붙일 Shell. 없으면 루트에 독립 서브모델로 놓는다. */
  shell?: NodeId | null;
  /**
   * 넣을 문서. 주면 서브모델의 전역 식별자를 **그 안에서 유일하게** 만든다.
   * 같은 템플릿을 두 번 넣으면 idPattern이 같은 값을 두 번 내놓기 때문이다.
   */
  doc?: AasDoc;
  /** 필수 요소만 넣는다. 기본은 전부. */
  requiredOnly?: boolean;
  /** exampleValue를 값으로 채운다. 기본 true — 빈 모델보다 채워진 모델이 검토하기 쉽다. */
  withExamples?: boolean;
}

/* ── 사내 네임스페이스 자리표시 `{ns}` ─────────────────────────────
   사내 정의 템플릿의 개념은 우리 이름으로 발행한다. 도메인을 JSON에 박으면 네임스페이스를
   바꾸는 순간 그 템플릿만 남의(옛) 도메인으로 개념을 발행한다 — 실제로 bnb.co.kr이 남았다. */

const NS = '{ns}';
const DEFAULT_NS = 'https://example.com/ids';

/** `{ns}`를 치환한다. 네임스페이스를 모르면 null — 자리표시를 그대로 문서에 넣지 않는다 */
export function resolveTemplateValue(value: string, ns: string | null | undefined): string | null {
  if (!value.includes(NS)) return value;
  if (!ns) return null;
  return value.split(NS).join(ns.replace(/\/+$/, ''));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 문서의 값이 템플릿 값을 따르는가. `{ns}` 자리는 **어느 IRI 네임스페이스든** 받는다 —
 * 네임스페이스를 바꾸기 전에 만든 모델이 적합성 경고로 뒤덮이면 안 된다.
 */
export function conformsToTemplateValue(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false;
  if (!expected.includes(NS)) return actual === expected;
  const re = new RegExp(`^${expected.split(NS).map(escapeRe).join('https?://\\S+?')}$`);
  return re.test(actual);
}

/** 인스턴스의 식별자를 idPattern에 맞춰 네임스페이스를 되읽는다. 못 읽으면 null */
function namespaceOf(def: TemplateDef, identifier: string | undefined): string | null {
  if (!identifier || !def.submodel.idPattern.includes(NS)) return null;
  const re = new RegExp(
    `^${escapeRe(def.submodel.idPattern).replace(escapeRe(NS), '(https?://.+?)').replace(escapeRe('{asset}'), '[^/]+')}(?:-\\d+)?$`,
  );
  return re.exec(identifier)?.[1] ?? null;
}

function identifierFor(def: TemplateDef, o: InstantiateOptions): string {
  const ns = o.namespace ?? DEFAULT_NS;
  const asset = o.assetSlug ?? 'asset';
  const id = def.submodel.idPattern.replace('{ns}', ns).replace('{asset}', asset);
  /* 문서를 알 때만 유일성을 보장할 수 있다. 모르면 패턴 그대로 — 조용히 바꾸지 않는다. */
  return o.doc ? uniqueIdentifier(o.doc, id) : id;
}

/**
 * 템플릿 하나를 문서에 넣는 명령 배열을 만든다.
 * 반환값을 `apply(doc, {t:'batch', ...})`에 넣으면 삽입이 하나의 실행취소 단위가 된다.
 */
export function instantiate(def: TemplateDef, opts: InstantiateOptions): Cmd {
  const cmds: Cmd[] = [];
  const origin = { templateId: def.id, version: def.version };
  const withExamples = opts.withExamples !== false;

  const ns = opts.namespace ?? DEFAULT_NS;
  const smId = opts.newId();
  const smSemanticId = resolveTemplateValue(def.submodel.semanticId, ns);
  const smSupplemental = def.submodel.supplementalSemanticIds
    ?.map((v) => resolveTemplateValue(v, ns))
    .filter((v): v is string => !!v);
  cmds.push({
    t: 'insert',
    parent: opts.shell ?? null,
    index: Number.MAX_SAFE_INTEGER,
    node: newNode(smId, 'submodel', {
      idShort: def.submodel.idShort,
      identifier: identifierFor(def, opts),
      kind: 'Instance',
      ...(smSemanticId ? { semanticId: smSemanticId } : {}),
      ...(smSupplemental?.length ? { supplementalSemanticIds: smSupplemental } : {}),
      origin,
    }),
  });

  const put = (e: ElementDef, parent: NodeId): void => {
    if (opts.requiredOnly && !e.required) return;
    /* 인스턴스 데이터 없이는 규격을 만족할 수 없는 요소는 정의만 남기고 넣지 않는다. */
    if (e.autoInsert === false) return;
    cmds.push(...elementCmds(e, parent, opts.newId, origin, withExamples, Number.MAX_SAFE_INTEGER, ns));
  };

  for (const e of def.elements) put(e, smId);
  return { t: 'batch', label: `template:${def.id}@${def.version}`, cmds };
}

/**
 * 템플릿 요소 하나(와 그 자손)를 넣는 명령.
 *
 * `instantiate`와 퀵픽스가 같은 코드를 쓴다 — 갈라지면 "삽입된 것"과
 * "빠졌다고 지적받아 채운 것"이 서로 달라진다.
 */
export function elementCmds(
  e: ElementDef,
  parent: NodeId,
  newId: () => NodeId,
  origin: { templateId: string; version: string },
  withExamples: boolean,
  index: number,
  /** `{ns}` 치환용. 모르면 `{ns}`가 든 값은 넣지 않는다 — 자리표시를 문서에 남기지 않는다 */
  ns: string | null = null,
): Cmd[] {
  const cmds: Cmd[] = [];
  const put = (d: ElementDef, at: NodeId, idx: number): void => {
    const id = newId();
    const semanticId = d.semanticId ? resolveTemplateValue(d.semanticId, ns) : null;
    const supplemental = d.supplementalSemanticIds
      ?.map((v) => resolveTemplateValue(v, ns))
      .filter((v): v is string => !!v);
    const listElement = d.semanticIdListElement ? resolveTemplateValue(d.semanticIdListElement, ns) : null;
    cmds.push({
      t: 'insert',
      parent: at,
      index: idx,
      node: newNode(id, d.t, {
        idShort: d.idShort,
        ...(semanticId ? { semanticId } : {}),
        ...(supplemental?.length ? { supplementalSemanticIds: supplemental } : {}),
        ...(d.valueType ? { valueType: d.valueType } : {}),
        ...(withExamples && d.exampleValue !== undefined ? { value: d.exampleValue } : {}),
        ...(withExamples && d.langs ? { langs: d.langs } : {}),
        ...(d.min !== undefined ? { min: d.min } : {}),
        ...(d.max !== undefined ? { max: d.max } : {}),
        ...(d.contentType ? { contentType: d.contentType } : {}),
        ...(d.entityType ? { entityType: d.entityType } : {}),
        ...(d.typeValueListElement ? { typeValueListElement: d.typeValueListElement } : {}),
        ...(listElement ? { semanticIdListElement: listElement } : {}),
        ...(d.valueTypeListElement ? { valueTypeListElement: d.valueTypeListElement } : {}),
        origin,
      }),
    });
    /* 자손은 정의 순서대로. autoInsert:false인 것은 여기서도 넣지 않는다 */
    let k = 0;
    for (const c of d.children ?? []) {
      if (c.autoInsert === false) continue;
      put(c, id, k++);
    }
  };

  put(e, parent, index);
  return cmds;
}

/* ── L3 적합성 — 삽입 후에도 템플릿이 계약으로 남는다 ─────────── */

export interface Conformance {
  code: 'T-001' | 'T-002' | 'T-003';
  node: NodeId | null;
  path: string;
  message: { ko: string; en: string };
}

/** 인스턴스가 자기 템플릿을 여전히 지키는가 */
export function checkConformance(doc: AasDoc, submodelId: NodeId): Conformance[] {
  const sm = doc.nodes[submodelId];
  if (!sm?.origin) return [];
  const def = BY_ID.get(sm.origin.templateId);
  if (!def) return [];

  const out: Conformance[] = [];
  const byShort = (parent: NodeId): Map<string, NodeId> =>
    new Map((doc.order[parent] ?? []).map((c) => [doc.nodes[c]?.idShort ?? '', c]));

  /* idShort를 바꿔 쓰는 요소는 semanticId로 대조한다 (템플릿의 editableIdShort). */
  const bySemantic = (parent: NodeId, semanticId: string): NodeId | undefined =>
    (doc.order[parent] ?? []).find((c) => conformsToTemplateValue(doc.nodes[c]?.semanticId, semanticId));
  /* 메시지에 보일 기대값 — 네임스페이스를 되읽을 수 있으면 실제 값으로, 아니면 자리표시로 */
  const ns = namespaceOf(def, sm.t === 'submodel' ? sm.identifier : undefined);
  const shown = (v: string): string => resolveTemplateValue(v, ns) ?? v.split(NS).join('<사내 네임스페이스>');

  const walk = (els: ElementDef[], parent: NodeId, prefix: string): void => {
    /* List 직속 자식은 idShort가 없다(AASd-120). 이름 대신 위치로 대조한다. */
    const parentIsList = doc.nodes[parent]?.t === 'sml';
    const present = parentIsList ? new Map<string, NodeId>() : byShort(parent);
    const positional = doc.order[parent] ?? [];
    for (const [i, e] of els.entries()) {
      const id = parentIsList
        ? positional[i]
        : e.editableIdShort && e.semanticId
          ? bySemantic(parent, e.semanticId)
          : present.get(e.idShort);
      const path = `${prefix}/${e.idShort}`;
      if (!id) {
        if (e.required) {
          out.push({
            code: 'T-001',
            node: parent,
            path,
            message: {
              ko: `템플릿 필수 요소 ${e.idShort}이(가) 없습니다.`,
              en: `Required template element ${e.idShort} is missing.`,
            },
          });
        }
        continue;
      }
      const node = doc.nodes[id]!;
      if (e.semanticId && node.semanticId && !conformsToTemplateValue(node.semanticId, e.semanticId)) {
        out.push({
          code: 'T-002',
          node: id,
          path,
          message: {
            ko: `semanticId가 템플릿과 다릅니다. 템플릿: ${shown(e.semanticId)}`,
            en: `semanticId deviates from the template. Expected ${shown(e.semanticId)}`,
          },
        });
      }
      if (e.children?.length) walk(e.children, id, path);
    }
  };

  if (sm.semanticId && !conformsToTemplateValue(sm.semanticId, def.submodel.semanticId)) {
    out.push({
      code: 'T-003',
      node: submodelId,
      path: sm.idShort,
      message: {
        ko: `서브모델 semanticId가 템플릿 ${def.idtaNumber}과 다릅니다. 템플릿: ${shown(def.submodel.semanticId)}`,
        en: `Submodel semanticId deviates from template ${def.idtaNumber}. Expected ${shown(def.submodel.semanticId)}`,
      },
    });
  }
  walk(def.elements, submodelId, sm.idShort);
  return out;
}

/* ── 템플릿 개정 마이그레이션 ──────────────────────────────── */

const MIGRATIONS = [nameplate20to30] as unknown as MigrationDef[];
const MIG_BY_ID = new Map<string, MigrationDef>(MIGRATIONS.map((m) => [m.id, m]));

export function listMigrations(): MigrationDef[] {
  return [...MIGRATIONS];
}

export function getMigration(id: string): MigrationDef | undefined {
  return MIG_BY_ID.get(id);
}

/** 이 서브모델에 적용할 수 있는 개정 매핑 (T-005의 근거) */
export function migrationsFor(doc: AasDoc, submodelId: NodeId): MigrationDef[] {
  const sm = doc.nodes[submodelId];
  if (!sm || sm.t !== 'submodel') return [];
  return MIGRATIONS.filter((m) => sm.semanticId === m.from.submodelSemanticId);
}

export interface MigrationStep {
  kind: 'submodel-semanticId' | 'semanticId' | 'supplemental' | 'rename' | 'origin';
  node: NodeId;
  path: string;
  before?: string;
  after?: string;
}

export interface MigrationPlan {
  migration: string;
  applicable: boolean;
  reason?: { ko: string; en: string };
  /** 미리보기 — 무엇이 어떻게 바뀌는지 */
  steps: MigrationStep[];
  /** 사람이 판단해야 하는 항목. 문서에 실제로 있는 것만 담는다 */
  manual: Array<{ node: NodeId; path: string; note: { ko: string; en: string } }>;
  /** 적용할 때만 쓴다. apply(doc, plan.cmds) — 하나의 실행취소 단위다 */
  cmds: Cmd;
}

/**
 * 개정 매핑을 문서에 적용할 계획을 세운다. **문서를 바꾸지 않는다.**
 *
 * 먼저 보여주고 승인받는 것이 이 함수의 존재 이유다. 사양서 개정은 서브모델 IRI와
 * 요소 IRDI를 동시에 바꾸므로, 무엇이 바뀌는지 보지 않고 적용하면 되돌리기 어렵다.
 */
export function planMigration(doc: AasDoc, submodelId: NodeId, def: MigrationDef): MigrationPlan {
  const empty = (reason: { ko: string; en: string }): MigrationPlan => ({
    migration: def.id,
    applicable: false,
    reason,
    steps: [],
    manual: [],
    cmds: { t: 'batch', label: `migrate:${def.id}`, cmds: [] },
  });

  const sm = doc.nodes[submodelId];
  if (!sm || sm.t !== 'submodel') {
    return empty({ ko: '서브모델이 아닙니다.', en: 'Not a submodel.' });
  }
  if (sm.semanticId !== def.from.submodelSemanticId) {
    return empty({
      ko: `이 서브모델은 ${def.from.idtaNumber}이 아닙니다. semanticId가 ${sm.semanticId ?? '(없음)'}입니다.`,
      en: `Submodel is not ${def.from.idtaNumber}; its semanticId is ${sm.semanticId ?? '(none)'}.`,
    });
  }

  const steps: MigrationStep[] = [];
  const manual: MigrationPlan['manual'] = [];
  const cmds: Cmd[] = [];

  steps.push({
    kind: 'submodel-semanticId',
    node: submodelId,
    path: sm.idShort,
    before: sm.semanticId,
    after: def.to.submodelSemanticId,
  });
  cmds.push({ t: 'set', node: submodelId, path: 'semanticId', value: def.to.submodelSemanticId });

  if (sm.origin) {
    steps.push({
      kind: 'origin',
      node: submodelId,
      path: sm.idShort,
      before: `${sm.origin.templateId}@${sm.origin.version}`,
      after: `${sm.origin.templateId}@${def.to.version}`,
    });
    cmds.push({
      t: 'set',
      node: submodelId,
      path: 'origin',
      value: { templateId: sm.origin.templateId, version: def.to.version },
    });
  }

  const byShort = new Map(def.elements.map((e) => [e.idShort, e]));
  const manualByShort = new Map(def.manual.map((m) => [m.idShort, m]));

  const walk = (id: NodeId, prefix: string): void => {
    for (const c of doc.order[id] ?? []) {
      const n = doc.nodes[c];
      if (!n) continue;
      const path = `${prefix}/${n.idShort || '·'}`;

      const man = manualByShort.get(n.idShort);
      if (man) manual.push({ node: c, path, note: man.note });

      const m = byShort.get(n.idShort);
      if (m) {
        /* from 값과 다르면 건드리지 않는다. 이미 옮겼거나 사내에서 바꾼 값일 수 있다. */
        if (m.semanticId && n.semanticId === m.semanticId.from) {
          steps.push({ kind: 'semanticId', node: c, path, before: n.semanticId, after: m.semanticId.to });
          cmds.push({ t: 'set', node: c, path: 'semanticId', value: m.semanticId.to });
        }
        if (m.supplementalSemanticIds?.length) {
          const cur = n.supplementalSemanticIds ?? [];
          const add = m.supplementalSemanticIds.filter((s) => !cur.includes(s));
          if (add.length) {
            const after = [...cur, ...add];
            steps.push({
              kind: 'supplemental',
              node: c,
              path,
              before: cur.join(' ') || '(없음)',
              after: after.join(' '),
            });
            cmds.push({ t: 'set', node: c, path: 'supplementalSemanticIds', value: after });
          }
        }
        if (m.rename && n.idShort !== m.rename) {
          steps.push({ kind: 'rename', node: c, path, before: n.idShort, after: m.rename });
          cmds.push({ t: 'set', node: c, path: 'idShort', value: m.rename });
        }
      }
      walk(c, path);
    }
  };
  walk(submodelId, sm.idShort);

  return {
    migration: def.id,
    applicable: true,
    steps,
    manual,
    cmds: { t: 'batch', label: `migrate:${def.id}`, cmds },
  };
}

/**
 * T-003(서브모델 semanticId 이탈)을 고치는 명령 — 템플릿 값으로 되돌린다.
 *
 * **자식은 건드리지 않는다.** 2.0 → 3.0처럼 개정을 건너온 문서는 자식 IRDI도 함께
 * 바뀌어야 하고, 그 매핑을 아는 것은 `planMigration`이다. 여기서 서브모델만 조용히
 * 맞추면 T-003은 사라지고 자식의 T-002만 남는데, 그것이 옳다 — 한 줄을 되돌리는 것과
 * 개정을 옮기는 것은 다른 일이고, 남는 이슈가 다음에 할 일을 가리킨다.
 */
function submodelSemanticIdFix(
  doc: AasDoc,
  node: NodeId,
): { label: { ko: string; en: string }; cmds: Cmd[] } | null {
  const sm = doc.nodes[node];
  if (sm?.t !== 'submodel' || !sm.origin) return null;
  const def = BY_ID.get(sm.origin.templateId);
  if (!def || conformsToTemplateValue(sm.semanticId, def.submodel.semanticId)) return null;

  /* `{ns}`면 이 서브모델의 식별자에서 네임스페이스를 되읽는다. 못 읽으면 고치지 않는다 —
     남의 네임스페이스로 되돌리는 것은 되돌리기가 아니다 */
  const value = resolveTemplateValue(def.submodel.semanticId, namespaceOf(def, sm.identifier));
  if (!value) return null;

  return {
    label: { ko: '템플릿 값으로 되돌리기', en: 'Restore the template semanticId' },
    cmds: [{ t: 'set', node, path: 'semanticId', value }],
  };
}

/**
 * T-001(필수 요소 누락)·T-003(서브모델 semanticId 이탈)을 고치는 명령.
 *
 * 계획서 04장 — **지적만 하는 검증은 결국 무시된다.** 빠진 요소가 무엇인지도,
 * 서브모델의 semanticId가 무엇이어야 하는지도 아는 것은 템플릿이므로,
 * 그것을 눌러서 고칠 수 있어야 한다.
 *
 * T-002(자식 semanticId 이탈)에는 만들지 않는다. 자식을 바꿔 쓰는 데에는 이유가 있을 수
 * 있고(개정 중간 상태·의도적 확장), 어느 쪽이 옳은지 우리가 모른다.
 *
 * 넣는 자리는 템플릿의 형제 순서를 따른다. 이미 있는 형제를 세어 그 뒤에 놓으므로
 * 채워 넣은 요소가 목록 끝에 몰리지 않는다.
 */
export function conformanceFix(
  doc: AasDoc,
  issue: Conformance,
  newId: () => NodeId,
): { label: { ko: string; en: string }; cmds: Cmd[] } | null {
  if (issue.node === null) return null;
  if (issue.code === 'T-003') return submodelSemanticIdFix(doc, issue.node);
  if (issue.code !== 'T-001') return null;
  const parent = issue.node;
  if (!doc.nodes[parent]) return null;

  /* 이 노드를 품은, 템플릿에서 나온 서브모델을 찾는다 */
  let smId: NodeId | null = parent;
  while (smId !== null && doc.nodes[smId]?.t !== 'submodel') smId = parentOf(doc, smId);
  const sm = smId === null ? undefined : doc.nodes[smId];
  if (!sm?.origin) return null;
  const def = BY_ID.get(sm.origin.templateId);
  if (!def) return null;

  /* 경로에서 서브모델 이름을 뺀 나머지를 정의에서 따라 내려간다 */
  const segs = issue.path.split('/').slice(1);
  let siblings: ElementDef[] = def.elements;
  let target: ElementDef | undefined;
  for (const seg of segs) {
    target = siblings.find((e) => e.idShort === seg);
    if (!target) return null;
    siblings = target.children ?? [];
  }
  if (!target) return null;

  /* target이 속한 형제 목록에서, 앞쪽 형제 중 이미 있는 것의 수가 삽입 위치다 */
  let family: ElementDef[] = def.elements;
  for (const seg of segs.slice(0, -1)) {
    family = family.find((e) => e.idShort === seg)?.children ?? [];
  }
  const present = new Set((doc.order[parent] ?? []).map((c) => doc.nodes[c]?.idShort));
  const at = family
    .slice(0, Math.max(0, family.indexOf(target)))
    .filter((e) => present.has(e.idShort)).length;

  return {
    label: {
      ko: `템플릿에서 ${target.idShort} 생성`,
      en: `Create ${target.idShort} from the template`,
    },
    cmds: elementCmds(target, parent, newId, sm.origin, true, at, namespaceOf(def, sm.t === 'submodel' ? sm.identifier : undefined)),
  };
}

/** 문서 전체에서 템플릿 출처를 가진 서브모델을 찾아 검사한다. */
export function checkAllConformance(doc: AasDoc): Conformance[] {
  const out: Conformance[] = [];
  for (const id of Object.keys(doc.nodes)) {
    const n = doc.nodes[id]!;
    if (n.t === 'submodel' && n.origin && parentOf(doc, id) !== undefined) {
      out.push(...checkConformance(doc, id));
    }
  }
  return out;
}
