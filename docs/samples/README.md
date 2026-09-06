# 연습용 AAS 두 벌

에디터의 `가져오기`로 열어 쓴다. 자산은 [AAS 사용법](../../../AAS_사용법.html) 문서와 같은
CNC 가공기 `MX200_Line1`이다.

| 파일 | 이슈 |
|---|---|
| `AAS1-clean.json` | **0건** — 통과한 모델이 어떻게 생겼는지 보는 용도 |
| `AAS2-with-issues.json` | **5건** — 하나씩 고쳐 보는 용도 |

두 파일이 약속대로인지는 검사로 지킨다. 화면과 어긋나면 배우는 사람이 자기 잘못인 줄 안다.

```
pnpm --filter @aas/api exec tsx scripts/check-samples.ts
```

---

## AAS1 — 이슈 0

Shell 하나, Submodel 하나, Property 셋. 다음 네 가지를 지켜서 0이 된다.

- 모든 전역 식별자가 **사내 네임스페이스**(`https://bnb.co.kr/ids`) 안에 있다
- 모든 요소에 **semanticId가 있다**
- 그 semanticId를 **기본 용어집이 전부 안다** — 영문 표제어와 정의까지 있어서
  ConceptDescription이 만들어진다
- 값이 `valueType`과 맞는다 (`15.0` / `42.5` / `Running`)

**단위는 값이 아니라 개념에 있다.** `RatedPower`의 값은 `15.0`이고 `kW`는 내보내기의
`conceptDescriptions`에 실린다. `출력 JSON` 탭 아래쪽에서 확인할 수 있다.

서브모델 개념(`…/cd/MachineOperationalData/1/0`)은 IDTA 템플릿이 아니라 사내 정의라,
템플릿 적합성 검사(T-00x)의 대상이 아니다.

---

## AAS2 — 고칠 것 넷

이슈는 5건으로 뜨지만 **결함은 넷**이다. 첫 번째가 규격(L1)과 사내 정책(L2) 양쪽에
걸려 두 줄로 보인다.

### ① `POL-VAL-001` · `RatedPower` 값이 `"15.0 kW"`

```
값 "15.0 kW"은(는) xs:double 형식이 아닙니다. 단위는 값이 아니라 ConceptDescription에 넣습니다.
```

`AAS-CORE`의 `Value must be consistent with the value type.`도 같은 자리를 가리킨다.

**고치기** — 값을 `15.0`으로. 단위 `kW`는 이미 용어집에 있으므로 따로 할 일이 없다.

### ② `POL-SEM-001` · `CycleTime`에 semanticId가 없다

**고치기** — 이슈의 퀵픽스를 누른다. 용어집에 "사이클타임"이 있으므로
`…/cd/CycleTime/1/0`이 자동으로 붙는다. (이름이 정확히 같을 때만 자동이다.)

### ③ `CD-001` · `ToolWearRate`의 개념을 아는 곳이 없다

semanticId가 `https://example.org/cd/ToolWearRate/1/0` — 우리 것도 표준도 아니다.

**고치기 (둘 중 하나)**

- semanticId를 비우고 `사내 개념으로 발행` → `개념 등록`에서 영문 이름·정의·단위를 채운다
- 이 속성을 안 쓸 거면 노드를 지운다

### ④ `POL-IRI-001` · 서브모델 식별자가 남의 네임스페이스

```
https://acme-supplier.com/ids/sm/mx200-line1-001/operationaldata
```

**고치기** — 퀵픽스 `…(으)로 고치기`. **식별자를 가리키던 참조까지 함께 고친다** —
Shell의 `submodels` 참조가 그것이다. 손으로 식별자만 바꾸면 그 참조가 조용히 끊긴다.

---

## 다 고치면

검증 탭이 `✓ 모든 검사를 통과했습니다`가 되고, AAS1과 같은 모양이 된다.
`내보내기` 알림이 `개념 4건을 함께 담았습니다`로 뜨면 끝난 것이다.
