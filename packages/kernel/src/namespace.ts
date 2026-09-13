/**
 * 사내 네임스페이스 옮기기 — 옛 접두어 아래의 **우리 이름**을 새 접두어로.
 *
 * 네임스페이스를 바꾸면 따라가야 할 것이 세 가지다:
 *   - 전역 식별자(Shell·Submodel) — 가리키던 참조도 함께 (`renameIdentifier`)
 *   - 자산 식별자(globalAssetId)
 *   - 자체 발행 개념의 semanticId — 요소·보조 식별자·목록 항목·Qualifier·Extension·SpecificAssetId
 * 이것을 사람이 하나씩 고치면 반드시 몇 개를 빠뜨리고, 빠진 것은 옛 도메인으로 계속 나간다.
 * 실제로 식별자는 옮겼는데 개념은 옛 도메인에 남은 모델, 표준 IRI의 도메인까지 바꿔 버린
 * 모델이 나왔다.
 *
 * 지키는 것:
 *   - **계획과 적용을 분리한다.** 이 함수는 문서를 바꾸지 않고 무엇이 바뀌는지 돌려준다.
 *   - 명령은 batch 하나다. 실행취소 한 번으로 원문서로 돌아간다.
 *   - **접두어 아래의 값만** 바꾼다. `https://a/ids`는 `https://a/ids2/…`를 건드리지 않는다.
 *   - **표준 네임스페이스는 옮기지 않는다** — admin-shell.io 아래는 IDTA가 정한 이름이다.
 *     IRDI(IEC CDD·eCl@ss)는 IRI가 아니라 애초에 접두어에 걸리지 않는다.
 *   - `raw`는 건드리지 않는다(`renameIdentifier`와 같은 규칙). 남아 있으면 알린다.
 */

import { type Cmd, apply } from './command.js';
import { renameIdentifier, uniqueIdentifier } from './identifier.js';
import { type AasDoc, type Json, type NodeId, isIdentifiable, pathOf } from './model.js';

/** 우리가 옮기면 안 되는 곳 — 남이 정한 이름이다 */
const STANDARD_HOSTS = ['admin-shell.io', 'www.admin-shell.io'];

export type NamespaceMoveRejection = 'NS-EMPTY' | 'NS-NOT-IRI' | 'NS-SAME' | 'NS-NESTED' | 'NS-STANDARD';

export interface NamespaceMoveStep {
  node: NodeId;
  /** 사람이 읽는 위치 — `Shell/Submodel/Element` */
  path: string;
  kind: 'identifier' | 'asset' | 'concept';
  /** `semanticId` · `qualifiers[0].semanticId` · `identifier` … */
  field: string;
  before: string;
  after: string;
}

export interface NamespaceMovePlan {
  from: string;
  to: string;
  ok: boolean;
  rejection?: { code: NamespaceMoveRejection; ko: string; en: string };
  steps: NamespaceMoveStep[];
  /** 식별자를 바꾸며 함께 고친 참조 수 */
  references: number;
  /** 해석하지 못한 raw 안에 옛 접두어가 남아 있다 — 옮기지 않았다 */
  rawMentions: boolean;
  /** 적용할 때만 쓴다. 하나의 실행취소 단위다 */
  cmds: Cmd;
}

function norm(prefix: string): string {
  return prefix.trim().replace(/\/+$/, '');
}

function hostOf(iri: string): string | null {
  return /^https?:\/\/([^/?#]+)/i.exec(iri)?.[1]?.toLowerCase() ?? null;
}

/** 접두어 아래인가 — 마디 경계에서만. `https://a/ids`는 `https://a/ids2`를 품지 않는다 */
export function isUnderNamespace(value: string | undefined, prefix: string): boolean {
  if (!value) return false;
  const p = norm(prefix);
  return value === p || value.startsWith(`${p}/`) || value.startsWith(`${p}#`);
}

function reject(from: string, to: string, code: NamespaceMoveRejection, ko: string, en: string): NamespaceMovePlan {
  return {
    from,
    to,
    ok: false,
    rejection: { code, ko, en },
    steps: [],
    references: 0,
    rawMentions: false,
    cmds: { t: 'batch', label: 'namespace-move', cmds: [] },
  };
}

type WithSemantic = { semanticId?: string; supplementalSemanticIds?: string[] };

export function planNamespaceMove(doc: AasDoc, fromRaw: string, toRaw: string): NamespaceMovePlan {
  const from = norm(fromRaw);
  const to = norm(toRaw);

  if (!from || !to) {
    return reject(from, to, 'NS-EMPTY', '옛 접두어와 새 접두어를 모두 넣으십시오.', 'Both prefixes are required.');
  }
  const fromHost = hostOf(from);
  const toHost = hostOf(to);
  if (!fromHost || !toHost) {
    return reject(from, to, 'NS-NOT-IRI', '접두어는 https://로 시작하는 IRI여야 합니다.', 'Prefixes must be http(s) IRIs.');
  }
  if (from === to) {
    return reject(from, to, 'NS-SAME', '옛 접두어와 새 접두어가 같습니다.', 'The prefixes are identical.');
  }
  if (isUnderNamespace(to, from) || isUnderNamespace(from, to)) {
    return reject(
      from,
      to,
      'NS-NESTED',
      '한쪽이 다른 쪽 안에 들어 있습니다. 옮긴 값이 다시 옛 접두어에 걸리거나 마디가 겹칩니다.',
      'One prefix contains the other.',
    );
  }
  if (STANDARD_HOSTS.includes(fromHost) || STANDARD_HOSTS.includes(toHost)) {
    return reject(
      from,
      to,
      'NS-STANDARD',
      'admin-shell.io는 IDTA가 정한 표준 네임스페이스라 옮기지 않습니다. 도메인이 바뀐 표준 IRI는 인스펙터에서 원래 값으로 되돌리십시오.',
      'admin-shell.io is a standard namespace and is never moved.',
    );
  }

  const move = (v: string): string => `${to}${v.slice(from.length)}`;
  const steps: NamespaceMoveStep[] = [];
  const cmds: Cmd[] = [];
  let cur = doc;
  let references = 0;

  const run = (list: Cmd[]): void => {
    if (list.length === 0) return;
    const r = apply(cur, { t: 'batch', label: 'namespace-move', cmds: list });
    cur = r.doc;
    cmds.push(...list);
  };

  const ids = Object.keys(doc.nodes);

  /* 1. 개념·자산 — 문자열 필드. 식별자보다 먼저: 식별자 이름 바꾸기가 참조를 훑을 때 섞이지 않게 */
  for (const id of ids) {
    const n = cur.nodes[id]! as unknown as WithSemantic & {
      semanticIdListElement?: string;
      globalAssetId?: string;
      qualifiers?: WithSemantic[];
      extensions?: WithSemantic[];
      specificAssetIds?: WithSemantic[];
    };
    const path = pathOf(cur, id);
    const list: Cmd[] = [];
    const note = (kind: NamespaceMoveStep['kind'], field: string, before: string): string => {
      const after = move(before);
      steps.push({ node: id, path, kind, field, before, after });
      return after;
    };

    for (const field of ['semanticId', 'semanticIdListElement'] as const) {
      const v = n[field];
      if (isUnderNamespace(v, from)) list.push({ t: 'set', node: id, path: field, value: note('concept', field, v!) });
    }
    if (isUnderNamespace(n.globalAssetId, from)) {
      list.push({ t: 'set', node: id, path: 'globalAssetId', value: note('asset', 'globalAssetId', n.globalAssetId!) });
    }
    if (n.supplementalSemanticIds?.some((v) => isUnderNamespace(v, from))) {
      const next = n.supplementalSemanticIds.map((v, k) =>
        isUnderNamespace(v, from) ? note('concept', `supplementalSemanticIds[${k}]`, v) : v,
      );
      list.push({ t: 'set', node: id, path: 'supplementalSemanticIds', value: next });
    }
    for (const field of ['qualifiers', 'extensions', 'specificAssetIds'] as const) {
      const arr = n[field];
      if (!Array.isArray(arr)) continue;
      let changed = false;
      const next = arr.map((item, k) => {
        const out: WithSemantic = { ...item };
        if (isUnderNamespace(item.semanticId, from)) {
          out.semanticId = note('concept', `${field}[${k}].semanticId`, item.semanticId!);
          changed = true;
        }
        if (item.supplementalSemanticIds?.some((v) => isUnderNamespace(v, from))) {
          out.supplementalSemanticIds = item.supplementalSemanticIds.map((v, j) =>
            isUnderNamespace(v, from) ? note('concept', `${field}[${k}].supplementalSemanticIds[${j}]`, v) : v,
          );
          changed = true;
        }
        return out;
      });
      if (changed) list.push({ t: 'set', node: id, path: field, value: next as unknown as Json });
    }
    run(list);
  }

  /* 2. 전역 식별자 — 참조까지. 이미 쓰이는 값이면 번호를 붙인다(중복을 만들지 않는다) */
  for (const id of ids) {
    const n = cur.nodes[id]!;
    if (!isIdentifiable(n.t)) continue;
    const before = (n as { identifier?: string }).identifier;
    if (!isUnderNamespace(before, from)) continue;
    const after = uniqueIdentifier(cur, move(before!), id);
    const list = renameIdentifier(cur, id, after);
    if (list.length === 0) continue;
    steps.push({ node: id, path: pathOf(cur, id), kind: 'identifier', field: 'identifier', before: before!, after });
    references += list.length - 1;
    run(list);
  }

  const probe = `${from}/`;
  const rawMentions =
    (doc.raw ? JSON.stringify(doc.raw).includes(probe) : false) ||
    ids.some((id) => {
      const raw = doc.nodes[id]!.raw;
      return raw ? JSON.stringify(raw).includes(probe) : false;
    });

  return {
    from,
    to,
    ok: true,
    steps,
    references,
    rawMentions,
    cmds: { t: 'batch', label: `네임스페이스 옮기기 ${from} → ${to}`, cmds },
  };
}

/**
 * 문서에 쓰인 사내 네임스페이스 후보 — 옮기기 화면이 "옛 접두어"로 고를 목록.
 *
 * 우리 발급 규칙(`{ns}/cd|sm|aas|asset/…`)의 꼴에서 `{ns}`를 뽑는다. 표준 네임스페이스는 뺀다.
 * 추측으로 접두어를 만들지 않는다 — 이 꼴이 아닌 IRI는 후보에 넣지 않는다.
 */
export function namespacesInDoc(doc: AasDoc): Array<{ prefix: string; count: number }> {
  const counts = new Map<string, number>();
  const see = (v: unknown): void => {
    if (typeof v !== 'string') return;
    const m = /^(https?:\/\/[^/]+(?:\/[^/]+)*?)\/(?:cd|sm|aas|asset)\//i.exec(v);
    if (!m) return;
    const host = hostOf(m[1]!);
    if (!host || STANDARD_HOSTS.includes(host)) return;
    counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
  };
  for (const id of Object.keys(doc.nodes)) {
    const n = doc.nodes[id]! as unknown as Record<string, unknown> & WithSemantic;
    see(n['identifier']);
    see(n['globalAssetId']);
    see(n.semanticId);
    see(n['semanticIdListElement']);
    n.supplementalSemanticIds?.forEach(see);
    for (const field of ['qualifiers', 'extensions', 'specificAssetIds']) {
      const arr = n[field];
      if (Array.isArray(arr)) for (const item of arr as WithSemantic[]) see(item.semanticId);
    }
  }
  return [...counts.entries()]
    .map(([prefix, count]) => ({ prefix, count }))
    .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix));
}
