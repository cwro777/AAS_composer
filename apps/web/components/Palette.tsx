'use client';

/**
 * 팔레트 — 선택한 노드 안에 넣을 수 있는 것만 보여준다.
 *
 * 넣을 수 없는 것을 눌러 보고 거부당하는 대신, 애초에 목록에서 빠진다.
 * 포함 규칙(L0)은 커널이 알고 있으므로 UI는 물어보기만 한다.
 */

import { MODEL_TYPE } from '@aas/kernel';
import { listTemplates } from '@aas/templates';

import { addNode, addableUnder, insertTemplate } from '../lib/edit';
import { useEditor } from '../lib/store';

export function Palette(): React.JSX.Element {
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selected);

  /* 선택이 없으면 루트에 넣는다 */
  const parent = selected ?? null;
  const types = addableUnder(doc, parent);
  const shells = doc.roots.filter((r) => doc.nodes[r]?.t === 'shell');
  const targetShell = shells.length === 1 ? shells[0]! : null;
  const where = parent ? (doc.nodes[parent]?.idShort || '선택한 노드') : '최상위';

  return (
    <aside className="rail">
      <div className="sec">
        <p className="eyebrow">노드 추가</p>
        <p className="hint">넣을 위치: <b>{where}</b></p>
        <div className="chips">
          {types.length === 0 ? (
            <p className="hint">이 노드 안에는 아무것도 넣을 수 없습니다.</p>
          ) : (
            types.map((t) => (
              <button key={t} type="button" className="chip" onClick={() => addNode(t, parent)}>
                <i style={{ background: `var(--n-${t})` }} />
                <span>{MODEL_TYPE[t]}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="sec">
        <p className="eyebrow">IDTA 템플릿</p>
        <p className="hint">
          {targetShell ? '셸에 붙습니다.' : shells.length ? '셸이 여럿이라 최상위에 놓입니다.' : '독립 서브모델로 놓입니다.'}
        </p>
        {listTemplates().map((t) => (
          <button key={t.id} type="button" className="tpl" onClick={() => insertTemplate(t, targetShell)}>
            <b>{t.name}</b>
            <i>
              {t.idtaNumber} v{t.version}
            </i>
          </button>
        ))}
      </div>
    </aside>
  );
}
