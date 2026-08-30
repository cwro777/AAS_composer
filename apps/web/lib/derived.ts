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
  buildConceptDescriptions,
  identifierIsReferencedInRaw,
  nodeForPath,
  pathIndex,
  renameIdentifier,
  serialize,
  suggestIdentifier,
  validate,
  verifyEnvironment,
} from '@aas/kernel';
import { checkAllConformance, conformanceFix } from '@aas/templates';
import { termsResolver } from '@aas/semantic';

import { buildExport } from './persist';
import { useSettings } from './settings';
import { useEditor } from './store';

export type IssueLayer = 'core' | 'policy' | 'template' | 'dictionary';

export interface UiIssue {
  code: string;
  layer: IssueLayer;
  severity: 'error' | 'warn' | 'info';
  /** 이슈를 눌렀을 때 갈 노드. 규격 이슈는 경로 색인으로 잇는다. */
  node: NodeId | null;
  path: string;
  text: string;
  /** 눌러서 고칠 수 있는 이슈만 채워진다. 지적만 하는 검증은 결국 무시된다. */
  fix?: { label: string; run: () => void };
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
      /* 내보내기와 같은 것을 보여준다 — conceptDescriptions까지 포함 */
      setText(JSON.stringify(buildExport(settled).env, null, 2));
    } catch (e) {
      setText(`// 직렬화 실패: ${(e as Error).message}`);
    }
  }, [settled]);
  return text;
}

export function useIssues(doc: AasDoc, ms = 300): UiIssue[] {
  const settled = useDebounced(doc, ms);
  const iriPrefix = useSettings((s) => s.iriPrefix);
  const [issues, setIssues] = useState<UiIssue[]>([]);

  useEffect(() => {
    const out: UiIssue[] = [];

    /* 셸이 하나뿐이면 "어느 셸에 붙일지"가 자명하다 */
    const shells = settled.roots.filter((r) => settled.nodes[r]?.t === 'shell');

    /* L2 — 사내 정책. 노드를 알고 있으므로 클릭해서 이동할 수 있다 */
    for (const i of validate(settled, { iriPrefix })) {
      const issue: UiIssue = {
        code: i.code,
        layer: 'policy',
        severity: i.severity,
        node: i.node,
        path: i.path,
        text: i.message.ko,
      };

      /* 커널이 이미 답을 아는 것은 그대로 내보낸다 — 여기서 다시 만들지 않는다 */
      if (i.quickFix) {
        const { label, cmds } = i.quickFix;
        issue.fix = {
          label: label.ko,
          run: () => useEditor.getState().run({ t: 'batch', label: label.ko, cmds }, label.ko),
        };
      }

      /**
       * 식별자를 네임스페이스 안으로 옮긴다.
       *
       * 명령은 누르는 시점에 만든다. 검증할 때마다 문서 전체를 훑어 참조를 찾으면
       * 타이핑이 느려진다.
       */
      if (i.code === 'POL-IRI-001' && i.node !== null && iriPrefix) {
        const node = i.node;
        const next = suggestIdentifier(settled, node, iriPrefix);
        if (next) {
          issue.fix = {
            label: `${next.slice(iriPrefix.length) || next}(으)로 고치기`,
            run: () => {
              const s = useEditor.getState();
              const target = suggestIdentifier(s.doc, node, iriPrefix);
              if (!target) return;
              const before = (s.doc.nodes[node] as { identifier?: string } | undefined)?.identifier ?? '';
              const cmds = renameIdentifier(s.doc, node, target);
              if (cmds.length === 0) return;
              const label = '식별자를 사내 네임스페이스로';
              if (!s.run({ t: 'batch', label, cmds }, label)) return;
              /* 우리가 고치지 못한 자리가 있으면 침묵하지 않는다 */
              const refs = cmds.length - 1;
              if (identifierIsReferencedInRaw(s.doc, before)) {
                s.notify(
                  `식별자를 바꿨습니다. 다만 해석하지 못한 원본 필드(raw)에 옛 값이 남아 있어 직접 확인해야 합니다: ${before}`,
                );
              } else {
                s.notify(
                  refs
                    ? `식별자와 그것을 가리키던 참조 ${refs}곳을 함께 고쳤습니다.`
                    : `식별자를 ${target}(으)로 바꿨습니다.`,
                );
              }
            },
          };
        }
      }

      /* 독립 서브모델을 유일한 셸에 붙인다 */
      if (i.code === 'POL-STRUCT-003' && i.node !== null && shells.length === 1) {
        const node = i.node;
        const shell = shells[0]!;
        issue.fix = {
          label: `${settled.nodes[shell]!.idShort || '셸'}에 연결`,
          run: () =>
            useEditor
              .getState()
              .run({ t: 'move', node, parent: shell, index: Number.MAX_SAFE_INTEGER }, '셸에 연결'),
        };
      }
      out.push(issue);
    }

    /* L3 — 템플릿 적합성 */
    for (const c of checkAllConformance(settled)) {
      const issue: UiIssue = {
        code: c.code,
        layer: 'template',
        severity: c.code === 'T-001' || c.code === 'T-002' ? 'error' : 'warn',
        node: c.node,
        path: c.path,
        text: c.message.ko,
      };
      /* 빠진 필수 요소는 템플릿이 답을 안다 — 눌러서 채운다.
         명령은 누르는 시점에 만든다. 여기서 만들면 검증할 때마다 노드 id가 소모된다. */
      if (c.code === 'T-001' && c.node !== null) {
        const missing = c.path.split('/').pop() ?? '요소';
        issue.fix = {
          label: `템플릿에서 ${missing} 생성`,
          run: () => {
            const s = useEditor.getState();
            const built = conformanceFix(s.doc, c, s.newId);
            if (!built) {
              s.notify('이 이슈는 자동으로 고칠 수 없습니다. 템플릿 출처를 확인하십시오.');
              return;
            }
            s.run({ t: 'batch', label: built.label.ko, cmds: built.cmds }, built.label.ko);
          },
        };
      }
      out.push(issue);
    }

    /* L4 — 사전. 단위·자료형을 모르는 개념은 내보내도 수신 측이 해석하지 못한다 */
    for (const i of buildConceptDescriptions(settled, termsResolver()).unresolved) {
      out.push({
        code: i.code,
        layer: 'dictionary',
        severity: i.severity,
        node: i.node,
        path: i.path,
        text: i.message.ko,
      });
    }

    /* L1 — 규격. aas-core3.0의 경로를 색인으로 우리 노드에 잇는다 */
    try {
      const index = pathIndex(settled);
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
          node: nodeForPath(index, i.path),
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
  }, [settled, iriPrefix]);

  return issues;
}
