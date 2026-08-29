/**
 * 정규화 — 두 Environment를 "의미가 같은가"로 비교하기 위한 기준형.
 *
 * Package Explorer가 만든 JSON은 키 순서와 빈 배열 처리가 우리와 다르다.
 * 텍스트 비교는 영원히 실패하지만, 정규화 후 비교하면
 * "우리 도구가 남의 파일을 손상시키지 않는다"를 CI에서 증명할 수 있다.
 *
 * 규칙:
 *  - 객체 키를 사전순으로 정렬한다.
 *  - 빈 배열·빈 객체·null·빈 문자열 값을 가진 키를 제거한다.
 *  - 문자열은 양끝 공백을 제거한다.
 *  - 배열 순서는 절대 바꾸지 않는다 (AAS에서 순서는 의미다).
 */

import type { Json } from './model.js';

function isEmpty(v: Json): boolean {
  if (v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

export function canonicalize(value: Json): Json {
  if (Array.isArray(value)) {
    return value.map(canonicalize).filter((v) => !isEmpty(v));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, Json> = {};
    for (const key of Object.keys(value).sort()) {
      const c = canonicalize(value[key] as Json);
      if (!isEmpty(c)) out[key] = c;
    }
    return out;
  }
  if (typeof value === 'string') return value.trim();
  return value;
}

/** 안정 직렬화 — 스냅샷·해시에 쓴다. */
export function canonicalJson(value: Json): string {
  return JSON.stringify(canonicalize(value));
}

/** 의미 동등 비교 */
export function semanticallyEqual(a: Json, b: Json): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
