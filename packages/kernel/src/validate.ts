/**
 * L2 — 사내 정책 검사만 둔다.
 *
 * 규격 제약(AASd-002·022·108·120 …)은 여기에 쓰지 않는다. `verify.ts`가 aas-core3.0에 위임한다.
 * 프로토타입의 validate()에 섞여 있던 규격 항목은 이 파일로 옮기지 않았다.
 */

import type { Cmd } from './command.js';
import { type Issue, sortIssues } from './issue.js';
import {
  type AasDoc,
  type NodeId,
  ID_SHORT_RE,
  childrenOf,
  isIdentifiable,
  parentOf,
  pathOf,
} from './model.js';

export interface PolicyOptions {
  /** 전역 식별자가 이 접두어로 시작해야 한다. 비우면 검사하지 않는다. */
  iriPrefix?: string;
}

function numeric(vt: string): boolean {
  return /double|float|decimal|integer|^xs:int$|long|byte|unsigned/.test(vt);
}

/** 부모가 SubmodelElementList인가 — AASd-120 대상 여부 */
function inList(doc: AasDoc, id: NodeId): boolean {
  const p = parentOf(doc, id);
  return !!p && doc.nodes[p]?.t === 'sml';
}

export function validate(doc: AasDoc, opts: PolicyOptions = {}): Issue[] {
  const out: Issue[] = [];
  const seenIdentifier = new Map<string, NodeId>();

  const push = (
    code: string,
    severity: Issue['severity'],
    node: NodeId | null,
    ko: string,
    en: string,
    quickFix?: Issue['quickFix'],
  ): void => {
    out.push({
      code,
      layer: 'policy',
      severity,
      node,
      path: node ? pathOf(doc, node) : '',
      message: { ko, en },
      ...(quickFix ? { quickFix } : {}),
    });
  };

  for (const id of Object.keys(doc.nodes)) {
    const n = doc.nodes[id]!;
    const where = n.idShort || '(이름 없음)';

    /* POL-NAME — 명명 컨벤션. List 직속 자식은 idShort를 출력하지 않으므로 대상 외. */
    if (!inList(doc, id)) {
      if (!n.idShort) {
        push('POL-NAME-001', 'error', id, `${where}에 idShort가 없습니다.`, 'Missing idShort.');
      } else if (!ID_SHORT_RE.test(n.idShort)) {
        const suggested = n.idShort.replace(/[^A-Za-z0-9_]/g, '').replace(/^[^A-Za-z]+/, '');
        push(
          'POL-NAME-002',
          'error',
          id,
          `“${n.idShort}”은(는) 영문자로 시작하고 영문·숫자·밑줄만 쓸 수 있습니다.`,
          `"${n.idShort}" must start with a letter and contain only letters, digits and underscores.`,
          suggested
            ? {
                label: { ko: `“${suggested}”로 고치기`, en: `Rename to "${suggested}"` },
                cmds: [{ t: 'set', node: id, path: 'idShort', value: suggested } satisfies Cmd],
              }
            : undefined,
        );
      }
    }

    /* POL-ID — 전역 식별자 */
    if (isIdentifiable(n.t)) {
      const identifier = (n as { identifier: string }).identifier;
      if (!identifier) {
        push(
          'POL-ID-001',
          'error',
          id,
          `${where}에 전역 식별자(id)가 없습니다.`,
          'Missing global identifier.',
        );
      } else {
        const prev = seenIdentifier.get(identifier);
        if (prev) {
          push(
            'POL-ID-002',
            'error',
            id,
            `전역 식별자가 중복됩니다: ${identifier}`,
            `Duplicate global identifier: ${identifier}`,
          );
        } else {
          seenIdentifier.set(identifier, id);
        }
        if (opts.iriPrefix && !identifier.startsWith(opts.iriPrefix)) {
          push(
            'POL-IRI-001',
            'warn',
            id,
            `전역 식별자가 사내 네임스페이스(${opts.iriPrefix})로 시작하지 않습니다.`,
            `Identifier does not start with the organization namespace (${opts.iriPrefix}).`,
          );
        }
      }
    }

    /* POL-SEM — 의미 식별자. List 직속 자식은 부모의 semanticIdListElement가 대신한다. */
    if (n.t !== 'shell' && !n.semanticId) {
      const p = parentOf(doc, id);
      const coveredByList =
        inList(doc, id) && !!p && !!(doc.nodes[p] as { semanticIdListElement?: string }).semanticIdListElement;
      if (!coveredByList) {
        push(
          'POL-SEM-001',
          'warn',
          id,
          `${where}에 semanticId가 없습니다. 의미론적 상호운용성이 보장되지 않습니다.`,
          'No semanticId. Semantic interoperability is not guaranteed.',
        );
      }
    }
    if (n.semanticId && n.supplementalSemanticIds?.includes(n.semanticId)) {
      push(
        'POL-SEM-002',
        'warn',
        id,
        `보조 semanticId가 주 semanticId와 같습니다: ${n.semanticId}`,
        `A supplemental semanticId duplicates the primary one: ${n.semanticId}`,
      );
    }

    /* POL-VAL — 값이 valueType과 맞는가 */
    if (n.t === 'prop' && n.value !== '') {
      const v = n.value;
      if (numeric(n.valueType) && !Number.isFinite(Number(v))) {
        push(
          'POL-VAL-001',
          'error',
          id,
          `값 “${v}”은(는) ${n.valueType} 형식이 아닙니다. 단위는 값이 아니라 ConceptDescription에 넣습니다.`,
          `Value "${v}" is not a valid ${n.valueType}. Units belong in the ConceptDescription, not the value.`,
        );
      }
      if (n.valueType === 'xs:boolean' && !['true', 'false'].includes(v.toLowerCase())) {
        push('POL-VAL-002', 'error', id, '값은 true 또는 false여야 합니다.', 'Value must be true or false.');
      }
      if (n.valueType === 'xs:dateTime' && Number.isNaN(Date.parse(v))) {
        push('POL-VAL-003', 'error', id, '값이 ISO 8601 일시 형식이 아닙니다.', 'Value is not an ISO 8601 date-time.');
      }
      if (n.valueType === 'xs:date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        push('POL-VAL-004', 'error', id, '값은 YYYY-MM-DD 형식이어야 합니다.', 'Value must be YYYY-MM-DD.');
      }
    }
    if (n.t === 'range' && numeric(n.valueType) && n.min !== '' && n.max !== '') {
      if (Number(n.min) > Number(n.max)) {
        push('POL-VAL-005', 'error', id, 'min이 max보다 큽니다.', 'min is greater than max.');
      }
    }
    if (n.t === 'mlp' && !n.value.some((l) => l.text)) {
      push('POL-VAL-006', 'warn', id, '입력된 다국어 텍스트가 없습니다.', 'No language strings entered.');
    }

    /* POL-REL / POL-ENT — P2에서 들어온 노드들 */
    if ((n.t === 'rel' || n.t === 'annrel') && (!n.first || !n.second)) {
      push(
        'POL-REL-001',
        'error',
        id,
        '관계의 first·second가 모두 채워져야 합니다.',
        'A relationship requires both first and second.',
      );
    }
    if (n.t === 'entity') {
      if (n.entityType === 'SelfManagedEntity' && !n.globalAssetId && !n.specificAssetIds?.length) {
        push(
          'POL-ENT-001',
          'error',
          id,
          'SelfManagedEntity는 globalAssetId나 specificAssetIds 중 하나가 필요합니다.',
          'A SelfManagedEntity needs either globalAssetId or specificAssetIds.',
        );
      }
      if (n.entityType === 'CoManagedEntity' && (n.globalAssetId || n.specificAssetIds?.length)) {
        push(
          'POL-ENT-002',
          'warn',
          id,
          'CoManagedEntity에는 자산 식별자를 두지 않는 것이 보통입니다.',
          'A CoManagedEntity normally carries no asset identifier.',
        );
      }
    }
    if (n.t === 'blob' && !n.contentType) {
      push('POL-VAL-007', 'error', id, 'Blob에 contentType이 없습니다.', 'Blob has no contentType.');
    }
    if (n.t === 'op' && childrenOf(doc, id).length === 0) {
      push(
        'POL-OP-001',
        'info',
        id,
        '변수가 하나도 없는 Operation입니다.',
        'This operation declares no variables.',
      );
    }
    if (n.qualifiers?.some((q) => !q.type)) {
      push('POL-QUAL-001', 'error', id, 'type이 없는 Qualifier가 있습니다.', 'A qualifier has no type.');
    }
    if (n.extensions?.some((e) => !e.name)) {
      push('POL-EXT-001', 'error', id, 'name이 없는 Extension이 있습니다.', 'An extension has no name.');
    }

    /* POL-STRUCT — 구조적 권고 */
    if (n.t === 'shell') {
      if (!n.globalAssetId) {
        push(
          'POL-STRUCT-001',
          'warn',
          id,
          'globalAssetId가 비어 있습니다. 물리 자산을 식별할 수 없습니다.',
          'globalAssetId is empty; the physical asset cannot be identified.',
        );
      }
      if (childrenOf(doc, id).length === 0) {
        push('POL-STRUCT-002', 'warn', id, '연결된 서브모델이 없습니다.', 'No submodels attached.');
      }
    }
    if (n.t === 'submodel' && parentOf(doc, id) === null) {
      push(
        'POL-STRUCT-003',
        'warn',
        id,
        'Shell에 연결되지 않았습니다. 독립 서브모델로 출력됩니다.',
        'Not attached to a shell; it will be emitted as a standalone submodel.',
      );
    }
  }

  return sortIssues(out);
}
