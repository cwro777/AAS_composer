/**
 * @aas/semantic — semanticId 파서 (순수).
 *
 * 이 엔트리에는 네트워크 코드를 두지 않는다. 커널이 이것만 import 하기 때문이다.
 * 사전 조회는 `@aas/semantic/dict`에 있다.
 */
export type { SemanticRef, SemanticScheme, VerifiedBy } from './parse.js';
export { parseSemanticId, formatSemanticId } from './parse.js';
