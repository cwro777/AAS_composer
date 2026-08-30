'use client';

/**
 * 표 편집 — P5의 실질.
 *
 * 실측에서 나온 문제가 이것이다. 신호 하나를 기술하는 데 노드가 여덟 개고,
 * 신호 20개면 160개다. 캔버스로는 불가능하고 트리로도 느리다.
 * 한 컨테이너의 자식을 스프레드시트처럼 놓고 고치는 화면이 있어야 실제로 쓴다.
 *
 * 붙여넣기는 한 번의 명령(batch)으로 들어간다 — 500행을 넣어도 Ctrl+Z 한 번이다.
 */

import { useMemo, useState } from 'react';

import {
  type AasNode,
  type AasNodeType,
  type Cmd,
  type NodeId,
  MODEL_TYPE,
  acceptsOf,
  childrenOf,
  newNode,
  parentOf,
} from '@aas/kernel';

import { addNode, addableUnder, removeNode, reorder, setField } from '../lib/edit';
import { useEditor } from '../lib/store';

const VALUE_TYPES = [
  'xs:string',
  'xs:double',
  'xs:int',
  'xs:long',
  'xs:boolean',
  'xs:dateTime',
  'xs:date',
  'xs:anyURI',
];

/** 표로 다룰 수 있는 부모 — 자식을 담는 노드 */
function containerFor(doc: ReturnType<typeof useEditor.getState>['doc'], id: NodeId | null): NodeId | null {
  if (id === null) return doc.roots.find((r) => acceptsOf(doc.nodes[r]!.t).length > 0) ?? null;
  const n = doc.nodes[id];
  if (!n) return null;
  if (acceptsOf(n.t).length > 0) return id;
  return parentOf(doc, id);
}

function valueOf(n: AasNode): string {
  switch (n.t) {
    case 'prop':
    case 'file':
      return n.value ?? '';
    case 'range':
      return `${n.min ?? ''} … ${n.max ?? ''}`;
    case 'mlp':
      return n.value
        .filter((l) => l.text)
        .map((l) => `${l.language}:${l.text}`)
        .join(' | ');
    default:
      return '';
  }
}

interface CellProps {
  value: string;
  onCommit: (v: string) => void;
  mono?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

function Cell({ value, onCommit, mono, disabled, placeholder }: CellProps): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const shown = editing ? draft : value;
  return (
    <input
      className={mono ? 'mono' : undefined}
      value={shown}
      disabled={disabled}
      placeholder={placeholder}
      onFocus={() => {
        setDraft(value);
        setEditing(true);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function PasteBox({ parent, onDone }: { parent: NodeId; onDone: () => void }): React.JSX.Element {
  const [text, setText] = useState('');
  const run = useEditor((s) => s.run);
  const newId = useEditor((s) => s.newId);

  const apply = (): void => {
    const rows = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split('\t').map((c) => c.trim()));
    if (rows.length === 0) return;

    const cmds: Cmd[] = rows.map(([idShort, value, valueType, semanticId]) => ({
      t: 'insert',
      parent,
      index: Number.MAX_SAFE_INTEGER,
      node: newNode(newId(), 'prop', {
        idShort: idShort ?? '',
        value: value ?? '',
        valueType: valueType || 'xs:string',
        ...(semanticId ? { semanticId } : {}),
      }),
    }));
    /* 500행을 넣어도 실행취소는 한 번이다 */
    run({ t: 'batch', label: `${rows.length}행 붙여넣기`, cmds }, `${rows.length}행 붙여넣기`);
    onDone();
  };

  return (
    <div className="paste">
      <p className="hint">
        엑셀에서 복사해 붙여넣으십시오. 열 순서는 <b>idShort · value · valueType · semanticId</b>이고
        탭으로 구분합니다. valueType을 비우면 xs:string입니다.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={'BarrelTempZone1\t235.4\txs:double\nBarrelTempZone2\t241.2\txs:double'}
      />
      <div className="row">
        <button type="button" className="mini" onClick={apply} disabled={!text.trim()}>
          {text.trim() ? `${text.trim().split(/\r?\n/).length}행 추가` : '행 추가'}
        </button>
        <button type="button" className="mini" onClick={onDone}>
          닫기
        </button>
      </div>
    </div>
  );
}

export function Table(): React.JSX.Element {
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selected);
  const select = useEditor((s) => s.select);
  const [pasting, setPasting] = useState(false);
  const [addType, setAddType] = useState<AasNodeType>('prop');

  const parent = useMemo(() => containerFor(doc, selected), [doc, selected]);
  const rows = parent ? childrenOf(doc, parent) : [];
  const addable = parent ? addableUnder(doc, parent) : [];
  const type = addable.includes(addType) ? addType : (addable[0] ?? 'prop');

  if (!parent) {
    return (
      <div className="empty">
        <b>표로 편집할 대상이 없습니다</b>
        <span>Submodel · Collection · List · Entity를 선택하면 그 자식을 표로 편집합니다.</span>
      </div>
    );
  }

  const p = doc.nodes[parent]!;
  const isList = p.t === 'sml';

  return (
    <div className="tablewrap">
      <div className="tablebar">
        <span className="where">
          <b>{p.idShort || '(이름 없음)'}</b>
          <i>{MODEL_TYPE[p.t]}</i>
          <em>{rows.length}행</em>
        </span>
        {addable.length ? (
          <>
            <select value={type} onChange={(e) => setAddType(e.target.value as AasNodeType)}>
              {addable.map((t) => (
                <option key={t} value={t}>
                  {MODEL_TYPE[t]}
                </option>
              ))}
            </select>
            <button type="button" className="mini" onClick={() => addNode(type, parent)}>
              + 행 추가
            </button>
            {addable.includes('prop') ? (
              <button type="button" className="mini" onClick={() => setPasting((v) => !v)}>
                붙여넣기
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {pasting ? <PasteBox parent={parent} onDone={() => setPasting(false)} /> : null}

      {rows.length === 0 ? (
        <p className="hint pad">자식이 없습니다. 위에서 행을 추가하거나 붙여넣으십시오.</p>
      ) : (
        <div className="tablescroll">
          <table className="grid">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>idShort</th>
                <th>종류</th>
                <th>semanticId</th>
                <th>valueType</th>
                <th>value</th>
                <th aria-label="행 조작" />
              </tr>
            </thead>
            <tbody>
              {rows.map((id, i) => {
                const n = doc.nodes[id]!;
                const editable = n.t === 'prop' || n.t === 'file';
                return (
                  <tr key={id} className={id === selected ? 'sel' : undefined} onClick={() => select(id)}>
                    <td className="num">{i + 1}</td>
                    <td>
                      <Cell
                        value={n.idShort}
                        disabled={isList}
                        placeholder={isList ? '(List 자식은 이름 없음)' : undefined}
                        onCommit={(v) => setField(id, 'idShort', v, 'idShort 편집')}
                      />
                    </td>
                    <td className="kindcell">{MODEL_TYPE[n.t]}</td>
                    <td>
                      <Cell
                        mono
                        value={n.semanticId ?? ''}
                        onCommit={(v) => setField(id, 'semanticId', v, 'semanticId 편집')}
                      />
                    </td>
                    <td>
                      {n.t === 'prop' || n.t === 'range' ? (
                        <select
                          value={(n as { valueType?: string }).valueType ?? 'xs:string'}
                          onChange={(e) => setField(id, 'valueType', e.target.value, 'valueType 편집')}
                        >
                          {VALUE_TYPES.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <Cell
                          mono
                          value={valueOf(n)}
                          onCommit={(v) => setField(id, 'value', v, '값 편집')}
                        />
                      ) : (
                        <span className="dim">{valueOf(n) || '—'}</span>
                      )}
                    </td>
                    <td className="ops">
                      <button type="button" onClick={() => reorder(id, -1)} aria-label="위로" disabled={i === 0}>
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => reorder(id, 1)}
                        aria-label="아래로"
                        disabled={i === rows.length - 1}
                      >
                        ↓
                      </button>
                      <button type="button" onClick={() => removeNode(id)} aria-label="삭제">
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
