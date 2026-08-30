'use client';

/**
 * /editor — P4 첫 슬라이스.
 *
 * 트리·인스펙터·팔레트·서랍이 같은 문서와 같은 선택 상태를 본다.
 * 캔버스(React Flow)는 다음 슬라이스에서 같은 스토어에 붙는다 — 세 뷰가
 * 같은 `AasDoc`과 `Cmd`만 쓰게 하는 것이 이 구조의 목적이다.
 */

import { useEffect, useState } from 'react';

import { ReactFlowProvider } from '@xyflow/react';

import { Canvas } from '../../components/Canvas';
import { Drawer } from '../../components/Drawer';
import { Inspector } from '../../components/Inspector';
import { Palette } from '../../components/Palette';
import { Table } from '../../components/Table';
import { Tree } from '../../components/Tree';
import { treeLayout } from '../../lib/layout';
import { useEditor } from '../../lib/store';
import './editor.css';

export default function EditorPage(): React.JSX.Element {
  const doc = useEditor((s) => s.doc);
  const past = useEditor((s) => s.past);
  const future = useEditor((s) => s.future);
  const notice = useEditor((s) => s.notice);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const notify = useEditor((s) => s.notify);
  const arrange = useEditor((s) => s.arrange);
  const [view, setView] = useState<'tree' | 'canvas' | 'table'>('tree');

  /* Ctrl+Z / Ctrl+Shift+Z · Ctrl+Y — 입력 중에는 브라우저 기본 동작에 맡긴다 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => notify(null), 2600);
    return () => clearTimeout(t);
  }, [notice, notify]);

  const counts = { shell: 0, submodel: 0, element: 0 };
  for (const id of Object.keys(doc.nodes)) {
    const t = doc.nodes[id]!.t;
    if (t === 'shell') counts.shell++;
    else if (t === 'submodel') counts.submodel++;
    else counts.element++;
  }

  return (
    <div className="app">
      <header className="bar">
        <div className="brand">
          <b>AAS Composer</b>
          <span>IEC 63278 · V3.0</span>
        </div>
        <div className="tools">
          <button type="button" onClick={undo} disabled={past.length === 0} title="Ctrl+Z">
            ↶ 실행취소
          </button>
          <button type="button" onClick={redo} disabled={future.length === 0} title="Ctrl+Shift+Z">
            ↷ 다시실행
          </button>
          {past.length ? <span className="last">{past[past.length - 1]!.label}</span> : null}
        </div>
        <div className="stat">
          <span>
            SHELL <b>{counts.shell}</b>
          </span>
          <span>
            SUBMODEL <b>{counts.submodel}</b>
          </span>
          <span>
            ELEMENT <b>{counts.element}</b>
          </span>
        </div>
      </header>

      <div className="body">
        <Palette />
        <main className="stage">
          <div className="viewhead">
            <div className="viewtabs" role="tablist" aria-label="보기">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'tree'}
                className={view === 'tree' ? 'on' : ''}
                onClick={() => setView('tree')}
              >
                트리
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'canvas'}
                className={view === 'canvas' ? 'on' : ''}
                onClick={() => setView('canvas')}
              >
                캔버스
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'table'}
                className={view === 'table' ? 'on' : ''}
                onClick={() => setView('table')}
              >
                표
              </button>
            </div>
            <span className="hint">
              {view === 'tree'
                ? '↑↓ 이동 · ←→ 접기/펼치기 · Ctrl+↑↓ 순서 변경 · F2 이름 · Del 삭제'
                : view === 'canvas'
                  ? '드래그로 이동(실행취소 대상 아님) · 오른쪽 단자를 끌어 포함 관계를 만듭니다'
                  : '선택한 컨테이너의 자식을 표로 고칩니다 · 엑셀에서 복사해 붙여넣을 수 있습니다'}
            </span>
            {view === 'canvas' ? (
              <button type="button" className="mini auto" onClick={() => arrange(treeLayout(doc))}>
                자동 정렬
              </button>
            ) : null}
          </div>
          {view === 'tree' ? (
            <Tree />
          ) : view === 'table' ? (
            <Table />
          ) : (
            <ReactFlowProvider>
              <Canvas />
            </ReactFlowProvider>
          )}
          <Drawer />
        </main>
        <aside className="side">
          <Inspector />
        </aside>
      </div>

      {notice ? <div className="toast">{notice}</div> : null}
    </div>
  );
}
