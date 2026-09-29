---
description: BaSyx에 게시하고 올라간 것을 확인한다. 게시 실패·빈 화면·사라진 데이터의 원인을 실측으로 짚는다. $ARGUMENTS 에 모델 id나 "확인"을 넣는다
---

BaSyx(게시 대상 · AAS V3 API) 관련 작업을 한다. 사용자가 준 것:

```
$ARGUMENTS
```

비어 있으면 **확인만** 한다(아래 3단계). 모델 id가 있으면 게시까지 한다.

배경은 `docs/presentation/basyx-notes.html`에, 규칙은 `CLAUDE.md`의 apps/api 절에 있다.
갈리면 **코드와 실측이 옳다** — 이 파일을 고친다.

## 먼저 — 하지 않는 것

- **BaSyx를 고치지 않는다.** Eclipse 오픈소스 서버를 컨테이너 그대로 쓴다. 우리가 만드는 것은
  게시 게이트웨이(`apps/api/src/basyx.ts`)뿐이다. BaSyx 소스를 받아 고치자고 제안하지 않는다.
- **mock 정의를 올리지 않는다.** 사전이 `origin: idta:MOCK-…`로 답한 개념은 게시에서 빠진다
  (지어내거나 라이선스를 가정한 자료다). 빠진 것은 응답의 `mock`에 온다 — 그것을 올리려고
  필터를 끄지 않는다.
- **검증 오류를 대신 강행하지 않는다.** `force=1`은 사람이 확인하고 결정한다.
- **BaSyx의 값을 저작 문서로 되쓰지 않는다.** 게시된 것은 사본이다.
- **사내망 밖으로 열자고 하지 않는다.** 인증이 없고 UI는 편집·업로드까지 허용돼 있다.

## 1. 떠 있나

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Full
```

`scripts\aas`(Full 없이)는 **BaSyx를 띄우지 않는다.** 8081(BaSyx)·8082(열람 화면)를 확인한다.
컨테이너를 다시 만들면 **게시한 것이 전부 사라진다**(`BASYX_BACKEND: InMemory`) — 그때는
다시 게시해야 하고, 그 사실을 사용자에게 말한다.

## 2. 게시

에디터의 파일 메뉴 `BaSyx에 게시`가 정식 경로다. 스크립트로 할 때:

```powershell
Invoke-RestMethod -Method Post "http://localhost:8787/publish/<모델id>"
```

응답을 그대로 읽는다.

| 필드 | 뜻 |
|---|---|
| `ok` · `failed` | 올라간 항목 수 · 실패 수(롤백하지 않는다 — 실패한 것만 다시) |
| `concepts` | 함께 올린 개념 설명 수 |
| `mock` | mock이라 **뺀** 개념 — 정상 동작이다 |
| `unresolved` | 사전도 샘플도 모르는 개념. 단위·정의 없이 나갔다는 뜻 |
| `items[].kind` | `concept` → `submodel` → `shell` 순서여야 한다 |

상태 코드: `200` 전부 · `207` 일부 실패 · `422` 검증 오류(사람이 강행 결정) · `502` BaSyx 없음.

## 3. 확인 — 실제로 물어본다

```powershell
# 요약
$b = { param($s) [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s)).TrimEnd('=').Replace('+','-').Replace('/','_') }
"shells:   " + (Invoke-RestMethod http://localhost:8081/shells).result.Count
"submodels:" + (Invoke-RestMethod http://localhost:8081/submodels).result.Count
"concepts: " + (Invoke-RestMethod http://localhost:8081/concept-descriptions).result.Count

# 값까지 — {id}는 전역 식별자의 Base64URL(패딩 없음)
$id = 'https://…/sm/operational-data'
$enc = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($id)).TrimEnd('=').Replace('+','-').Replace('/','_')
Invoke-RestMethod "http://localhost:8081/submodels/$enc/`$value" | ConvertTo-Json -Depth 5
```

- 개념 하나: `GET /concept-descriptions/{Base64URL id}` — `unit`·`definition`이 실렸는지 본다.
- 사람에게 보여 줄 때: **열람 화면 `http://localhost:8082`**.
- 스택 전체: `pnpm --filter @aas/api exec tsx scripts/live-check.ts` (`KEEP=1`이면 점검 모델을 남긴다).

## 4. 막혔을 때 — 이미 겪은 것들

| 증상 | 원인 | 조치 |
|---|---|---|
| `404` | `{id}`에 전역 식별자를 그대로 넣었다 | Base64URL(패딩 없음)로 인코딩. `encodeId()`가 한 곳이다 |
| `422 HAS_ERRORS` | 검증 오류가 있는 모델 | 오류를 먼저 고친다. 강행은 사람이 결정 |
| `502 UNREACHABLE` | BaSyx가 없다 | `scripts\aas full` |
| 게시했는데 `concepts: 0` | 서버가 개념을 모른다 — 브라우저 용어집은 서버에 없다 | 에디터의 `서버에 보내기`가 `/dictionary/import`로 넣는다. 사전 상태는 `GET /dictionary/status` |
| 응답의 `mock`이 0인데 mock이 올라간다 | import가 `origin`을 `editor:…`로 덮었다(실제로 그랬다) | `dict-seed`로 다시 시드해 origin 복구. 코드는 이미 덮지 못하게 막혀 있다 |
| 열람 화면이 비어 있다 | 브라우저가 BaSyx를 직접 부르는데 CORS 헤더가 없다 | compose의 `BASYX_CORS_ALLOWED-ORIGINS` 확인. 헤더는 `Origin`을 넣어 요청해 본다 |
| 8082 연결이 끊긴다 | 이미지 EXPOSE는 80인데 **안의 nginx는 3000**으로 듣는다 | 포트 매핑을 `8082:3000`으로. 메타데이터를 믿지 말 것 |
| 이미지 `not found` | 태그를 짐작했다 | Docker Hub 태그 목록을 확인하고 **고정 태그**를 쓴다(`SNAPSHOT`·`latest` 금지) |
| 지운 서브모델이 BaSyx에 남아 있다 | 게시는 올리기(POST/PUT)만 한다 | 남은 것은 `DELETE /submodels/{id}` 등으로 직접. 지우기 전에 무엇을 지울지 사용자에게 보인다 |
| 어제 올린 것이 없다 | 컨테이너 재생성 → 메모리 저장이라 사라졌다 | 다시 게시. 운영이라면 영속 백엔드로 바꾸는 것이 먼저다 |

## 보고

1. 한 줄 결론 — 올라갔는지, 무엇이 빠졌는지.
2. 실제로 물어본 결과를 표로: `shells` · `submodels` · `concept-descriptions` 건수.
3. 뺀 것(`mock`)과 모르는 것(`unresolved`)을 나눠 적는다 — 둘은 사용자가 할 일이 다르다.
4. 실행하지 못한 것은 못 했다고 적는다(BaSyx가 없었다, 모델 id를 못 받았다 …).

숫자는 **직접 물어본 것만** 쓴다. 게시 응답만 보고 "BaSyx에 있다"고 적지 않는다 —
응답은 우리 서버가 만든 것이고, 확인은 BaSyx에 물어야 끝난다.
