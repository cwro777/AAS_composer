'use client';

/**
 * 캔버스 자동 정렬.
 *
 * 계획서는 ELK를 Web Worker에서 돌리는 것을 목표로 잡았다(1,000노드 300ms).
 * 지금은 포함 관계가 트리라는 점을 이용한 결정적 배치로 충분하다 —
 * 노드가 겹치지 않고, 같은 문서면 항상 같은 자리에 놓인다.
 */

import { type AasDoc, type NodeId, childrenOf } from '@aas/kernel';

export const COL = 250;
export const ROW = 78;

export function treeLayout(doc: AasDoc): Record<NodeId, { x: number; y: number }> {
  const pos: Record<NodeId, { x: number; y: number }> = {};
  let cursor = 0;

  const place = (id: NodeId, depth: number): number => {
    const kids = childrenOf(doc, id);
    if (kids.length === 0) {
      const y = cursor;
      cursor += ROW;
      pos[id] = { x: depth * COL, y };
      return y;
    }
    const ys = kids.map((k) => place(k, depth + 1));
    const y = Math.round((ys[0]! + ys[ys.length - 1]!) / 2);
    pos[id] = { x: depth * COL, y };
    return y;
  };

  for (const r of doc.roots) {
    place(r, 0);
    cursor += ROW / 2;
  }
  return pos;
}
