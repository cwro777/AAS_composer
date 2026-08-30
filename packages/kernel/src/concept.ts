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
import type { AasDoc, NodeId } from './model.js';
import type { Environment } from './serialize.js';

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

export function buildConceptDescriptions(doc: AasDoc, resolver: ConceptResolver): ConceptResult {
  const used = usedSemanticIds(doc);
  const cds: Array<{ id: string; json: Json }> = [];
  const unresolved: Issue[] = [];

  const hasEnglish = (texts: LangText[] | undefined): boolean =>
    (texts ?? []).some((t) => t.language.toLowerCase().startsWith('en') && t.text.trim() !== '');

  const report = (node: NodeId | null, semanticId: string, ko: string, en: string): void => {
    unresolved.push({
      code: 'CD-001',
      layer: 'dictionary',
      severity: 'warn',
      node,
      path: semanticId,
      message: { ko, en },
    });
  };

  for (const [semanticId, nodes] of used) {
    const node = nodes[0] ?? null;
    const info = resolver.resolve(semanticId);
    if (!info) {
      report(
        node,
        semanticId,
        '이 semanticId를 아는 곳이 없습니다. 단위·자료형 없이 나가면 수신 측이 값을 해석하지 못합니다.',
        'Nothing knows this semanticId; without unit and data type the receiver cannot interpret the value.',
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
    if (info.dataType) content['dataType'] = info.dataType;

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
 */
export function attachConceptDescriptions(env: Environment, cds: Json[]): Environment {
  if (cds.length === 0) return env;
  return { ...env, conceptDescriptions: cds };
}
