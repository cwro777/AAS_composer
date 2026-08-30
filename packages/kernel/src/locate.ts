/**
 * 경로 ↔ NodeId 색인.
 *
 * aas-core3.0은 위반을 `submodels/[0]/submodelElements/[3]/value/[1]` 같은 경로로 알려 준다.
 * 그 경로는 우리 NodeId를 모른다. 이 파일이 둘을 잇는다 — 검증 이슈를 눌러 해당 노드로
 * 가려면 필요하다.
 *
 * **`serialize()`와 순회 순서가 같아야 한다.** 어긋나면 엉뚱한 노드를 가리키므로,
 * 테스트가 직렬화 결과를 따라가며 색인이 실제로 그 객체를 가리키는지 확인한다.
 */

import { type AasDoc, type NodeId, childrenOf, nodeOf } from './model.js';

export interface PathIndex {
  /** 'submodels/[0]/submodelElements/[2]' → NodeId */
  byPath: Record<string, NodeId>;
  byNode: Record<NodeId, string>;
}

export function pathIndex(doc: AasDoc): PathIndex {
  const byPath: Record<string, NodeId> = {};
  const byNode: Record<NodeId, string> = {};

  const mark = (id: NodeId, path: string): void => {
    byPath[path] = id;
    byNode[id] = path;
  };

  const walkElement = (id: NodeId, path: string): void => {
    mark(id, path);
    const n = nodeOf(doc, id);
    const kids = childrenOf(doc, id);

    switch (n.t) {
      case 'smc':
      case 'sml':
        kids.forEach((c, i) => walkElement(c, `${path}/value/[${i}]`));
        break;
      case 'entity':
        kids.forEach((c, i) => walkElement(c, `${path}/statements/[${i}]`));
        break;
      case 'annrel':
        kids.forEach((c, i) => walkElement(c, `${path}/annotations/[${i}]`));
        break;
      case 'op': {
        /* 자식이 슬롯별 세 배열로 나뉜다. 각 항목은 { value: 요소 } 로 감싸인다. */
        const inV = kids.filter((c) => (doc.nodes[c]?.opSlot ?? 'in') === 'in');
        const outV = kids.filter((c) => doc.nodes[c]?.opSlot === 'out');
        const ioV = kids.filter((c) => doc.nodes[c]?.opSlot === 'inout');
        inV.forEach((c, i) => walkElement(c, `${path}/inputVariables/[${i}]/value`));
        outV.forEach((c, i) => walkElement(c, `${path}/outputVariables/[${i}]/value`));
        ioV.forEach((c, i) => walkElement(c, `${path}/inoutputVariables/[${i}]/value`));
        break;
      }
      default:
        break;
    }
  };

  /* serialize()와 같은 순서로 셸·서브모델을 모은다 */
  const shells: NodeId[] = [];
  const submodels: NodeId[] = [];
  for (const r of doc.roots) {
    const n = doc.nodes[r];
    if (!n) continue;
    if (n.t === 'shell') {
      shells.push(r);
      for (const c of childrenOf(doc, r)) {
        if (doc.nodes[c]?.t === 'submodel') submodels.push(c);
      }
    } else if (n.t === 'submodel') {
      submodels.push(r);
    }
  }

  shells.forEach((id, i) => mark(id, `assetAdministrationShells/[${i}]`));
  submodels.forEach((id, i) => {
    const path = `submodels/[${i}]`;
    mark(id, path);
    childrenOf(doc, id).forEach((c, k) => walkElement(c, `${path}/submodelElements/[${k}]`));
  });

  return { byPath, byNode };
}

/**
 * 이슈 경로에서 가장 가까운 노드를 찾는다.
 *
 * 위반은 요소 자체가 아니라 그 안의 속성에서 나기도 한다
 * (`…/submodelElements/[2]/value/[0]/language`). 그럴 때는 조상 쪽으로 한 칸씩
 * 줄여 가며 아는 노드를 찾는다.
 */
export function nodeForPath(index: PathIndex, path: string): NodeId | null {
  let cur = path;
  while (cur.length > 0) {
    const hit = index.byPath[cur];
    if (hit !== undefined) return hit;
    const cut = cur.lastIndexOf('/');
    if (cut < 0) return null;
    cur = cur.slice(0, cut);
  }
  return null;
}
