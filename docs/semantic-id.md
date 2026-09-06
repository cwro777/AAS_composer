# semanticId 다루기 — 인스펙터 사용법과 개념 등록

`semanticId`는 "이 값이 무엇인가"를 가리키는 유일한 자리다. 여기가 비거나 틀리면
받는 쪽은 숫자만 받고 뜻을 모른다. 그래서 이 프로젝트의 규칙은 하나다 —
**추측해서 쓰지 않는다.**

관련 코드: [`SemanticField.tsx`](../apps/web/components/SemanticField.tsx) ·
[`ConceptForm.tsx`](../apps/web/components/ConceptForm.tsx) ·
[`terms.ts`](../packages/semantic/src/terms.ts) ·
[`concept.ts`](../packages/kernel/src/concept.ts)

---

## 1. 인스펙터의 semanticId 칸

노드를 고르면 인스펙터에 `semanticId` 칸이 나온다. 경우는 셋뿐이다.

### A. 표준 식별자를 이미 안다 — 그대로 붙여넣는다

칸에 입력하고 `Enter`. `Esc`는 되돌리기다.

```
0112/2///61987#ABA951#009                              IEC CDD IRDI  (시리얼번호)
0173-1#02-AAO677#002                                   eCl@ss IRDI   (제조사명)
https://admin-shell.io/idta/TimeSeries/Metadata/1/1    IDTA IRI
```

**끝의 `#009` · `#002`는 장식이 아니라 다른 식별자다.** 사양서에 적힌 그대로 쓰고,
버전 접미사를 임의로 올리거나 내리지 않는다.

### B. 식별자를 모른다 — `한글 용어로 찾기`

IEC CDD에는 한글 표제어가 없다. 현장에서 "형체력"으로 찾을 수 없으면 사전 기능은
결국 안 쓰인다 — P0 실측에서 나온 요구다. 그래서 **어느 쪽으로 쳐도 찾는다.**

| 입력 | 걸리는 것 |
|---|---|
| `형체력` | 사내 용어 (본 이름) |
| `실린더온도` | **별칭** — 실제 용어는 "배럴온도" |
| `Serial` | 영문 이름 |
| `ABA951` | 식별자 일부 |

후보에는 영문 이름 · 식별자 · **단위** · `표준`/`사내` 배지가 함께 뜬다.
고르기 전에 **단위가 맞는지** 본다. 이름이 비슷해도 단위가 다르면 다른 개념이다.

고르면 `semanticId`가 채워진다.

### C. 아무 데도 없다 — 자체 발행한다

검색이 비면 이렇게 안내한다.

> 용어집에 없습니다. 표준 사전에도 없다면 자체 IRI를 발급하고 용어집에 등록하십시오.

이때 **표준 IRDI를 지어내지 않는다.** 검증 탭의 `POL-SEM-001` 이슈에서
`사내 개념으로 발행`을 누르면 우리 이름으로 발행한다.

```
https://bnb.co.kr/ids/cd/BarrelTemperature/1/0
└ IRI_PREFIX              └ 요소 이름        └ 1/0
```

표준 IRDI를 지어내는 것과 자체 발행은 다르다 — **후자는 근거가 없다는 것을 밝히는
행위다.** 발행 뒤에도 `CD-001`이 남는 것이 옳다. 뜻을 채워야 사라진다(4·5장).

> 접두어(`IRI_PREFIX`)는 상수가 아니라 값이다. 무엇을 넣어야 하는지는 **3장**을 본다.

---

## 2. 배지 읽는 법

입력 칸 오른쪽에 배지가 둘 붙는다. 앞은 **체계**, 뒤는 **확인 상태**다.

```
IEC CDD 61987/ABA951#009            사양서 확인 · 시리얼번호
ProductCarbonFootprints (1/0)       사전 확인 · Product carbon footprint
BarrelTemperature (1/0)             자체 발급 · 배럴온도
eCl@ss AAO677#002                   미확인
```

**뒤 배지는 근거의 세기다.** 센 것부터.

| 뒤 배지 | 뜻 | 할 일 |
|---|---|---|
| `사양서 확인` | 사람이 IDTA 사양서와 대조함 (`verified: spec`) | 없음 |
| `사전 확인` | **사전이 답함** (`verified: dict`) | 없음. 다만 사양서를 대조한 것은 아니다 |
| `자체 발급` | 우리가 발행 (`origin: local`) | 영문 정의를 채워야 개념이 함께 나간다 |
| `미확인` | 용어집에 없음 | `사전에서 채우기` → 그래도 없으면 등록 |
| `해석 불가` | IRDI도 IRI도 아닌 모양 | 슬래시 · `#` 개수를 확인한다 |

`사양서 확인`과 `사전 확인`을 한 배지로 뭉치지 않는 이유는, **대조한 것과 받아 적은
것을 구분할 방법이 화면에서 사라지기 때문이다.** 사전이 답했다고 사양서를 본 것은 아니다.

`해석 불가`는 파서가 **추측하지 않기 때문에** 나온다. 모양이 맞지 않으면 `unknown`이다.

---

## 3. 사내 네임스페이스

전역 식별자를 발급할 때 앞에 붙는 접두어다. 자체 발행 개념 IRI도 여기서 나온다.
**코드에 도메인을 박지 않는다** — 박으면 다른 회사에서는 열자마자 모든 식별자가
경고로 뜨고 고칠 방법이 없다.

### 좋은 값의 조건

| 조건 | 이유 |
|---|---|
| **소유한 도메인** | 식별자는 전 세계에서 영원히 유일해야 한다. 남의 도메인을 쓰면 언젠가 충돌한다 |
| `https://` | 관례다 |
| 끝에 `/` 없이 | 붙여도 동작하지만(발급 시 떼어낸다) 지저분하다 |
| 짧고 안 바뀔 것 | 바꾸면 모든 식별자를 다시 발급해야 한다 |
| 사람 이름·날짜 금지 | `…/hong/2026`은 조직이 바뀌면 못 쓴다 |

**주소가 실제로 열릴 필요는 없다.** AAS 식별자는 IRI지 URL이 아니다. 도메인을 쓰는
이유는 "우리가 소유해서 충돌하지 않는다"는 것뿐이다.

### 예

```
https://bnb.co.kr/ids                 현재 기본값
https://acme.co.kr/aas
https://example.com/ids/plant-a       공장별로 나눌 때
https://id.acme.co.kr                 전용 서브도메인
```

공장·법인이 여럿이면 마디를 하나 더 두는 편이 낫다. 나중에 합칠 때 충돌이 없다.

### 이 값이 만들어내는 것

접두어가 `https://acme.co.kr/aas`일 때:

| 대상 | 결과 | 규칙 |
|---|---|---|
| Shell `IMM150_AAS` | `…/aas/imm150-aas` | `{ns}/aas/{슬러그}` |
| Asset | `…/asset/imm150-aas` | `{ns}/asset/{슬러그}` |
| Submodel `TechnicalData` | `…/sm/asset/technicaldata` | 템플릿의 `idPattern` |
| 자체 발행 개념 `BarrelTemperature` | `…/cd/BarrelTemperature/1/0` | `{ns}/cd/{이름}/1/0` |

**식별자는 소문자 슬러그, 개념 IRI는 원래 대소문자를 유지한다.**
`RatedPower` → 식별자 `rated-power`, 개념 `…/cd/RatedPower/1/0`.
규칙이 어긋난 것이 아니라 발급 함수가 다르다(`mintIdentifier` vs `selfIssuedIri`).

### 세 곳이 같아야 한다

| 위치 | 키 |
|---|---|
| `.env` — 서버 | `IRI_PREFIX=https://bnb.co.kr/ids` |
| `.env` — 웹 | `NEXT_PUBLIC_IRI_PREFIX=https://bnb.co.kr/ids` |
| 검증 탭 입력칸 | 브라우저에 저장 — **`.env`를 덮어쓴다** |

앞의 둘이 다르면 **에디터가 통과시킨 것이 서버에서 경고로 뜬다.** 같은 커널을 쓰는
의미가 사라진다. 검증 탭에서 바꾼 값은 그 브라우저에만 남아 `.env`와 조용히
어긋날 수 있으므로, 팀에 배포할 값은 `.env`에 넣는다.

### 비우면 검사하지 않는다

`POL-IRI-001`이 아예 뜨지 않는다. **남의 AASX를 열어 볼 때 쓴다** — 그 회사 식별자에
우리 접두어를 요구하는 것은 무의미하다.

### 바꿀 때는 참조가 함께 따라간다

기존 식별자에 `POL-IRI-001`이 뜨고 이슈마다 퀵픽스가 붙는다.

> `/aas/imm150-aas(으)로 고치기`

이 퀵픽스는 **식별자를 가리키던 참조까지 하나의 batch로 고친다** — Relationship의
first·second, ReferenceElement의 value, Shell의 derivedFrom, Qualifier의 valueId.
식별자만 바꾸면 그것들이 조용히 끊긴다.

다만 `raw`(해석하지 못한 남의 필드)는 건드리지 않는다. 문자열 치환으로 남의 데이터를
헤집는 것이 끊긴 참조보다 나쁘다. 대신 옛 값이 raw에 남아 있으면 그렇게 말한다.

> 식별자를 바꿨습니다. 다만 해석하지 못한 원본 필드(raw)에 옛 값이 남아 있어
> 직접 확인해야 합니다.

---

## 4. CD-001을 없애는 세 가지 길

### 먼저 — IEC CDD에 "등록"은 할 수 없다

IEC CDD는 회사가 항목을 올리는 곳이 아니다. IEC 61360 공용 데이터 사전이고 내용은
IEC 기술위원회가 표준화 절차로 관리한다. 새 개념은 국가위원회를 통해 해당 TC/SC에
제안하는 표준화 작업이고 에디터에서 버튼으로 되는 일이 아니다.

게다가 `cdd.iec.ch`는 자동 접근을 403으로 막고, 공개 REST 창구를 확인하지 못했다.
그래서 **사전 프록시는 캐시가 답한다.** 없는 API를 가정해 어댑터를 쓰지 않는다.

실제로 할 수 있는 것은 셋이다.

| | 방법 | 대상 |
|---|---|---|
| ① | 검증 탭의 `사전에서 채우기` | IDTA 공식 템플릿에 CD가 있는 개념 |
| ② | **자체 발행 + 용어집 등록** | 표준에 없는 사내 개념 |
| ③ | `dict-seed`에 회사 사전 파일 추가 | 회사가 이미 가진 사전이 있을 때 |

### ① 사전에서 채우기

검증 탭 상단 도구줄, `사내 네임스페이스` 칸 오른쪽에 있다.

```
사내 네임스페이스 [https://bnb.co.kr/ids]  [사전에서 채우기]  [모두 고치기 (N)]  [전체 복사]
```

이슈가 하나도 없으면 비활성이다 — 물어볼 것이 없다는 뜻이다.

**하는 일**

1. 지금 검증 목록의 **`CD-001` 이슈만** 골라 semanticId를 중복 없이 모은다
2. `POST /dictionary/lookup`으로 서버에 한 번에 묻는다
3. 답 중 **영문 이름과 정의가 둘 다 있는 것만** 브라우저 용어집에 넣는다
4. 몇 건을 넣었고 몇 건을 못 넣었는지 숫자로 말한다

**추측하지 않는다.** 서버가 모르는 것은 그대로 남고, 정의가 없는 항목은 받지 않는다 —
규격이 영문 정의를 요구하기 때문이다(AASc-3a-008).

**전제 — 사전은 서버에 있다**

API(8787)와 PostgreSQL(5433)이 떠 있어야 한다. 안 떠 있으면 이렇게 답한다.

> API 서버에 닿지 못했습니다 (http://localhost:8787). 사전은 서버에 있습니다.

이때는 `scripts\aas`로 스택을 올린다.

**결과 메시지 읽는 법**

> 43건 중 35건을 용어집에 넣었습니다. 사전이 모르는 것 8건.

| 문구 | 뜻 | 할 일 |
|---|---|---|
| `N건 중 M건을 넣었습니다` | M건 해소 | 검증 목록이 그만큼 줄어든다 |
| `정의가 없어 못 쓴 것 N건` | 사전이 이름만 안다 | 회사 사전에 정의를 넣고 시드를 다시 돌린다 |
| `사전이 모르는 것 N건` | 캐시에 없다 | eCl@ss면 포기, 아니면 `개념 등록`으로 직접 |

**두 번 눌러도 되지만 0건이 나온다**

`addMany`가 이미 있는 항목을 덮어쓰지 않는다 — **사람이 손으로 등록한 것이 이긴다.**
그래서 두 번째 실행이 "0건을 넣었습니다"인 것은 실패가 아니라 정상이다.
직접 등록한 개념을 사전 값으로 갈아끼우려면 그 항목을 먼저 지운다.

**다시 눌러야 할 때**

- 모델에 새 요소·새 템플릿을 넣은 뒤 — 그때 생긴 CD-001은 아직 물어보지 않았다
- 시드로 캐시를 새로 채운 뒤

받은 개념은 브라우저 용어집(localStorage)에 쌓이므로 **그 뒤엔 API를 꺼도 유지된다.**
다만 다른 브라우저·다른 PC에서는 다시 눌러야 한다.

### 캐시를 채우는 것은 dict-seed다

①의 근거는 `docs/idta/*.json`(IDTA 공식 Template JSON)이다. 저장소 루트에서 돌린다.

```
pnpm --filter @aas/api exec tsx scripts/dict-seed.ts ../../docs/idta/*.json
```

경로가 `../../`인 것은 `--filter … exec`가 **패키지 디렉터리(`apps/api`)에서** 돌기
때문이다. 실행하면 캐시 건수와 검색 확인 몇 줄을 찍는다.

`GET /dictionary/status`가 `{"cached":0}`이면 시드가 안 된 것이다.
`scripts\aas`도 이 경우를 감지해 경고한다.

### eCl@ss는 풀리지 않는다

`0173-1#02-…`는 어떤 방법으로도 해소되지 않는다. 라이선스가 없어 조회·검증하지
않기로 P0에서 확정했다. **남는 것이 정상이다.** 파싱·보존·출력만 한다.

---

## 5. 개념 등록 템플릿

### 입력 — 용어집 항목 하나

검증 탭의 `개념 등록` 폼이 이 JSON을 만든다. 회사 용어집에 직접 적을 때도 같은 모양이다.

```json
{
  "term": "배럴온도",
  "aliases": ["실린더온도", "배럴온도Zone1"],
  "nameEn": "Barrel temperature",
  "definition": "Temperature measured in a barrel heating zone of an injection moulding machine.",
  "semanticId": "https://bnb.co.kr/ids/cd/BarrelTemperature/1/0",
  "unit": "°C",
  "dataType": "REAL_MEASURE",
  "origin": "local",
  "verified": "none",
  "provenance": "사내 정의 2026-09"
}
```

**`nameEn`과 `definition`이 필수다.** 규격이 영문 표제어(AASc-3a-002)와
영문 정의(AASc-3a-008)를 요구하고, 없으면 커널이 ConceptDescription을 **만들지 않는다** —
지어내는 대신 이유를 남긴다.

`dataType`은 IEC 61360 값이어야 한다.

```
STRING · STRING_TRANSLATABLE · REAL_MEASURE · REAL_COUNT
INTEGER_MEASURE · INTEGER_COUNT · BOOLEAN · DATE · TIMESTAMP
```

`verified`는 `spec`(사양서 대조) · `dict`(사전) · `none`(대조 안 함)이다.
**직접 대조하지 않았으면 `none`으로 둔다.** 여기서 거짓말하면 배지가 거짓말한다.

### 출력 — 내보내기에 실리는 것

위 항목 하나로 `conceptDescriptions`에 이것이 생긴다.

```json
{
  "modelType": "ConceptDescription",
  "id": "https://bnb.co.kr/ids/cd/BarrelTemperature/1/0",
  "embeddedDataSpecifications": [{
    "dataSpecification": {
      "type": "ExternalReference",
      "keys": [{
        "type": "GlobalReference",
        "value": "https://admin-shell.io/aas/3/0/DataSpecificationIec61360"
      }]
    },
    "dataSpecificationContent": {
      "modelType": "DataSpecificationIec61360",
      "preferredName": [
        { "language": "en", "text": "Barrel temperature" },
        { "language": "ko", "text": "배럴온도" }
      ],
      "definition": [
        { "language": "en", "text": "Temperature measured in a barrel heating zone…" }
      ],
      "unit": "°C",
      "dataType": "REAL_MEASURE"
    }
  }]
}
```

한글 표제어가 `ko`로 함께 나가는 것이 이 구조의 이점이다 — IEC CDD에는 한글이 없다.

### 회사 용어집으로 옮기기

등록한 것은 **이 브라우저에만** 쌓인다. 폼 하단의 `용어집 내보내기 (N)`으로
`terms.local.json`을 받아 회사 용어집에 합친다.

```json
{
  "note": "에디터에서 등록한 사내 용어. 회사 용어집에 합치십시오.",
  "terms": [ /* 위 항목들 */ ]
}
```

이 파일을 `dict-seed`에 넘기면 서버 사전에도 들어가, 다른 사람이 `사전에서 채우기`로
받는다. 그래야 한 사람의 등록이 팀의 자산이 된다.

---

## 6. ConceptDescription은 어떻게 만들어지는가

팔레트에 ConceptDescription이 없는 것이 맞다. **손으로 만들지 않는다 — 커널이 만든다.**

```
문서에서 쓰인 semanticId를 전부 모은다      usedSemanticIds(doc)
        ↓ 각각을 용어집에서 찾는다           termsResolver(book)
        ↓ 규격 최소치를 갖췄는지 본다
conceptDescriptions 배열                   buildConceptDescriptions()
```

**"CD를 만든다" = "용어집에 항목을 넣는다"** 이다. 넣는 방법은 4장(사전에서 채우기)과
5장(개념 등록)이고, 이 장은 그것이 언제 파일에 실리는지를 말한다.

### 만들어지는 조건 — 넷 다 있어야 한다

| # | 조건 | 없으면 |
|---|---|---|
| 1 | 노드에 `semanticId`가 있다 | `POL-SEM-001` |
| 2 | 용어집이 그 semanticId를 안다 | `CD-001` "아는 곳이 없습니다" |
| 3 | **영문 표제어** (AASc-3a-002) | `CD-001` "영문 표제어가 없어…" |
| 4 | **영문 정의** (AASc-3a-008) | `CD-001` "영문 정의가 없어…" |

하나라도 빠지면 커널은 **CD를 만들지 않고 이유를 남긴다.** 틀린 정의를 실어 보내는 것이
아무것도 안 보내는 것보다 나쁘다. `unit`과 `dataType`은 선택이다 — 없어도 만들어진다.

### CD-001은 요소 종류에 따라 문구가 다르다

전부 `WARN`이다. **심각도는 나누지 않는다** — 개념이 빠진 것은 그릇이든 값이든 같은
무게다. 다른 것은 **무엇을 잃느냐**이고, 그것은 문장이 말한다.

| 요소 | 문구 |
|---|---|
| 값을 담는 것 — Property · MLP · Range · File · Blob · ReferenceElement | 단위·자료형 없이 나가면 수신 측이 **값을 해석하지 못합니다** |
| 담는 그릇 — Submodel · SMC · SML · Entity · Operation · Capability | 수신 측은 **이 묶음이 무엇인지** 알 수 없습니다 |

그릇에는 값이 없으니 단위라는 것도 없다. 그릇에까지 "값을 해석하지 못한다"고 쓰면
사실이 아닌 말을 하는 것이고, 문장이 한 번 틀리기 시작하면 나머지도 안 읽힌다.

같은 semanticId를 여러 요소가 쓰면 **하나라도 값을 담으면 값 쪽 문구**다.

그릇 쪽에는 **우리가 고칠 수 없는 것**이 섞여 있다. IDTA가 IRI만 쓰고
ConceptDescription을 발행하지 않은 자리가 실제로 있다 —
`…/zvei/nameplate/1/0/ContactInformations/AddressInformation`이 그렇고,
공식 템플릿 어디에도 그 개념 정의가 없다. 남의 네임스페이스에 우리가 정의를 지어
붙일 수는 없으므로(1장 C) 그런 항목은 경고로 남는 것이 끝이다.

### 단위는 값이 아니라 여기에 넣는다

인스펙터에 단위 입력란이 없는 것도 맞다. 규격이 그렇게 되어 있다.

```
Property           idShort · semanticId · valueType · value · valueId
                          ↓ 가리킨다
ConceptDescription   embeddedDataSpecifications
                       └ DataSpecificationIec61360
                           ├ preferredName · definition · dataType
                           └ unit          ← 단위는 여기
```

**단위는 값의 속성이 아니라 개념의 속성이다.** "공구마모율이 mm 단위"라는 사실은 이
설비에서만 참인 것이 아니라 그 개념 자체의 성질이다. 그래서 값마다 반복하지 않는다.

값 칸에 단위를 적으면 이렇게 걸린다.

```
ERROR  POL-VAL-001  …/ToolWearRate
값 "0.34)"은(는) xs:double 형식이 아닙니다. 단위는 값이 아니라 ConceptDescription에 넣습니다.
```

**고치는 순서**

1. 값에서 단위·괄호를 뺀다 — `0.34)` → `0.34`. 이것만으로 ERROR는 사라진다
2. semanticId가 없으면 `사내 개념으로 발행`(1장 C)
3. 그 개념의 `CD-001`에서 `개념 등록` → **단위** 칸에 `mm`

단위는 **IEC 61360 기호**로 쓴다 — `mm` · `kN` · `°C` · `%` · `s` · `mm/h`.
한글이나 문장이 아니다. 측정값이면 자료형은 `REAL_MEASURE`다
(`REAL_COUNT`는 단위 없는 실수).

값에 단위를 남겨 두면 이 프로젝트에서 실제로 두 곳이 깨진다.

- **값 수집** — 숫자로 읽히지 않으면 `numValue`가 아니라 `textValue`로 담긴다.
  0으로 바꾸지는 않지만, 평균·최댓값·차트가 그 신호를 쓰지 못한다.
- **BaSyx 게시** — 받는 쪽이 `xs:double`을 기대하는데 문자열이 간다.

### 헷갈리지 않게 알아 둘 것

- **같은 semanticId를 쓰는 요소가 100개여도 CD는 하나다.** Map으로 모은다.
- **보조 semanticId로는 CD가 만들어지지 않는다.** 주 식별자만 개념이고 보조는 참고다.
- **출력 순서는 id 사전순으로 고정된다.** 편집 순서에 따라 파일이 달라지면 diff와
  골든 테스트가 흔들린다.
- **하나도 없으면 `conceptDescriptions` 키 자체를 내보내지 않는다.** 규격이
  "설정하지 않거나 최소 1개"를 요구한다. 빈 배열은 위반이다.
- **목록 직속 자식은 부모의 `semanticIdListElement`에서 만들어진다**(8장).

### 확인

`출력 JSON` 탭 맨 아래에 `conceptDescriptions`가 붙는다. 내보내기 알림도 건수를 말한다.

> `MyAsset_AAS.json — 개념 12건 포함, 3건은 단위·정의를 몰라 빠졌습니다.`

**"빠졌습니다"가 0이 될 때까지가 목표다**(eCl@ss 제외). AASX에도 같은 개념이 담긴다 —
미리보기·내보내기·AASX·검증이 같은 책을 보기 때문이다(7장).

### 한계 — unitId는 없다

우리는 `unit`(기호 문자열)만 내보낸다. IEC 61360에는 단위를 개념으로 가리키는
`unitId`도 있지만 구현하지 않았다. 기호만으로 충분한 수신 측이 대부분이지만,
`unitId`를 요구하는 상대는 아직 맞추지 못한다. **있는 척하지 않는다.**

---

## 7. 용어집은 두 겹이다

```
SAMPLE_TERMS (packages/semantic/src/seed/terms.sample.json — 샘플)
    +
브라우저 사내 용어집 (apps/web/lib/terms.ts, localStorage)
    ↓ mergeBooks — 뒤가 이긴다
useTerms().book()
```

**미리보기 · 내보내기 · AASX · 검증 · 인스펙터가 같은 책을 봐야 한다.**
화면에서는 해석됐는데 파일에는 개념이 빠지면 손실을 알아챌 방법이 없다.
반대도 나쁘다 — 파일에는 실렸는데 화면이 "미확인"이면, 등록이 안 된 줄 알고
다시 등록하거나 있지도 않은 표준 IRDI를 찾아 헤매게 된다.
(인스펙터가 샘플만 보던 버그가 실제로 있었다.)

`terms.sample.json`은 **샘플이다.** 회사 용어와 실제 값으로 바꿔 쓴다.
자체 IRI의 도메인도 회사 도메인으로 바꾼다.

---

## 8. 검증 이슈별 처리

| 코드 | 메시지 | 조치 |
|---|---|---|
| `POL-SEM-001` | semanticId가 없다 | 용어집에 **이름이 정확히 같은** 항목이 있으면 그것을 지정, 없으면 `사내 개념으로 발행` |
| `CD-001` | 이 semanticId를 아는 곳이 없다 | `사전에서 채우기` → 그래도 남으면 `개념 등록` |
| `CD-001` | 영문 정의가 없다 (AASc-3a-008) | `사전에서 채우기`. IDTA CD에는 정의가 있다 |
| `CD-001` | 영문 표제어가 없다 (AASc-3a-002) | 용어집 항목에 `nameEn`을 채운다 |
| `POL-IRI-001` | 식별자가 사내 네임스페이스 밖 | 퀵픽스가 참조까지 함께 고친다 |

이슈 줄은 눌러서 그 노드로 갈 수 있고, **복사 버튼이 따로 있다** — 줄 자체가
버튼이라 브라우저가 드래그를 클릭으로 보기 때문이다.

### 목록 항목은 목록에서 고친다

`SubmodelElementList`의 직속 자식은 AASd-120으로 **idShort조차 없다.** 의미는 자식이
아니라 목록에 있으므로, 자식의 `semanticId`가 아니라 부모의 `semanticIdListElement`로
지정한다. 퀵픽스가 알아서 부모를 고친다.

목록 항목의 개념은 목록 자신의 개념과 **다른 IRI**여야 한다.

```
…/cd/Segments/1/0            목록 자신
…/cd/Segments/Element/1/0    목록 항목
```
