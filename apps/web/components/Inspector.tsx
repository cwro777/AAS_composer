'use client';

/**
 * 인스펙터 — 선택한 노드의 속성 편집.
 *
 * 입력은 blur/Enter에서 커밋한다. 글자마다 명령을 만들면 Ctrl+Z가 한 글자씩 되돌아가
 * 쓸 수 없게 된다. 편집 하나가 실행취소 하나여야 한다.
 */

import { useEffect, useState } from 'react';

import { type AasNode, type NodeId, MODEL_TYPE, childrenOf, parentOf, pathOf } from '@aas/kernel';

import { setField } from '../lib/edit';
import { useEditor } from '../lib/store';
import { SemanticField } from './SemanticField';

const VALUE_TYPES = [
  'xs:string',
  'xs:double',
  'xs:float',
  'xs:decimal',
  'xs:integer',
  'xs:int',
  'xs:long',
  'xs:unsignedLong',
  'xs:boolean',
  'xs:dateTime',
  'xs:date',
  'xs:time',
  'xs:anyURI',
];

const LIST_TYPES = [
  'Property',
  'MultiLanguageProperty',
  'Range',
  'File',
  'Blob',
  'ReferenceElement',
  'SubmodelElementCollection',
  'SubmodelElementList',
  'Entity',
  'RelationshipElement',
];

interface FieldProps {
  label: string;
  note?: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  name?: string;
  multiline?: boolean;
}

function Field({ label, note, value, onCommit, placeholder, name, multiline }: FieldProps): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };

  const common = {
    'data-field': name,
    value: draft,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !multiline) {
        e.preventDefault();
        commit();
      }
      if (e.key === 'Escape') setDraft(value);
    },
  };

  return (
    <label className="f">
      <span>{label}</span>
      {multiline ? <textarea {...common} rows={2} /> : <input {...common} />}
      {note ? <em>{note}</em> : null}
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onCommit,
}: {
  label: string;
  value: string;
  options: string[];
  onCommit: (v: string) => void;
}): React.JSX.Element {
  return (
    <label className="f">
      <span>{label}</span>
      <select value={value} onChange={(e) => onCommit(e.target.value)}>
        {options.includes(value) ? null : <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function LangEditor({ id, node }: { id: NodeId; node: AasNode }): React.JSX.Element {
  const langs = (node as { value?: Array<{ language: string; text: string }> }).value ?? [];
  const write = (next: Array<{ language: string; text: string }>): void =>
    setField(id, 'value', next, '다국어 편집');

  return (
    <div className="f">
      <span>다국어 값</span>
      {langs.map((l, i) => (
        <div className="lang" key={`${i}-${l.language}`}>
          <input
            value={l.language}
            placeholder="ko"
            onChange={(e) =>
              write(langs.map((x, j) => (j === i ? { ...x, language: e.target.value } : x)))
            }
          />
          <input
            value={l.text}
            placeholder="텍스트"
            onChange={(e) => write(langs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
          />
          <button type="button" onClick={() => write(langs.filter((_, j) => j !== i))} aria-label="언어 삭제">
            ×
          </button>
        </div>
      ))}
      <button type="button" className="mini" onClick={() => write([...langs, { language: 'ko', text: '' }])}>
        + 언어 추가
      </button>
    </div>
  );
}

export function Inspector(): React.JSX.Element {
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selected);

  if (!selected || !doc.nodes[selected]) {
    return <div className="nothing">노드를 선택하면 여기에서 속성과 semanticId를 편집합니다.</div>;
  }

  const id = selected;
  const n = doc.nodes[id]!;
  const parent = parentOf(doc, id);
  const inList = parent !== null && doc.nodes[parent]?.t === 'sml';
  const sup = ((n as { supplementalSemanticIds?: string[] }).supplementalSemanticIds ?? []).join(' ');
  const desc = ((n as { description?: Array<{ language: string; text: string }> }).description ?? [])
    .map((d) => d.text)
    .join(' ');

  return (
    <div className="insp">
      <div className="sec">
        <p className="eyebrow">선택된 노드</p>
        <span className="badge">
          <i style={{ background: `var(--n-${n.t})` }} />
          {MODEL_TYPE[n.t]}
        </span>
        <p className="path">{pathOf(doc, id)}</p>
      </div>

      <div className="sec">
        <Field
          label="idShort"
          name="idShort"
          value={n.idShort}
          placeholder="MyProperty"
          note={
            inList
              ? 'List의 직속 자식이라 JSON에는 출력되지 않습니다 (AASd-120).'
              : '영문자로 시작, 형제 안에서 유일해야 합니다.'
          }
          onCommit={(v) => setField(id, 'idShort', v, 'idShort 편집')}
        />

        {n.t === 'shell' || n.t === 'submodel' ? (
          <Field
            label="id (전역 식별자)"
            value={(n as { identifier?: string }).identifier ?? ''}
            placeholder="https://bnb.co.kr/ids/…"
            note="조직 도메인을 접두어로 쓰십시오."
            onCommit={(v) => setField(id, 'identifier', v, 'id 편집')}
          />
        ) : null}

        {n.t === 'shell' ? (
          <>
            <Select
              label="assetKind"
              value={(n as { assetKind?: string }).assetKind ?? 'Instance'}
              options={['Instance', 'Type', 'NotApplicable']}
              onCommit={(v) => setField(id, 'assetKind', v, 'assetKind 편집')}
            />
            <Field
              label="globalAssetId"
              value={(n as { globalAssetId?: string }).globalAssetId ?? ''}
              placeholder="https://bnb.co.kr/ids/asset/…"
              onCommit={(v) => setField(id, 'globalAssetId', v, 'globalAssetId 편집')}
            />
          </>
        ) : null}

        {n.t === 'submodel' ? (
          <Select
            label="kind"
            value={(n as { kind?: string }).kind ?? 'Instance'}
            options={['Instance', 'Template']}
            onCommit={(v) => setField(id, 'kind', v, 'kind 편집')}
          />
        ) : null}

        {n.t === 'entity' ? (
          <>
            <Select
              label="entityType"
              value={(n as { entityType?: string }).entityType ?? 'CoManagedEntity'}
              options={['CoManagedEntity', 'SelfManagedEntity']}
              onCommit={(v) => setField(id, 'entityType', v, 'entityType 편집')}
            />
            <Field
              label="globalAssetId"
              value={(n as { globalAssetId?: string }).globalAssetId ?? ''}
              note="SelfManagedEntity는 이 값이 필수입니다 (AASd-014)."
              onCommit={(v) => setField(id, 'globalAssetId', v, 'globalAssetId 편집')}
            />
          </>
        ) : null}
      </div>

      {n.t !== 'shell' ? (
        <div className="sec">
          <p className="eyebrow">시맨틱</p>
          <SemanticField
            value={(n as { semanticId?: string }).semanticId ?? ''}
            onCommit={(v) => setField(id, 'semanticId', v, 'semanticId 편집')}
          />
          <Field
            label="supplementalSemanticIds"
            value={sup}
            multiline
            placeholder="0173-1#02-AAO677#004"
            note="여러 개는 공백으로 구분합니다."
            onCommit={(v) =>
              setField(id, 'supplementalSemanticIds', v.split(/\s+/).filter(Boolean), '보조 semanticId 편집')
            }
          />
        </div>
      ) : null}

      <div className="sec">
        <p className="eyebrow">값</p>
        {n.t === 'prop' ? (
          <>
            <Select
              label="valueType"
              value={(n as { valueType?: string }).valueType ?? 'xs:string'}
              options={VALUE_TYPES}
              onCommit={(v) => setField(id, 'valueType', v, 'valueType 편집')}
            />
            <Field
              label="value"
              value={(n as { value?: string }).value ?? ''}
              onCommit={(v) => setField(id, 'value', v, '값 편집')}
            />
          </>
        ) : null}

        {n.t === 'range' ? (
          <>
            <Select
              label="valueType"
              value={(n as { valueType?: string }).valueType ?? 'xs:double'}
              options={VALUE_TYPES}
              onCommit={(v) => setField(id, 'valueType', v, 'valueType 편집')}
            />
            <Field
              label="min"
              value={(n as { min?: string }).min ?? ''}
              onCommit={(v) => setField(id, 'min', v, 'min 편집')}
            />
            <Field
              label="max"
              value={(n as { max?: string }).max ?? ''}
              onCommit={(v) => setField(id, 'max', v, 'max 편집')}
            />
          </>
        ) : null}

        {n.t === 'mlp' ? <LangEditor id={id} node={n} /> : null}

        {n.t === 'file' || n.t === 'blob' ? (
          <Field
            label="contentType"
            value={(n as { contentType?: string }).contentType ?? ''}
            placeholder="application/pdf"
            onCommit={(v) => setField(id, 'contentType', v, 'contentType 편집')}
          />
        ) : null}

        {n.t === 'file' ? (
          <Field
            label="value (경로 또는 URL)"
            value={(n as { value?: string }).value ?? ''}
            placeholder="/aasx/files/manual.pdf"
            onCommit={(v) => setField(id, 'value', v, '값 편집')}
          />
        ) : null}

        {n.t === 'sml' ? (
          <>
            <Select
              label="typeValueListElement"
              value={(n as { typeValueListElement?: string }).typeValueListElement ?? 'Property'}
              options={LIST_TYPES}
              onCommit={(v) => setField(id, 'typeValueListElement', v, '목록 종류 편집')}
            />
            <Select
              label="valueTypeListElement"
              value={(n as { valueTypeListElement?: string }).valueTypeListElement ?? ''}
              options={['', ...VALUE_TYPES]}
              onCommit={(v) => setField(id, 'valueTypeListElement', v, '목록 valueType 편집')}
            />
            <Field
              label="semanticIdListElement"
              value={(n as { semanticIdListElement?: string }).semanticIdListElement ?? ''}
              note="목록 안 요소들이 공통으로 갖는 의미. 자식마다 붙이지 않습니다."
              onCommit={(v) => setField(id, 'semanticIdListElement', v, '목록 semanticId 편집')}
            />
          </>
        ) : null}

        {childrenOf(doc, id).length ? (
          <p className="hint">{childrenOf(doc, id).length}개의 하위 노드가 있습니다.</p>
        ) : null}

        <Field
          label="description (ko)"
          value={desc}
          multiline
          placeholder="사람이 읽는 설명"
          onCommit={(v) =>
            setField(id, 'description', v ? [{ language: 'ko', text: v }] : [], '설명 편집')
          }
        />
      </div>
    </div>
  );
}
