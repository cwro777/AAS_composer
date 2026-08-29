# 프로토타입 → 플랫폼 델타

`docs/prototype.html`(단일 HTML, 약 71KB, 의존성 0)과 이 저장소가 만들려는 것의 차이.
**P1 이전에 반드시 읽는다.** 프로토타입을 열기 전에 이 문서를 먼저 보면
무엇을 베끼고 무엇을 버릴지가 명확해진다.

---

## 0. 한 줄 요약

프로토타입은 **"이 구조가 옳은가"에 답하는 물건**이고,
이 저장소는 **"여러 자산을 매일 다룰 수 있는가"에 답하는 물건**이다.
가져올 것은 **알고리즘과 규칙**이고, 버릴 것은 **코드 구조 전부**다.

---

## 1. 가져온다 — 검증된 자산

프로토타입에서 이미 동작이 확인된 것들. **새로 설계하지 말고 이식한다.**

| 프로토타입 위치 | 내용 | 이식 대상 |
|---|---|---|
| `TYPES` 객체 | 노드 9종 ↔ `modelType` 매핑, `accepts`(포함 규칙), `identifiable` | `kernel/src/model.ts` |
| `connect(from,to)` | 자기참조·타입불일치·중복부모·순환 4가지 거부 규칙 | `kernel` 명령 유효성 검사 |
| `serializeElement()` / `serialize()` | AAS Environment JSON 출력 구조 | `kernel/src/serialize.ts` |
| `supRefs()` / `inList()` | `supplementalSemanticIds` 배열화, AASd-120 idShort 생략 | 동일 |
| `walkEl()` / `semOf` `descOf` `supOf` `listSemOf` | 역직렬화 분해 방식 | `kernel/src/parse.ts` |
| `validate()` | 검사 **항목 목록** (구현이 아니라 무엇을 잡아야 하는지) | `kernel/src/validate.ts` (L2) |
| `TEMPLATES` 6종 | 확정된 semanticId 값 — 재조사 불필요 (§4 참조) | `packages/templates/src/idta/*.json` |
| `autoLayout()` | 깊이=열, 리프=행 트리 배치. 단순하지만 실사용에 충분 | `apps/web` 레이아웃 유틸 |
| 연결 UX 3경로 | 드래그 / 클릭-클릭(sticky) / 인스펙터 드롭다운 | React Flow 커스텀 핸들 |
| `--pz` 역보정 | 저배율에서 단자를 화면상 일정 크기로 유지 | 동일 개념 유지 |
| 디자인 토큰 | 슬레이트 중성색 + 신호 앰버 액센트, 노드 타입 9색 | `packages/ui/tokens.css` |

---

## 2. 가져오지 않는다 — 코드 구조

프로토타입은 단일 파일 제약 아래 쓰였다. **이 패턴이 새 코드베이스에 재현되면 P1의 의미가 사라진다.**

- 전역 가변 상태 `var S = {nodes, edges, sel, pan, zoom}` → `AasDoc` + `Layout` + `Cmd`
- `innerHTML` 문자열로 조립하는 인스펙터 → 컴포넌트 + Zod 폼
- 모든 변경 후 `render()` 전체 재그리기 → selector 기반 선택적 리렌더
- 직접 구현한 pan/zoom/drag/wire → React Flow
- `localStorage` 단일 슬롯 → 저장소 + 버전 + ETag
- 한국어 문자열을 그대로 반환하는 오류 처리 → 판별 가능한 코드 + `{ ko, en }`
- 노드 객체에 좌표를 섞어 넣기(`n.x`, `n.y`) → `Layout` 문서로 분리

---

## 3. 프로토타입이 틀렸거나 부족한 지점

계획이 고치기로 한 것들. **프로토타입 동작을 정답으로 삼지 말 것.**

| 결함 | 증상 | 계획의 대응 |
|---|---|---|
| **자식 순서가 `S.edges` 삽입 순서에 의존** | 순서 변경 UI를 만들 수 없고, `SubmodelElementList` 순서가 불안정 | `AasDoc.order` 배열이 유일한 근거 |
| **좌표가 문서 안에 있음** | 노드를 옮기기만 해도 문서가 바뀜 → 해시·diff·버전이 무의미 | `Layout` 분리, 실행취소·해시 대상에서 제외 |
| **실행취소 없음** | 실수를 되돌릴 수 없어 실사용 불가 | `Cmd` apply/undo + 명령 로그 |
| **`_raw` 보존 없음** | 가져오기에서 모르는 필드가 소실됨 — `Entity`, `Operation`, `Blob`, `qualifiers`, `administration`, `embeddedDataSpecifications` 등이 조용히 사라진다. **남의 AASX를 손상시킨다.** | 미지 필드 `_raw` 보존 후 재출력 |
| **검증 L1/L2 혼재** | 규격 제약과 사내 정책이 같은 함수 안에 섞임 | L1은 `aas-core3.0`, L2만 `validate.ts` |
| **`conceptDescriptions`가 항상 빈 배열** | 수신 측이 단위·자료형을 해석하려면 사전을 다시 조회해야 함 | 사용된 semanticId로부터 자동 생성 |
| **eCl@ss IRDI를 조회 없이 신뢰** | 버전 접미사 오류를 잡을 방법이 없음 | 사전은 **IEC CDD 단독** 조회. eCl@ss는 파싱·보존·출력만 |
| **템플릿에 확인 여부 표기 없음** | 미확인 값이 확인된 값과 구분되지 않음 | `verified: "none" \| "spec" \| "dict"` |
| **성능 미검증** | 77노드까지만 확인. 500노드 이상 불명 | 성능 예산 (`docs/plan.html` 08장) |
| **AASX 없음** | JSON 복사가 종점 | `packages/aasx` OPC 패키징 |

---

## 4. 프로토타입에서 확정된 사실 — 재조사 불필요

다음은 사양서·카탈로그를 직접 대조해 확정한 값이다. 다시 찾지 말고 그대로 쓴다.

- **Digital Nameplate 02006-3-0** — 서브모델 `https://admin-shell.io/idta/nameplate/3/0/Nameplate`.
  15개 요소가 **IEC CDD IRDI(주) + eCl@ss IRDI(보조)** 쌍으로 정의됨.
  예: `ManufacturerName` = `0112/2///61987#ABA565#009` + `0173-1#02-AAO677#004`
- **Handover Documentation 02004-2-0** — 서브모델 `0173-1#01-AHF578#003`.
  `Documents(SML) → Document(SMC) → {DocumentIds, DocumentClassifications, DocumentVersions}(SML) → …(SMC)`
  3중 중첩. 각 SML에 `semanticIdListElement`가 붙는다.
- **Carbon Footprint 02023 v1.0** — `https://admin-shell.io/idta/CarbonFootprint/CarbonFootprint/1/0`.
  0.9의 `PCF*` 이름이 `Pcf*`로 바뀌고 `TransportCarbonFootprint`는 삭제됨.
- **Technical Data 02003-1-2**, **Time Series 02008-1-1** — 현행 최신.
- **무손실 왕복이 성립함** — 6종 템플릿 전부 삽입한 77노드 모델에서
  `serialize → parse → serialize` 문자열 동일, 검증 이슈 0건.

### 확인하지 못한 값 — `verified: "none"`으로 이식할 것

- Nameplate 3.0의 `AddressInformation` 하위 4개(`Street` `Zipcode` `CityTown` `NationalCode`)의
  IRDI는 카탈로그에 이름만 있어 **2.0 기준값을 사용**했다. 사양서 PDF에서 재확인 필요.
- `LifeCyclePhases`의 `semanticIdListElement`(`0173-1#02-ABG858#003`)는
  0.9 문서에서 가져온 값이다.

---

## 5. 열어볼 때

`docs/prototype.html`은 브라우저에서 바로 열린다. `<script>` 블록이 전부이고 순서는
① 메타모델 정의 · 템플릿 → ② 상태 → ③ 직렬화 → ④ 검증 → ⑤ 렌더링 → ⑥ 캔버스 상호작용 → ⑦ 명령.

**①③④만 읽으면 된다.** ⑤⑥은 React Flow가 대체하므로 읽을 이유가 없고,
읽으면 오히려 그 패턴을 옮기게 된다.
