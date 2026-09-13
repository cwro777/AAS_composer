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
  /**
   * 삽입 시 자동으로 넣을지. 기본 true.
   *
   * false로 두는 경우는 하나뿐이다 — **요소가 인스턴스 데이터 없이는 규격을 만족할 수 없을 때.**
   * RelationshipElement의 `first`/`second`가 그렇다(필수인데 대상이 정해져야 값이 생긴다).
   * 정의는 남기므로 팔레트에 뜨고 T-001도 이 요소를 안다. 다만 가짜 참조를 심지 않는다.
   */
  autoInsert?: boolean;
  /** Entity 전용. SelfManagedEntity는 globalAssetId나 specificAssetId가 필수다(AASd-014). */
  entityType?: 'CoManagedEntity' | 'SelfManagedEntity';
  /**
   * idShort를 사용자가 바꿔 쓰는 요소인가. 기본 false.
   *
   * 공식 템플릿의 `EditIdShort=True`에 대응한다. BoM의 Node가 대표적이다 —
   * 이름이 InjectionUnit·ClampingUnit이 되는 것이 정상이다.
   * 이 표시가 있으면 적합성 검사가 **idShort가 아니라 semanticId로 대조**한다.
   * 없으면 이름을 바꾸는 순간 T-001(필수 요소 누락)이 뜬다.
   */
  editableIdShort?: boolean;
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

/**
 * 템플릿 개정 매핑.
 *
 * 사양서가 개정되면 서브모델 IRI와 요소 IRDI가 **동시에** 바뀐다. 그것을 코드가 아니라
 * 데이터로 선언하고, 적용 전에 먼저 미리보기를 보여준다.
 *
 * 자동 변환하지 않는 것(`manual`)을 분명히 남기는 것이 이 파일의 핵심이다 —
 * 구조가 바뀌는 항목을 조용히 옮기면 데이터가 사라진다.
 */
export interface MigrationDef {
  id: string;
  templateId: string;
  name: string;
  from: { idtaNumber: string; version: string; submodelSemanticId: string };
  to: { idtaNumber: string; version: string; submodelSemanticId: string };
  sourceUrl: string;
  note?: string;
  elements: Array<{
    idShort: string;
    /** 이 값일 때만 바꾼다. 다르면 건드리지 않고 보고한다. */
    semanticId?: { from: string; to: string };
    /** 개정판에서 새로 붙는 보조 식별자 */
    supplementalSemanticIds?: string[];
    rename?: string;
  }>;
  manual: Array<{ idShort: string; note: { ko: string; en: string } }>;
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
    /**
     * `{ns}`를 넣을 수 있다 — 사내 정의 템플릿이 **우리 이름으로 발행하는** 개념이다.
     * 삽입할 때 사내 네임스페이스로 치환하고, 적합성 검사는 어느 네임스페이스든 받는다.
     * 표준(IDTA·IEC CDD·eCl@ss) 식별자에는 쓰지 않는다 — 그것은 네임스페이스를 따라가면 안 된다.
     */
    semanticId: string;
    supplementalSemanticIds?: string[];
    verified: Verified;
    /** 인스턴스 id 제안 패턴. `{ns}`와 `{asset}`을 치환한다. */
    idPattern: string;
  };
  elements: ElementDef[];
}
