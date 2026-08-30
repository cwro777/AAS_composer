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
  parentOf,
  pathIndex,
  planMerge,
  renameIdentifier,
  serialize,
  suggestIdentifier,
  validate,
  verifyEnvironment,
} from '@aas/kernel';
import { checkAllConformance, conformanceFix } from '@aas/templates';
import { selfIssuedIri, termByName, termsResolver } from '@aas/semantic';

import { buildExport } from './persist';
import { useSettings } from './settings';
import { useEditor } from './store';
import { dataTypeFor, humanize, nameFromIri, useTerms } from './terms';

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
  const entries = useTerms((s) => s.entries);
  const [text, setText] = useState('{}');
  useEffect(() => {
    try {
      /* 내보내기와 같은 것을 보여준다 — conceptDescriptions까지 포함 */
      setText(JSON.stringify(buildExport(settled, useTerms.getState().book()).env, null, 2));
    } catch (e) {
      setText(`// 직렬화 실패: ${(e as Error).message}`);
    }
  }, [settled, entries]);
  return text;
}

export function useIssues(doc: AasDoc, ms = 300): UiIssue[] {
  const settled = useDebounced(doc, ms);
  const iriPrefix = useSettings((s) => s.iriPrefix);
  const entries = useTerms((s) => s.entries);
  const [issues, setIssues] = useState<UiIssue[]>([]);

  useEffect(() => {
    const out: UiIssue[] = [];
    const book = useTerms.getState().book();

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

      /** 식별자가 겹친다 — 유일한 값으로 바꾼다. 참조도 함께 따라간다 */
      if (i.code === 'POL-ID-002' && i.node !== null && iriPrefix) {
        const node = i.node;
        const next = suggestIdentifier(settled, node, iriPrefix);
        if (next) {
          issue.fix = {
            label: '유일한 식별자로 바꾸기',
            run: () => {
              const s = useEditor.getState();
              const target = suggestIdentifier(s.doc, node, iriPrefix);
              if (!target) return;
              const cmds = renameIdentifier(s.doc, node, target);
              if (cmds.length === 0) return;
              const label = '식별자 중복 해소';
              if (!s.run({ t: 'batch', label, cmds }, label)) return;
              s.notify(`식별자를 ${target}(으)로 바꿨습니다.`);
            },
          };
        }
      }

      /**
       * semanticId가 없다.
       *
       * **표준 IRDI를 지어내지 않는다.** 할 수 있는 것은 두 가지뿐이다 —
       *  1. 사내 용어집에 같은 이름이 있으면 그 식별자를 쓴다 (근거가 있다)
       *  2. 없으면 **우리 이름으로 발행한다**. 이것은 추측이 아니라 선언이다.
       *
       * 목록 직속 자식은 자기 semanticId가 아니라 부모의 semanticIdListElement로 덮는다.
       */
      if (i.code === 'POL-SEM-001' && i.node !== null && iriPrefix) {
        const node = i.node;
        const parent = parentOf(settled, node);
        const listChild = parent !== null && settled.nodes[parent]?.t === 'sml';
        const target = listChild ? parent : node;
        const field = listChild ? 'semanticIdListElement' : 'semanticId';
        const name = settled.nodes[target]!.idShort;

        /* 목록 항목의 개념은 목록 자신의 개념과 다른 것이다 — 같은 IRI를 쓰면 안 된다 */
        const term = listChild
          ? termByName(`${name}Element`, book)
          : termByName(name, book);
        const minted = listChild
          ? selfIssuedIri(iriPrefix, name, 'Element')
          : selfIssuedIri(iriPrefix, name);
        const value = term?.semanticId ?? minted;

        if (value) {
          issue.fix = {
            label: term ? `용어집의 “${term.term}” 지정` : '사내 개념으로 발행',
            run: () => {
              const s = useEditor.getState();
              const label = term ? `용어집에서 semanticId 지정` : '사내 개념 발행';
              if (!s.run({ t: 'set', node: target, path: field, value }, label)) return;
              s.notify(
                term
                  ? `${name}에 용어집의 “${term.term}”(${term.semanticId})을 지정했습니다.`
                  : `${name}의 개념을 ${value}로 발행했습니다. 표준 사전에 해당 개념이 있으면 그쪽을 쓰는 편이 낫고, 이대로 가려면 용어집에 영문 이름과 정의를 등록해야 내보낼 때 함께 나갑니다.`,
              );
            },
          };
        }
      }

      /**
       * 같은 뜻의 서브모델이 둘 — 하나로 합친다.
       *
       * 무엇을 잃는지 모르고 합치지 않는다. 내용이 같으면 그냥 지우고, 이름이 겹치지
       * 않으면 옮겨 붙이고, 둘 다 아니면 **사라지는 요소 수를 라벨에 적어** 사람이
       * 보고 누르게 한다. 되돌리기는 명령 하나로 된다.
       */
      if (i.code === 'POL-STRUCT-004' && i.node !== null) {
        const dup = i.node;
        const parent = parentOf(settled, dup);
        const sem = settled.nodes[dup]!.semanticId;
        const keep = Object.keys(settled.nodes).find(
          (id) =>
            id !== dup &&
            settled.nodes[id]!.t === 'submodel' &&
            settled.nodes[id]!.semanticId === sem &&
            parentOf(settled, id) === parent,
        );
        const plan = keep ? planMerge(settled, keep, dup) : null;
        if (plan) {
          const label = plan.identical
            ? '중복 삭제 (내용이 같습니다)'
            : plan.conflicts.length === 0
              ? `합치기 (요소 ${plan.movable.length}개 옮김)`
              : `합치기 (요소 ${plan.lost - 1}개 사라짐)`;
          issue.fix = {
            label,
            run: () => {
              const s = useEditor.getState();
              const fresh = keep ? planMerge(s.doc, keep, dup) : null;
              if (!fresh) return;
              if (
                fresh.conflicts.length > 0 &&
                !fresh.identical &&
                !window.confirm(
                  `같은 이름의 요소 ${fresh.conflicts.length}개(자손 포함 ${fresh.lost - 1}개)는 옮길 수 없어 사라집니다.\n` +
                    `${fresh.conflicts.map((c) => c.idShort).join(', ')}\n\n계속할까요? (Ctrl+Z로 되돌릴 수 있습니다)`,
                )
              ) {
                return;
              }
              const done = '서브모델 합치기';
              if (!s.run({ t: 'batch', label: done, cmds: fresh.cmds }, done)) return;
              s.notify(
                fresh.identical
                  ? '내용이 같은 중복 서브모델을 지웠습니다.'
                  : `요소 ${fresh.movable.length}개를 옮기고 중복 서브모델을 지웠습니다.`,
              );
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
    for (const i of buildConceptDescriptions(settled, termsResolver(book)).unresolved) {
      const issue: UiIssue = {
        code: i.code,
        layer: 'dictionary',
        severity: i.severity,
        node: i.node,
        path: i.path,
        text: i.message.ko,
      };

      /**
       * 자체 발행한 개념은 **우리가 뜻을 채울 수 있다.**
       *
       * 표준 개념(IEC CDD·eCl@ss)은 정의를 우리가 갖고 있지 않으므로 등록 창을 열지
       * 않는다 — 지어내는 것보다 남겨 두는 편이 낫다. 그쪽은 사전 프록시의 몫이다.
       */
      if (i.path.startsWith(iriPrefix) && iriPrefix) {
        const semanticId = i.path;
        const name = nameFromIri(semanticId);
        const holder = i.node ? settled.nodes[i.node] : undefined;
        issue.fix = {
          label: '개념 등록',
          run: () =>
            useTerms.getState().openDraft({
              semanticId,
              term: '',
              nameEn: humanize(name),
              definition: '',
              unit: '',
              dataType: dataTypeFor(
                holder && holder.t === 'prop' ? holder.valueType : undefined,
              ),
            }),
        };
      }

      out.push(issue);
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
  }, [settled, iriPrefix, entries]);

  return issues;
}
