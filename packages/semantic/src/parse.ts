/**
 * IRDI / IRI 파서.
 *
 * 문자열을 통째로 다루면 버전 접미사 오기입을 잡을 수 없다. 자리마다 뜻이 있으므로
 * 분해해서 다룬다 — 첨부 문서 `AAS_semanticId_정리`의 분석을 코드로 옮긴 것이다.
 *
 *   eCl@ss   0173-1#02-AAO677#002        ICD-OI#CSI-Code#VI
 *   IEC CDD  0112/2///61987#ABA565#009   슬래시 개수가 하나만 틀려도 다른 식별자
 *   IDTA IRI https://admin-shell.io/idta/nameplate/3/0/Nameplate
 *
 * **추측하지 않는다.** 모양이 맞지 않으면 'unknown'이다. 그럴듯하게 해석해 주는 편이
 * 편해 보이지만, 틀린 semanticId가 조용히 배포되는 것보다는 모른다고 말하는 편이 낫다.
 */

export type SemanticScheme = 'iec-cdd' | 'eclass' | 'iri' | 'unknown';

/**
 * 무엇으로 확인했는가.
 * - 'dict' : IEC CDD 사전이 실재·현행을 확인 (기계적 확인)
 * - 'spec' : IDTA 사양서에서 사람이 대조. eCl@ss 보조 식별자 대부분이 여기 속한다
 * - 'none' : 아직 확인되지 않음
 *
 * 이 프로젝트는 eCl@ss 라이선스가 없어 eCl@ss IRDI는 'dict'가 될 수 없다.
 */
export type VerifiedBy = 'dict' | 'spec' | 'none';

export interface SemanticRef {
  raw: string;
  scheme: SemanticScheme;
  /** 등록기관 코드 — eCl@ss 0173, IEC 0112 */
  icd?: string;
  /** eCl@ss의 CSI. 02면 속성, 01이면 분류 클래스 */
  csi?: string;
  /** IEC CDD의 출처 표준 — 61987, 61360_7 … */
  source?: string;
  /** 개념 코드 — AAO677 · ABA565 */
  code?: string;
  /** 버전 접미사. **다른 버전은 다른 식별자다** */
  version?: string;
  /** IRI에 경로로 박힌 버전 — '3/0' */
  iriVersion?: string;
  /** 둘 이상이 '/'로 이어 붙은 값인가 (Nameplate 3.0에 실제로 있다) */
  composite?: boolean;
  verified: VerifiedBy;
  checkedAt?: string;
  /** 사양서 출처 — 문서 번호·페이지 */
  provenance?: string;
}

const ECLASS = /^(\d{4})-(\d)#(\d{2})-([A-Za-z0-9]+)#(\d{3})$/;
const CDD = /^(\d{4})\/(\d)\/\/\/([A-Za-z0-9_]+)#([A-Za-z0-9]+)#(\d{3})$/;
/** admin-shell.io/idta/nameplate/3/0/Nameplate 처럼 경로에 박힌 버전 */
const IRI_VERSION = /\/(\d+)\/(\d+)(?:\/|$)/;

function one(raw: string): SemanticRef {
  const s = raw.trim();
  if (s === '') return { raw, scheme: 'unknown', verified: 'none' };

  const ec = ECLASS.exec(s);
  if (ec) {
    return {
      raw: s,
      scheme: 'eclass',
      icd: ec[1],
      csi: ec[3],
      code: ec[4],
      version: ec[5],
      verified: 'none',
    };
  }

  const cdd = CDD.exec(s);
  if (cdd) {
    return {
      raw: s,
      scheme: 'iec-cdd',
      icd: cdd[1],
      source: cdd[3],
      code: cdd[4],
      version: cdd[5],
      verified: 'none',
    };
  }

  if (/^https?:\/\//i.test(s)) {
    const v = IRI_VERSION.exec(s);
    return {
      raw: s,
      scheme: 'iri',
      ...(v ? { iriVersion: `${v[1]}/${v[2]}` } : {}),
      verified: 'none',
    };
  }

  return { raw: s, scheme: 'unknown', verified: 'none' };
}

export function parseSemanticId(raw: string): SemanticRef {
  const direct = one(raw);
  if (direct.scheme !== 'unknown') return direct;

  /* 'A/B' 로 이어 붙인 값 — 공식 Nameplate 3.0의 AssetSpecificProperties가 그렇다.
     각 조각이 전부 해석되면 첫 조각을 대표로 삼고 composite로 표시한다. */
  const s = raw.trim();
  if (s.includes('/') && !/^https?:\/\//i.test(s)) {
    const parts = s.split('/').map((p) => one(p));
    if (parts.length > 1 && parts.every((p) => p.scheme !== 'unknown')) {
      return { ...parts[0]!, raw: s, composite: true };
    }
  }
  return direct;
}

/** 사람이 읽는 짧은 표기 — 목록·배지에 쓴다 */
export function formatSemanticId(ref: SemanticRef): string {
  switch (ref.scheme) {
    case 'eclass':
      return `eCl@ss ${ref.code}#${ref.version}${ref.composite ? ' 외' : ''}`;
    case 'iec-cdd':
      return `IEC CDD ${ref.source}/${ref.code}#${ref.version}`;
    case 'iri': {
      /* 버전이 경로 끝에 있으면(.../BarrelTemperature/1/0) 그것을 떼고 이름을 집는다.
         떼지 않으면 마지막 조각이 버전 숫자라 "0 (1/0)"으로 보인다. */
      let path = ref.raw.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      if (ref.iriVersion && path.endsWith(`/${ref.iriVersion}`)) {
        path = path.slice(0, -(ref.iriVersion.length + 1));
      }
      const segs = path.split('/').filter(Boolean);
      const last = segs[segs.length - 1] ?? ref.raw;
      return ref.iriVersion ? `${last} (${ref.iriVersion})` : last;
    }
    default:
      return ref.raw.length > 32 ? `${ref.raw.slice(0, 16)}…${ref.raw.slice(-14)}` : ref.raw;
  }
}

/** 같은 개념인가 — 버전만 다른 경우를 가려낸다 */
export function sameConcept(a: SemanticRef, b: SemanticRef): boolean {
  if (a.scheme !== b.scheme || a.scheme === 'unknown') return a.raw === b.raw;
  if (a.scheme === 'iri') return a.raw === b.raw;
  return a.icd === b.icd && a.source === b.source && a.code === b.code;
}
