'use client';

/**
 * 파생값 — 스토어에 저장하지 않고 계산한다.
 *
 * JSON 미리보기와 검증은 문서에서 나오는 값이다. 저장해 두면 두 진실이 생긴다.
 * 대신 디바운스로 타이핑을 막지 않는다(계획서 08장 성능 예산).
 */

import { useEffect, useState } from 'react';

import {
  type AasDoc,
  type NodeId,
  serialize,
  validate,
  verifyEnvironment,
} from '@aas/kernel';
import { checkAllConformance } from '@aas/templates';

export type IssueLayer = 'core' | 'policy' | 'template';

export interface UiIssue {
  code: string;
  layer: IssueLayer;
  severity: 'error' | 'warn' | 'info';
  /** 노드로 이동할 수 있는 이슈만 채워진다. 규격(core) 이슈는 경로만 있다. */
  node: NodeId | null;
  path: string;
  text: string;
}

function useDebounced<T>(value: T, ms: number): T {
  const [held, setHeld] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setHeld(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return held;
}

export function useJson(doc: AasDoc, ms = 100): string {
  const settled = useDebounced(doc, ms);
  const [text, setText] = useState('{}');
  useEffect(() => {
    try {
      setText(JSON.stringify(serialize(settled), null, 2));
    } catch (e) {
      setText(`// 직렬화 실패: ${(e as Error).message}`);
    }
  }, [settled]);
  return text;
}

export function useIssues(doc: AasDoc, ms = 300): UiIssue[] {
  const settled = useDebounced(doc, ms);
  const [issues, setIssues] = useState<UiIssue[]>([]);

  useEffect(() => {
    const out: UiIssue[] = [];

    /* L2 — 사내 정책. 노드를 알고 있으므로 클릭해서 이동할 수 있다 */
    for (const i of validate(settled, { iriPrefix: 'https://bnb.co.kr/ids' })) {
      out.push({
        code: i.code,
        layer: 'policy',
        severity: i.severity,
        node: i.node,
        path: i.path,
        text: i.message.ko,
      });
    }

    /* L3 — 템플릿 적합성 */
    for (const c of checkAllConformance(settled)) {
      out.push({
        code: c.code,
        layer: 'template',
        severity: c.code === 'T-001' || c.code === 'T-002' ? 'error' : 'warn',
        node: c.node,
        path: c.path,
        text: c.message.ko,
      });
    }

    /* L1 — 규격. aas-core3.0의 경로는 우리 NodeId를 모른다 */
    try {
      const r = verifyEnvironment(serialize(settled));
      if (r.deserializationError) {
        out.push({
          code: 'AAS-CORE',
          layer: 'core',
          severity: 'error',
          node: null,
          path: '',
          text: `역직렬화 실패: ${r.deserializationError}`,
        });
      }
      for (const i of r.issues) {
        out.push({
          code: i.code,
          layer: 'core',
          severity: 'error',
          node: null,
          path: i.path,
          text: i.message.ko,
        });
      }
    } catch (e) {
      out.push({
        code: 'AAS-CORE',
        layer: 'core',
        severity: 'error',
        node: null,
        path: '',
        text: `규격 검증을 실행하지 못했습니다: ${(e as Error).message}`,
      });
    }

    const rank = { error: 0, warn: 1, info: 2 } as const;
    out.sort((a, b) => rank[a.severity] - rank[b.severity]);
    setIssues(out);
  }, [settled]);

  return issues;
}
