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
  mintIdentifier,
  newNode,
  parentOf,
  slugify,
  uniqueIdentifier,
} from '@aas/kernel';
import { type TemplateDef, conformsToTemplateValue, instantiate } from '@aas/templates';

import { DEFAULT_IRI_PREFIX, useSettings } from './settings';
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

/**
 * idShort는 **형제 안에서** 겹치지 않으면 되고, 전역 식별자는 **문서 전체에서**
 * 유일해야 한다. 범위가 다르다.
 *
 * 이 둘을 같은 계산으로 만들면 안 된다. idShort만 형제 기준으로 맞추고 식별자를
 * 거기서 파생시키면, 다른 셸 아래의 서브모델과 식별자가 그대로 부딪힌다
 * (POL-ID-002 — 화면에는 이름이 달라 보여서 원인을 찾기 어렵다).
 */
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
  const ns = useSettings.getState().iriPrefix || DEFAULT_IRI_PREFIX;
  const id = s.newId();
  const idShort = uniqueShort(s.doc, parent, SEED[t]);
  const identifier = mintIdentifier(s.doc, t, idShort, ns) ?? '';
  /* 자산 식별자도 같은 규칙으로 — 셸마다 다른 물리 자산이다 */
  const assetId = uniqueIdentifier(s.doc, `${ns.replace(/\/+$/, '')}/asset/${slugify(idShort)}`);

  const ok = s.run(
    {
      t: 'insert',
      parent,
      index: Number.MAX_SAFE_INTEGER,
      node: newNode(id, t, {
        idShort,
        ...(t === 'shell' ? { identifier, globalAssetId: assetId } : {}),
        ...(t === 'submodel' ? { identifier } : {}),
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

  /**
   * 같은 템플릿이 이미 붙어 있으면 묻는다.
   *
   * 규격이 막지는 않지만 IDTA 템플릿은 자산 하나에 한 벌을 전제한다. 두 번 넣는 것은
   * 대개 사고이고, 넣고 나서 합치는 것보다 넣기 전에 멈추는 편이 싸다.
   * 일부러 둘을 두려는 경우(설비마다 다른 접점 등)도 있으므로 막지는 않는다.
   */
  /* `{ns}` 템플릿은 네임스페이스와 무관하게 같은 뜻이다 — 적합성 검사와 같은 비교를 쓴다 */
  const already = Object.keys(s.doc.nodes).find(
    (id) =>
      s.doc.nodes[id]!.t === 'submodel' &&
      conformsToTemplateValue(s.doc.nodes[id]!.semanticId, def.submodel.semanticId) &&
      parentOf(s.doc, id) === shell,
  );
  if (
    already &&
    !window.confirm(
      `${def.name}이(가) 이미 있습니다 (${s.doc.nodes[already]!.idShort}).\n` +
        '같은 뜻의 서브모델이 둘이면 받는 쪽이 어느 것을 볼지 알 수 없습니다.\n\n그래도 하나 더 넣을까요?',
    )
  ) {
    s.notify(`${def.name}은(는) 이미 있습니다.`);
    return;
  }

  const cmd: Cmd = instantiate(def, {
    newId: () => useEditor.getState().newId(),
    namespace: useSettings.getState().iriPrefix || DEFAULT_IRI_PREFIX,
    assetSlug: 'asset',
    shell,
    /* 같은 템플릿을 두 번 넣어도 식별자가 겹치지 않게 한다 */
    doc: s.doc,
  });
  s.run(cmd, `${def.name} 삽입`);
}
