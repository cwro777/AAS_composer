---
description: IDTA 서브모델 템플릿을 레지스트리에 추가한다
---

$ARGUMENTS 로 지정된 IDTA 템플릿을 추가해줘.

1. `template-harvester` 서브에이전트로 해당 사양서에서 다음을 추출:
   서브모델 semanticId, 각 요소의 idShort / modelType / semanticId /
   supplementalSemanticIds / cardinality / valueType / 예시 값.
2. `packages/templates/src/idta/<slug>.json` 으로 저장.
   `idtaNumber` · `version` · `publishedAt` · `sourceUrl`을 함께 기록.
3. `packages/templates/src/index.ts` 레지스트리에 등록.
4. 골든 테스트 추가: 템플릿 인스턴스화 → serialize → 스냅샷 비교.
5. `aas-core3.0` 검증기를 통과하는지 확인.
6. 적합성 검사(T-001 필수 요소 누락, T-002 카디널리티)가 새 템플릿에서 동작하는지 확인.
7. 추출한 semanticId 중 **사양서에서 직접 확인하지 못한 값**이 있으면 목록으로 보고할 것.
   추측한 값을 조용히 넣지 말 것. eCl@ss는 이 프로젝트에서 사전 조회로 검증할 수 없다.
