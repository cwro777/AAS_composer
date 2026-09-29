---
description: semanticId·검증 이슈(CD-001·CD-002·AASc-3a-009·POL-IRI-001·POL-SEM-001·T-00x)를 받아 누구의 이름인지 근거로 판정하고 할 일을 안내한다. $ARGUMENTS 에 검증 탭 복사 내용이나 IRI/IRDI를 붙인다
---

사용자가 붙인 **검증 이슈 줄**(검증 탭 `전체 복사` — 탭으로 나뉜 `심각도 코드 경로 내용`)이나
**식별자 목록**을 판정하고, 무엇을 해야 하는지 알려 줘.

```
$ARGUMENTS
```

비어 있으면 무엇을 붙이면 되는지 한 줄로 묻고 멈춘다.

상세 근거는 `docs/semantic-id.md`에 있다(3장 네임스페이스 · 4장 CD-001 · 6장 ConceptDescription ·
7장 용어집 · 8장 이슈별 처리). 규칙이 이 파일과 문서 사이에서 갈리면 **문서와 코드가 옳다** —
이 파일을 고친다.

## 절대 규칙 — 판정보다 먼저

- **식별자를 추측하지 않는다.** IRDI를 지어내거나 버전 접미사(`#009`)를 바꾸지 않는다. 확인하지 못한 것은
  "미확인"이라고 말한다. 그럴듯한 값을 제안하는 것도 추측이다.
- **표준 문자열은 한 글자도 바꾸지 않는다.** `admin-shell.io` 경로의 `idta`/`zvei`/`ZVEI`, `http`/`https`,
  버전 마디까지 발표된 그대로다. "정리"하자는 제안을 하지 않는다.
- **`/idta/`가 들어 있다는 것은 근거가 아니다.** 근거는 아래 증거 순서뿐이다.
  (실례: `https://admin-shell.io/idta/TimeSeries/UtcTime/1/1`은 IDTA 02008 1.1 공식 JSON에 없었다.)
- **mock은 증거가 아니다.** `docs/mock/*`(저장소에 없다 — 로컬 전용)과 사전의
  `origin: idta:MOCK-…`은 우리가 지어내거나 가정한 자료다.
- **eCl@ss는 대조하지 않는다.** 라이선스가 없다(P0 확정). "eCl@ss 후보 — 대조 못 함"까지만 말한다.
- **표준 개념의 정의·단위를 쓰지 않는다.** IEC CDD·eCl@ss·IDTA 개념의 정의 문장을 만들어 주지 않는다.
  사내 개념도 정의는 사용자가 정한다 — 문장 초안을 줄 때는 "예시, 실제 뜻으로 고칠 것"을 붙인다.
- **사용자의 브라우저 데이터(용어집·모델)를 직접 고치지 않는다.** 화면에서 누를 버튼을 안내한다.
  코드·템플릿·샘플 파일 수정은 사용자가 요청할 때만 한다.

## 1. 가르기 — 모양으로 가족을 정한다

사내 네임스페이스는 **루트 `.env`의 `IRI_PREFIX`** 를 읽어 확인한다(추측 금지. 브라우저 입력칸 값이
다를 수 있으니 이슈 문구의 `사내 네임스페이스(…)`가 있으면 그것을 우선한다).

| 모양 | 가족 |
|---|---|
| `0112/…#…#NNN` | IEC CDD IRDI |
| `0173-1#NN-XXXXXX#NNN` | eCl@ss IRDI |
| `https://admin-shell.io/…` · `http://admin-shell.io/…` | IDTA가 정했다고 **주장**하는 IRI |
| `{IRI_PREFIX}/cd/…` | 사내 개념 |
| `{IRI_PREFIX}/aas|sm|asset/…` | 사내 식별자 (개념이 아니다) |
| 다른 도메인 + `/cd/ /sm/ /aas/ /asset/` | **옛 사내 네임스페이스** 후보 (`cw.co.kr/ids`, `bnb.co.kr/ids` 등) |
| 다른 도메인 + `/idta/ /zvei/ …` | **도메인만 바뀐 표준 IRI** 의심 (`https://cw1.co.kr/idta/…`) |
| 버전 접미사 없는 IRDI (`…#ABA951`) | 깨진 IRDI — 어떤 사전과도 일치하지 않는다 |

## 2. 증거 — 강한 순서대로 확인한다

Windows·PowerShell이다. 문자열은 **그대로** 찾는다(`-SimpleMatch`).

1. **IDTA 공식 Template JSON** — 여기 있으면 IDTA 개념이다.
   ```powershell
   Select-String -Path docs\idta\*.json -Pattern '<식별자>' -SimpleMatch | Group-Object Filename
   ```
   IRDI도 여기서 찾는다 — IDTA가 IEC CDD·eCl@ss 개념의 정의를 실어 둔 경우가 많다.
2. **템플릿 레지스트리** — `verified`와 `source`를 본다. `spec`이면 사양서 대조를 거친 값.
   ```powershell
   Select-String -Path packages\templates\src\idta\*.json -Pattern '<식별자>' -SimpleMatch -Context 0,4
   ```
   템플릿 JSON의 `{ns}`는 사내 개념 자리표시다.
   **걸린 줄이 `"semanticId"`·`"semanticIdListElement"`·`"supplementalSemanticIds"` 값인지 확인한다** —
   `"source"` 설명문에 옛 값이 적혀 있는 경우가 있다(예: Timestamp의 source가 옛 UtcTime IRI를 언급한다).
3. **서버 사전** — API(8787)가 떠 있어야 한다. 안 떠 있으면 `scripts\aas`를 안내하고 이 단계는 "확인 못 함".
   ```powershell
   $b = @{ ids = @('<식별자>') } | ConvertTo-Json
   Invoke-RestMethod -Method Post -Uri http://localhost:8787/dictionary/lookup -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($b))
   ```
   `origin`을 읽는다: `idta:IDTA-…json`(공식 JSON 시드) · `terms:…`(용어집·옮겨 적은 파일) · **`idta:MOCK-…`(증거 아님)**.
   `missing`이면 사전이 모른다. 정의(`definition`)가 비었는지도 본다.
4. **샘플 용어집** — `packages/semantic/src/seed/terms.sample.json`. 샘플 회사(`bnb.co.kr`) 자료다.
5. **mock** — `docs/mock/*.json`에만 있으면 "근거 없음, mock에만 있음"이라고 명시한다.

IEC CDD 원문(`cdd.iec.ch`)은 프로그램 접근이 403이다. 필요하면 사용자에게 **브라우저로 열어** 확인하라고 한다.

## 3. 판정

| 판정 | 조건 | 에디터 표시 |
|---|---|---|
| **사양서 확인** | ①에 있음, 또는 ②가 `verified: spec` | 배지 `사양서 확인` |
| **사전 확인** | ③이 mock이 아닌 origin으로 이름·정의를 답함 | `사전 확인` · 용어집 탭 `사전` |
| **자체 발급** | 현재 사내 네임스페이스의 `/cd/` | `자체 발급` · `사내` |
| **옛 네임스페이스** | 다른 도메인의 우리 발급 꼴 | POL-IRI-001(식별자일 때) |
| **도메인이 바뀐 표준** | 원래 `admin-shell.io/…`인데 도메인만 바뀜 — ①에서 원래 값이 확인되면 그 값을 제시 | CD-001, `개념 등록` 없음 |
| **미확인** | 어느 증거에도 없음 · mock에만 있음 · eCl@ss 후보 | `미확인` · `mock` |

## 4. 할 일 — 이슈 코드별

| 이슈 | 확인할 것 | 안내 |
|---|---|---|
| `CD-001` 아는 곳이 없다 | 사전이 떠 있나(자동 조회는 API가 있어야 한다) → 판정 | 사전 확인이면 새로고침으로 사라짐. **자체 발급**이면 검증 탭 `개념 등록 · Concept definition`(영문 이름·정의 필수, 단위는 `단위 종류`에서 고름). **도메인이 바뀐 표준**이면 인스펙터에서 원래 값으로. **옛 네임스페이스**면 `옮기기…`. **미확인 표준 IRI**면 공식 JSON·사양서로 확인 전까지 사내 개념 발행(`{ns}/cd/이름/1/0`)을 권한다 |
| `CD-001` 영문 정의가 없다 (AASc-3a-008) | ①에 정의가 있나 | 있으면 샘플·사전 시드 누락 — 사용자가 원하면 공식 문장을 **글자 그대로** 옮기는 수정을 제안. IEC CDD면 `docs/dict/TEMPLATE-cdd-concepts.json` → `dict-seed` 절차 |
| `CD-002` 단위가 없어 자료형을 뺐다 | 용어집 항목 | 용어집 탭 `고칠 것만` → `고치기` → 단위 |
| `AAS-CORE` AASc-3a-009 | 경로의 개념 id(이슈 경로 괄호) | 불러온 파일의 개념 → `단위 넣기` |
| `POL-IRI-001` | 옛 접두어가 무엇인가 | 한두 건은 퀵픽스, 여러 건·개념까지면 검증 탭 `옮기기…`(모델+용어집 함께, Ctrl+Z·`용어집 되돌리기`) |
| `POL-SEM-001` semanticId 없음 | 용어집에 **이름이 정확히 같은** 항목 | 있으면 퀵픽스가 지정, 없으면 `사내 개념으로 발행` → 개념 등록 |
| `T-002` 자식 semanticId 이탈 | ②의 템플릿 값 | 버튼 없음이 정상 — 어느 쪽이 옳은지 사용자 판단. 개정 건너온 문서면 마이그레이션 |
| `T-003` 서브모델 semanticId 이탈 | ②, `{ns}` 여부 | `템플릿 값으로 되돌리기` |

단위를 물으면 **정의(무엇을 재는가)가 먼저**라고 답하고, 뜻별 후보 단위를 나열하되 고르지 않는다.

## 보고 형식

1. 한 문장 결론 — 이 이슈들이 왜 떴는지.
2. 식별자별 표: `식별자 | 가족 | 증거(찾은 파일·origin) | 판정 | 할 일`. 증거 칸에는 **실제로 실행해 본 결과만** 쓴다.
3. 화면에서 누를 순서(짧게).
4. 확인하지 못한 것 — API가 안 떠 있었음, 사양서 PDF 필요, eCl@ss 라이선스 등. 없으면 생략.

추측으로 채운 칸이 하나라도 있으면 그 보고는 틀린 것이다. 모르면 모른다고 쓴다.
