/**
 * 템플릿 레지스트리 — 정의(JSON)를 읽고, 문서에 삽입할 명령 배열로 만든다.
 *
 * 삽입 결과에는 `origin`(templateId·version)이 남는다. L3 적합성 검사가 이 값을 본다.
 */

import {
  type AasDoc,
  type Cmd,
  type NodeId,
  newNode,
  parentOf,
} from '@aas/kernel';

import type { ElementDef, TemplateDef, Verified } from './types.js';

import nameplate from './idta/nameplate.json' with { type: 'json' };
import technical from './idta/technical.json' with { type: 'json' };
import handover from './idta/handover.json' with { type: 'json' };
import timeseries from './idta/timeseries.json' with { type: 'json' };
import carbon from './idta/carbon.json' with { type: 'json' };
import operational from './idta/operational.json' with { type: 'json' };
import hierarchical from './idta/hierarchical.json' with { type: 'json' };

export type { ElementDef, TemplateDef, Verified } from './types.js';

const DEFS = [
  nameplate,
  technical,
  handover,
  timeseries,
  carbon,
  operational,
  hierarchical,
] as unknown as TemplateDef[];

const BY_ID = new Map<string, TemplateDef>(DEFS.map((d) => [d.id, d]));

export function listTemplates(): TemplateDef[] {
  return [...DEFS];
}

export function getTemplate(id: string): TemplateDef | undefined {
  return BY_ID.get(id);
}

/** 사양서에서 대조하지 못한 항목 — UI가 배지로 드러내고 배포 전 확인이 필요하다. */
export function unverifiedOf(def: TemplateDef): Array<{ path: string; source?: string }> {
  const out: Array<{ path: string; source?: string }> = [];
  if (def.submodel.verified === 'none') {
    out.push({ path: def.submodel.idShort, source: '(서브모델 semanticId)' });
  }
  const walk = (els: ElementDef[], prefix: string): void => {
    for (const e of els) {
      const path = `${prefix}/${e.idShort}`;
      if (e.verified === 'none') out.push({ path, ...(e.source ? { source: e.source } : {}) });
      if (e.children?.length) walk(e.children, path);
    }
  };
  walk(def.elements, def.submodel.idShort);
  return out;
}

export interface InstantiateOptions {
  /** 노드 id 생성기. 결정적인 id가 필요한 테스트에서 주입한다. */
  newId: () => NodeId;
  /** 서브모델 인스턴스의 전역 식별자. 없으면 idPattern으로 만든다. */
  namespace?: string;
  assetSlug?: string;
  /** 붙일 Shell. 없으면 루트에 독립 서브모델로 놓는다. */
  shell?: NodeId | null;
  /** 필수 요소만 넣는다. 기본은 전부. */
  requiredOnly?: boolean;
  /** exampleValue를 값으로 채운다. 기본 true — 빈 모델보다 채워진 모델이 검토하기 쉽다. */
  withExamples?: boolean;
}

function identifierFor(def: TemplateDef, o: InstantiateOptions): string {
  const ns = o.namespace ?? 'https://example.com/ids';
  const asset = o.assetSlug ?? 'asset';
  return def.submodel.idPattern.replace('{ns}', ns).replace('{asset}', asset);
}

/**
 * 템플릿 하나를 문서에 넣는 명령 배열을 만든다.
 * 반환값을 `apply(doc, {t:'batch', ...})`에 넣으면 삽입이 하나의 실행취소 단위가 된다.
 */
export function instantiate(def: TemplateDef, opts: InstantiateOptions): Cmd {
  const cmds: Cmd[] = [];
  const origin = { templateId: def.id, version: def.version };
  const withExamples = opts.withExamples !== false;

  const smId = opts.newId();
  cmds.push({
    t: 'insert',
    parent: opts.shell ?? null,
    index: Number.MAX_SAFE_INTEGER,
    node: newNode(smId, 'submodel', {
      idShort: def.submodel.idShort,
      identifier: identifierFor(def, opts),
      kind: 'Instance',
      semanticId: def.submodel.semanticId,
      ...(def.submodel.supplementalSemanticIds
        ? { supplementalSemanticIds: def.submodel.supplementalSemanticIds }
        : {}),
      origin,
    }),
  });

  const put = (e: ElementDef, parent: NodeId): void => {
    if (opts.requiredOnly && !e.required) return;
    /* 인스턴스 데이터 없이는 규격을 만족할 수 없는 요소는 정의만 남기고 넣지 않는다. */
    if (e.autoInsert === false) return;
    const id = opts.newId();
    cmds.push({
      t: 'insert',
      parent,
      index: Number.MAX_SAFE_INTEGER,
      node: newNode(id, e.t, {
        idShort: e.idShort,
        ...(e.semanticId ? { semanticId: e.semanticId } : {}),
        ...(e.supplementalSemanticIds ? { supplementalSemanticIds: e.supplementalSemanticIds } : {}),
        ...(e.valueType ? { valueType: e.valueType } : {}),
        ...(withExamples && e.exampleValue !== undefined ? { value: e.exampleValue } : {}),
        ...(withExamples && e.langs ? { langs: e.langs } : {}),
        ...(e.min !== undefined ? { min: e.min } : {}),
        ...(e.max !== undefined ? { max: e.max } : {}),
        ...(e.contentType ? { contentType: e.contentType } : {}),
        ...(e.entityType ? { entityType: e.entityType } : {}),
        ...(e.typeValueListElement ? { typeValueListElement: e.typeValueListElement } : {}),
        ...(e.semanticIdListElement ? { semanticIdListElement: e.semanticIdListElement } : {}),
        ...(e.valueTypeListElement ? { valueTypeListElement: e.valueTypeListElement } : {}),
        origin,
      }),
    });
    for (const c of e.children ?? []) put(c, id);
  };

  for (const e of def.elements) put(e, smId);
  return { t: 'batch', label: `template:${def.id}@${def.version}`, cmds };
}

/* ── L3 적합성 — 삽입 후에도 템플릿이 계약으로 남는다 ─────────── */

export interface Conformance {
  code: 'T-001' | 'T-002' | 'T-003';
  node: NodeId | null;
  path: string;
  message: { ko: string; en: string };
}

/** 인스턴스가 자기 템플릿을 여전히 지키는가 */
export function checkConformance(doc: AasDoc, submodelId: NodeId): Conformance[] {
  const sm = doc.nodes[submodelId];
  if (!sm?.origin) return [];
  const def = BY_ID.get(sm.origin.templateId);
  if (!def) return [];

  const out: Conformance[] = [];
  const byShort = (parent: NodeId): Map<string, NodeId> =>
    new Map((doc.order[parent] ?? []).map((c) => [doc.nodes[c]?.idShort ?? '', c]));

  const walk = (els: ElementDef[], parent: NodeId, prefix: string): void => {
    /* List 직속 자식은 idShort가 없다(AASd-120). 이름 대신 위치로 대조한다. */
    const parentIsList = doc.nodes[parent]?.t === 'sml';
    const present = parentIsList ? new Map<string, NodeId>() : byShort(parent);
    const positional = doc.order[parent] ?? [];
    for (const [i, e] of els.entries()) {
      const id = parentIsList ? positional[i] : present.get(e.idShort);
      const path = `${prefix}/${e.idShort}`;
      if (!id) {
        if (e.required) {
          out.push({
            code: 'T-001',
            node: parent,
            path,
            message: {
              ko: `템플릿 필수 요소 ${e.idShort}이(가) 없습니다.`,
              en: `Required template element ${e.idShort} is missing.`,
            },
          });
        }
        continue;
      }
      const node = doc.nodes[id]!;
      if (e.semanticId && node.semanticId && node.semanticId !== e.semanticId) {
        out.push({
          code: 'T-002',
          node: id,
          path,
          message: {
            ko: `semanticId가 템플릿과 다릅니다. 템플릿: ${e.semanticId}`,
            en: `semanticId deviates from the template. Expected ${e.semanticId}`,
          },
        });
      }
      if (e.children?.length) walk(e.children, id, path);
    }
  };

  if (sm.semanticId && sm.semanticId !== def.submodel.semanticId) {
    out.push({
      code: 'T-003',
      node: submodelId,
      path: sm.idShort,
      message: {
        ko: `서브모델 semanticId가 템플릿 ${def.idtaNumber}과 다릅니다.`,
        en: `Submodel semanticId deviates from template ${def.idtaNumber}.`,
      },
    });
  }
  walk(def.elements, submodelId, sm.idShort);
  return out;
}

/** 문서 전체에서 템플릿 출처를 가진 서브모델을 찾아 검사한다. */
export function checkAllConformance(doc: AasDoc): Conformance[] {
  const out: Conformance[] = [];
  for (const id of Object.keys(doc.nodes)) {
    const n = doc.nodes[id]!;
    if (n.t === 'submodel' && n.origin && parentOf(doc, id) !== undefined) {
      out.push(...checkConformance(doc, id));
    }
  }
  return out;
}
