'use client';

/**
 * 개념 등록 — 자체 발행한 semanticId에 뜻을 채운다.
 *
 * 규격이 요구하는 최소치가 **영문 표제어(AASc-3a-002)와 영문 정의(AASc-3a-008)**다.
 * 그래서 그 둘은 비워 둘 수 없다. 없는 것을 지어내지 않는 대신, 채울 자리를 준다.
 *
 * 여기 넣은 것은 이 브라우저에만 쌓인다. 회사 용어집으로 옮기는 내보내기는 용어집 탭에
 * 한 곳만 둔다(여기에도 두었더니 전역 `.mini`의 width:100%를 물려받아 안내문이 한 글자 폭으로
 * 짜부라졌다).
 */

import { useMemo, useState } from 'react';

import { DATA_TYPES, useTerms } from '../lib/terms';
import { useEditor } from '../lib/store';
import { UNIT_KINDS, type UnitOption, kindOfUnit, suggestKind } from '../lib/units';

const USED = 'used';

/**
 * 단위 고르기. 종류를 고르면 그 종류의 기호가 버튼으로 뜨고, 누르면 단위 칸에 들어간다.
 *
 * 처음 보이는 종류는 ① 이미 적힌 단위의 종류 ② 개념 이름에서 찾은 종류(추천)
 * ③ 용어집에서 이미 쓰는 단위 순이다. **값을 대신 채우지 않는다** — 고르는 것은 사람이다.
 * 용어집에서 쓰는 단위를 따로 보이는 이유는 같은 단위를 같은 기호로 쓰게 하려는 것이다.
 */
function UnitPicker({
  text,
  dataType,
  value,
  onPick,
}: {
  text: string;
  dataType: string;
  value: string;
  onPick: (unit: string) => void;
}): React.JSX.Element {
  const entries = useTerms((s) => s.entries);
  const dict = useTerms((s) => s.dict);
  const used = useMemo<UnitOption[]>(() => {
    const symbols = new Set(
      useTerms
        .getState()
        .book()
        .terms.map((t) => t.unit?.trim())
        .filter((x): x is string => !!x),
    );
    return [...symbols].sort().map((symbol) => ({
      symbol,
      name: kindOfUnit(symbol)?.label ?? '용어집에서 쓰는 단위',
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, dict]);

  const suggested = suggestKind(text, dataType);
  const [kind, setKind] = useState<string>(
    () => kindOfUnit(value)?.id ?? suggested?.id ?? (used.length ? USED : UNIT_KINDS[0]!.id),
  );
  const options = kind === USED ? used : (UNIT_KINDS.find((k) => k.id === kind)?.units ?? []);

  return (
    <div className="upick wide">
      <label className="ukind">
        <span>단위 종류</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {used.length ? <option value={USED}>용어집에서 쓰는 단위 ({used.length})</option> : null}
          {UNIT_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
              {k.id === suggested?.id ? ' — 추천' : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="uchips" role="listbox" aria-label="단위">
        {options.map((o) => (
          <button
            key={o.symbol}
            type="button"
            role="option"
            aria-selected={o.symbol === value}
            className={o.symbol === value ? 'on' : undefined}
            title={o.name}
            onClick={() => onPick(o.symbol)}
          >
            <b>{o.symbol}</b>
            <small>{o.name}</small>
          </button>
        ))}
        {value ? (
          <button type="button" className="clear" title="단위를 비웁니다" onClick={() => onPick('')}>
            비우기
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ConceptForm(): React.JSX.Element | null {
  const draft = useTerms((s) => s.draft);
  const entries = useTerms((s) => s.entries);
  const patch = useTerms((s) => s.patchDraft);
  const close = useTerms((s) => s.closeDraft);
  const commit = useTerms((s) => s.commitDraft);
  const notify = useEditor((s) => s.notify);

  if (!draft) return null;

  /* 이미 책에 있는 id면 고치기다. 등록은 같은 id를 덮어쓰므로 지우고 다시 만들 필요가 없다 */
  const editing = useTerms.getState().book().terms.some((e) => e.semanticId === draft.semanticId);
  /* 목록 밖의 자료형(INTEGER_CURRENCY 등)을 가진 항목을 열어도 값이 바뀌지 않게 한다 */
  const types: string[] = [...DATA_TYPES];
  if (draft.dataType && !types.includes(draft.dataType)) types.push(draft.dataType);

  const save = (): void => {
    const r = commit();
    notify(
      r.ok
        ? editing
          ? `“${r.entry.term}”을(를) 고쳤습니다.`
          : `“${r.entry.term}”을(를) 사내 용어집에 등록했습니다. 이제 내보낼 때 개념도 함께 나갑니다.`
        : r.reason,
    );
  };

  return (
    <div className="cform" role="dialog" aria-label={editing ? '개념 고치기' : '개념 등록'}>
      <div className="chead">
        <b>{editing ? '개념 고치기' : '개념 등록'}</b>
        <code>{draft.semanticId}</code>
        <button type="button" className="mini" onClick={close} aria-label="닫기">
          닫기
        </button>
      </div>

      <div className="cgrid">
        <label>
          <span>사내 용어 (한글)</span>
          <input
            autoFocus={!draft.term}
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
          <span>단위 — 아래에서 고르거나 직접 입력</span>
          <input
            /* 파일에서 이름·정의를 옮겨 온 경우 남은 것은 단위뿐이다 */
            autoFocus={!!draft.term && !!draft.definition && !draft.unit}
            value={draft.unit}
            placeholder="°C · kN · mm"
            onChange={(e) => patch({ unit: e.target.value })}
          />
        </label>
        <label>
          <span>자료형</span>
          <select value={draft.dataType} onChange={(e) => patch({ dataType: e.target.value })}>
            <option value="">(없음 — 묶음·서브모델 개념)</option>
            {types.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <UnitPicker
          key={draft.semanticId}
          text={`${draft.nameEn} ${draft.term} ${draft.semanticId}`}
          dataType={draft.dataType}
          value={draft.unit}
          onPick={(unit) => patch({ unit })}
        />
      </div>

      <div className="cfoot">
        <span className="note">
          규격이 영문 표제어와 정의를 요구합니다. 이 브라우저에 저장되며, 등록한 {entries.length}건은
          용어집 탭의 내보내기로 회사 용어집에 옮기십시오.
        </span>
        <button type="button" className="primary" onClick={save}>
          {editing ? '고친 내용 저장' : '등록'}
        </button>
      </div>
    </div>
  );
}
