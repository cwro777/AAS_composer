'use client';

/**
 * 개념 등록 — 자체 발행한 semanticId에 뜻을 채운다.
 *
 * 규격이 요구하는 최소치가 **영문 표제어(AASc-3a-002)와 영문 정의(AASc-3a-008)**다.
 * 그래서 그 둘은 비워 둘 수 없다. 없는 것을 지어내지 않는 대신, 채울 자리를 준다.
 *
 * 여기 넣은 것은 이 브라우저에만 쌓인다. 회사 용어집으로 옮겨야 여러 사람이 쓰므로
 * 내보내기를 같은 자리에 둔다.
 */

import { DATA_TYPES, useTerms } from '../lib/terms';
import { downloadText } from '../lib/persist';
import { useEditor } from '../lib/store';

export function ConceptForm(): React.JSX.Element | null {
  const draft = useTerms((s) => s.draft);
  const entries = useTerms((s) => s.entries);
  const patch = useTerms((s) => s.patchDraft);
  const close = useTerms((s) => s.closeDraft);
  const commit = useTerms((s) => s.commitDraft);
  const notify = useEditor((s) => s.notify);

  if (!draft) return null;

  const save = (): void => {
    const r = commit();
    notify(
      r.ok
        ? `“${r.entry.term}”을(를) 사내 용어집에 등록했습니다. 이제 내보낼 때 개념도 함께 나갑니다.`
        : r.reason,
    );
  };

  return (
    <div className="cform" role="dialog" aria-label="개념 등록">
      <div className="chead">
        <b>개념 등록</b>
        <code>{draft.semanticId}</code>
        <button type="button" className="mini" onClick={close} aria-label="닫기">
          닫기
        </button>
      </div>

      <div className="cgrid">
        <label>
          <span>사내 용어 (한글)</span>
          <input
            autoFocus
            value={draft.term}
            placeholder="배럴온도"
            onChange={(e) => patch({ term: e.target.value })}
          />
        </label>
        <label>
          <span>
            영문 이름 <em>필수</em>
          </span>
          <input
            value={draft.nameEn}
            placeholder="Barrel temperature"
            onChange={(e) => patch({ nameEn: e.target.value })}
          />
        </label>
        <label className="wide">
          <span>
            영문 정의 <em>필수</em>
          </span>
          <textarea
            rows={2}
            value={draft.definition}
            placeholder="Temperature measured in a barrel heating zone."
            onChange={(e) => patch({ definition: e.target.value })}
          />
        </label>
        <label>
          <span>단위</span>
          <input
            value={draft.unit}
            placeholder="°C · kN · mm"
            onChange={(e) => patch({ unit: e.target.value })}
          />
        </label>
        <label>
          <span>자료형</span>
          <select value={draft.dataType} onChange={(e) => patch({ dataType: e.target.value })}>
            {DATA_TYPES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="cfoot">
        <span className="note">
          규격이 영문 표제어와 정의를 요구합니다. 이 브라우저에 저장되며, 등록한 {entries.length}건은
          내보내 회사 용어집에 옮기십시오.
        </span>
        {entries.length ? (
          <button
            type="button"
            className="mini"
            onClick={() => {
              downloadText(
                'terms.local.json',
                `${JSON.stringify({ note: '에디터에서 등록한 사내 용어. 회사 용어집에 합치십시오.', terms: entries }, null, 2)}\n`,
              );
              notify(`용어 ${entries.length}건을 내보냈습니다.`);
            }}
          >
            용어집 내보내기 ({entries.length})
          </button>
        ) : null}
        <button type="button" className="primary" onClick={save}>
          등록
        </button>
      </div>
    </div>
  );
}
