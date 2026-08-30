'use client';

/**
 * 편집 동작 — 스토어 위에 얹는 얇은 층.
 *
 * 여기서 만드는 것은 전부 `Cmd`다. 컴포넌트가 문서를 직접 만지지 않게 하려는 것이 목적이다.
 */

import {
  type AasDoc,
  type AasNodeType,
  type Cmd,
  type NodeId,
  MODEL_TYPE,
  acceptsOf,
  childrenOf,
  newNode,
  parentOf,
} from '@aas/kernel';
import { type TemplateDef, instantiate } from '@aas/templates';

import { useEditor } from './store';

const SEED: Record<AasNodeType, string> = {
  shell: 'MyAsset_AAS',
  submodel: 'MySubmodel',
  smc: 'MyCollection',
  sml: 'MyList',
  prop: 'MyProperty',
  mlp: 'MyText',
  range: 'MyRange',
  file: 'MyDocument',
  blob: 'MyBlob',
  ref: 'MyReference',
  entity: 'MyEntity',
  rel: 'MyRelation',
  annrel: 'MyAnnotatedRelation',
  op: 'MyOperation',
  cap: 'MyCapability',
};

const NS = 'https://bnb.co.kr/ids';

/** 형제 안에서 겹치지 않는 idShort */
function uniqueShort(doc: AasDoc, parent: NodeId | null, base: string): string {
  const siblings = parent === null ? doc.roots : childrenOf(doc, parent);
  const taken = new Set(siblings.map((c) => doc.nodes[c]?.idShort));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

/** 선택한 노드 안에 넣을 수 있는 종류 */
export function addableUnder(doc: AasDoc, parent: NodeId | null): readonly AasNodeType[] {
  if (parent === null) return ['shell', 'submodel'];
  const p = doc.nodes[parent];
  if (!p) return [];
  /* List는 자기 typeValueListElement와 같은 종류만 받는다 */
  if (p.t === 'sml') {
    const only = Object.entries(MODEL_TYPE).find(([, m]) => m === p.typeValueListElement);
    return only ? [only[0] as AasNodeType] : acceptsOf(p.t);
  }
  return acceptsOf(p.t);
}

export function addNode(t: AasNodeType, parent: NodeId | null): void {
  const s = useEditor.getState();
  const id = s.newId();
  const idShort = uniqueShort(s.doc, parent, SEED[t]);
  const slug = idShort.toLowerCase();
  const ok = s.run(
    {
      t: 'insert',
      parent,
      index: Number.MAX_SAFE_INTEGER,
      node: newNode(id, t, {
        idShort,
        ...(t === 'shell'
          ? { identifier: `${NS}/aas/${slug}`, globalAssetId: `${NS}/asset/${slug}` }
          : {}),
        ...(t === 'submodel' ? { identifier: `${NS}/sm/${slug}` } : {}),
      }),
    },
    `${MODEL_TYPE[t]} 추가`,
  );
  if (ok) useEditor.getState().select(id);
}

export function removeNode(id: NodeId): void {
  const s = useEditor.getState();
  const label = `${s.doc.nodes[id]?.idShort || '노드'} 삭제`;
  const parent = parentOf(s.doc, id);
  if (s.run({ t: 'remove', node: id }, label)) {
    useEditor.getState().select(parent);
  }
}

/** 형제 사이에서 위·아래로 옮긴다. List의 순서가 곧 모델 순서다. */
export function reorder(id: NodeId, delta: -1 | 1): void {
  const s = useEditor.getState();
  const parent = parentOf(s.doc, id);
  if (parent === null) return;
  const sibs = childrenOf(s.doc, parent);
  const i = sibs.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= sibs.length) return;
  s.run({ t: 'move', node: id, parent, index: j }, '순서 변경');
}

export function setField(id: NodeId, path: string, value: unknown, label?: string): void {
  useEditor.getState().run(
    { t: 'set', node: id, path, value: value as never },
    label ?? `${path} 편집`,
  );
}

export function insertTemplate(def: TemplateDef, shell: NodeId | null): void {
  const s = useEditor.getState();
  const cmd: Cmd = instantiate(def, {
    newId: () => useEditor.getState().newId(),
    namespace: NS,
    assetSlug: 'asset',
    shell,
  });
  s.run(cmd, `${def.name} 삽입`);
}
