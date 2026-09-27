# AAS Composer

산업 자산을 IEC 63278(AAS) V3.0 모델로 저작·검증·게시하는 웹 플랫폼.

- 설계 근거: `docs/plan.html` (고도화 구현 계획, 11단계)
- 출발점: `docs/prototype.html` (단일 HTML 프로토타입 — 검증된 로직의 원본)
- **프로토타입과의 델타: `docs/prototype-delta.md` — 프로토타입을 열기 전에 반드시 먼저 읽는다**
- semanticId 사용법·개념 등록·CD-001 해소: `docs/semantic-id.md`

## 확정된 전제 — 다시 논의하지 않는다

이 다섯 가지는 P0에서 확정되었다. 대안을 제안하거나 "혹시 몰라" 양쪽을 다 만들지 말 것.

- **사전은 IEC CDD 단독.** eCl@ss 라이선스가 없다. eCl@ss IRDI는 파싱·보존·출력만 하고 **조회·검증하지 않는다**. 사전 어댑터는 `DictAdapter` 인터페이스 뒤에 두어 나중에 추가할 여지만 남긴다.
- **단일 사용자.** 실시간 공동 편집·CRDT를 만들지 않는다. 충돌은 ETag 409 + 재적재 안내로 끝낸다. 단, **명령 로그와 버전은 유지한다** (감사 추적·되돌리기의 근거).
- **게시 대상은 BaSyx V2 (AAS V3 API).** 버전 어댑터를 만들지 않는다.
- **대상 규모는 설비 10~50대.** 일괄 생성보다 **템플릿 정확도와 표 편집 속도**가 우선이다. CSV 매핑 UI를 만들지 않는다 (고정 컬럼만).
- **인터넷 접근 가능.** 폐쇄망 오프라인 설치 이미지를 만들지 않는다.
- **n8n을 쓰지 않는다.** `packages/n8n-nodes`를 만들지 않는다.
- **값 수집은 `apps/api`가 직접 한다** (①안 확정). 외부 오케스트레이터도, `POST /ingest`
  수신 경로도 만들지 않는다. 접점 설정은 **AID 서브모델이 곧 설정 파일**이다 —
  별도 커넥터 설정 파일·화면을 만들지 말 것.

## 절대 규칙

- **`docs/prototype.html`은 참고 구현이다.** 가져올 것은 알고리즘과 규칙(매핑·포함 규칙·직렬화 구조·검증 항목·확정된 semanticId)뿐이고, **코드 구조는 가져오지 않는다.** 전역 가변 상태, `innerHTML` 문자열 조립, 변경마다 전체 재렌더, 노드 객체에 좌표를 섞는 방식은 옮기지 않는다. 프로토타입의 동작을 정답으로 삼지 말 것 — 알려진 결함은 `docs/prototype-delta.md` 3장에 있다.

- AAS JSON을 **손으로 조립하지 않는다.** 반드시 `@aas/kernel`의 `serialize()`를 쓴다.
- 규격 제약(`AASd-*`)을 **직접 구현하지 않는다.** `aas-core3.0` 검증기에 위임한다.
  `packages/kernel/src/validate.ts`에는 **사내 정책(L2)만** 둔다.
- `packages/kernel`에 react / next / hono / fflate / DOM API / fetch 를 import 하지 않는다.
  kernel의 tsconfig는 `lib: ["ES2022"]`, `types: []`라 **DOM 타입이 아예 없다.** 타입 오류가 나면 우회하지 말고 설계를 고쳐라. `pnpm check:kernel`이 CI에서 다시 막는다.
- **semanticId 문자열을 추측하지 않는다.** `@aas/templates` 레지스트리에서 가져오거나, 없으면 사용자에게 확인한다. IRDI의 버전 접미사(`#003` 등)를 임의로 바꾸지 않는다. 확인하지 못한 값은 `verified: "none"`으로 남기고 보고한다.
- **SubmodelElementList의 직속 자식에는 idShort를 출력하지 않는다** (AASd-120).
- **자식 순서는 `AasDoc.order` 배열이 유일한 근거다.** 간선 삽입 순서나 객체 키 순서에 의존하는 코드를 쓰지 않는다. 프로토타입이 이 때문에 List 순서를 표현하지 못했다.
- **좌표(x/y)를 `AasDoc`에 넣지 않는다.** 화면 정보는 `Layout` 문서로 분리되어 있고 실행취소·diff·해시의 대상이 아니다.
- **문서 변경은 반드시 `Cmd`를 거친다.** 스토어나 문서를 직접 변형하지 않는다. 실행취소·버전·감사 추적이 전부 여기서 나온다.
- 오류·거부 사유는 **사람이 읽는 문자열이 아니라 판별 가능한 코드**로 반환한다. 메시지는 `{ ko, en }` 두 벌.

## 명령어

- `pnpm dev` — web(3000) + api(8787) 동시 실행
- `pnpm verify` — check:kernel + typecheck + test + lint. **커밋 전 반드시 통과**
- `pnpm test --filter @aas/kernel` — 커널 단위 테스트
- `pnpm check:kernel` — 커널 의존성 경계 검사 (금지된 import 탐지)
- `pnpm e2e` — Playwright (dev 서버를 설정이 직접 띄운다)
- `pnpm golden:update` — 골든 JSON 갱신. **의도한 변경일 때만**, 커밋 메시지에 이유를 적는다

## 구조

- `packages/kernel` — 문서 모델 · 명령 · 직렬화 · 파싱 · 검증. **유일한 진실.** 순수 TypeScript
- `packages/templates` — IDTA 템플릿 정의(JSON) + 레지스트리 + 적합성 검사
- `packages/semantic` — IRDI/IRI 파서(순수) + 사전 클라이언트(네트워크). **엔트리를 분리**해 커널은 파서만 쓴다
- `packages/aasx` — OPC 패키징. 브라우저·서버 공용(fflate). 커널 밖에 두는 이유는 ZIP 의존성 때문
- `packages/ui` — 디자인 토큰과 공용 컴포넌트. 색은 CSS 변수로만
- `apps/web` — Next.js. `/editor`, `/dashboard/models`, `/dashboard/operations`
- `apps/api` — Hono. 저장소 · 명령 로그 · 사전 프록시 · BaSyx 게이트웨이
- `e2e` — Playwright

## 코드 규약

- 색상 리터럴(`#hex`) 금지. `var(--…)` 토큰만 사용한다.
- 서버 상태는 TanStack Query, 에디터 상태는 Zustand. 둘을 섞지 않는다.
- 파생값(JSON 미리보기, 검증 이슈)은 스토어에 저장하지 않고 selector로 계산한다.
- 새 SubmodelElement 종류를 추가할 때는 model → serialize → parse → validate → 노드 컴포넌트 → 골든 테스트 순서로 **전부** 손댄다. 하나라도 빠지면 왕복이 깨진다.
- 파싱하지 못한 필드는 버리지 말고 `_raw`로 보존해 그대로 재출력한다. **남의 AASX를 손상시키지 않는 것이 규칙이다.**

## 작업 방식

- 커널을 바꾸면 반드시 왕복 테스트를 돌린다 — `parse(serialize(doc)) ≡ doc`, `canonicalize` 기준 의미 동등.
- 명령을 추가하면 `apply → undo`가 원문서로 복귀하는지 속성 테스트를 함께 쓴다.
- UI를 바꾸면 스크린샷을 찍어 **직접 본다.** "될 것 같다"로 끝내지 않는다. `ui-reviewer` 서브에이전트를 쓴다.
- 성능 예산(`docs/plan.html` 08장)을 넘기면 기능을 더 얹지 않는다.
- 커밋은 하나의 논리 단위. `pnpm verify` 통과 전에는 커밋하지 않는다.
- 커널·스키마·디자인 토큰을 건드리는 작업은 **직렬로만** 한다. 병렬 워크트리는 대시보드·템플릿·문서에만.

## 현재 상태

**P1·P2·P3 완료.** `pnpm verify` 통과 — 22/22 태스크, 101개 테스트
(커널 32 · 템플릿 65 · 스텁 스모크 4).

- `@aas/kernel` — 문서 모델·명령·직렬화·파싱·정규화·L1 위임·L2 정책. **노드 15종.**
- `@aas/templates` — **템플릿 9종** + 적합성 검사(T-001·T-002·T-003) + `verified` 표기
  + **개정 마이그레이션**(`planMigration` — 미리보기와 적용을 분리한다).
  기존 6종 + Hierarchical Structures(02011-1-1) + AID MQTT·OPC UA(02017-1-1).
  미확인 semanticId는 **7건, 전부 eCl@ss 후보**다 — Operational Data 4건, Technical Data의
  공식 템플릿에 없는 예시 속성 3건. 라이선스가 없어 대조하지 못했고 P0 결정대로 IRDI는 유지한다.
  사내 개념(`{ns}` — OperationalData·Timestamp)은 우리 이름이라는 선언이라 미확인에 세지 않는다.
  **`/idta/`가 들어 있다고 IDTA 개념이 아니다** — 예전 Timestamp의 `…/idta/TimeSeries/UtcTime/1/1`은
  IDTA 공식 JSON 어디에도 없었다. 근거는 공식 Template JSON·사양서 본문뿐이다.
- `apps/web` — **P9 운전 모니터링 진행 중.** `/dashboard/operations`가 서버를 본다 —
  수집 상태·신호별 지연·시계열. **지연은 서버가 준 `now`로 잰다**(브라우저 시계는 어긋난다).
  값이 온 적 없는 신호도 목록에 남고, 조회 실패를 "신호 없음"으로 보이지 않는다.
  서버 없음·모델 없음·수집 꺼짐을 각각 다른 화면으로 안내한다 — 사용자가 할 일이 다르다.
  차트는 라이브러리 없이 SVG다. 축약은 구간 min·max를 남긴다(균등하게 솎으면 스파이크가 사라진다).
  **팬·줌은 아직 없다** — 계획서의 10만 점 목표는 남아 있다.
  모델 자산 관리(`/dashboard/models`)는 아직 없다.
  대시보드만 TanStack Query를 쓰고 에디터(Zustand)와 섞지 않는다.
- `apps/web` — **P4 완료, P5 진행 중.** `/editor`에 트리·캔버스·표 3뷰가 있고
  셋이 같은 스토어(문서·선택)를 본다. 실행취소는 커널의 역명령으로 만든다(zundo 없음).
  좌표는 Layout이라 실행취소 대상이 아니다. 표 편집의 붙여넣기는 batch 한 개다.
- `@aas/semantic` — **P6 진행 중.** IRDI/IRI 파서, 사내 용어집(`terms.sample.json` — **샘플**),
  용어집을 커널 개념 해석기로 잇는 어댑터. 사전 프록시(IEC CDD 조회)는 P7에서 `apps/api`에 붙는다.
  파서는 **추측하지 않는다** — 모양이 맞지 않으면 `unknown`이다.
- `@aas/kernel`의 `concept.ts` — ConceptDescription 생성. 규격이 영문 표제어(AASc-3a-002)와
  영문 정의(AASc-3a-008)를 요구하므로, 없으면 **만들지 않고 이유를 남긴다.** 지어내지 않는다.
  그래서 표준 개념(IEC CDD·eCl@ss)은 사전 프록시가 붙기 전까지 해석되지 않는다.
- `@aas/aasx` — **P7 완료.** OPC 패키지 쓰기·읽기. 관계 타입은 admin-shell.io가 정한 것을
  그대로 쓴다(이름을 지어내면 Package Explorer가 열지 못한다). `docs/sample-imm150.aasx`가
  실제 산출물이다.
- `apps/api` — **P7 진행 중.** 모델 저장소·명령 로그·버전 비교·검증·AASX·BaSyx 게시.
  저장소는 `DATABASE_URL`이 있으면 **PostgreSQL(Drizzle)**, 없으면 메모리다. 메모리일 때는
  껐다 켜면 사라지고 시작 로그가 그렇게 말한다.
  게시는 **부분 실패를 롤백하지 않는다** — 항목별 결과를 돌려주고 실패한 것만 다시 시도한다.
  **게시에는 개념 설명이 함께 간다.** 서버는 브라우저 용어집을 모르므로 `buildServerExport`가
  사전(캐시)과 샘플로 개념을 만든다 — 에디터가 `서버에 보내기`에서 용어집을 `/dictionary/import`로
  함께 밀어 넣는 것이 그 근거다. 모르는 것은 지어내지 않고 `unresolved`로 돌려준다.
  **mock에서 온 개념은 싣지 않는다** — 지어내거나 라이선스를 가정한 자료라 남의 서버에
  남기지 않는다(뺀 것은 `mock`으로 돌려준다). 에디터도 mock 항목은 사전에 보내지 않고,
  `/dictionary/import`는 이미 mock인 항목의 origin을 덮어쓰지 않는다 — 한 번 `editor:…`로
  덮여 지어낸 정의가 보통 항목처럼 보였고, 그래서 게시에서 걸러낼 근거가 사라졌다.
  AASX 내보내기도 같은 함수를 쓴다 — 한쪽만 고치면 파일과 게시가 서로 다른 것을 말한다.
  네트워크는 주입받으므로(`createApp(store, { fetchLike })`) 테스트는 실제 BaSyx 없이 돈다.
  **사전 프록시는 캐시가 답한다.** 상류(IEC CDD)는 꽂혀 있지 않다 — cdd.iec.ch가 자동 접근을
  403으로 막고 공개 REST 창구를 확인하지 못했다. **없는 API를 가정해 어댑터를 쓰지 말 것.**
  캐시를 채우는 것은 `scripts/dict-seed.ts`이고 근거는 실재하는 자료뿐이다 —
  사내 용어집과 IDTA Template JSON의 conceptDescriptions.
  **IDTA CD에는 단위가 거의 없다**(223건 중 1건). 단위는 자체 개념이나 IEC CDD에서 온다.
  일괄 생성만 501이다.
- **값 수집 — MQTT·OPC UA 완료.** `planFor(doc)`가 AID 서브모델에서
  프로토콜·주소·신호를 읽고, 읽지 못한 것은 `problems`에 남긴다(조용히 넘기지 않는다).
  **어댑터가 없는 프로토콜은 없다고 말한다** — `/collect/:id/start`가 207과 함께
  건너뛴 접점과 이유를 돌려준다. 있는 척하지 않는 것이 규칙이다.
  숫자로 읽히지 않는 페이로드는 `textValue`로 담는다 — **0으로 바꾸지 않는다.**
  **연결 대기용 타이머는 반드시 지운다.** 지우지 않으면 붙은 지 timeout 뒤에 그 타이머가
  살아 있는 연결을 끊고, 이미 resolve된 뒤라 오류도 남지 않아 값만 조용히 멎는다
  (실제로 8초마다 그랬다). 붙은 뒤의 `'error'`도 반드시 듣는다 — EventEmitter라
  아무도 듣지 않으면 API 프로세스가 죽는다. 어댑터의 `connect`는 주입 가능하고
  회귀 테스트가 이 둘을 지킨다.
  OPC UA는 폴링이 아니라 **구독**이고, AID의 browsePath를
  TranslateBrowsePathsToNodeIds로 한 번 옮긴 뒤 감시한다. 상태 코드가 Bad면 값이 아니라
  `problems`로 간다. 보안은 None/익명뿐 — 인증이 필요한 엔드포인트는 연결에서 거절되고
  그 사유가 `skipped`에 남는다.
  실브로커·실서버 점검: `scripts/collect-check.ts`(MQTT) · `scripts/opcua-check.ts`(OPC UA —
  실측 픽스처의 browsePath와 같은 주소공간을 띄워 붙는다. 틀린 주소일 때까지 함께 본다)
  화면을 움직이는 값이 필요하면 `scripts/feed-demo.ts`.
  **`GET /models/:id/signals`가 운전 화면의 근거다.** 신호별 마지막 한 건을 SQL
  `DISTINCT ON`으로 뽑는다 — 최근 N건을 받아 화면에서 묶으면 수다스러운 신호가 창을 채워
  조용한 신호가 목록에서 사라진다. 원시 SQL은 drizzle의 타입 변환을 거치지 않으므로
  타임스탬프·수치를 손으로 변환한다(그래서 한 번 500이 났다).
- **웹(3000)이 API(8787)를 직접 부른다.** CORS는 localhost로 좁혀 두었다(`WEB_ORIGIN`).
  에디터는 여전히 브라우저 안에만 저장하고, **서버로 보내는 것은 명시적인 동작**이다
  (파일 메뉴의 '서버에 보내기'). 지금은 새 모델로 만들기만 한다 — 덮어쓰기·버전 잠금은 미구현.
  파일 메뉴의 **'BaSyx에 게시'** 는 서버에 없는 모델이면 먼저 보낸 뒤 `POST /publish/:id`를 부른다.
  검증 오류가 있으면 서버가 422로 막고, **강행은 사람이 확인 창에서 결정한다**(force).
- **이 PC의 5432는 다른 스택(TimescaleDB)이 쓰고 있다.** 우리 PostgreSQL은 **5433**이다.
  Docker는 WSL 안에서 돈다 — `wsl -e bash -lc "cd /mnt/c/… && docker compose up -d"`.
  살아 있는 스택 점검: `pnpm --filter @aas/api exec tsx scripts/live-check.ts`
- 나머지 워크스페이스는 **스캐폴드**다 — `ui`(토큰만) · `e2e`.

P3에서 확정된 것:
- **템플릿은 IDTA 공식 저장소의 Template JSON에서 기계로 추출한다.** PDF를 사람이 옮겨
  적지 않는다. `admin-shell-io/submodel-templates`의 published/… 아래 JSON이 규범 artifact다.
- **인스턴스 데이터 없이 규격을 만족할 수 없는 요소는 자동 삽입하지 않는다**(`autoInsert:false`).
  RelationshipElement의 first/second가 그렇다. 공식 템플릿은 "EMPTY" 자리표시자를 쓰지만
  우리는 가짜 참조를 심지 않는다. 정의는 남으므로 팔레트에 뜨고 T-001도 안다.
- **빈 컬렉션은 value/submodelElements/최상위 배열을 내보내지 않는다.** 규격이
  "설정하지 않거나 최소 1개"를 요구한다. MultiLanguageProperty의 빈 value도 같다.
  `test/empty-collection.test.ts`가 지킨다.
- **골든 스냅샷 키는 템플릿 id로 고정한다.** name·idtaNumber·version을 키에 넣으면
  메타데이터를 고치는 순간 골든이 고아가 되고 새 키로 조용히 다시 쓰인다 — 안전망이 사라진다.
- **사내 정의 템플릿의 semanticId는 `{ns}`로 쓴다**(예: `{ns}/cd/OperationalData/1/0`).
  `instantiate()`가 사내 네임스페이스로 치환하고, 적합성 검사는 `conformsToTemplateValue`로
  어느 IRI 네임스페이스든 받는다. 되돌리기 값은 서브모델 식별자(idPattern)에서 되읽는다.
  도메인을 JSON에 박지 말 것 — 네임스페이스를 바꾼 뒤에도 그 템플릿만 옛 도메인으로 발행된다.
  표준(IDTA·IEC CDD·eCl@ss) 식별자에는 쓰지 않는다.
- **마이그레이션은 계획과 적용을 분리한다.** `planMigration()`은 문서를 바꾸지 않고
  steps(미리보기)와 manual(사람이 판단할 것)을 돌려준다. 구조가 바뀌는 항목을
  자동 변환하지 않는 것이 핵심이다 — 조용히 옮기면 데이터가 사라진다.

확정된 것 — 다시 설계하지 않는다:
- 자식 순서는 `AasDoc.order` 배열, 좌표와 List 자식의 표시 이름은 `Layout`.
- List 직속 자식은 **문서에서도** idShort가 빈 문자열이다(AASd-120). 직렬화 시점에만 생략하면
  왕복이 깨진다. 표시 이름은 `Layout.label`에 둔다.
- 빈 `conceptDescriptions`는 내보내지 않는다. 규격이 "설정하지 않거나 최소 1개"를 요구한다.
- `typeValueListElement`가 Property·Range면 `valueTypeListElement`가 필수다(AASd-109).
- **Operation의 자식 순서는 슬롯 그룹(in → out → inout)으로 정규화한다.** JSON이 세 배열로
  나눠 담으므로 슬롯이 뒤섞인 하나의 순서는 표현할 수 없다. `apply()`가 안정 정렬한다.
  **역명령은 슬롯을 먼저 맞춘 뒤에 옮긴다.** 정렬이 안정적이라 자리는 (슬롯, 색인)으로
  정해지는데, 순서를 뒤집으면 중간 상태의 기본 슬롯('in')으로 자리가 매겨지고 뒤늦게
  슬롯을 고쳐도 그룹 안 상대 순서가 어긋난 채 남는다. `opSlot`을 바꾸는 `set`의 역명령도
  값 복원 뒤에 원래 색인으로 한 번 더 옮긴다. `test/opslot.test.ts`가 지킨다.
- **같은 셸에 같은 semanticId의 서브모델이 둘이면 POL-STRUCT-004다.** 규격이 금지하지는
  않지만 IDTA 템플릿은 자산 하나에 한 벌을 전제한다. 합치기는 `planMerge()`가 계획만
  만들고(문서를 바꾸지 않는다), 이름이 겹쳐 옮기지 못하는 자식은 **몇 개가 사라지는지
  세어 사람에게 보인 뒤에** 지운다. 남기는 쪽의 필드는 건드리지 않는다 —
  어느 쪽이 옳은지 우리가 모른다.
- `opSlot`은 부모가 Operation일 때만 유효하다. 밖으로 옮기면 `apply()`가 지우고,
  되돌리면 역명령이 복구한다.
- **qualifiers · extensions · administration · specificAssetIds · derivedFrom · assetType ·
  defaultThumbnail은 1급 필드다.** raw 보존이 아니라 편집 대상이다.
- 그 밖에 모르는 필드는 `node.raw` / `doc.raw` / `raw.assetInformation` / Reference·Qualifier의
  `raw`에 보존해 그대로 재출력한다.
- **사내 네임스페이스는 값이지 상수가 아니다.** 웹은 `NEXT_PUBLIC_IRI_PREFIX`, 서버는
  `IRI_PREFIX`이고 **둘은 같아야 한다.** 에디터에서 바꿀 수 있고 브라우저에 남는다.
  **두 앱 모두 저장소 루트 `.env` 하나를 읽는다**(웹은 `next.config.ts`의 `loadEnvFile`).
  API에서 환경값을 **모듈 최상위 상수로 읽지 말 것** — ESM은 import를 먼저 평가하므로
  `index.ts`가 `.env`를 읽기 전에 값이 굳는다(실제로 IRI_PREFIX·BASYX_URL이 그렇게 무시됐다).
  비우면 검사하지 않는다. 코드에 도메인을 박으면 다른 회사에서는 열자마자 모든 식별자가
  경고로 뜨고 고칠 방법이 없다.
- **idShort와 전역 식별자는 유일성 범위가 다르다.** idShort는 형제 안에서, 식별자는
  **모델 전체에서** 유일해야 한다. 식별자를 idShort에서 파생시키되 형제 기준으로만
  중복을 피하면, 다른 셸 아래의 서브모델과 그대로 부딪힌다(화면에는 이름이 달라 보여
  원인을 찾기 어렵다). 발급은 `mintIdentifier()` / `uniqueIdentifier()` 한 곳만 쓴다 —
  `edit.ts`의 새 노드도, `instantiate()`의 템플릿도, 퀵픽스도 같은 함수다.
- **네임스페이스를 옮길 때는 모델과 용어집을 함께 옮긴다.** 커널 `planNamespaceMove`가
  식별자(참조까지)·자산·개념 semanticId(보조·목록·Qualifier·Extension·SpecificAssetId)를
  batch 하나로, 웹 `planGlossaryMove`가 용어집 항목을 옮긴다. 계획과 적용을 분리하고,
  표준 네임스페이스(admin-shell.io)와 서로 품는 접두어는 거절한다. 용어집은 문서가 아니라
  Ctrl+Z가 닿지 않으므로 옮기기 전 사본을 남기고 되돌리기를 따로 둔다.
- **식별자를 바꿀 때는 참조를 함께 고친다.** `renameIdentifier()`가 문서 전체의
  Reference 키를 훑어 하나의 batch로 만든다. 식별자만 바꾸면 그것을 가리키던
  Relationship·ReferenceElement·derivedFrom이 조용히 끊긴다. `raw`는 건드리지 않고
  `identifierIsReferencedInRaw()`가 그 사실을 알린다 — 남의 데이터를 문자열 치환으로
  헤집는 것이 더 나쁘다.
- **semanticId가 없을 때 할 수 있는 것은 두 가지뿐이다.** ① 사내 용어집에 **이름이 정확히
  같은** 항목이 있으면 그 식별자를 쓴다(`termByName` — 부분일치는 쓰지 않는다). ② 없으면
  `selfIssuedIri()`로 **우리 이름으로 발행한다**(`<접두어>/cd/<이름>/1/0`). 표준 IRDI를
  지어내는 것과 자체 발행은 다르다 — 후자는 근거가 없다는 것을 밝히는 행위다.
  발행 뒤에도 CD-001이 남는 것이 옳다. 영문 이름과 정의를 용어집에 넣어야 개념이 함께 나간다.
- **용어집은 두 겹이다.** `SAMPLE_TERMS`(파일, 샘플) + 브라우저의 사내 용어집
  (`apps/web/lib/terms.ts`). 뒤가 이긴다. 자체 발행한 개념은 여기서 뜻을 채워야
  CD-001이 사라지고 ConceptDescription이 내보내기에 실린다.
  **미리보기·내보내기·AASX·검증이 같은 책을 봐야 한다** — 화면에서는 해석됐는데 파일에는
  개념이 빠지면 손실을 알아챌 방법이 없다. `buildExport(doc, book)`에 항상 넘긴다.
  표준 개념(IEC CDD·eCl@ss)에는 등록 창을 열지 않는다 — 정의를 우리가 갖고 있지 않다.
  브라우저에 갇히지 않게 내보내기를 같은 자리에 둔다.
  **책 사이에 서버 사전의 답이 끼어 있다**(샘플 → 사전 → 사내). 검증이 CD-001을 내면
  물어본 적 없는 id만 자동으로 묻고 답은 세션 메모리에만 둔다 — 사내 용어집에 자동으로
  쌓지 않는다(사람의 장부다). mock 시드에서 온 답은 용어집 탭에 `mock`으로 표시한다.
  **불러온 파일에 실린 개념(`doc.raw.conceptDescriptions`)에는 CD-001을 내지 않는다** —
  내보낼 때 그대로 나간다. `attachConceptDescriptions`가 id로 합치고(같은 id는 새로 만든
  쪽이 이긴다) 에디터의 규격 검증은 `serialize()`가 아니라 **내보낼 것**을 검사한다.
- **목록 직속 자식의 의미는 자식이 아니라 목록에 있다.** semanticId가 아니라 부모의
  `semanticIdListElement`로 지정한다(AASd-120으로 자식은 idShort조차 없다).
  목록 항목의 개념은 목록 자신의 개념과 **다른 IRI**여야 한다(`…/<이름>/Element/1/0`).
- **검증 이슈는 복사할 수 있어야 한다.** 이슈 줄이 버튼이라 브라우저가 드래그를 클릭으로
  본다. 선택만 믿지 말고 복사 버튼을 따로 둔다.
- **커널이 만든 `quickFix`는 UI가 그대로 내보낸다.** 화면에서 다시 만들지 않는다
  (한동안 버려지고 있어서 POL-NAME-002의 이름 고치기가 뜨지 않았다).
- **수집한 값을 저작 문서에 되쓰지 않는다.** 값이 바뀔 때마다 명령 로그에 버전이 생기면
  버전 비교가 무의미해진다. 저작 모델은 구조의 원본이고, 실행 중 값은 시계열(`samples`)과
  BaSyx(런타임 사본)가 갖는다.
- **신호 → 대상 요소 연결은 짐작하지 않는다.** AID는 접점만 기술하고 어느 요소에 값을 쓸지는
  가리키지 않는다. 그 연결은 IDTA 02027(AIMC)의 몫이고, 그 전까지 BaSyx `PATCH $value`는
  꽂지 않는다.

다음 작업은 **P3**(템플릿 엔진 — 정의·적합성·마이그레이션). 템플릿 8종으로 늘리고
(Hierarchical Structures 02011-1-1, Asset Interfaces Description 02017-1-1),
harvest 결과를 사양서와 두 번 대조해 `verified`를 `spec`으로 올린다.
Nameplate 2.0 → 3.0 마이그레이션 미리보기도 이 단계다.

열려 있는 것:
- **P0 실측 — 사출성형기 1대 완료, 2대 남음.**
  `packages/templates/test/build-imm.ts`가 템플릿만으로 설비 한 대를 조립하고,
  결과를 `packages/kernel/test/fixtures/injection-molding-imm150.json`으로 남긴다
  (갱신: `UPDATE_FIXTURE=1 pnpm test --filter @aas/templates`).
  **실측에서 걸린 지점은 같은 테스트의 `friction` 골든에 있다** — P4·P5·P6의 근거다.
  다음 설비는 같은 방식으로 build-*.ts를 하나 더 쓰면 된다.
- **Package Explorer 샘플 AASX 3종** — 같은 폴더에 넣으면 손실 없이 열고 저장되는지 검사된다.
  현재는 15종 노드를 모두 쓰는 합성 픽스처(`test/coverage.test.ts`)로 대신하고 있다.
- 미확인 semanticId 7건(eCl@ss 후보) — `unverifiedOf()`가 목록으로 내주고 골든 스냅샷에 고정돼 있다.
