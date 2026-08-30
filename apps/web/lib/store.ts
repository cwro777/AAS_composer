'use client';

/**
 * 에디터 상태 — 문서는 명령으로만 바꾼다.
 *
 * 실행취소를 zundo 같은 상태 diff 라이브러리로 만들지 않는다. 커널의 `apply()`가
 * 이미 역명령을 돌려주기 때문이다(계획서 04장). 그래서 실행취소·다시실행·감사 추적이
 * 같은 한 곳에서 나온다.
 *
 * 좌표는 `Layout`에 있고 실행취소 대상이 아니다. 노드를 옮겼다고 문서가
 * 더러워지면 버전 비교가 무의미해진다.
 */

import { create } from 'zustand';

import {
  type AasDoc,
  type Cmd,
  type Layout,
  type NodeId,
  type Reject,
  MODEL_TYPE,
  apply,
  emptyDoc,
  emptyLayout,
  undoAll,
} from '@aas/kernel';

export interface HistoryEntry {
  label: string;
  redo: Cmd;
  undo: Cmd[];
}

export function rejectMessage(r: Reject): string {
  switch (r.code) {
    case 'CONTAINMENT':
      return `${MODEL_TYPE[r.parent]} 안에는 ${MODEL_TYPE[r.child]}을(를) 넣을 수 없습니다.`;
    case 'CYCLE':
      return '자기 자신의 하위로는 옮길 수 없습니다.';
    case 'ALREADY_PARENTED':
      return '이미 다른 노드에 포함된 요소입니다.';
    case 'LIST_TYPE_MISMATCH':
      return `이 목록은 ${r.expected} 목록입니다. ${r.got}은(는) 넣을 수 없습니다. (AASd-108)`;
    case 'ROOT_NOT_ALLOWED':
      return `${MODEL_TYPE[r.child]}은(는) 최상위에 놓을 수 없습니다. Submodel 안에 넣으세요.`;
    case 'UNKNOWN_NODE':
      return '대상 노드를 찾을 수 없습니다.';
    case 'DUPLICATE_NODE':
      return '같은 id의 노드가 이미 있습니다.';
    case 'INVALID_PATH':
      return `바꿀 수 없는 항목입니다: ${r.path}`;
  }
}

interface EditorState {
  doc: AasDoc;
  layout: Layout;
  selected: NodeId | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  notice: string | null;
  seq: number;

  newId: () => NodeId;
  /** 문서를 바꾸는 유일한 경로. 거부되면 false를 돌려주고 사유를 알린다. */
  run: (cmd: Cmd, label: string) => boolean;
  undo: () => void;
  redo: () => void;
  select: (id: NodeId | null) => void;
  /** 화면 정보 — 실행취소 대상이 아니다 */
  moveTo: (id: NodeId, pos: { x: number; y: number }) => void;
  /** 자동 정렬 — 좌표를 한 번에 바꾼다 */
  arrange: (pos: Record<NodeId, { x: number; y: number }>) => void;
  toggleCollapse: (id: NodeId) => void;
  load: (doc: AasDoc, layout?: Layout) => void;
  notify: (msg: string | null) => void;
}

/** 불러온 문서와 id가 겹치지 않도록 다음 번호를 찾는다 */
function nextSeq(doc: AasDoc): number {
  let max = 0;
  for (const id of Object.keys(doc.nodes)) {
    const m = /^n(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export const useEditor = create<EditorState>()((set, get) => ({
  doc: emptyDoc(),
  layout: emptyLayout(),
  selected: null,
  past: [],
  future: [],
  notice: null,
  seq: 1,

  newId: () => {
    const id = `n${get().seq}` as NodeId;
    set((s) => ({ seq: s.seq + 1 }));
    return id;
  },

  run: (cmd, label) => {
    const r = apply(get().doc, cmd);
    if (r.rejected) {
      set({ notice: rejectMessage(r.rejected) });
      return false;
    }
    set((s) => ({
      doc: r.doc,
      past: [...s.past, { label, redo: cmd, undo: r.undo }],
      future: [],
      notice: null,
    }));
    return true;
  },

  undo: () => {
    const { past, doc } = get();
    const entry = past[past.length - 1];
    if (!entry) return;
    const next = undoAll(doc, entry.undo);
    set((s) => ({
      doc: next,
      /* 되돌리면서 사라진 노드를 계속 선택해 두면 팔레트가 굳는다 */
      selected: s.selected && next.nodes[s.selected] ? s.selected : null,
      past: s.past.slice(0, -1),
      future: [entry, ...s.future],
      notice: `되돌림: ${entry.label}`,
    }));
  },

  redo: () => {
    const { future, doc } = get();
    const entry = future[0];
    if (!entry) return;
    const r = apply(doc, entry.redo);
    if (r.rejected) {
      set({ notice: rejectMessage(r.rejected) });
      return;
    }
    set((s) => ({
      doc: r.doc,
      selected: s.selected && r.doc.nodes[s.selected] ? s.selected : null,
      past: [...s.past, { label: entry.label, redo: entry.redo, undo: r.undo }],
      future: s.future.slice(1),
      notice: `다시 실행: ${entry.label}`,
    }));
  },

  select: (id) => set({ selected: id }),

  moveTo: (id, pos) =>
    set((s) => ({ layout: { ...s.layout, pos: { ...s.layout.pos, [id]: pos } } })),

  arrange: (pos) => set((s) => ({ layout: { ...s.layout, pos } })),

  toggleCollapse: (id) =>
    set((s) => ({
      layout: { ...s.layout, collapsed: { ...s.layout.collapsed, [id]: !s.layout.collapsed[id] } },
    })),

  load: (doc, layout) =>
    set({
      doc,
      layout: layout ?? emptyLayout(),
      selected: null,
      past: [],
      future: [],
      notice: null,
      seq: nextSeq(doc),
    }),

  notify: (msg) => set({ notice: msg }),
}));
