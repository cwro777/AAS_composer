/**
 * 단위 고르기 — 종류별 단위 기호.
 *
 * 단위는 ConceptDescription의 `unit`(IEC 61360 단위 기호)으로 나간다. 손으로 치면
 * `um`·`µm`·`μm`·`micron`이 섞여 같은 단위가 여러 벌이 되고, 받는 쪽은 그것을 같은 것으로
 * 보지 못한다. 그래서 고를 수 있게 한다. 목록에 없으면 직접 입력은 여전히 된다.
 *
 * 기호는 SI 표기를 따른다. 마이크로는 U+00B5(µ)로 통일한다 — 이미 용어집·파일에 그 문자로
 * 들어가 있어 바꾸면 같은 단위가 둘로 갈린다. `unitId`(IEC CDD 단위 IRDI)는 내보내지 않는다.
 *
 * 종류 추천은 **정렬만 바꾼다.** 값을 대신 채우지 않는다 — 단위는 사람이 아는 값이다.
 */

export interface UnitOption {
  symbol: string;
  /** 사람이 읽는 이름 — 기호만으로는 헷갈리는 것이 있다(min: 분, ‰: 퍼밀) */
  name: string;
}

export interface UnitKind {
  id: string;
  label: string;
  units: UnitOption[];
  /** 개념 이름에 이 말이 있으면 이 종류를 먼저 보인다 */
  hints: RegExp;
}

const u = (symbol: string, name: string): UnitOption => ({ symbol, name });

export const UNIT_KINDS: readonly UnitKind[] = [
  {
    id: 'temperature',
    label: '온도',
    units: [u('°C', '섭씨도'), u('K', '켈빈'), u('°F', '화씨도')],
    hints: /temperat|온도/i,
  },
  {
    id: 'length',
    label: '길이',
    units: [u('mm', '밀리미터'), u('µm', '마이크로미터'), u('cm', '센티미터'), u('m', '미터'), u('km', '킬로미터'), u('nm', '나노미터'), u('in', '인치')],
    hints: /length|diameter|thickness|rough|stroke|position|distance|width|height|depth|radius|gap|길이|두께|직경|지름|거칠기|조도|스트로크|위치|거리|폭|높이|깊이|간격/i,
  },
  {
    id: 'pressure',
    label: '압력',
    units: [u('MPa', '메가파스칼'), u('kPa', '킬로파스칼'), u('Pa', '파스칼'), u('bar', '바'), u('mbar', '밀리바'), u('psi', '제곱인치당 파운드')],
    hints: /pressure|압력|사출압|배압/i,
  },
  {
    id: 'force',
    label: '힘',
    units: [u('kN', '킬로뉴턴'), u('N', '뉴턴'), u('MN', '메가뉴턴'), u('tf', '톤힘')],
    hints: /force|clamp|load|thrust|힘|형체력|하중|추력/i,
  },
  {
    id: 'mass',
    label: '질량',
    units: [u('kg', '킬로그램'), u('g', '그램'), u('mg', '밀리그램'), u('t', '톤')],
    hints: /mass|weight|질량|무게|중량/i,
  },
  {
    id: 'time',
    label: '시간',
    units: [u('s', '초'), u('ms', '밀리초'), u('min', '분'), u('h', '시간'), u('d', '일')],
    hints: /time|duration|cycle|period|delay|interval|시간|사이클|주기|지연|간격/i,
  },
  /* 속도보다 앞 — "spindle speed"는 회전수다 */
  {
    id: 'rotation',
    label: '회전수',
    units: [u('1/min', '분당 회전'), u('rpm', '분당 회전(관용)'), u('1/s', '초당 회전')],
    hints: /rotat|revolution|rpm|spindle|screw speed|회전|주축/i,
  },
  {
    id: 'speed',
    label: '속도',
    units: [u('mm/s', '초당 밀리미터'), u('m/s', '초당 미터'), u('m/min', '분당 미터'), u('km/h', '시간당 킬로미터')],
    hints: /speed|velocity|feed|속도|이송/i,
  },
  {
    id: 'frequency',
    label: '주파수',
    units: [u('Hz', '헤르츠'), u('kHz', '킬로헤르츠')],
    hints: /frequen|주파수/i,
  },
  {
    id: 'power',
    label: '전력',
    units: [u('kW', '킬로와트'), u('W', '와트'), u('MW', '메가와트'), u('kVA', '킬로볼트암페어')],
    hints: /power|전력|출력/i,
  },
  {
    id: 'energy',
    label: '에너지',
    units: [u('kWh', '킬로와트시'), u('Wh', '와트시'), u('J', '줄'), u('kJ', '킬로줄'), u('MJ', '메가줄')],
    hints: /energy|consumption|에너지|소비|사용량/i,
  },
  {
    id: 'voltage',
    label: '전압',
    units: [u('V', '볼트'), u('mV', '밀리볼트'), u('kV', '킬로볼트')],
    hints: /voltage|전압/i,
  },
  {
    id: 'current',
    label: '전류',
    units: [u('A', '암페어'), u('mA', '밀리암페어')],
    hints: /current|전류/i,
  },
  {
    id: 'resistance',
    label: '저항',
    units: [u('Ω', '옴'), u('kΩ', '킬로옴'), u('MΩ', '메가옴')],
    hints: /resistan|저항/i,
  },
  {
    id: 'torque',
    label: '토크',
    units: [u('N·m', '뉴턴미터'), u('kN·m', '킬로뉴턴미터')],
    hints: /torque|토크/i,
  },
  {
    id: 'volume',
    label: '부피',
    units: [u('L', '리터'), u('mL', '밀리리터'), u('cm³', '세제곱센티미터'), u('m³', '세제곱미터')],
    hints: /volume|capacity|shot size|부피|용량|용적|계량/i,
  },
  {
    id: 'flow',
    label: '유량',
    units: [u('L/min', '분당 리터'), u('m³/h', '시간당 세제곱미터'), u('kg/h', '시간당 킬로그램')],
    hints: /flow|유량/i,
  },
  {
    id: 'area',
    label: '넓이',
    units: [u('mm²', '제곱밀리미터'), u('cm²', '제곱센티미터'), u('m²', '제곱미터')],
    hints: /area|넓이|면적/i,
  },
  {
    id: 'angle',
    label: '각도',
    units: [u('°', '도'), u('rad', '라디안')],
    hints: /angle|각도/i,
  },
  {
    id: 'acceleration',
    label: '가속도·진동',
    units: [u('m/s²', '초제곱당 미터'), u('g', '중력가속도'), u('mm/s', '진동속도')],
    hints: /accelerat|vibrat|가속|진동/i,
  },
  /* 'rate'가 흔한 말이라 뒤에 둔다 — flow rate·feed rate는 앞의 유량·속도가 먼저 잡는다 */
  {
    id: 'ratio',
    label: '비율',
    units: [u('%', '퍼센트'), u('‰', '퍼밀'), u('ppm', '백만분율'), u('1', '무차원')],
    hints: /ratio|rate|percent|wear|humid|efficien|yield|utili[sz]ation|비율|율|습도|효율|수율|마모|가동률/i,
  },
  {
    id: 'currency',
    label: '통화',
    units: [u('KRW', '원'), u('USD', '미국 달러'), u('EUR', '유로'), u('JPY', '엔'), u('CNY', '위안')],
    hints: /price|cost|currency|가격|비용|원가|단가/i,
  },
];

/**
 * 이 개념에 먼저 보일 종류. 이름에서 찾지 못하면 null — 추측으로 채우지 않는다.
 * 통화형 자료형은 이름보다 자료형이 확실하다.
 */
export function suggestKind(text: string, dataType: string): UnitKind | null {
  if (/CURRENCY/.test(dataType)) return UNIT_KINDS.find((k) => k.id === 'currency') ?? null;
  return UNIT_KINDS.find((k) => k.id !== 'currency' && k.hints.test(text)) ?? null;
}

export function kindOfUnit(symbol: string): UnitKind | null {
  return UNIT_KINDS.find((k) => k.units.some((x) => x.symbol === symbol)) ?? null;
}
