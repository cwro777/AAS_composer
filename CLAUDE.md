# AAS Composer

산업 자산을 IEC 63278(AAS) V3.0 모델로 저작·검증·게시하는 웹 플랫폼.

- 설계 근거: `docs/plan.html` (고도화 구현 계획, 11단계)
- 출발점: `docs/prototype.html` (단일 HTML 프로토타입 — 검증된 로직의 원본)
- **프로토타입과의 델타: `docs/prototype-delta.md` — 프로토타입을 열기 전에 반드시 먼저 읽는다**

## 확정된 전제 — 다시 논의하지 않는다

이 다섯 가지는 P0에서 확정되었다. 대안을 제안하거나 "혹시 몰라" 양쪽을 다 만들지 말 것.

- **사전은 IEC CDD 단독.** eCl@ss 라이선스가 없다. eCl@ss IRDI는 파싱·보존·출력만 하고 **조회·검증하지 않는다**. 사전 어댑터는 `DictAdapter` 인터페이스 뒤에 두어 나중에 추가할 여지만 남긴다.
- **단일 사용자.** 실시간 공동 편집·CRDT를 만들지 않는다. 충돌은 ETag 409 + 재적재 안내로 끝낸다. 단, **명령 로그와 버전은 유지한다** (감사 추적·되돌리기의 근거).
- **게시 대상은 BaSyx V2 (AAS V3 API).** 버전 어댑터를 만들지 않는다.
- **대상 규모는 설비 10~50대.** 일괄 생성보다 **템플릿 정확도와 표 편집 속도**가 우선이다. CSV 매핑 UI를 만들지 않는다 (고정 컬럼만).
- **인터넷 접근 가능.** 폐쇄망 오프라인 설치 이미지를 만들지 않는다.
- **n8n을 쓰지 않는다.** `packages/n8n-nodes`를 만들지 않는다. 값 수집·자동화를 n8n에
  맡기려던 계획은 취소됐다. **대체 경로는 아직 정해지지 않았다** — P8 착수 시
  ① `apps/api`가 OPC UA·MQTT로 직접 수집 ② 기존 MES/SCADA가 `POST /ingest`로 밀어 넣기
  중에서 고른다. 그 전까지 수집 코드를 짐작으로 만들지 말 것.

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
  미확인 semanticId는 9건뿐이고 전부 이유가 분명하다 — 사내 정의 6건,
  공식 템플릿에 없는 예시 속성 3건(eCl@ss 라이선스 없음).
- `apps/web` — **P4 완료, P5 진행 중.** `/editor`에 트리·캔버스·표 3뷰가 있고
  셋이 같은 스토어(문서·선택)를 본다. 실행취소는 커널의 역명령으로 만든다(zundo 없음).
  좌표는 Layout이라 실행취소 대상이 아니다. 표 편집의 붙여넣기는 batch 한 개다.
- `@aas/semantic` — **P6 진행 중.** IRDI/IRI 파서, 사내 용어집(`terms.sample.json` — **샘플**),
  용어집을 커널 개념 해석기로 잇는 어댑터. 사전 프록시(IEC CDD 조회)는 P7에서 `apps/api`에 붙는다.
  파서는 **추측하지 않는다** — 모양이 맞지 않으면 `unknown`이다.
- `@aas/kernel`의 `concept.ts` — ConceptDescription 생성. 규격이 영문 표제어(AASc-3a-002)와
  영문 정의(AASc-3a-008)를 요구하므로, 없으면 **만들지 않고 이유를 남긴다.** 지어내지 않는다.
  그래서 표준 개념(IEC CDD·eCl@ss)은 사전 프록시가 붙기 전까지 해석되지 않는다.
- 나머지 워크스페이스는 **스캐폴드**다 — `aasx`(P7) · `ui`(토큰만) · `api`(P7) · `e2e`.
  기능은 `throw new Error('P#에서 구현합니다.')` 스텁이고,
  스모크 테스트가 "스텁임"을 검사한다. **스텁을 구현으로 착각하지 말 것.**

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
- `opSlot`은 부모가 Operation일 때만 유효하다. 밖으로 옮기면 `apply()`가 지우고,
  되돌리면 역명령이 복구한다.
- **qualifiers · extensions · administration · specificAssetIds · derivedFrom · assetType ·
  defaultThumbnail은 1급 필드다.** raw 보존이 아니라 편집 대상이다.
- 그 밖에 모르는 필드는 `node.raw` / `doc.raw` / `raw.assetInformation` / Reference·Qualifier의
  `raw`에 보존해 그대로 재출력한다.

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
- 미확인 semanticId 8건 — `unverifiedOf()`가 목록으로 내주고 골든 스냅샷에 고정돼 있다.
