/**
 * 사전 클라이언트.  구현은 P6.
 *
 * 확정된 전제: 조회 대상은 **IEC CDD 단독**이다 (eCl@ss 라이선스 없음).
 * eCl@ss IRDI는 파싱·보존·출력만 하고 조회하지 않는다 — status는 항상 'unknown'.
 *
 * 네트워크 접근은 주입받는다. 전역 fetch를 직접 부르지 않으므로 이 패키지는
 * 브라우저·Node·테스트 어디서나 같은 코드로 돌고, 커널의 순수성 규칙도 깨지 않는다.
 */

export interface DictConcept {
  irdi: string;
  scheme: 'iec-cdd' | 'eclass';
  /** 출처 표준 — IEC 61987 · 62683 · 62720 … */
  source?: string;
  nameEn?: string;
  /** CDD에는 한글 표제어가 없다. 사내 용어 매핑 테이블에서 채운다 */
  nameKo?: string;
  definition?: string;
  unit?: string;
  dataType?: string;
  status: 'current' | 'deprecated' | 'superseded' | 'unknown';
  /** status가 superseded일 때 후속 IRDI */
  successor?: string;
}

export interface DictSearchHit {
  concept: DictConcept;
  score: number;
}

/** 사전 어댑터. 나중에 eCl@ss를 붙인다면 이 인터페이스의 구현을 하나 더 만든다. */
export interface DictAdapter {
  readonly scheme: 'iec-cdd';
  lookup(irdi: string): Promise<DictConcept | null>;
  search(query: string, lang: 'ko' | 'en'): Promise<DictSearchHit[]>;
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export function createCddAdapter(_fetchLike: FetchLike, _baseUrl: string): DictAdapter {
  throw new Error('createCddAdapter: P6에서 구현합니다.');
}
