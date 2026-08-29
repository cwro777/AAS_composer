/**
 * 직렬화 — AasDoc → AAS Environment JSON (IEC 63278-1 V3.0)
 *
 * 불변식 (test/roundtrip.test.ts가 강제):
 *   parse(serialize(doc)).doc ≡ doc                             구조 동등
 *   canonicalize(serialize(parse(env).doc)) ≡ canonicalize(env)  의미 동등
 */

import {
  type AasDoc,
  type AasNode,
  type Administration,
  type Extension,
  type Json,
  type NodeId,
  type Qualifier,
  type Reference,
  type SpecificAssetId,
  MODEL_TYPE,
  childrenOf,
  nodeOf,
} from './model.js';

export type Environment = Record<string, Json>;

function extRef(v: string): Json {
  return { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: v }] };
}
function modelRef(kind: string, v: string): Json {
  return { type: 'ModelReference', keys: [{ type: kind, value: v }] };
}
function refToJson(r: Reference): Json {
  return {
    ...(r.raw ?? {}),
    type: r.type,
    keys: r.keys.map((k) => ({ type: k.type, value: k.value })),
  };
}

function semanticFields(
  o: Record<string, Json>,
  s: { semanticId?: string; supplementalSemanticIds?: string[] },
): void {
  if (s.semanticId) o['semanticId'] = extRef(s.semanticId);
  if (s.supplementalSemanticIds?.length) {
    o['supplementalSemanticIds'] = s.supplementalSemanticIds.map(extRef);
  }
}

function qualifierToJson(q: Qualifier): Json {
  const o: Record<string, Json> = { ...(q.raw ?? {}), type: q.type, valueType: q.valueType };
  if (q.kind) o['kind'] = q.kind;
  if (q.value !== undefined) o['value'] = q.value;
  if (q.valueId) o['valueId'] = refToJson(q.valueId);
  semanticFields(o, q);
  return o;
}

function extensionToJson(e: Extension): Json {
  const o: Record<string, Json> = { ...(e.raw ?? {}), name: e.name };
  if (e.valueType) o['valueType'] = e.valueType;
  if (e.value !== undefined) o['value'] = e.value;
  if (e.refersTo?.length) o['refersTo'] = e.refersTo.map(refToJson);
  semanticFields(o, e);
  return o;
}

function administrationToJson(a: Administration): Json {
  const o: Record<string, Json> = { ...(a.raw ?? {}) };
  if (a.version) o['version'] = a.version;
  if (a.revision) o['revision'] = a.revision;
  if (a.creator) o['creator'] = refToJson(a.creator);
  if (a.templateId) o['templateId'] = a.templateId;
  return o;
}

function specificAssetIdToJson(s: SpecificAssetId): Json {
  const o: Record<string, Json> = { ...(s.raw ?? {}), name: s.name, value: s.value };
  if (s.externalSubjectId) o['externalSubjectId'] = refToJson(s.externalSubjectId);
  semanticFields(o, s);
  return o;
}

/** 해석하지 못했던 필드를 먼저 깔고, 우리가 아는 필드로 덮는다. */
function withRaw(node: AasNode, known: Record<string, Json>): Record<string, Json> {
  return { ...(node.raw ?? {}), ...known };
}

function common(node: AasNode, omitIdShort: boolean): Record<string, Json> {
  const o: Record<string, Json> = { modelType: MODEL_TYPE[node.t] };
  if (!omitIdShort) o['idShort'] = node.idShort;
  if (node.category) o['category'] = node.category;
  if (node.displayName?.length) o['displayName'] = node.displayName as unknown as Json;
  if (node.description?.length) o['description'] = node.description as unknown as Json;
  semanticFields(o, node);
  if (node.qualifiers?.length) o['qualifiers'] = node.qualifiers.map(qualifierToJson);
  if (node.extensions?.length) o['extensions'] = node.extensions.map(extensionToJson);
  return o;
}

function serializeElement(doc: AasDoc, id: NodeId, parentIsList: boolean): Json {
  const n = nodeOf(doc, id);
  const o = common(n, parentIsList); // AASd-120: List 직속 자식은 idShort 없음
  const kids = childrenOf(doc, id);

  switch (n.t) {
    case 'prop':
      o['valueType'] = n.valueType;
      o['value'] = n.value;
      if (n.valueId) o['valueId'] = refToJson(n.valueId);
      break;
    case 'range':
      o['valueType'] = n.valueType;
      o['min'] = n.min;
      o['max'] = n.max;
      break;
    case 'mlp':
      o['value'] = n.value.filter((l) => l.text) as unknown as Json;
      if (n.valueId) o['valueId'] = refToJson(n.valueId);
      break;
    case 'file':
      o['contentType'] = n.contentType;
      o['value'] = n.value;
      break;
    case 'blob':
      o['contentType'] = n.contentType;
      if (n.value !== undefined) o['value'] = n.value;
      break;
    case 'ref':
      if (n.value) o['value'] = refToJson(n.value);
      break;
    case 'smc':
      o['value'] = kids.map((c) => serializeElement(doc, c, false));
      break;
    case 'sml':
      o['typeValueListElement'] = n.typeValueListElement;
      o['orderRelevant'] = n.orderRelevant;
      if (n.valueTypeListElement) o['valueTypeListElement'] = n.valueTypeListElement;
      if (n.semanticIdListElement) o['semanticIdListElement'] = extRef(n.semanticIdListElement);
      o['value'] = kids.map((c) => serializeElement(doc, c, true));
      break;
    case 'entity':
      o['entityType'] = n.entityType;
      if (n.globalAssetId) o['globalAssetId'] = n.globalAssetId;
      if (n.specificAssetIds?.length) {
        o['specificAssetIds'] = n.specificAssetIds.map(specificAssetIdToJson);
      }
      if (kids.length) o['statements'] = kids.map((c) => serializeElement(doc, c, false));
      break;
    case 'rel':
      if (n.first) o['first'] = refToJson(n.first);
      if (n.second) o['second'] = refToJson(n.second);
      break;
    case 'annrel':
      if (n.first) o['first'] = refToJson(n.first);
      if (n.second) o['second'] = refToJson(n.second);
      if (kids.length) o['annotations'] = kids.map((c) => serializeElement(doc, c, false));
      break;
    case 'op': {
      /* 자식은 opSlot으로 세 목록에 나뉜다. 각 목록 안의 순서는 order 배열이 정한다. */
      const wrap = (c: NodeId): Json => ({ value: serializeElement(doc, c, false) });
      const inV = kids.filter((c) => (doc.nodes[c]?.opSlot ?? 'in') === 'in');
      const outV = kids.filter((c) => doc.nodes[c]?.opSlot === 'out');
      const ioV = kids.filter((c) => doc.nodes[c]?.opSlot === 'inout');
      if (inV.length) o['inputVariables'] = inV.map(wrap);
      if (outV.length) o['outputVariables'] = outV.map(wrap);
      if (ioV.length) o['inoutputVariables'] = ioV.map(wrap);
      break;
    }
    case 'cap':
      break;
    default:
      break;
  }
  return withRaw(n, o);
}

export function serialize(doc: AasDoc): Environment {
  const shells: Json[] = [];
  const submodels: Json[] = [];

  const emitShell = (id: NodeId): void => {
    const n = nodeOf(doc, id);
    if (n.t !== 'shell') return;
    const o = common(n, false);
    o['id'] = n.identifier;
    if (n.administration) o['administration'] = administrationToJson(n.administration);
    if (n.derivedFrom) o['derivedFrom'] = refToJson(n.derivedFrom);

    /* assetInformation 안에서 우리가 읽지 않은 필드는 raw에 보존해 두었다. */
    const rawAi = n.raw?.['assetInformation'];
    const ai: Record<string, Json> = {
      ...(rawAi && typeof rawAi === 'object' && !Array.isArray(rawAi) ? rawAi : {}),
      assetKind: n.assetKind,
    };
    if (n.globalAssetId) ai['globalAssetId'] = n.globalAssetId;
    if (n.assetType) ai['assetType'] = n.assetType;
    if (n.specificAssetIds?.length) {
      ai['specificAssetIds'] = n.specificAssetIds.map(specificAssetIdToJson);
    }
    if (n.defaultThumbnail) {
      const th: Record<string, Json> = { path: n.defaultThumbnail.path };
      if (n.defaultThumbnail.contentType) th['contentType'] = n.defaultThumbnail.contentType;
      ai['defaultThumbnail'] = th;
    }
    o['assetInformation'] = ai;

    const subs = childrenOf(doc, id)
      .map((c) => nodeOf(doc, c))
      .filter((c): c is Extract<AasNode, { t: 'submodel' }> => c.t === 'submodel')
      .map((c) => modelRef('Submodel', c.identifier));
    if (subs.length) o['submodels'] = subs;
    shells.push(withRaw(n, o));
  };

  const emitSubmodel = (id: NodeId): void => {
    const n = nodeOf(doc, id);
    if (n.t !== 'submodel') return;
    const o = common(n, false);
    o['id'] = n.identifier;
    o['kind'] = n.kind;
    if (n.administration) o['administration'] = administrationToJson(n.administration);
    o['submodelElements'] = childrenOf(doc, id).map((c) => serializeElement(doc, c, false));
    submodels.push(withRaw(n, o));
  };

  /* 문서 순서를 그대로 따른다 — roots 순서가 출력 순서다. */
  for (const r of doc.roots) {
    const n = doc.nodes[r];
    if (!n) continue;
    if (n.t === 'shell') {
      emitShell(r);
      for (const c of childrenOf(doc, r)) emitSubmodel(c);
    } else if (n.t === 'submodel') {
      emitSubmodel(r);
    }
  }

  const env: Environment = { ...(doc.raw ?? {}) };
  env['assetAdministrationShells'] = shells;
  env['submodels'] = submodels;
  /* 빈 배열은 내보내지 않는다 — 규격이 "설정하지 않거나 최소 1개"를 요구한다.
     (프로토타입은 항상 빈 배열을 내보내 aas-core3.0 검증에 걸렸다.) */
  const cds = env['conceptDescriptions'];
  if (Array.isArray(cds) && cds.length === 0) delete env['conceptDescriptions'];
  return env;
}
