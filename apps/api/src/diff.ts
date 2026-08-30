/**
 * 버전 비교 — 명령을 사람이 읽는 문장으로.
 *
 * "무엇이 바뀌었는지"를 문장으로 보여주는 것이 P7의 완료 기준이다.
 * 두 스냅샷을 비교해 추측하지 않는다 — **명령 로그가 이미 정답을 갖고 있다.**
 * 이것이 문서를 명령으로 바꾸기로 한 설계의 배당금이다.
 */

import { type AasDoc, type Cmd, MODEL_TYPE } from '@aas/kernel';

import type { CommandRecord } from './store.js';

export interface DiffLine {
  version: number;
  at: string;
  author: string | null;
  text: string;
}

function short(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s === undefined || s === 'null' || s === '""') return '(비어 있음)';
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

/** 명령 하나를 문장으로. 이름은 그 시점의 문서에서 찾는다 */
function describe(cmd: Cmd, doc: AasDoc, undo?: Cmd[]): string {
  switch (cmd.t) {
    case 'insert': {
      const kind = MODEL_TYPE[cmd.node.t];
      const name = cmd.node.idShort || '(이름 없음)';
      const parent = cmd.parent;
      const where = parent === null ? '최상위' : (doc.nodes[parent]?.idShort ?? '어딘가');
      return `${where}에 ${kind} ${name} 추가`;
    }
    case 'remove': {
      const n = doc.nodes[cmd.node];
      return n ? `${MODEL_TYPE[n.t]} ${n.idShort || '(이름 없음)'} 삭제` : '노드 삭제';
    }
    case 'move': {
      const n = doc.nodes[cmd.node];
      const parent = cmd.parent;
      /* 최상위로 꺼내는 것도 move다 */
      const to = parent === null ? '최상위' : (doc.nodes[parent]?.idShort ?? '다른 노드');
      return `${n?.idShort ?? '노드'}를 ${to} 아래로 옮김`;
    }
    case 'set': {
      const n = doc.nodes[cmd.node];
      /* 이전 값은 역명령이 갖고 있다 — 저장해 둔 것을 쓰면 "A → B"로 읽힌다.
         현재 문서만 보면 idShort를 바꾼 경우 "X의 idShort를 X로"가 되어 읽을 수 없다. */
      const before = undo?.find((u) => u.t === 'set' && u.node === cmd.node && u.path === cmd.path);
      const from = before && before.t === 'set' ? short(before.value) : null;
      const to = short(cmd.value);
      const who = n?.idShort ?? '노드';
      return from === null
        ? `${who}의 ${cmd.path}을(를) ${to}(으)로`
        : `${who}의 ${cmd.path}: ${from} → ${to}`;
    }
    case 'batch':
      return cmd.label || `${cmd.cmds.length}개 변경`;
  }
}

/**
 * 명령 로그를 문장 목록으로.
 * 문서는 **현재 스냅샷**을 쓴다. 지워진 노드의 이름은 알 수 없으므로 그대로 둔다 —
 * 정확한 이름이 필요해지면 로그에 이름을 함께 남기는 것이 다음 수순이다.
 */
export function diffLines(commands: CommandRecord[], doc: AasDoc): DiffLine[] {
  return commands.map((c) => ({
    version: c.version,
    at: c.at,
    author: c.author,
    text: describe(c.cmd, doc, c.undo),
  }));
}
