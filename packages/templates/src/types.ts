/**
 * 템플릿 정의 — 코드가 아니라 데이터다.
 *
 * `verified`가 이 패키지의 핵심이다. 사양서에서 직접 대조한 값과
 * 추정한 값을 구분하지 않으면 틀린 semanticId가 조용히 배포된다.
 */

import type { AasNodeType, LangText } from '@aas/kernel';

/** 어디까지 확인했는가 */
export type Verified =
  /** 해당 버전 사양서/카탈로그에서 직접 대조함 */
  | 'spec'
  /** 사전(IEC CDD)에서 실재를 확인함 */
  | 'dict'
  /** 확인하지 못함 — UI가 배지로 드러내고, 배포 전 대조가 필요하다 */
  | 'none';

export interface ElementDef {
  t: AasNodeType;
  idShort: string;
  semanticId?: string;
  supplementalSemanticIds?: string[];
  verified: Verified;
  /** 확인 출처 — 사양서 번호·페이지·URL */
  source?: string;
  required: boolean;
  /** '1' | '0..1' | '0..*' | '1..*' */
  cardinality: '1' | '0..1' | '0..*' | '1..*';
  valueType?: string;
  exampleValue?: string;
  langs?: LangText[];
  min?: string;
  max?: string;
  contentType?: string;
  typeValueListElement?: string;
  semanticIdListElement?: string;
  /** AASd-109 — Property·Range 목록이면 필수 */
  valueTypeListElement?: string;
  children?: ElementDef[];
}

export interface TemplateDef {
  /** 'idta-02006' */
  id: string;
  idtaNumber: string;
  name: string;
  version: string;
  publishedAt: string;
  sourceUrl: string;
  submodel: {
    idShort: string;
    semanticId: string;
    supplementalSemanticIds?: string[];
    verified: Verified;
    /** 인스턴스 id 제안 패턴. `{ns}`와 `{asset}`을 치환한다. */
    idPattern: string;
  };
  elements: ElementDef[];
}
