---
description: 새 SubmodelElement 종류를 커널에 추가한다 (여섯 지점 전부)
---

$ARGUMENTS 종류의 SubmodelElement를 추가해줘.

하나라도 빠지면 왕복이 깨진다. **여섯 지점을 전부** 손대고, 각 단계마다 테스트를 먼저 쓴다.

1. `packages/kernel/src/model.ts` — `AasNodeType` 유니온에 추가, 노드 인터페이스 정의,
   포함 규칙(`canContain`) 갱신.
2. `packages/kernel/src/serialize.ts` — 직렬화. 빈 값 처리를 규격대로
   (설정하지 않는 것과 빈 문자열은 다르다).
3. `packages/kernel/src/parse.ts` — 역직렬화. 인식하지 못한 필드는 `raw`에 보존.
4. `packages/kernel/src/validate.ts` — 사내 정책만. 규격 제약은 `verify.ts`가 위임한다.
5. 노드 컴포넌트 (`apps/web`) — 캔버스·트리·표 세 뷰 모두. 타입 색은 좌측 스트라이프로만.
6. 골든 테스트 + 왕복 속성 테스트 — `test/arbitrary.ts`의 생성기에 새 종류를 포함시킬 것.
   **여기를 빠뜨리면 속성 테스트가 새 종류를 영원히 검사하지 않는다.**

끝나면 `aas-spec` 서브에이전트로 검토받고, `pnpm verify`를 돌려줘.
