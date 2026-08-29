/**
 * IRDI / IRI 파서.  구현은 P6.
 *
 * 참조 문법 (docs/plan.html 06장):
 *   eCl@ss   0173-1#02-AAO677#002        ICD-OI#CSI-Code#VI
 *   IEC CDD  0112/2///61987#ABA565#009   슬래시 개수가 하나만 틀려도 다른 식별자
 *   IDTA IRI https://admin-shell.io/idta/nameplate/3/0/Nameplate
 */

export type SemanticScheme = 'iec-cdd' | 'eclass' | 'iri' | 'unknown';

/**
 * 무엇으로 확인했는지를 구분한다.
 * - 'dict' : IEC CDD 사전이 실재·현행을 확인 (기계적 확인)
 * - 'spec' : IDTA 사양서에서 사람이 대조. eCl@ss 보조 식별자 대부분이 여기 속한다
 * - 'none' : 아직 확인되지 않음
 *
 * 이 프로젝트는 eCl@ss 라이선스가 없어 eCl@ss IRDI는 'dict'가 될 수 없다.
 */
export type VerifiedBy = 'dict' | 'spec' | 'none';

export interface SemanticRef {
  raw: string;
  scheme: SemanticScheme;
  /** 개념 코드 — eCl@ss AAO677, CDD ABA565 */
  code?: string;
  /** 버전 접미사. 다른 버전은 다른 식별자다 */
  version?: string;
  verified: VerifiedBy;
  /** 사전이 확인한 시각 (ISO 8601). verified === 'dict'일 때만 */
  checkedAt?: string;
  /** 사양서 출처 — 문서 번호·버전·페이지. verified === 'spec'일 때만 */
  source?: string;
}

export function parseSemanticId(_raw: string): SemanticRef {
  throw new Error('parseSemanticId: P6에서 구현합니다.');
}

export function formatSemanticId(_ref: SemanticRef): string {
  throw new Error('formatSemanticId: P6에서 구현합니다.');
}
