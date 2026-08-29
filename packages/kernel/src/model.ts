/**
 * 문서 모델 — 이 파일이 커널의 어휘를 정의한다.
 *
 * 프로토타입과의 차이 (docs/prototype-delta.md 3장):
 *  - `edges` 배열이 사라지고 `order` 맵이 들어온다. 자식 순서는 배열 순서가 유일한 근거다.
 *  - 좌표(x/y)는 이 문서에 없다. `Layout`으로 분리되어 해시·diff·실행취소 대상이 아니다.
 *
 * P2에서 노드 9종 → 15종, 부속 필드(qualifiers·extensions·administration·specificAssetIds)를
 * `raw` 보존에서 편집 가능한 1급 필드로 올렸다.
 */

export type NodeId = string;

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** 캔버스에 노드로 뜨는 것들. 부속 정보(qualifiers 등)는 노드가 아니라 필드다. */
export type AasNodeType =
  | 'shell'
  | 'submodel'
  | 'smc'
  | 'sml'
  | 'prop'
  | 'mlp'
  | 'range'
  | 'file'
  | 'blob'
  | 'ref'
  | 'entity'
  | 'rel'
  | 'annrel'
  | 'op'
  | 'cap';

export interface LangText {
  language: string;
  text: string;
}

export interface Reference {
  type: 'ExternalReference' | 'ModelReference';
  keys: Array<{ type: string; value: string }>;
  /** ModelReference가 가리키는 대상의 타입 정보 등, 우리가 아직 안 쓰는 필드 */
  raw?: Record<string, Json>;
}

/** IEC 63278 Qualifier — 카디널리티·단위·유효기간을 규격 안에서 표현하는 자리 */
export interface Qualifier {
  kind?: 'ValueQualifier' | 'ConceptQualifier' | 'TemplateQualifier';
  type: string;
  valueType: string;
  value?: string;
  valueId?: Reference;
  semanticId?: string;
  supplementalSemanticIds?: string[];
  raw?: Record<string, Json>;
}

/** 사내 확장 정보를 규격 위반 없이 담는 유일한 자리 */
export interface Extension {
  name: string;
  valueType?: string;
  value?: string;
  refersTo?: Reference[];
  semanticId?: string;
  supplementalSemanticIds?: string[];
  raw?: Record<string, Json>;
}

/** Identifiable의 관리 정보 */
export interface Administration {
  version?: string;
  revision?: string;
  creator?: Reference;
  templateId?: string;
  raw?: Record<string, Json>;
}

/** 사내 설비번호 ↔ 자산 매핑. MES 연동의 접점. */
export interface SpecificAssetId {
  name: string;
  value: string;
  externalSubjectId?: Reference;
  semanticId?: string;
  supplementalSemanticIds?: string[];
  raw?: Record<string, Json>;
}

export interface ResourceRef {
  path: string;
  contentType?: string;
}

/** Operation의 자식이 어느 변수 목록에 속하는가 */
export type OpSlot = 'in' | 'out' | 'inout';

/** 모든 노드가 공유하는 부분. `raw`는 파싱에서 해석하지 못한 필드를 그대로 보존한다. */
interface NodeBase {
  id: NodeId;
  idShort: string;
  category?: string;
  displayName?: LangText[];
  description?: LangText[];
  semanticId?: string;
  supplementalSemanticIds?: string[];
  qualifiers?: Qualifier[];
  extensions?: Extension[];
  /**
   * 부모가 Operation일 때만 의미가 있다. 어느 변수 목록(input/output/inoutput)에 속하는가.
   * 부모가 Operation이 아니면 `apply()`가 지운다.
   */
  opSlot?: OpSlot;
  /** 삽입 출처. 템플릿 적합성 검사(L3)가 이 값을 본다. */
  origin?: { templateId: string; version: string };
  /**
   * 이 도구가 아직 모르는 필드. 파싱에서 채우고 직렬화에서 그대로 되돌린다.
   * 남의 AASX를 손상시키지 않기 위한 장치다. 절대 임의로 지우지 않는다.
   */
  raw?: Record<string, Json>;
}

interface IdentifiableBase extends NodeBase {
  identifier: string;
  administration?: Administration;
}

export interface ShellNode extends IdentifiableBase {
  t: 'shell';
  assetKind: 'Instance' | 'Type' | 'NotApplicable';
  globalAssetId?: string;
  assetType?: string;
  specificAssetIds?: SpecificAssetId[];
  defaultThumbnail?: ResourceRef;
  /** Type Shell로부터 파생 — 설비 다수 일괄 생성의 기반 */
  derivedFrom?: Reference;
}

export interface SubmodelNode extends IdentifiableBase {
  t: 'submodel';
  kind: 'Instance' | 'Template';
}

export interface CollectionNode extends NodeBase {
  t: 'smc';
}

export interface ListNode extends NodeBase {
  t: 'sml';
  typeValueListElement: string;
  orderRelevant: boolean;
  semanticIdListElement?: string;
  /** AASd-109: typeValueListElement가 Property·Range면 반드시 설정한다. */
  valueTypeListElement?: string;
}

export interface PropertyNode extends NodeBase {
  t: 'prop';
  valueType: string;
  value: string;
  valueId?: Reference;
}

export interface MultiLangNode extends NodeBase {
  t: 'mlp';
  value: LangText[];
  valueId?: Reference;
}

export interface RangeNode extends NodeBase {
  t: 'range';
  valueType: string;
  min: string;
  max: string;
}

export interface FileNode extends NodeBase {
  t: 'file';
  contentType: string;
  value: string;
}

/** File은 참조, Blob은 포함 */
export interface BlobNode extends NodeBase {
  t: 'blob';
  contentType: string;
  /** base64. 커널은 내용을 해석하지 않고 문자열로만 다룬다. */
  value?: string;
}

export interface RefNode extends NodeBase {
  t: 'ref';
  value?: Reference;
}

/** 설비 구성(BoM). Hierarchical Structures 02011의 전제. */
export interface EntityNode extends NodeBase {
  t: 'entity';
  entityType: 'CoManagedEntity' | 'SelfManagedEntity';
  globalAssetId?: string;
  specificAssetIds?: SpecificAssetId[];
}

export interface RelationshipNode extends NodeBase {
  t: 'rel';
  first?: Reference;
  second?: Reference;
}

/** 관계에 속성을 붙임 (연결 지점, 수량). 자식은 annotations. */
export interface AnnotatedRelationshipNode extends NodeBase {
  t: 'annrel';
  first?: Reference;
  second?: Reference;
}

/** 원격 호출. 자식이 opSlot으로 input/output/inoutput에 나뉜다. */
export interface OperationNode extends NodeBase {
  t: 'op';
}

/** 자산이 제공하는 능력 선언 */
export interface CapabilityNode extends NodeBase {
  t: 'cap';
}

export type AasNode =
  | ShellNode
  | SubmodelNode
  | CollectionNode
  | ListNode
  | PropertyNode
  | MultiLangNode
  | RangeNode
  | FileNode
  | BlobNode
  | RefNode
  | EntityNode
  | RelationshipNode
  | AnnotatedRelationshipNode
  | OperationNode
  | CapabilityNode;

/** 의미 문서 — 버전·비교·해시의 유일한 대상. */
export interface AasDoc {
  schema: 1;
  nodes: Record<NodeId, AasNode>;
  /** 부모 → 자식 배열. 배열 순서가 곧 모델 순서다. */
  order: Record<NodeId, NodeId[]>;
  parent: Record<NodeId, NodeId | null>;
  roots: NodeId[];
  /** Environment 최상위에서 해석하지 못한 필드 보존 */
  raw?: Record<string, Json>;
}

/** 화면 문서 — 별도 저장. 실행취소·diff·해시에서 제외. */
export interface Layout {
  pos: Record<NodeId, { x: number; y: number }>;
  collapsed: Record<NodeId, boolean>;
  /**
   * List 직속 자식의 화면 표시 이름.
   * AASd-120 때문에 이 노드들은 문서에 idShort를 가질 수 없으므로,
   * 캔버스·트리에서 구분하기 위한 이름은 화면 문서에 둔다.
   */
  label: Record<NodeId, string>;
}

/* ── 메타모델 사실들 ─────────────────────────────────────── */

export const MODEL_TYPE: Record<AasNodeType, string> = {
  shell: 'AssetAdministrationShell',
  submodel: 'Submodel',
  smc: 'SubmodelElementCollection',
  sml: 'SubmodelElementList',
  prop: 'Property',
  mlp: 'MultiLanguageProperty',
  range: 'Range',
  file: 'File',
  blob: 'Blob',
  ref: 'ReferenceElement',
  entity: 'Entity',
  rel: 'RelationshipElement',
  annrel: 'AnnotatedRelationshipElement',
  op: 'Operation',
  cap: 'Capability',
};

export const NODE_TYPE_OF_MODEL_TYPE: Record<string, AasNodeType> = Object.fromEntries(
  Object.entries(MODEL_TYPE).map(([k, v]) => [v, k as AasNodeType]),
) as Record<string, AasNodeType>;

/** SubmodelElement에 해당하는 노드들 */
export const ELEMENT_TYPES: readonly AasNodeType[] = [
  'smc',
  'sml',
  'prop',
  'mlp',
  'range',
  'file',
  'blob',
  'ref',
  'entity',
  'rel',
  'annrel',
  'op',
  'cap',
];

/** DataElement — AnnotatedRelationshipElement의 annotations가 될 수 있는 것들 */
export const DATA_ELEMENT_TYPES: readonly AasNodeType[] = [
  'prop',
  'mlp',
  'range',
  'file',
  'blob',
  'ref',
];

/** 포함 규칙. L0 — 애초에 만들 수 없게 하는 계층. */
const ACCEPTS: Record<AasNodeType, readonly AasNodeType[]> = {
  shell: ['submodel'],
  submodel: ELEMENT_TYPES,
  smc: ELEMENT_TYPES,
  sml: ELEMENT_TYPES,
  /** statements */
  entity: ELEMENT_TYPES,
  /** input / output / inoutput 변수 */
  op: ELEMENT_TYPES,
  /** annotations — DataElement만 */
  annrel: DATA_ELEMENT_TYPES,
  prop: [],
  mlp: [],
  range: [],
  file: [],
  blob: [],
  ref: [],
  rel: [],
  cap: [],
};

export function canContain(parent: AasNodeType, child: AasNodeType): boolean {
  return ACCEPTS[parent].includes(child);
}

export function acceptsOf(parent: AasNodeType): readonly AasNodeType[] {
  return ACCEPTS[parent];
}

/** 전역 식별자(id)를 갖는 노드 — Identifiable */
export function isIdentifiable(t: AasNodeType): t is 'shell' | 'submodel' {
  return t === 'shell' || t === 'submodel';
}

export const ID_SHORT_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,127}$/;

/* ── 문서 조작 헬퍼 ──────────────────────────────────────── */

export function emptyDoc(): AasDoc {
  return { schema: 1, nodes: {}, order: {}, parent: {}, roots: [] };
}

export function emptyLayout(): Layout {
  return { pos: {}, collapsed: {}, label: {} };
}

/** AASd-109 대상 — 값 타입 목록을 반드시 선언해야 하는 List인가 */
export function listNeedsValueType(typeValueListElement: string): boolean {
  return typeValueListElement === 'Property' || typeValueListElement === 'Range';
}

export function childrenOf(doc: AasDoc, id: NodeId): NodeId[] {
  return doc.order[id] ?? [];
}

export function parentOf(doc: AasDoc, id: NodeId): NodeId | null {
  return doc.parent[id] ?? null;
}

export function nodeOf(doc: AasDoc, id: NodeId): AasNode {
  const n = doc.nodes[id];
  if (!n) throw new Error(`unknown node: ${id}`);
  return n;
}

/** 조상 체인 (자신 제외, 가까운 순) */
export function ancestorsOf(doc: AasDoc, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  let p = parentOf(doc, id);
  while (p) {
    out.push(p);
    p = parentOf(doc, p);
  }
  return out;
}

/** 자신 포함 서브트리, 전위 순회 */
export function subtreeOf(doc: AasDoc, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const walk = (n: NodeId) => {
    out.push(n);
    for (const c of childrenOf(doc, n)) walk(c);
  };
  walk(id);
  return out;
}

/** 루트부터의 idShort 경로. Issue.path와 퀵픽스가 이 표기를 쓴다. */
export function pathOf(doc: AasDoc, id: NodeId): string {
  const chain = [id, ...ancestorsOf(doc, id)].reverse();
  return chain.map((n) => doc.nodes[n]?.idShort ?? '?').join('/');
}
