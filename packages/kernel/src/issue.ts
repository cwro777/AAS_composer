/**
 * 이슈 — 네 계층이 모두 같은 모양으로 보고한다.
 *
 *  L0 구조   커널 명령      애초에 만들 수 없음 (Reject로 거부)
 *  L1 규격   aas-core3.0    AASd-*                    layer: 'core'
 *  L2 정책   validate.ts    사내 규칙                  layer: 'policy'
 *  L3 템플릿 @aas/templates 필수 요소·카디널리티       layer: 'template'
 *  L4 사전   사전 프록시     IRDI 실재·폐기             layer: 'dictionary'
 */

import type { Cmd } from './command.js';
import type { NodeId } from './model.js';

export type IssueLayer = 'core' | 'policy' | 'template' | 'dictionary';
export type Severity = 'error' | 'warn' | 'info';

export interface Issue {
  /** 'AASd-022' | 'POL-IRI-001' | 'T-002' | 'DIC-004' */
  code: string;
  layer: IssueLayer;
  severity: Severity;
  node: NodeId | null;
  /** 'Submodel/TechnicalProperties/RatedPower' */
  path: string;
  message: { ko: string; en: string };
  /** 클릭 한 번으로 고치기. 지적만 하는 검증은 결국 무시된다. */
  quickFix?: { label: { ko: string; en: string }; cmds: Cmd[] };
}

const RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) => RANK[a.severity] - RANK[b.severity] || a.code.localeCompare(b.code),
  );
}

export function countBySeverity(issues: Issue[]): Record<Severity, number> {
  const out: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
  for (const i of issues) out[i.severity] += 1;
  return out;
}
