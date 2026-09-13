/**
 * ConceptDescription 생성.
 *
 * semanticId는 **가리키기만** 한다. "이 값의 단위는 ℃"라는 정보는
 * `conceptDescriptions` 배열에 `DataSpecificationIec61360`으로 실려야 한다.
 * 그래야 수신 측이 사전을 다시 조회하지 않고도 해석할 수 있다.
 *
 * 실측에서 나온 friction — "단위(kN·mm·g·MPa)를 담을 자리가 없다" — 를 푸는 지점이다.
 *
 * 커널은 fetch를 모른다. 개념 정보는 **주입받는다**(사전 프록시든 사내 용어집이든).
 */

import type { Json, LangText } from './model.js';
import { type Issue, sortIssues } from './issue.js';
import type { AasDoc, AasNodeType, NodeId } from './model.js';
import type { Environment } from './serialize.js';

/**
 * 값을 담는 종류.
 *
 * CD-001이 말하는 손해 — "단위·자료형 없이 나가면 수신 측이 값을 해석하지 못한다" — 는
 * **값이 있는 요소에만** 해당한다. 컬렉션·목록·엔티티·오퍼레이션은 담는 그릇이라
 * 단위라는 것이 없다.
 *
 * 그릇에까지 그 문장을 쓰면 사실이 아닌 말을 하게 된다. 그래서 **문구만 나눈다.**
 *
 * **심각도는 나누지 않는다.** 개념이 빠진 것은 그릇이든 값이든 같은 무게다 —
 * 그릇의 개념이 없으면 수신 측은 그 묶음이 무엇인지 알 수 없다. 다른 것은
 * 무엇을 잃느냐뿐이고, 그것은 문장이 말한다.
 */
const VALUE_BEARING: ReadonlySet<AasNodeType> = new Set<AasNodeType>([
  'prop',
  'mlp',
  'range',
  'file',
  'blob',
  'ref',
]);

/** 개념 하나에 대해 우리가 아는 것 */
export interface ConceptInfo {
  preferredName?: LangText[];
  shortName?: LangText[];
  /** IEC 61360 단위 기호 — kN · mm · °C */
  unit?: string;
  /** STRING · REAL_MEASURE · INTEGER_COUNT · DATE · BOOLEAN … */
  dataType?: string;
  definition?: LangText[];
}

export interface ConceptResolver {
  resolve(semanticId: string): ConceptInfo | undefined;
}

const DATA_SPEC_IEC61360 = 'https://admin-shell.io/aas/3/0/DataSpecificationIec61360';

/**
 * 단위가 있어야 하는 자료형 (AASc-3a-009).
 *
 * 측정값과 통화는 단위 없이는 뜻이 없다 — "15.0"이 kW인지 kN인지 모른다.
 * 규격이 `unit` 또는 `unitId` 중 하나를 요구한다. 우리는 `unit`(기호)만 내보낸다.
 */
const UNIT_REQUIRED: ReadonlySet<string> = new Set([
  'INTEGER_MEASURE',
  'REAL_MEASURE',
  'RATIONAL_MEASURE',
  'INTEGER_CURRENCY',
  'REAL_CURRENCY',
]);

function extRef(value: string): Json {
  return { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value }] };
}

/** 문서에서 쓰인 semanticId를 전부 모은다 — 주 식별자만. 보조는 개념이 아니라 참고다. */
export function usedSemanticIds(doc: AasDoc): Map<string, NodeId[]> {
  const out = new Map<string, NodeId[]>();
  for (const id of Object.keys(doc.nodes)) {
    const s = doc.nodes[id]!.semanticId;
    if (!s) continue;
    const list = out.get(s);
    if (list) list.push(id);
    else out.set(s, [id]);
  }
  return out;
}

export interface ConceptResult {
  /** id 사전순. 골든 테스트가 흔들리지 않도록 결정적으로 만든다 */
  conceptDescriptions: Json[];
  /** 해석하지 못한 semanticId — 조용히 빠지지 않고 목록으로 남는다 */
  unresolved: Issue[];
}

/**
 * 불러온 파일에 이미 실려 있는 개념 — `doc.raw`에 보존된 conceptDescriptions.
 *
 * 이것들은 내보낼 때 그대로 나간다(`attachConceptDescriptions`). 그러니 용어집이
 * 모른다고 "아는 곳이 없다"고 하면 거짓말이다 — 파일이 알고 있다. 실제로 파일 하나에서
 * CD-001 64건 중 38건이 이것이었고, 경고가 많으면 진짜 경고가 묻힌다.
 * 내용이 규격에 맞는지는 L1(aas-core)이 따로 본다.
 */
function carriedConcepts(doc: AasDoc): Map<string, Json> {
  const out = new Map<string, Json>();
  const list = doc.raw?.['conceptDescriptions'];
  if (!Array.isArray(list)) return out;
  for (const cd of list) {
    const id = (cd as { id?: unknown } | null)?.id;
    if (typeof id === 'string') out.set(id, cd);
  }
  return out;
}

function carriedUnit(cd: Json | undefined): boolean {
  const specs = (cd as { embeddedDataSpecifications?: unknown } | undefined)?.embeddedDataSpecifications;
  if (!Array.isArray(specs)) return false;
  return specs.some((s) => {
    const c = (s as { dataSpecificationContent?: { unit?: unknown; unitId?: unknown } } | null)
      ?.dataSpecificationContent;
    return (typeof c?.unit === 'string' && c.unit.trim() !== '') || !!c?.unitId;
  });
}

export function buildConceptDescriptions(doc: AasDoc, resolver: ConceptResolver): ConceptResult {
  const used = usedSemanticIds(doc);
  const carried = carriedConcepts(doc);
  const cds: Array<{ id: string; json: Json }> = [];
  const unresolved: Issue[] = [];

  const hasEnglish = (texts: LangText[] | undefined): boolean =>
    (texts ?? []).some((t) => t.language.toLowerCase().startsWith('en') && t.text.trim() !== '');

  const report = (node: NodeId | null, semanticId: string, ko: string, en: string): void => {
    unresolved.push({
      code: 'CD-001',
      layer: 'dictionary',
      /* 그릇이든 값이든 개념이 빠진 것은 같은 무게다. 다른 것은 무엇을 잃느냐뿐이다. */
      severity: 'warn',
      node,
      path: semanticId,
      message: { ko, en },
    });
  };

  for (const [semanticId, nodes] of used) {
    const node = nodes[0] ?? null;
    /* 하나라도 값을 담는 요소가 이 개념을 쓰면 값 쪽 문구다 */
    const carriesValue = nodes.some((n) => {
      const t = doc.nodes[n]?.t;
      return !!t && VALUE_BEARING.has(t);
    });

    const info = resolver.resolve(semanticId);
    const inFile = carried.has(semanticId);

    /* 용어집이 모르거나 규격 최소치를 못 채우면 파일의 개념이 그대로 나간다 — 경고할 것이 없다 */
    if (inFile && (!info || !hasEnglish(info.preferredName) || !hasEnglish(info.definition))) {
      continue;
    }

    if (!info) {
      report(
        node,
        semanticId,
        carriesValue
          ? '이 semanticId를 아는 곳이 없습니다. 단위·자료형 없이 나가면 수신 측이 값을 해석하지 못합니다.'
          : '이 묶음의 개념을 아는 곳이 없습니다. 수신 측은 이 묶음이 무엇인지 알 수 없습니다.',
        carriesValue
          ? 'Nothing knows this semanticId; without unit and data type the receiver cannot interpret the value.'
          : 'Nothing knows this semanticId. The receiver cannot tell what this grouping means.',
      );
      continue;
    }

    /* 규격이 요구하는 최소치. 없는 것을 지어내지 않는다 —
       틀린 정의를 실어 보내는 것이 아무것도 안 보내는 것보다 나쁘다.
         AASc-3a-002  표제어는 최소한 영어로
         AASc-3a-008  정의도 최소한 영어로 (값을 기술하는 개념은 예외) */
    if (!hasEnglish(info.preferredName)) {
      report(
        node,
        semanticId,
        '영문 표제어가 없어 ConceptDescription을 만들 수 없습니다 (AASc-3a-002).',
        'No English preferred name; a ConceptDescription cannot be built (AASc-3a-002).',
      );
      continue;
    }
    if (!hasEnglish(info.definition)) {
      report(
        node,
        semanticId,
        '영문 정의가 없어 ConceptDescription을 만들 수 없습니다 (AASc-3a-008). 표준 개념은 사전 프록시가 채웁니다.',
        'No English definition; a ConceptDescription cannot be built (AASc-3a-008).',
      );
      continue;
    }

    const content: Record<string, Json> = { modelType: 'DataSpecificationIec61360' };
    content['preferredName'] = info.preferredName as unknown as Json;
    content['definition'] = info.definition as unknown as Json;
    if (info.shortName?.length) content['shortName'] = info.shortName as unknown as Json;
    if (info.unit) content['unit'] = info.unit;

    /**
     * 측정·통화형인데 단위를 모르면 **자료형을 빼고 내보낸다** (AASc-3a-009).
     *
     * 자료형만 실으면 규격 위반이라 받는 쪽이 파일 전체를 거부한다 — 개념 하나 때문에
     * 모델이 통째로 막히는 것이 가장 나쁘다. 이름과 정의는 그대로 나가므로 뜻은 전해진다.
     *
     * 지어낸 단위를 붙이지는 않는다. 대신 CD-002로 무엇을 뺐는지 말한다 —
     * 조용히 빼면 왜 자료형이 없는지 알 방법이 없다.
     */
    if (info.dataType && UNIT_REQUIRED.has(info.dataType) && !info.unit) {
      /* 파일의 개념이 단위를 갖고 있으면 그쪽이 낫다 — 갈아끼우면 단위를 잃는다 */
      if (inFile && carriedUnit(carried.get(semanticId))) continue;
      unresolved.push({
        code: 'CD-002',
        layer: 'dictionary',
        severity: 'warn',
        node,
        path: semanticId,
        message: {
          ko: `자료형이 ${info.dataType}인데 단위가 없어 자료형을 빼고 내보냅니다 (AASc-3a-009). 용어집에서 단위를 채우십시오.`,
          en: `Data type ${info.dataType} requires a unit; the data type is omitted from the export (AASc-3a-009). Fill in the unit in the glossary.`,
        },
      });
    } else if (info.dataType) {
      content['dataType'] = info.dataType;
    }

    cds.push({
      id: semanticId,
      json: {
        modelType: 'ConceptDescription',
        id: semanticId,
        embeddedDataSpecifications: [
          { dataSpecification: extRef(DATA_SPEC_IEC61360), dataSpecificationContent: content },
        ],
      },
    });
  }

  cds.sort((a, b) => a.id.localeCompare(b.id));
  return { conceptDescriptions: cds.map((c) => c.json), unresolved: sortIssues(unresolved) };
}

/**
 * Environment에 붙인다. 비어 있으면 키 자체를 넣지 않는다 —
 * 규격이 "설정하지 않거나 최소 1개"를 요구한다.
 *
 * **불러온 파일에 이미 있던 개념과 합친다.** 그것들은 `doc.raw`에 보존돼 `serialize()`가
 * 그대로 내놓는다. 예전에는 새로 만든 목록으로 통째로 갈아끼웠는데, 그러면
 *  - 용어집이 모르는 남의 개념이 내보낼 때 조용히 사라지고
 *  - 만든 것이 하나도 없으면 반대로 옛 개념이 전부 나가서
 * 화면의 검증과 파일이 서로 다른 것을 보게 된다.
 *
 * 같은 id면 **새로 만든 쪽이 이긴다.** `raw`의 개념은 에디터에서 고칠 방법이 없고,
 * 용어집이 그것을 고치는 유일한 자리다 — 옛 파일에 단위 없는 측정형이 실려 있어도
 * 용어집에서 고치면 내보낼 때 바로잡힌다. 모르는 id는 손대지 않고 원래 자리에 둔다.
 */
export function attachConceptDescriptions(env: Environment, cds: Json[]): Environment {
  const existing = Array.isArray(env['conceptDescriptions'])
    ? (env['conceptDescriptions'] as Json[])
    : [];
  const idOf = (cd: Json): string | undefined => {
    const id = (cd as { id?: unknown } | null)?.id;
    return typeof id === 'string' ? id : undefined;
  };

  const fresh = new Map<string, Json>();
  for (const cd of cds) {
    const id = idOf(cd);
    if (id !== undefined) fresh.set(id, cd);
  }

  const used = new Set<string>();
  const merged = existing.map((cd) => {
    const id = idOf(cd);
    const next = id !== undefined ? fresh.get(id) : undefined;
    if (next === undefined) return cd;
    used.add(id!);
    return next;
  });
  for (const cd of cds) {
    const id = idOf(cd);
    if (id === undefined || !used.has(id)) merged.push(cd);
  }

  if (merged.length === 0) {
    const rest = { ...env };
    delete rest['conceptDescriptions'];
    return rest;
  }
  return { ...env, conceptDescriptions: merged };
}
