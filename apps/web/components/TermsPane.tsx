'use client';

/**
 * 용어집 — 지금 무엇을 알고 있는지 한자리에서 본다.
 *
 * 이 화면이 없을 때는 개념을 확인할 길이 셋이었다. 검색해서 한 건씩 보거나,
 * 파일로 내보내 편집기로 열거나, 콘솔에서 localStorage를 읽거나. 전체를 훑을 수
 * 없으니 **단위가 빠진 항목 같은 것을 찾지 못했다** — 그것이 AASc-3a-009로 터졌다.
 *
 * 그래서 문제 있는 줄을 위로 올리고 이유를 붙인다. 목록은 보라고 있는 것이 아니라
 * 고칠 것을 찾으라고 있다.
 */

import { useMemo, useRef, useState } from 'react';

import { type TermEntry, formatSemanticId, parseSemanticId } from '@aas/semantic';

import { downloadText } from '../lib/persist';
import { useSettings } from '../lib/settings';
import { useEditor } from '../lib/store';
import { entriesFromFile, planModelImport, useTerms } from '../lib/terms';

/** 단위가 있어야 하는 자료형 (AASc-3a-009) — 커널의 UNIT_REQUIRED와 같은 목록이다 */
const UNIT_REQUIRED = new Set([
  'INTEGER_MEASURE',
  'REAL_MEASURE',
  'RATIONAL_MEASURE',
  'INTEGER_CURRENCY',
  'REAL_CURRENCY',
]);

function problemOf(t: TermEntry): string | null {
  if (t.dataType && UNIT_REQUIRED.has(t.dataType) && !t.unit) {
    return `자료형이 ${t.dataType}인데 단위가 없습니다 — 내보낼 때 자료형이 빠집니다 (AASc-3a-009)`;
  }
  if (!t.nameEn?.trim()) return '영문 표제어가 없어 개념을 만들 수 없습니다 (AASc-3a-002)';
  if (!t.definition?.trim()) return '영문 정의가 없어 개념을 만들 수 없습니다 (AASc-3a-008)';
  return null;
}

function haystack(t: TermEntry): string {
  return [t.term, ...(t.aliases ?? []), t.nameEn ?? '', t.semanticId].join(' ').toLowerCase();
}

export function TermsPane(): React.JSX.Element {
  const entries = useTerms((s) => s.entries);
  const dict = useTerms((s) => s.dict);
  const remove = useTerms((s) => s.remove);
  const openDraft = useTerms((s) => s.openDraft);
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selected);
  const selectedName = selected ? doc.nodes[selected]?.idShort || null : null;
  const scopeLabel = selectedName ? `${selectedName} 아래` : '모델 전체';
  const iriPrefix = useSettings((s) => s.iriPrefix);
  const notify = useEditor((s) => s.notify);
  const [q, setQ] = useState('');
  const [onlyBad, setOnlyBad] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** 샘플 → 사전 → 사내. 뒤가 이긴다 — 화면이 내보내기와 같은 책을 봐야 한다 */
  const book = useMemo(() => useTerms.getState().book(), [entries, dict]);
  /** 이 브라우저에 있는 것만 지울 수 있다. 샘플은 파일이라 여기서 못 지운다 */
  const mine = useMemo(() => new Set(entries.map((e) => e.semanticId)), [entries]);
  const fromDict = useMemo(() => new Set(dict.map((e) => e.semanticId)), [dict]);

  /**
   * 어디서 온 개념인가. **mock은 따로 표시한다** — 개발용 가정 자료가 사전 답으로
   * 들어와 파일에 실린다. 표시가 없으면 진짜 정의와 구별할 수 없다.
   */
  /**
   * 고칠 수 있는 것은 **우리 개념**뿐이다 — 사내 네임스페이스로 발행했거나 에디터에서 등록한 것.
   * 표준 개념(IEC CDD·eCl@ss·IDTA)의 정의·단위를 여기서 바꾸면 원본과 다른 설명이
   * 표준 식별자를 달고 나간다. 그쪽은 사전을 고친다.
   */
  const editable = (t: TermEntry): boolean =>
    (!!iriPrefix && t.semanticId.startsWith(iriPrefix)) ||
    (mine.has(t.semanticId) && t.origin === 'local');

  const originOf = (t: TermEntry): { cls: string; label: string } => {
    /* 용어집에 옮겨 담아도 mock은 mock이다 — 표시가 사라지면 진짜 정의와 구별할 수 없다 */
    if (/mock/i.test(t.provenance ?? '')) return { cls: 'mock', label: 'mock' };
    if (mine.has(t.semanticId)) return { cls: 'local', label: '사내' };
    if (fromDict.has(t.semanticId)) {
      return /mock/i.test(t.provenance ?? '')
        ? { cls: 'mock', label: 'mock' }
        : { cls: 'dict', label: '사전' };
    }
    return { cls: 'sample', label: '샘플' };
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = book.terms.filter((t) => (needle ? haystack(t).includes(needle) : true));
    const withProblem = list.map((t) => ({ t, problem: problemOf(t) }));
    const shown = onlyBad ? withProblem.filter((r) => r.problem) : withProblem;
    /* 고칠 것이 먼저, 그다음 사내, 그다음 이름순 */
    return shown.sort((a, b) => {
      const ap = a.problem ? 0 : 1;
      const bp = b.problem ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const am = mine.has(a.t.semanticId) ? 0 : 1;
      const bm = mine.has(b.t.semanticId) ? 0 : 1;
      if (am !== bm) return am - bm;
      return a.t.term.localeCompare(b.t.term);
    });
  }, [book, q, onlyBad, mine]);

  const badCount = useMemo(() => book.terms.filter((t) => problemOf(t)).length, [book]);

  const importFromModel = (): void => {
    const s = useTerms.getState();
    const plan = planModelImport(doc, selected, iriPrefix, { entries: s.entries, dict: s.dict });
    const added = plan.entries.length ? s.addMany(plan.entries) : 0;
    const parts = [
      plan.already ? `이미 용어집 ${plan.already}` : '',
      plan.inSample ? `샘플에 있음 ${plan.inSample}` : '',
      plan.noDefinition ? `영문 이름·정의 없어 못 옮김 ${plan.noDefinition}` : '',
      plan.unknown.length ? `아무도 모름 ${plan.unknown.length} (검증 탭 CD-001로 등록)` : '',
    ].filter(Boolean);
    notify(
      `${scopeLabel}: 개념 ${plan.seen}건 중 ${added}건을 용어집에 넣었습니다.` +
        (plan.mock ? ` 그중 mock ${plan.mock}건 — 진짜 정의가 아닙니다.` : '') +
        (parts.length ? ` (${parts.join(' · ')})` : ''),
    );
  };

  const importFile = (file: File): void => {
    void file
      .text()
      .then((raw) => {
        const { entries: incoming, unusable } = entriesFromFile(raw, file.name);
        if (incoming.length === 0) {
          notify(`${file.name}: 쓸 수 있는 항목이 없습니다 (${unusable}건 건너뜀).`);
          return;
        }
        const added = useTerms.getState().addMany(incoming);
        const already = incoming.length - added;
        notify(
          `${file.name}: ${incoming.length}건 중 ${added}건을 넣었습니다.` +
            (already ? ` 이미 있던 것 ${already}건.` : '') +
            (unusable ? ` 영문 이름·정의가 없어 못 쓴 것 ${unusable}건.` : ''),
        );
      })
      .catch((e: Error) => notify(`${file.name}을(를) 읽지 못했습니다: ${e.message}`));
  };

  return (
    <div className="terms">
      <div className="thead">
        <input
          type="search"
          value={q}
          spellCheck={false}
          placeholder="용어 · 별칭 · 영문 · 식별자로 찾기"
          onChange={(e) => setQ(e.target.value)}
        />
        <label className={`chk${badCount ? ' hot' : ''}`}>
          <input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} />
          고칠 것만 ({badCount})
        </label>
        <span className="grow" />
        <button
          type="button"
          className="mini"
          disabled={Object.keys(doc.nodes).length === 0}
          title={`${scopeLabel}에서 쓰는 개념 중 용어집에 없는 것을 옮깁니다 — 파일에 실려 온 개념과 사전이 답한 개념. 트리에서 요소를 고르면 그 아래만 옮깁니다.`}
          onClick={importFromModel}
        >
          {selectedName ? `${selectedName}에서 가져오기` : '모델에서 가져오기'}
        </button>
        <button type="button" className="mini" onClick={() => fileRef.current?.click()}>
          가져오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) importFile(f);
          }}
        />
        <button
          type="button"
          className="mini"
          disabled={entries.length === 0}
          title="이 브라우저에 등록한 것만 내보냅니다. 샘플 용어집은 파일에 이미 있습니다."
          onClick={() => {
            downloadText(
              'terms.local.json',
              `${JSON.stringify({ note: '에디터에서 등록한 사내 용어. 회사 용어집에 합치십시오.', terms: entries }, null, 2)}\n`,
            );
            notify(`용어 ${entries.length}건을 내보냈습니다.`);
          }}
        >
          내보내기 ({entries.length})
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="clean">
          {onlyBad ? '✓ 고칠 것이 없습니다.' : `찾는 용어가 없습니다 (전체 ${book.terms.length}건).`}
        </p>
      ) : (
        <ul className="tlist">
          {rows.map(({ t, problem }) => (
            <li key={t.semanticId} className={problem ? 'bad' : undefined}>
              <span className="tm">{t.term}</span>
              <span className="en">{t.nameEn ?? '—'}</span>
              <span className="un">{t.unit ?? ''}</span>
              <span className="dt">{t.dataType ?? ''}</span>
              <span className={`org ${originOf(t).cls}`} title={t.provenance}>
                {originOf(t).label}
              </span>
              <span className="sem" title={t.semanticId}>
                {formatSemanticId(parseSemanticId(t.semanticId))}
              </span>
              {problem ? <span className="why">{problem}</span> : null}
              <span className="acts">
                {editable(t) ? (
                  <button
                    type="button"
                    className="del"
                    aria-label={`${t.term} 고치기`}
                    title={
                      mine.has(t.semanticId)
                        ? '등록 창을 열어 고칩니다'
                        : '샘플은 파일이라 그대로 두고, 고친 것을 이 브라우저의 용어집에 올립니다 (뒤가 이깁니다)'
                    }
                    onClick={() =>
                      openDraft({
                        semanticId: t.semanticId,
                        term: t.term,
                        nameEn: t.nameEn ?? '',
                        definition: t.definition ?? '',
                        unit: t.unit ?? '',
                        dataType: t.dataType ?? '',
                      })
                    }
                  >
                    고치기
                  </button>
                ) : null}
                {mine.has(t.semanticId) ? (
                  <button
                    type="button"
                    className="del"
                    aria-label={`${t.term} 지우기`}
                    title="이 브라우저의 용어집에서 지웁니다"
                    onClick={() => {
                      remove(t.semanticId);
                      notify(`“${t.term}”을(를) 용어집에서 지웠습니다.`);
                    }}
                  >
                    지우기
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
