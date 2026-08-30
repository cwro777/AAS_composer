/**
 * 전역 식별자 고쳐 쓰기.
 *
 * 식별자를 그냥 바꾸면 **그것을 가리키던 참조가 끊긴다.** Relationship의 first·second,
 * ReferenceElement의 value, Shell의 derivedFrom, Qualifier의 valueId … 전부 키 안에
 * 식별자 문자열을 그대로 담고 있기 때문이다. 그래서 이름 바꾸기는 한 노드의 일이 아니라
 * 문서 전체의 일이고, 명령 하나(batch)로 묶여야 실행취소가 온전해진다.
 *
 * `raw`는 건드리지 않는다. 우리가 해석하지 못한 남의 데이터를 문자열 치환으로
 * 헤집는 것이 끊긴 참조보다 더 나쁘다. 대신 `identifierIsReferencedInRaw()`가
 * 그런 경우를 알려 준다.
 */

import type { Cmd } from './command.js';
import { type AasDoc, type AasNodeType, type Json, type NodeId, isIdentifiable } from './model.js';

/** Identifiable 종류마다 쓰는 경로 마디. 저장소의 기존 식별자들이 이 꼴이다. */
const SEGMENT: Partial<Record<AasNodeType, string>> = {
  shell: 'aas',
  submodel: 'sm',
};

/** `IMM150_AAS` → `imm150-aas`, `RatedPower` → `rated-power` */
export function slugify(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function identifierOf(doc: AasDoc, id: NodeId): string {
  const n = doc.nodes[id];
  return n && isIdentifiable(n.t) ? ((n as { identifier?: string }).identifier ?? '') : '';
}

/** 문서가 이미 쓰고 있는 전역 식별자들 */
export function takenIdentifiers(doc: AasDoc, except?: NodeId): Set<string> {
  const out = new Set<string>();
  for (const id of Object.keys(doc.nodes)) {
    if (id === except) continue;
    const v = identifierOf(doc, id);
    if (v) out.add(v);
  }
  return out;
}

/**
 * 후보를 문서 안에서 **유일하게** 만든다. 겹치지 않으면 그대로 돌려준다.
 *
 * 전역 식별자의 유일성 범위는 문서 전체다. 형제 안에서만 이름을 겹치지 않게 해서는
 * 부족하다 — 다른 셸 아래의 서브모델과 얼마든지 부딪힌다.
 */
export function uniqueIdentifier(doc: AasDoc, candidate: string, except?: NodeId): string {
  if (!candidate) return candidate;
  const taken = takenIdentifiers(doc, except);
  if (!taken.has(candidate)) return candidate;
  for (let i = 2; i < 10_000; i += 1) {
    const next = `${candidate}-${i}`;
    if (!taken.has(next)) return next;
  }
  return candidate;
}

/**
 * 종류와 이름으로 새 전역 식별자를 발급한다. 문서 안에서 유일하다.
 *
 * 새 노드를 만들 때도, 있는 노드를 고칠 때도 이 한 곳을 쓴다. 발급 규칙이 두 군데로
 * 갈라지면 만든 것과 고친 것의 꼴이 달라진다.
 */
export function mintIdentifier(
  doc: AasDoc,
  t: AasNodeType,
  name: string,
  prefix: string,
  except?: NodeId,
): string | null {
  const base = slugify(name);
  if (!base || !prefix) return null;
  return uniqueIdentifier(
    doc,
    `${prefix.replace(/\/+$/, '')}/${SEGMENT[t] ?? 'id'}/${base}`,
    except,
  );
}

/**
 * 네임스페이스 안쪽으로 옮긴 식별자를 제안한다.
 *
 * 이름을 짓는 근거는 idShort이고, 그것이 없으면 옛 식별자의 마지막 마디를 쓴다.
 * 이미 쓰이는 값이면 뒤에 번호를 붙인다 — 고치자마자 POL-ID-002(중복)가 뜨면 안 된다.
 */
export function suggestIdentifier(doc: AasDoc, node: NodeId, prefix: string): string | null {
  const n = doc.nodes[node];
  if (!n || !isIdentifiable(n.t)) return null;
  const tail = identifierOf(doc, node).split(/[/#]/).filter(Boolean).pop() ?? '';
  return mintIdentifier(doc, n.t, n.idShort || tail || 'item', prefix, node);
}

/** `{ type, keys: [{ type, value }] }` 모양이면 그 keys 배열을 준다 */
function referenceKeys(obj: Record<string, Json>): Json[] | null {
  const keys = obj['keys'];
  return Array.isArray(keys) ? keys : null;
}

/** 참조 키 안의 옛 식별자를 새 것으로. 바뀐 곳이 없으면 changed=false */
function rewrite(value: Json, from: string, to: string): { value: Json; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const r = rewrite(v, from, to);
      if (r.changed) changed = true;
      return r.value;
    });
    return changed ? { value: next as Json, changed } : { value, changed: false };
  }

  if (value === null || typeof value !== 'object') return { value, changed: false };

  const obj = value as Record<string, Json>;
  let changed = false;
  const next: Record<string, Json> = {};

  const keys = referenceKeys(obj);
  if (keys) {
    const nextKeys = keys.map((k) => {
      if (k !== null && typeof k === 'object' && !Array.isArray(k) && k['value'] === from) {
        changed = true;
        return { ...k, value: to } as Json;
      }
      return k;
    });
    if (!changed) return { value, changed: false };
    /* 참조 안에 또 참조가 들어가는 일은 없다 — 여기서 끝낸다 */
    return { value: { ...obj, keys: nextKeys }, changed: true };
  }

  for (const [k, v] of Object.entries(obj)) {
    const r = rewrite(v, from, to);
    if (r.changed) changed = true;
    next[k] = r.value;
  }
  return changed ? { value: next as Json, changed } : { value, changed: false };
}

/**
 * 식별자를 바꾸는 명령들. **가리키던 참조를 함께 고친다.**
 *
 * 되돌리기는 `apply()`가 각 `set`의 이전 값을 담아 주므로 따로 만들 필요가 없다.
 * 바꿀 것이 없으면 빈 배열이다.
 */
export function renameIdentifier(doc: AasDoc, node: NodeId, next: string): Cmd[] {
  const from = identifierOf(doc, node);
  if (!from || from === next || !next) return [];

  const cmds: Cmd[] = [{ t: 'set', node, path: 'identifier', value: next }];

  for (const id of Object.keys(doc.nodes)) {
    const n = doc.nodes[id]! as unknown as Record<string, Json | undefined>;
    for (const field of Object.keys(n)) {
      /* id·t는 바꿀 수 없고, raw는 손대지 않는다 */
      if (field === 'id' || field === 't' || field === 'raw' || field === 'identifier') continue;
      const v = n[field];
      if (v === null || v === undefined || typeof v !== 'object') continue;
      const r = rewrite(v, from, next);
      if (r.changed) cmds.push({ t: 'set', node: id, path: field, value: r.value });
    }
  }

  return cmds;
}

/**
 * 해석하지 못한 `raw` 안에 그 식별자가 남아 있는가.
 *
 * 남아 있다면 이름을 바꿔도 그쪽은 옛 값을 가리킨 채다. 조용히 두지 않고 알린다.
 */
export function identifierIsReferencedInRaw(doc: AasDoc, identifier: string): boolean {
  if (!identifier) return false;
  for (const id of Object.keys(doc.nodes)) {
    const raw = doc.nodes[id]!.raw;
    if (raw && JSON.stringify(raw).includes(identifier)) return true;
  }
  return doc.raw ? JSON.stringify(doc.raw).includes(identifier) : false;
}
