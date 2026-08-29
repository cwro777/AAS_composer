/**
 * 노드 생성 헬퍼 — 명령을 만들 때 쓰는 팩토리.
 *
 * 문서를 직접 만들지 말 것. 여기서 노드를 만들고 `apply({t:'insert', ...})`로 넣는다.
 */

import type {
  AasNode,
  AasNodeType,
  Administration,
  Extension,
  LangText,
  NodeId,
  OpSlot,
  Qualifier,
  Reference,
  SpecificAssetId,
} from './model.js';

export interface IdFactory {
  (): NodeId;
}

/** 테스트·일괄생성에서 결정적인 id가 필요할 때 쓴다. */
export function sequentialIds(prefix = 'n'): IdFactory {
  let i = 0;
  return () => `${prefix}${++i}`;
}

type Defaults = {
  idShort: string;
  semanticId?: string;
  supplementalSemanticIds?: string[];
  description?: LangText[];
};

export interface NewNodeInit extends Partial<Defaults> {
  identifier?: string;
  assetKind?: 'Instance' | 'Type' | 'NotApplicable';
  globalAssetId?: string;
  kind?: 'Instance' | 'Template';
  valueType?: string;
  value?: string;
  langs?: LangText[];
  min?: string;
  max?: string;
  contentType?: string;
  typeValueListElement?: string;
  orderRelevant?: boolean;
  semanticIdListElement?: string;
  valueTypeListElement?: string;
  qualifiers?: Qualifier[];
  extensions?: Extension[];
  administration?: Administration;
  specificAssetIds?: SpecificAssetId[];
  derivedFrom?: Reference;
  assetType?: string;
  first?: Reference;
  second?: Reference;
  entityType?: 'CoManagedEntity' | 'SelfManagedEntity';
  opSlot?: OpSlot;
  origin?: { templateId: string; version: string };
}

export function newNode(id: NodeId, t: AasNodeType, init: NewNodeInit = {}): AasNode {
  const base: Record<string, unknown> = {
    id,
    t,
    idShort: init.idShort ?? '',
  };
  if (init.semanticId) base['semanticId'] = init.semanticId;
  if (init.supplementalSemanticIds?.length) {
    base['supplementalSemanticIds'] = [...init.supplementalSemanticIds];
  }
  if (init.description?.length) base['description'] = init.description;
  if (init.qualifiers?.length) base['qualifiers'] = init.qualifiers;
  if (init.extensions?.length) base['extensions'] = init.extensions;
  if (init.opSlot) base['opSlot'] = init.opSlot;
  if (init.origin) base['origin'] = init.origin;

  switch (t) {
    case 'shell':
      base['identifier'] = init.identifier ?? '';
      base['assetKind'] = init.assetKind ?? 'Instance';
      if (init.globalAssetId) base['globalAssetId'] = init.globalAssetId;
      if (init.assetType) base['assetType'] = init.assetType;
      if (init.specificAssetIds?.length) base['specificAssetIds'] = init.specificAssetIds;
      if (init.derivedFrom) base['derivedFrom'] = init.derivedFrom;
      if (init.administration) base['administration'] = init.administration;
      break;
    case 'submodel':
      base['identifier'] = init.identifier ?? '';
      base['kind'] = init.kind ?? 'Instance';
      if (init.administration) base['administration'] = init.administration;
      break;
    case 'prop':
      base['valueType'] = init.valueType ?? 'xs:string';
      base['value'] = init.value ?? '';
      break;
    case 'range':
      base['valueType'] = init.valueType ?? 'xs:double';
      base['min'] = init.min ?? '';
      base['max'] = init.max ?? '';
      break;
    case 'mlp':
      base['value'] = init.langs ?? [];
      break;
    case 'file':
      base['contentType'] = init.contentType ?? 'application/octet-stream';
      base['value'] = init.value ?? '';
      break;
    case 'blob':
      base['contentType'] = init.contentType ?? 'application/octet-stream';
      if (init.value !== undefined) base['value'] = init.value;
      break;
    case 'entity':
      base['entityType'] = init.entityType ?? 'CoManagedEntity';
      if (init.globalAssetId) base['globalAssetId'] = init.globalAssetId;
      if (init.specificAssetIds?.length) base['specificAssetIds'] = init.specificAssetIds;
      break;
    case 'rel':
    case 'annrel':
      if (init.first) base['first'] = init.first;
      if (init.second) base['second'] = init.second;
      break;
    case 'sml':
      base['typeValueListElement'] = init.typeValueListElement ?? 'Property';
      base['orderRelevant'] = init.orderRelevant ?? true;
      if (init.semanticIdListElement) base['semanticIdListElement'] = init.semanticIdListElement;
      if (init.valueTypeListElement) base['valueTypeListElement'] = init.valueTypeListElement;
      break;
    default:
      break;
  }
  return base as unknown as AasNode;
}
