'use client';

/**
 * semanticId 입력 — 문자열 칸이 아니라 **타입을 가진 값**으로 다룬다.
 *
 * 두 가지를 한다.
 *  1. 입력된 값을 파싱해 체계·버전·확인 상태를 배지로 드러낸다.
 *     끝의 `#003`은 장식이 아니라 다른 식별자다. 눈에 보여야 실수를 잡는다.
 *  2. 한글 용어로 찾게 한다. IEC CDD에는 한글 표제어가 없어서,
 *     "형체력"으로 찾을 수 없으면 사전 기능은 결국 안 쓰인다(P0 실측의 요구).
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  type TermBook,
  type TermEntry,
  formatSemanticId,
  parseSemanticId,
  searchTerms,
  termFor,
} from '@aas/semantic';

import { useTerms } from '../lib/terms';

interface Props {
  value: string;
  onCommit: (v: string) => void;
}

/**
 * 근거의 세기를 있는 그대로 보인다. 센 것부터 본다.
 *
 * `dict`는 **사전이 답했다**는 뜻이지 사양서를 대조했다는 뜻이 아니다. 둘을 한 배지로
 * 뭉치면, 대조한 것과 받아 적은 것을 구분할 방법이 화면에서 사라진다.
 */
function verdictOf(term: TermEntry): { cls: string; label: string } {
  if (term.verified === 'spec') return { cls: 'v-spec', label: '사양서 확인' };
  if (term.verified === 'dict') return { cls: 'v-dict', label: '사전 확인' };
  if (term.origin === 'local') return { cls: 'v-none', label: '자체 발급' };
  return { cls: 'v-none', label: '미확인' };
}

function Badge({ raw, book }: { raw: string; book: TermBook }): React.JSX.Element | null {
  const ref = useMemo(() => (raw ? parseSemanticId(raw) : null), [raw]);
  const term = useMemo(() => (raw ? termFor(raw, book) : undefined), [raw, book]);
  if (!ref) return null;

  if (ref.scheme === 'unknown') {
    return (
      <span className="sembadge unknown" title="이 모양은 해석하지 못했습니다. 슬래시·버전 접미사를 확인하십시오.">
        해석 불가
      </span>
    );
  }

  return (
    <span className="sembadges">
      <span className={`sembadge s-${ref.scheme}`}>{formatSemanticId(ref)}</span>
      {term ? (
        <span className={`sembadge ${verdictOf(term).cls}`} title={term.provenance ?? ''}>
          {verdictOf(term).label}
          {' · '}
          {term.term}
        </span>
      ) : (
        <span className="sembadge v-none" title="용어집에 없는 값입니다. 사전 프록시가 붙으면 자동으로 대조됩니다.">
          미확인
        </span>
      )}
    </span>
  );
}

export function SemanticField({ value, onCommit }: Props): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(value), [value]);

  /**
   * **샘플 + 사내 용어집을 함께 본다.**
   *
   * 검증·미리보기·내보내기는 이미 이 책을 보는데 인스펙터만 샘플을 봤다. 그래서
   * `개념 등록`으로 방금 넣은 용어가 검색에 뜨지 않고, 배지도 계속 "미확인"이었다.
   * 화면과 파일이 다른 책을 보면 무엇이 빠졌는지 알아챌 방법이 없다.
   */
  const entries = useTerms((s) => s.entries);
  const book = useMemo(() => useTerms.getState().book(), [entries]);

  const hits = useMemo(() => (open ? searchTerms(query, book) : []), [open, query, book]);

  const commit = (v: string): void => {
    setDraft(v);
    if (v !== value) onCommit(v);
  };

  const pick = (t: TermEntry): void => {
    commit(t.semanticId);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="f semf" ref={boxRef}>
      <span>semanticId</span>
      <input
        value={draft}
        placeholder="0112/2///61987#ABA565#009"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(draft);
          }
          if (e.key === 'Escape') setDraft(value);
        }}
      />
      <Badge raw={draft} book={book} />

      <button type="button" className="mini" onClick={() => setOpen((v) => !v)}>
        {open ? '용어 검색 닫기' : '한글 용어로 찾기'}
      </button>

      {open ? (
        <div className="termbox">
          <input
            autoFocus
            value={query}
            placeholder="형체력 · 배럴온도 · 시리얼번호 …"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() === '' ? (
            <p className="hint">용어·별칭·영문·식별자 어느 쪽으로도 찾습니다.</p>
          ) : hits.length === 0 ? (
            <p className="hint">
              용어집에 없습니다. 표준 사전에도 없다면 자체 IRI를 발급하고 용어집에 등록하십시오.
            </p>
          ) : (
            <ul>
              {hits.map((t) => (
                <li key={t.semanticId}>
                  <button type="button" onClick={() => pick(t)}>
                    <b>{t.term}</b>
                    <i>{t.nameEn}</i>
                    <span className="sem">{formatSemanticId(parseSemanticId(t.semanticId))}</span>
                    {t.unit ? <span className="unit">{t.unit}</span> : null}
                    <span className={`org ${t.origin}`}>{t.origin === 'idta' ? '표준' : '사내'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <em>IEC CDD IRDI · eCl@ss IRDI · IDTA IRI. 추측해서 쓰지 마십시오.</em>
    </div>
  );
}
