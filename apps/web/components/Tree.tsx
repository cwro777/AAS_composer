'use client';

/**
 * 트리 뷰 — 키보드만으로 생성·이동·편집·삭제가 되는 완전한 경로.
 *
 * 캔버스는 접근성이 구조적으로 취약하다. 트리를 "보조 수단"이 아니라
 * 대등한 경로로 만드는 것이 P4의 완료 기준 중 하나다(계획서 08장).
 * 대형 모델에서는 이쪽이 오히려 실사용 경로가 된다.
 */

import { useEffect, useMemo, useRef } from 'react';

import { type AasDoc, type NodeId, MODEL_TYPE, childrenOf, parentOf } from '@aas/kernel';

import { removeNode, reorder } from '../lib/edit';
import { useEditor } from '../lib/store';

interface Row {
  id: NodeId;
  depth: number;
  hasKids: boolean;
  collapsed: boolean;
}

/** 접힌 노드의 자식은 건너뛴다 — 화면에 보이는 순서 그대로의 목록 */
function flatten(doc: AasDoc, collapsed: Record<string, boolean>): Row[] {
  const rows: Row[] = [];
  const walk = (id: NodeId, depth: number): void => {
    const kids = childrenOf(doc, id);
    const isCollapsed = Boolean(collapsed[id]);
    rows.push({ id, depth, hasKids: kids.length > 0, collapsed: isCollapsed });
    if (!isCollapsed) for (const k of kids) walk(k, depth + 1);
  };
  for (const r of doc.roots) walk(r, 0);
  return rows;
}

export function Tree(): React.JSX.Element {
  const doc = useEditor((s) => s.doc);
  const collapsed = useEditor((s) => s.layout.collapsed);
  const selected = useEditor((s) => s.selected);
  const select = useEditor((s) => s.select);
  const toggleCollapse = useEditor((s) => s.toggleCollapse);
  const boxRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => flatten(doc, collapsed), [doc, collapsed]);

  /* 선택이 바뀌면 그 줄이 보이도록 */
  useEffect(() => {
    if (!selected) return;
    boxRef.current?.querySelector<HTMLElement>(`[data-id="${selected}"]`)?.scrollIntoView({
      block: 'nearest',
    });
  }, [selected]);

  const move = (delta: -1 | 1): void => {
    const i = rows.findIndex((r) => r.id === selected);
    const next = rows[i < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, i + delta))];
    if (next) select(next.id);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!selected) {
      if (e.key === 'ArrowDown' && rows[0]) {
        e.preventDefault();
        select(rows[0].id);
      }
      return;
    }
    const node = doc.nodes[selected];
    if (!node) return;

    /* Ctrl+↑/↓ 는 순서 변경. List의 순서가 곧 모델 순서다 */
    if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      reorder(selected, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (childrenOf(doc, selected).length && collapsed[selected]) toggleCollapse(selected);
        else move(1);
        break;
      case 'ArrowLeft': {
        e.preventDefault();
        if (childrenOf(doc, selected).length && !collapsed[selected]) {
          toggleCollapse(selected);
        } else {
          const p = parentOf(doc, selected);
          if (p) select(p);
        }
        break;
      }
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        removeNode(selected);
        break;
      case 'F2': {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[data-field="idShort"]')?.focus();
        break;
      }
      default:
        break;
    }
  };

  if (rows.length === 0) {
    return (
      <div className="empty">
        <b>모델이 비어 있습니다</b>
        <span>왼쪽 팔레트에서 AAS Shell을 추가하거나 IDTA 템플릿을 넣어 시작하세요.</span>
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      className="tree"
      role="tree"
      aria-label="모델 트리"
      tabIndex={0}
      /* 탭 정지점은 트리 하나. 현재 항목은 activedescendant로 알린다 */
      aria-activedescendant={selected ?? undefined}
      onKeyDown={onKeyDown}
    >
      {rows.map((r) => {
        const n = doc.nodes[r.id]!;
        const isSel = r.id === selected;
        return (
          <div
            key={r.id}
            id={r.id}
            data-id={r.id}
            role="treeitem"
            aria-selected={isSel}
            aria-expanded={r.hasKids ? !r.collapsed : undefined}
            className={`row${isSel ? ' sel' : ''}`}
            style={{ paddingLeft: `${8 + r.depth * 14}px` }}
            onClick={() => select(r.id)}
          >
            <button
              type="button"
              className="twist"
              aria-hidden={!r.hasKids}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                if (r.hasKids) toggleCollapse(r.id);
              }}
            >
              {r.hasKids ? (r.collapsed ? '▸' : '▾') : ''}
            </button>
            <i className="stripe" style={{ background: `var(--n-${n.t})` }} />
            <span className="name">{n.idShort || <em>(이름 없음)</em>}</span>
            <span className="kind">{MODEL_TYPE[n.t]}</span>
          </div>
        );
      })}
    </div>
  );
}
