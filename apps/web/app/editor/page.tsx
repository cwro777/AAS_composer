'use client';

/**
 * /editor — P4 첫 슬라이스.
 *
 * 트리·인스펙터·팔레트·서랍이 같은 문서와 같은 선택 상태를 본다.
 * 캔버스(React Flow)는 다음 슬라이스에서 같은 스토어에 붙는다 — 세 뷰가
 * 같은 `AasDoc`과 `Cmd`만 쓰게 하는 것이 이 구조의 목적이다.
 */

import { useEffect } from 'react';

import { Drawer } from '../../components/Drawer';
import { Inspector } from '../../components/Inspector';
import { Palette } from '../../components/Palette';
import { Tree } from '../../components/Tree';
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
            <span className="eyebrow">트리</span>
            <span className="hint">
              ↑↓ 이동 · ←→ 접기/펼치기 · Ctrl+↑↓ 순서 변경 · F2 이름 · Del 삭제
            </span>
          </div>
          <Tree />
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
