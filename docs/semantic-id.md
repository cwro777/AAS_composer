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
행위다.** 발행 뒤에도 `CD-001`이 남는 것이 옳다. 뜻을 채워야 사라진다(3장).

> 접두어는 상수가 아니라 값이다. 웹은 `NEXT_PUBLIC_IRI_PREFIX`, 서버는 `IRI_PREFIX`이고
> **둘은 같아야 한다.** 코드에 도메인을 박으면 다른 회사에서는 열자마자 모든 식별자가
> 경고로 뜬다.

---

## 2. 배지 읽는 법

입력 칸 오른쪽에 배지가 둘 붙는다. 앞은 **체계**, 뒤는 **확인 상태**다.

```
IEC CDD 61987/ABA951#009      사양서 확인 · 시리얼번호
BarrelTemperature (1/0)       자체 발급 · 배럴온도
eCl@ss AAO677#002             미확인
```

| 뒤 배지 | 뜻 | 할 일 |
|---|---|---|
| `사양서 확인` | IDTA 사양서와 대조됨 (`verified: spec`) | 없음 |
| `자체 발급` | 우리가 발행 (`origin: local`) | 영문 정의를 채워야 개념이 함께 나간다 |
| `미확인` | 용어집에 없음 | `사전에서 채우기` → 그래도 없으면 등록 |
| `해석 불가` | IRDI도 IRI도 아닌 모양 | 슬래시 · `#` 개수를 확인한다 |

`해석 불가`는 파서가 **추측하지 않기 때문에** 나온다. 모양이 맞지 않으면 `unknown`이다.

---

## 3. CD-001을 없애는 세 가지 길

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

①의 근거는 `docs/idta/*.json`(IDTA 공식 Template JSON)이고, 캐시를 채우는 명령은
이것이다. API(8787)와 PostgreSQL(5433)이 떠 있어야 한다.

```
pnpm --filter @aas/api exec tsx scripts/dict-seed.ts ../../docs/idta/*.json
```

받은 개념은 브라우저 용어집(localStorage)에 쌓이므로 **그 뒤엔 API를 꺼도 유지된다.**

### eCl@ss는 풀리지 않는다

`0173-1#02-…`는 어떤 방법으로도 해소되지 않는다. 라이선스가 없어 조회·검증하지
않기로 P0에서 확정했다. **남는 것이 정상이다.** 파싱·보존·출력만 한다.

---

## 4. 개념 등록 템플릿

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

## 5. 용어집은 두 겹이다

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

## 6. 검증 이슈별 처리

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
