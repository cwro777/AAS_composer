/**
 * L1 — 규격 제약(AASd-*)은 우리가 구현하지 않는다. aas-core3.0에 위임한다.
 *
 * 이 파일이 하는 일은 두 가지뿐이다.
 *  1. Environment JSON을 aas-core3.0 모델로 역직렬화한다.
 *  2. 그 검증 결과를 우리 Issue 모양으로 옮긴다.
 *
 * aas-core3.0은 순수 TypeScript이고 DOM·fetch를 쓰지 않으므로 커널 경계를 깨지 않는다.
 */

import * as aas from '@aas-core-works/aas-core3.0-typescript';

import { type Issue, sortIssues } from './issue.js';
import type { Environment } from './serialize.js';

/** 메시지에서 'AASd-022' 같은 제약 번호를 뽑는다. 없으면 일반 코드. */
function constraintCode(message: string): string {
  const m = /AASd-\d{3}/.exec(message);
  return m ? m[0] : 'AAS-CORE';
}

/**
 * aas-core3.0의 Path를 사람이 읽는 경로로 옮긴다.
 * PropertySegment는 이름, IndexSegment는 [n]으로 표기한다.
 */
function pathToString(path: unknown): string {
  const segs = (path as { segments?: unknown[] })?.segments;
  if (!Array.isArray(segs)) return '';
  const out: string[] = [];
  for (const s of segs) {
    const name = (s as { name?: unknown }).name;
    const index = (s as { index?: unknown }).index;
    if (typeof name === 'string') out.push(name);
    else if (typeof index === 'number') out.push(`[${index}]`);
  }
  return out.join('/');
}

export interface VerifyResult {
  issues: Issue[];
  /** 역직렬화 자체가 실패하면 규격 검증을 시작할 수 없다. */
  deserializationError?: string;
}

/**
 * Environment JSON을 규격에 대해 검증한다.
 * `node`를 채우지 않는 이유: aas-core3.0의 경로는 우리 NodeId를 모른다.
 * 노드 연결은 P4에서 path ↔ NodeId 색인으로 붙인다.
 */
export function verifyEnvironment(env: Environment): VerifyResult {
  const parsed = aas.jsonization.environmentFromJsonable(env as aas.jsonization.JsonValue);
  if (parsed.error !== null) {
    return {
      issues: [
        {
          code: 'AAS-CORE-DESERIALIZE',
          layer: 'core',
          severity: 'error',
          node: null,
          path: pathToString((parsed.error as { path?: unknown }).path),
          message: {
            ko: `규격 모델로 읽을 수 없습니다: ${parsed.error.message}`,
            en: `Cannot read as a spec model: ${parsed.error.message}`,
          },
        },
      ],
      deserializationError: parsed.error.message,
    };
  }

  const environment = parsed.mustValue();
  const issues: Issue[] = [];
  for (const err of aas.verification.verify(environment)) {
    issues.push({
      code: constraintCode(err.message),
      layer: 'core',
      severity: 'error',
      node: null,
      path: pathToString(err.path),
      message: { ko: err.message, en: err.message },
    });
  }
  return { issues: sortIssues(issues) };
}

/** 위반이 하나도 없는가 — 골든 테스트가 이 함수로 단언한다. */
export function isSpecClean(env: Environment): boolean {
  const r = verifyEnvironment(env);
  return !r.deserializationError && r.issues.length === 0;
}
