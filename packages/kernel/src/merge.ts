/**
 * 같은 뜻의 서브모델 둘을 하나로.
 *
 * 대개 같은 템플릿을 두 번 넣은 사고다. 그런데 "합친다"는 말이 늘 안전하지는 않다 —
 * 두 서브모델에 같은 이름의 자식이 있으면 한쪽으로 몰 수 없다(형제 idShort는
 * 유일해야 한다). 그래서 **무엇을 옮길 수 있고 무엇이 부딪히는지 먼저 세어 보고**,
 * 잃는 것이 있으면 그 수를 말한 뒤에 사람이 정하게 한다.
 *
 * 여기서 문서를 바꾸지 않는다. 계획만 만든다 — `planMigration`과 같은 방식이다.
 */

import type { Cmd } from './command.js';
import { type AasDoc, type Json, type NodeId, childrenOf } from './model.js';

export interface MergePlan {
  /** 이름이 겹치지 않아 그대로 옮길 수 있는 자식 */
  movable: NodeId[];
  /** 이름이 겹쳐 자동으로 옮길 수 없는 자식 */
  conflicts: Array<{ node: NodeId; idShort: string }>;
  /**
   * 두 서브모델의 내용이 같은가.
   *
   * 같다면 지워도 잃는 것이 없다 — 두 번 넣은 그대로라는 뜻이다.
   */
  identical: boolean;
  /** 옮길 수 있는 것을 옮기고 중복을 지운다. 충돌은 이 명령으로 사라진다. */
  cmds: Cmd[];
  /** 이 계획으로 사라지는 요소 수 (충돌 자식과 그 자손) */
  lost: number;
}

/** 노드 하나의 비교용 모양 — 우리 내부 id와 좌표는 뜻이 아니다 */
function shapeOf(doc: AasDoc, id: NodeId): Json {
  const n = doc.nodes[id]! as unknown as Record<string, Json>;
  const own: Record<string, Json> = {};
  for (const k of Object.keys(n).sort()) {
    if (k === 'id' || k === 'origin') continue;
    own[k] = n[k]!;
  }
  return {
    self: own,
    children: childrenOf(doc, id).map((c) => shapeOf(doc, c)),
  };
}

function countSubtree(doc: AasDoc, id: NodeId): number {
  return 1 + childrenOf(doc, id).reduce((n, c) => n + countSubtree(doc, c), 0);
}

/**
 * `keep`에 `dup`을 합치는 계획.
 *
 * 서브모델 자신의 필드(idShort·identifier·administration…)는 `keep`의 것을 그대로 둔다.
 * 둘 중 어느 쪽이 옳은지 우리가 알 방법이 없고, 조용히 덮어쓰는 것이 가장 나쁘다.
 */
export function planMerge(doc: AasDoc, keep: NodeId, dup: NodeId): MergePlan | null {
  if (keep === dup || !doc.nodes[keep] || !doc.nodes[dup]) return null;

  const taken = new Set(childrenOf(doc, keep).map((c) => doc.nodes[c]?.idShort ?? ''));
  const movable: NodeId[] = [];
  const conflicts: Array<{ node: NodeId; idShort: string }> = [];

  for (const c of childrenOf(doc, dup)) {
    const idShort = doc.nodes[c]?.idShort ?? '';
    if (idShort && taken.has(idShort)) conflicts.push({ node: c, idShort });
    else movable.push(c);
  }

  const cmds: Cmd[] = [
    ...movable.map(
      (node): Cmd => ({ t: 'move', node, parent: keep, index: Number.MAX_SAFE_INTEGER }),
    ),
    { t: 'remove', node: dup },
  ];

  return {
    movable,
    conflicts,
    identical: JSON.stringify(shapeOf(doc, keep)) === JSON.stringify(shapeOf(doc, dup)),
    cmds,
    /* 중복 서브모델 자신 + 옮기지 못한 자식들의 자손 */
    lost: 1 + conflicts.reduce((n, c) => n + countSubtree(doc, c.node), 0),
  };
}
