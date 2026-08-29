/**
 * 임의 문서·명령 생성기 — 속성 테스트의 입력.
 *
 * 왕복 불변식을 "손으로 고른 예제"가 아니라 임의 문서 100건으로 확인한다.
 */

import fc from 'fast-check';

import {
  type AasDoc,
  type AasNode,
  type AasNodeType,
  type Cmd,
  type NodeId,
  type OpSlot,
  DATA_ELEMENT_TYPES,
  ELEMENT_TYPES,
  acceptsOf,
  apply,
  childrenOf,
  emptyDoc,
  newNode,
} from '../src/index.js';

const IDSHORT = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,11}$/);
const VALUE_TYPES = ['xs:string', 'xs:double', 'xs:boolean', 'xs:date', 'xs:dateTime', 'xs:long'];

const SEMANTIC_IDS = [
  '0112/2///61987#ABA565#009',
  '0173-1#02-AAO677#004',
  'https://admin-shell.io/idta/nameplate/3/0/Nameplate',
  '',
];

function valueFor(vt: string): string {
  switch (vt) {
    case 'xs:double':
    case 'xs:long':
      return '42';
    case 'xs:boolean':
      return 'true';
    case 'xs:date':
      return '2026-03-14';
    case 'xs:dateTime':
      return '2026-03-14T09:30:00+09:00';
    default:
      return 'text';
  }
}

interface Seed {
  t: AasNodeType;
  idShort: string;
  semanticId: string;
  valueType: string;
  listType: AasNodeType;
  entitySelf: boolean;
  opSlot: OpSlot;
  children: Seed[];
}

const elementSeed = fc.letrec<{ node: Seed }>((tie) => ({
  node: fc.record({
    t: fc.constantFrom(...ELEMENT_TYPES),
    idShort: IDSHORT,
    semanticId: fc.constantFrom(...SEMANTIC_IDS),
    valueType: fc.constantFrom(...VALUE_TYPES),
    listType: fc.constantFrom<AasNodeType>('prop', 'smc'),
    entitySelf: fc.boolean(),
    opSlot: fc.constantFrom<OpSlot>('in', 'out', 'inout'),
    children: fc.oneof(
      { depthSize: 'small', withCrossShrink: true },
      fc.constant([] as Seed[]),
      fc.array(tie('node'), { maxLength: 3 }),
    ),
  }),
})).node;

export const docArbitrary = fc
  .record({
    shells: fc.array(
      fc.record({
        idShort: IDSHORT,
        submodels: fc.array(
          fc.record({ idShort: IDSHORT, elements: fc.array(elementSeed, { maxLength: 4 }) }),
          { maxLength: 3 },
        ),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    standalone: fc.array(
      fc.record({ idShort: IDSHORT, elements: fc.array(elementSeed, { maxLength: 3 }) }),
      { maxLength: 2 },
    ),
  })
  .map(({ shells, standalone }) => buildDoc(shells, standalone));

function buildDoc(
  shells: Array<{ idShort: string; submodels: Array<{ idShort: string; elements: Seed[] }> }>,
  standalone: Array<{ idShort: string; elements: Seed[] }>,
): AasDoc {
  let seq = 0;
  const nextId = (): NodeId => `n${++seq}`;
  let doc = emptyDoc();
  let uniq = 0;
  const unique = (s: string): string => `${s}_${++uniq}`;

  const insert = (node: AasNode, parent: NodeId | null): NodeId => {
    const r = apply(doc, { t: 'insert', parent, index: Number.MAX_SAFE_INTEGER, node });
    if (r.rejected) return node.id; /* 거부되면 붙이지 않는다 — 생성기가 만든 조합 문제 */
    doc = r.doc;
    return node.id;
  };

  const REF = { type: 'ModelReference' as const, keys: [{ type: 'Submodel', value: 'https://example.com/ids/sm/x' }] };

  const putElement = (
    seed: Seed,
    parent: NodeId,
    ctx: { list?: AasNodeType; dataOnly?: boolean; op?: boolean },
  ): void => {
    /* List 안에서는 타입이 하나로 고정된다. annotations는 DataElement만 받는다. */
    const t: AasNodeType = ctx.list
      ? ctx.list
      : ctx.dataOnly && !DATA_ELEMENT_TYPES.includes(seed.t)
        ? 'prop'
        : seed.t;
    const id = nextId();
    const valueType = ctx.list && t === 'prop' ? 'xs:string' : seed.valueType;
    const init: Parameters<typeof newNode>[2] = {
      idShort: unique(seed.idShort),
      ...(seed.semanticId ? { semanticId: seed.semanticId } : {}),
      valueType,
      value: valueFor(valueType),
      langs: [{ language: 'en', text: 'x' }],
      min: '1',
      max: '9',
      contentType: 'application/pdf',
    };
    if (t === 'sml') {
      const isProp = seed.listType !== 'smc';
      init.typeValueListElement = isProp ? 'Property' : 'SubmodelElementCollection';
      init.semanticIdListElement = '0173-1#01-AHF579#003';
      /* AASd-109 — Property 목록은 값 타입을 선언해야 하고 자식이 모두 그 타입이어야 한다 */
      if (isProp) init.valueTypeListElement = 'xs:string';
    }
    if (t === 'file') init.value = '/aasx/files/x.pdf';
    if (t === 'ref') init.value = '';
    if (t === 'blob') { init.contentType = 'application/octet-stream'; init.value = 'AAEC'; }
    if (t === 'entity') {
      init.entityType = seed.entitySelf ? 'SelfManagedEntity' : 'CoManagedEntity';
      if (seed.entitySelf) init.globalAssetId = `https://example.com/ids/asset/${id}`;
    }
    if (t === 'rel' || t === 'annrel') { init.first = REF; init.second = REF; }
    if (ctx.op) init.opSlot = seed.opSlot;

    insert(newNode(id, t, init), parent);
    if (!doc.nodes[id]) return;

    if (t === 'smc') {
      for (const c of seed.children) putElement(c, id, {});
    } else if (t === 'sml') {
      const childType: AasNodeType = seed.listType === 'smc' ? 'smc' : 'prop';
      for (const c of seed.children) putElement(c, id, { list: childType });
    } else if (t === 'entity') {
      for (const c of seed.children) putElement(c, id, {});
    } else if (t === 'annrel') {
      for (const c of seed.children) putElement(c, id, { dataOnly: true });
    } else if (t === 'op') {
      for (const c of seed.children) putElement(c, id, { op: true });
    }
  };

  const putSubmodel = (sm: { idShort: string; elements: Seed[] }, shell: NodeId | null): void => {
    const id = nextId();
    const name = unique(sm.idShort);
    insert(
      newNode(id, 'submodel', {
        idShort: name,
        identifier: `https://example.com/ids/sm/${name.toLowerCase()}`,
        kind: 'Instance',
        semanticId: 'https://admin-shell.io/idta/OperationalData/1/0',
      }),
      shell,
    );
    if (!doc.nodes[id]) return;
    for (const e of sm.elements) putElement(e, id, {});
  };

  for (const sh of shells) {
    const id = nextId();
    const name = unique(sh.idShort);
    insert(
      newNode(id, 'shell', {
        idShort: name,
        identifier: `https://example.com/ids/aas/${name.toLowerCase()}`,
        globalAssetId: `https://example.com/ids/asset/${name.toLowerCase()}`,
        assetKind: 'Instance',
      }),
      null,
    );
    for (const sm of sh.submodels) putSubmodel(sm, id);
  }
  for (const sm of standalone) putSubmodel(sm, null);

  return doc;
}

/** 문서 하나에 대해 적용 가능한 명령을 뽑는다. */
export function cmdArbitrary(doc: AasDoc): fc.Arbitrary<Cmd> {
  const ids = Object.keys(doc.nodes);
  if (ids.length === 0) return fc.constant({ t: 'batch', label: 'noop', cmds: [] } as Cmd);

  const setCmd = fc
    .record({ node: fc.constantFrom(...ids), value: fc.constantFrom('A_1', 'B_2', 'C_3') })
    .map(({ node, value }) => ({ t: 'set', node, path: 'idShort', value }) as Cmd);

  const removeCmd = fc.constantFrom(...ids).map((node) => ({ t: 'remove', node }) as Cmd);

  const insertCmd = fc
    .record({ parent: fc.constantFrom(...ids), idShort: IDSHORT })
    .map(({ parent, idShort }) => {
      const p = doc.nodes[parent]!;
      const accepts = acceptsOf(p.t);
      const t = accepts.includes('prop') ? 'prop' : (accepts[0] ?? 'prop');
      return {
        t: 'insert',
        parent,
        index: childrenOf(doc, parent).length,
        node: newNode(`gen_${Math.random().toString(36).slice(2, 9)}`, t, {
          idShort: `G_${idShort}`,
          valueType: 'xs:string',
          value: 'v',
        }),
      } as Cmd;
    });

  const moveCmd = fc
    .record({ node: fc.constantFrom(...ids), parent: fc.constantFrom(...ids) })
    .map(({ node, parent }) => ({ t: 'move', node, parent, index: 0 }) as Cmd);

  return fc.oneof(setCmd, removeCmd, insertCmd, moveCmd);
}
