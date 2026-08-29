/**
 * 파싱 — AAS Environment JSON → AasDoc
 *
 * 규칙: 해석하지 못한 필드는 버리지 않고 `node.raw`(문서 최상위는 `doc.raw`)에 보존한다.
 * 남의 AASX를 열어 저장했을 때 정보가 사라지지 않는 것이 이 파일의 존재 이유다.
 */

import {
  type AasDoc,
  type AasNode,
  type Administration,
  type Extension,
  type Json,
  type LangText,
  type NodeId,
  type OpSlot,
  type Qualifier,
  type Reference,
  type SpecificAssetId,
  NODE_TYPE_OF_MODEL_TYPE,
  emptyDoc,
} from './model.js';

export interface ParseWarning {
  code: 'UNKNOWN_MODEL_TYPE' | 'DANGLING_SUBMODEL_REF' | 'MISSING_ID' | 'NOT_AN_ENVIRONMENT';
  detail: string;
}

export interface ParseResult {
  doc: AasDoc;
  warnings: ParseWarning[];
}

interface IdGen {
  (): NodeId;
}
function counterIds(prefix = 'n'): IdGen {
  let i = 0;
  return () => `${prefix}${++i}`;
}

const isObj = (v: unknown): v is Record<string, Json> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: Json | undefined, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

function firstKeyValue(v: Json | undefined): string | undefined {
  if (!isObj(v)) return undefined;
  const keys = v['keys'];
  if (!Array.isArray(keys) || keys.length === 0) return undefined;
  const k0 = keys[0];
  if (!isObj(k0)) return undefined;
  const val = k0['value'];
  return typeof val === 'string' ? val : undefined;
}

function refOf(v: Json | undefined): Reference | undefined {
  if (!isObj(v)) return undefined;
  const keys = v['keys'];
  if (!Array.isArray(keys)) return undefined;
  const parsed = keys.filter(isObj).map((k) => ({
    type: typeof k['type'] === 'string' ? k['type'] : 'GlobalReference',
    value: typeof k['value'] === 'string' ? k['value'] : '',
  }));
  const rest = leftover(v, ['type', 'keys']);
  return {
    type: v['type'] === 'ModelReference' ? 'ModelReference' : 'ExternalReference',
    keys: parsed,
    ...(rest ? { raw: rest } : {}),
  };
}

function langsOf(v: Json | undefined): LangText[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).map((l) => ({
    language: str(l['language']),
    text: str(l['text']),
  }));
}

/** 우리가 소비한 키를 뺀 나머지를 raw로 남긴다. */
function leftover(src: Record<string, Json>, consumed: string[]): Record<string, Json> | undefined {
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(src)) {
    if (!consumed.includes(k)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function semanticOf(src: Record<string, Json>): {
  semanticId?: string;
  supplementalSemanticIds?: string[];
} {
  const out: { semanticId?: string; supplementalSemanticIds?: string[] } = {};
  const sem = firstKeyValue(src['semanticId']);
  if (sem) out.semanticId = sem;
  const sup = src['supplementalSemanticIds'];
  if (Array.isArray(sup)) {
    const list = sup.map((r) => firstKeyValue(r)).filter((s): s is string => !!s);
    if (list.length) out.supplementalSemanticIds = list;
  }
  return out;
}

const SEM_KEYS = ['semanticId', 'supplementalSemanticIds'];

function qualifiersOf(v: Json | undefined): Qualifier[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter(isObj).map((q) => {
    const rest = leftover(q, [...SEM_KEYS, 'kind', 'type', 'valueType', 'value', 'valueId']);
    const kind = q['kind'];
    return {
      ...(kind === 'ValueQualifier' || kind === 'ConceptQualifier' || kind === 'TemplateQualifier'
        ? { kind }
        : {}),
      type: str(q['type']),
      valueType: str(q['valueType'], 'xs:string'),
      ...(q['value'] !== undefined ? { value: str(q['value']) } : {}),
      ...(refOf(q['valueId']) ? { valueId: refOf(q['valueId'])! } : {}),
      ...semanticOf(q),
      ...(rest ? { raw: rest } : {}),
    } satisfies Qualifier;
  });
  return out.length ? out : undefined;
}

function extensionsOf(v: Json | undefined): Extension[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter(isObj).map((e) => {
    const rest = leftover(e, [...SEM_KEYS, 'name', 'valueType', 'value', 'refersTo']);
    const refersTo = Array.isArray(e['refersTo'])
      ? e['refersTo'].map(refOf).filter((r): r is Reference => !!r)
      : undefined;
    return {
      name: str(e['name']),
      ...(e['valueType'] !== undefined ? { valueType: str(e['valueType']) } : {}),
      ...(e['value'] !== undefined ? { value: str(e['value']) } : {}),
      ...(refersTo?.length ? { refersTo } : {}),
      ...semanticOf(e),
      ...(rest ? { raw: rest } : {}),
    } satisfies Extension;
  });
  return out.length ? out : undefined;
}

function administrationOf(v: Json | undefined): Administration | undefined {
  if (!isObj(v)) return undefined;
  const rest = leftover(v, ['version', 'revision', 'creator', 'templateId']);
  const a: Administration = {
    ...(v['version'] !== undefined ? { version: str(v['version']) } : {}),
    ...(v['revision'] !== undefined ? { revision: str(v['revision']) } : {}),
    ...(refOf(v['creator']) ? { creator: refOf(v['creator'])! } : {}),
    ...(v['templateId'] !== undefined ? { templateId: str(v['templateId']) } : {}),
    ...(rest ? { raw: rest } : {}),
  };
  return Object.keys(a).length ? a : undefined;
}

function specificAssetIdsOf(v: Json | undefined): SpecificAssetId[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter(isObj).map((s) => {
    const rest = leftover(s, [...SEM_KEYS, 'name', 'value', 'externalSubjectId']);
    return {
      name: str(s['name']),
      value: str(s['value']),
      ...(refOf(s['externalSubjectId']) ? { externalSubjectId: refOf(s['externalSubjectId'])! } : {}),
      ...semanticOf(s),
      ...(rest ? { raw: rest } : {}),
    } satisfies SpecificAssetId;
  });
  return out.length ? out : undefined;
}

const COMMON_KEYS = [
  'modelType',
  'idShort',
  'category',
  'displayName',
  'description',
  'semanticId',
  'supplementalSemanticIds',
  'qualifiers',
  'extensions',
];

function commonFields(src: Record<string, Json>): Record<string, unknown> {
  const out: Record<string, unknown> = { idShort: str(src['idShort']) };
  if (typeof src['category'] === 'string') out['category'] = src['category'];
  const dn = langsOf(src['displayName']);
  if (dn.length) out['displayName'] = dn;
  const de = langsOf(src['description']);
  if (de.length) out['description'] = de;
  Object.assign(out, semanticOf(src));
  const q = qualifiersOf(src['qualifiers']);
  if (q) out['qualifiers'] = q;
  const e = extensionsOf(src['extensions']);
  if (e) out['extensions'] = e;
  return out;
}

export function parse(env: unknown, opts?: { newId?: IdGen }): ParseResult {
  const warnings: ParseWarning[] = [];
  const newId = opts?.newId ?? counterIds();
  const doc = emptyDoc();

  if (!isObj(env)) {
    warnings.push({ code: 'NOT_AN_ENVIRONMENT', detail: 'object가 아닙니다.' });
    return { doc, warnings };
  }

  const add = (node: AasNode, parent: NodeId | null): void => {
    doc.nodes[node.id] = node;
    doc.order[node.id] = [];
    doc.parent[node.id] = parent;
    if (parent === null) doc.roots.push(node.id);
    else doc.order[parent] = [...(doc.order[parent] ?? []), node.id];
  };

  const walkElement = (src: Json, parent: NodeId, opSlot?: OpSlot): void => {
    if (!isObj(src)) return;
    const mt = str(src['modelType']);
    const t = NODE_TYPE_OF_MODEL_TYPE[mt];
    if (!t || t === 'shell' || t === 'submodel') {
      warnings.push({ code: 'UNKNOWN_MODEL_TYPE', detail: mt || '(없음)' });
      return;
    }
    const id = newId();
    const base = { id, t, ...commonFields(src) } as Record<string, unknown>;
    if (opSlot) base['opSlot'] = opSlot;
    let consumed = [...COMMON_KEYS];

    switch (t) {
      case 'prop':
        base['valueType'] = str(src['valueType'], 'xs:string');
        base['value'] = src['value'] == null ? '' : String(src['value']);
        if (refOf(src['valueId'])) base['valueId'] = refOf(src['valueId']);
        consumed = consumed.concat(['valueType', 'value', 'valueId']);
        break;
      case 'range':
        base['valueType'] = str(src['valueType'], 'xs:double');
        base['min'] = src['min'] == null ? '' : String(src['min']);
        base['max'] = src['max'] == null ? '' : String(src['max']);
        consumed = consumed.concat(['valueType', 'min', 'max']);
        break;
      case 'mlp':
        base['value'] = langsOf(src['value']);
        if (refOf(src['valueId'])) base['valueId'] = refOf(src['valueId']);
        consumed = consumed.concat(['value', 'valueId']);
        break;
      case 'file':
        base['contentType'] = str(src['contentType']);
        base['value'] = str(src['value']);
        consumed = consumed.concat(['contentType', 'value']);
        break;
      case 'blob':
        base['contentType'] = str(src['contentType']);
        if (src['value'] !== undefined) base['value'] = str(src['value']);
        consumed = consumed.concat(['contentType', 'value']);
        break;
      case 'ref': {
        const r = refOf(src['value']);
        if (r) base['value'] = r;
        consumed = consumed.concat(['value']);
        break;
      }
      case 'smc':
        consumed = consumed.concat(['value']);
        break;
      case 'sml':
        base['typeValueListElement'] = str(src['typeValueListElement'], 'Property');
        base['orderRelevant'] = src['orderRelevant'] !== false;
        {
          const sle = firstKeyValue(src['semanticIdListElement']);
          if (sle) base['semanticIdListElement'] = sle;
          const vt = str(src['valueTypeListElement']);
          if (vt) base['valueTypeListElement'] = vt;
        }
        consumed = consumed.concat([
          'typeValueListElement',
          'orderRelevant',
          'semanticIdListElement',
          'valueTypeListElement',
          'value',
        ]);
        break;
      case 'entity':
        base['entityType'] =
          src['entityType'] === 'SelfManagedEntity' ? 'SelfManagedEntity' : 'CoManagedEntity';
        if (str(src['globalAssetId'])) base['globalAssetId'] = str(src['globalAssetId']);
        {
          const sa = specificAssetIdsOf(src['specificAssetIds']);
          if (sa) base['specificAssetIds'] = sa;
        }
        consumed = consumed.concat([
          'entityType',
          'globalAssetId',
          'specificAssetIds',
          'statements',
        ]);
        break;
      case 'rel':
      case 'annrel': {
        const f = refOf(src['first']);
        const s = refOf(src['second']);
        if (f) base['first'] = f;
        if (s) base['second'] = s;
        consumed = consumed.concat(['first', 'second', 'annotations']);
        break;
      }
      case 'op':
        consumed = consumed.concat(['inputVariables', 'outputVariables', 'inoutputVariables']);
        break;
      case 'cap':
        break;
      default:
        break;
    }

    const rest = leftover(src, consumed);
    if (rest) base['raw'] = rest;
    add(base as unknown as AasNode, parent);

    /* 자식 */
    if ((t === 'smc' || t === 'sml') && Array.isArray(src['value'])) {
      for (const c of src['value']) walkElement(c, id);
    }
    if (t === 'entity' && Array.isArray(src['statements'])) {
      for (const c of src['statements']) walkElement(c, id);
    }
    if (t === 'annrel' && Array.isArray(src['annotations'])) {
      for (const c of src['annotations']) walkElement(c, id);
    }
    if (t === 'op') {
      const slots: Array<[string, OpSlot]> = [
        ['inputVariables', 'in'],
        ['outputVariables', 'out'],
        ['inoutputVariables', 'inout'],
      ];
      for (const [key, slot] of slots) {
        const arr = src[key];
        if (!Array.isArray(arr)) continue;
        for (const v of arr) {
          if (isObj(v) && v['value'] !== undefined) walkElement(v['value'], id, slot);
        }
      }
    }
  };

  /* 서브모델을 먼저 만든다 — Shell의 참조를 붙이기 위해 identifier → nodeId 색인이 필요하다. */
  const smByIdentifier: Record<string, NodeId> = {};
  const submodelSrc = Array.isArray(env['submodels']) ? env['submodels'] : [];
  const pendingSubmodels: Array<{ id: NodeId; src: Record<string, Json> }> = [];

  for (const s of submodelSrc) {
    if (!isObj(s)) continue;
    const id = newId();
    const identifier = str(s['id']);
    if (!identifier) warnings.push({ code: 'MISSING_ID', detail: `Submodel ${str(s['idShort'])}` });
    const base: Record<string, unknown> = {
      id,
      t: 'submodel',
      ...commonFields(s),
      identifier,
      kind: s['kind'] === 'Template' ? 'Template' : 'Instance',
    };
    const adm = administrationOf(s['administration']);
    if (adm) base['administration'] = adm;
    const rest = leftover(s, [
      ...COMMON_KEYS,
      'id',
      'kind',
      'administration',
      'submodelElements',
    ]);
    if (rest) base['raw'] = rest;
    doc.nodes[id] = base as unknown as AasNode;
    doc.order[id] = [];
    doc.parent[id] = null;
    if (identifier) smByIdentifier[identifier] = id;
    pendingSubmodels.push({ id, src: s });
  }

  /* Shell을 만들고 서브모델을 자식으로 붙인다. */
  const shellSrc = Array.isArray(env['assetAdministrationShells'])
    ? env['assetAdministrationShells']
    : [];
  const attached = new Set<NodeId>();

  for (const s of shellSrc) {
    if (!isObj(s)) continue;
    const id = newId();
    const ai = isObj(s['assetInformation']) ? s['assetInformation'] : {};
    const identifier = str(s['id']);
    if (!identifier) warnings.push({ code: 'MISSING_ID', detail: `Shell ${str(s['idShort'])}` });
    const base: Record<string, unknown> = {
      id,
      t: 'shell',
      ...commonFields(s),
      identifier,
      assetKind:
        ai['assetKind'] === 'Type'
          ? 'Type'
          : ai['assetKind'] === 'NotApplicable'
            ? 'NotApplicable'
            : 'Instance',
    };
    if (str(ai['globalAssetId'])) base['globalAssetId'] = str(ai['globalAssetId']);
    if (str(ai['assetType'])) base['assetType'] = str(ai['assetType']);
    const sa = specificAssetIdsOf(ai['specificAssetIds']);
    if (sa) base['specificAssetIds'] = sa;
    const th = ai['defaultThumbnail'];
    if (isObj(th) && str(th['path'])) {
      base['defaultThumbnail'] = {
        path: str(th['path']),
        ...(str(th['contentType']) ? { contentType: str(th['contentType']) } : {}),
      };
    }
    const adm = administrationOf(s['administration']);
    if (adm) base['administration'] = adm;
    const df = refOf(s['derivedFrom']);
    if (df) base['derivedFrom'] = df;

    /* assetInformation 안에서 우리가 안 읽은 필드도 보존한다. */
    const aiRest = leftover(ai, [
      'assetKind',
      'globalAssetId',
      'assetType',
      'specificAssetIds',
      'defaultThumbnail',
    ]);
    const rest = leftover(s, [
      ...COMMON_KEYS,
      'id',
      'administration',
      'derivedFrom',
      'assetInformation',
      'submodels',
    ]);
    const merged: Record<string, Json> = { ...(rest ?? {}) };
    if (aiRest) merged['assetInformation'] = aiRest;
    if (Object.keys(merged).length) base['raw'] = merged;

    add(base as unknown as AasNode, null);

    const refs = Array.isArray(s['submodels']) ? s['submodels'] : [];
    for (const r of refs) {
      const target = firstKeyValue(r);
      const smId = target ? smByIdentifier[target] : undefined;
      if (!smId) {
        warnings.push({ code: 'DANGLING_SUBMODEL_REF', detail: target ?? '(빈 참조)' });
        continue;
      }
      if (attached.has(smId)) continue;
      attached.add(smId);
      doc.parent[smId] = id;
      doc.order[id] = [...(doc.order[id] ?? []), smId];
    }
  }

  /* Shell에 붙지 않은 서브모델은 루트로 남는다 — 독립 서브모델. */
  for (const { id } of pendingSubmodels) {
    if (!attached.has(id)) doc.roots.push(id);
  }

  /* 서브모델 요소는 부모 관계가 확정된 뒤에 채운다. */
  for (const { id, src } of pendingSubmodels) {
    const elements = Array.isArray(src['submodelElements']) ? src['submodelElements'] : [];
    for (const e of elements) walkElement(e, id);
  }

  const envRest = leftover(env, ['assetAdministrationShells', 'submodels']);
  if (envRest) doc.raw = envRest;

  return { doc, warnings };
}
