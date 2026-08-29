---
description: 커밋 전 전체 검증
---

다음을 순서대로 실행하고, 실패하면 원인을 찾아 고친 뒤 다시 돌려줘.

1. `pnpm verify` (check:kernel + typecheck + test + lint)
2. `pnpm test --filter @aas/kernel` — 왕복 · 속성 · 픽스처 · aas-core3.0
3. `docker compose up -d && pnpm test:integration` — BaSyx 등록 (해당 단계에 도달했을 때만)
4. `pnpm e2e` (해당 단계에 도달했을 때만)
5. 변경이 UI에 닿았다면 `ui-reviewer` 서브에이전트로 검토

전부 통과하면 변경 요약을 한 문단으로 보고해.
통과하지 못한 항목이 있으면 **"통과했다"고 말하지 말고** 무엇이 왜 실패했는지 그대로 보고해.

골든 스냅샷이 실패했을 때 `--update`로 덮어쓰지 마라.
출력이 바뀐 것이 의도한 변경인지 먼저 판단하고, 의도한 것이라면 `pnpm golden:update`를 쓴 뒤
커밋 메시지에 **왜 바뀌었는지**를 적는다.
