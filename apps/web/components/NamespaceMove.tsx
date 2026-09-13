'use client';

/**
 * 네임스페이스 옮기기 — 옛 접두어 아래의 우리 이름을 새 접두어로.
 *
 * 모델(커널 `planNamespaceMove`)과 용어집(`planGlossaryMove`)을 **함께** 옮긴다. 한쪽만
 * 옮기면 새 IRI마다 CD-001이 뜨거나, 용어집의 뜻이 아무도 쓰지 않는 옛 IRI에 매달린다.
 *
 * 무엇이 바뀌는지 먼저 보이고, 적용은 누를 때만 한다. 모델은 Ctrl+Z 한 번으로 되돌아가고,
 * 용어집은 문서가 아니라 실행취소가 닿지 않으므로 되돌리기 버튼을 따로 둔다.
 */

import { useMemo, useState } from 'react';

import { namespacesInDoc, planNamespaceMove } from '@aas/kernel';

import { useSettings } from '../lib/settings';
import { useEditor } from '../lib/store';
import { planGlossaryMove, useTerms } from '../lib/terms';

const KIND_LABEL = { identifier: '식별자', asset: '자산', concept: '개념' } as const;

export function NamespaceMove({ onClose }: { onClose: () => void }): React.JSX.Element {
  const doc = useEditor((s) => s.doc);
  const notify = useEditor((s) => s.notify);
  const entries = useTerms((s) => s.entries);
  const hasBackup = useTerms((s) => s.hasBackup);
  const iriPrefix = useSettings((s) => s.iriPrefix);
  const setIriPrefix = useSettings((s) => s.setIriPrefix);

  /* 옛 접두어 후보 — 모델과 사내 용어집에 쓰인 우리 발급 꼴. 지금 네임스페이스는 뺀다 */
  const candidates = useMemo(() => {
    const counts = new Map(namespacesInDoc(doc).map((c) => [c.prefix, c.count]));
    for (const e of entries) {
      const m = /^(https?:\/\/[^/]+(?:\/[^/]+)*?)\/(?:cd|sm|aas|asset)\//i.exec(e.semanticId);
      if (m && !m[1]!.includes('admin-shell.io')) counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
    }
    const current = iriPrefix.replace(/\/+$/, '');
    return [...counts.entries()]
      .filter(([p]) => p !== current)
      .sort((a, b) => b[1] - a[1])
      .map(([prefix, count]) => ({ prefix, count }));
  }, [doc, entries, iriPrefix]);

  const [from, setFrom] = useState(() => candidates[0]?.prefix ?? '');
  const [to, setTo] = useState(iriPrefix);

  const plan = useMemo(() => planNamespaceMove(doc, from, to), [doc, from, to]);
  const gplan = useMemo(
    () => (plan.ok ? planGlossaryMove(entries, doc, from, to) : null),
    [plan.ok, entries, doc, from, to],
  );

  const count = (k: keyof typeof KIND_LABEL): number => plan.steps.filter((s) => s.kind === k).length;
  const glossaryChanges = gplan ? gplan.moved.length + gplan.copied.length : 0;
  const total = plan.steps.length + glossaryChanges;
  const tail = (v: string, prefix: string): string => (v.startsWith(prefix) ? `…${v.slice(prefix.length)}` : v);

  const applyMove = (): void => {
    if (!plan.ok || total === 0) return;
    const s = useEditor.getState();
    if (plan.steps.length && !s.run(plan.cmds, '네임스페이스 옮기기')) {
      notify('모델을 옮기지 못했습니다. 문서가 바뀌었으면 다시 열어 보십시오.');
      return;
    }
    if (gplan && glossaryChanges) useTerms.getState().replaceEntries(gplan.next);
    const target = to.trim().replace(/\/+$/, '');
    if (target && target !== iriPrefix.replace(/\/+$/, '')) setIriPrefix(target);
    notify(
      `옮겼습니다 — 모델 ${plan.steps.length}곳, 용어집 ${glossaryChanges}건. ` +
        '모델은 Ctrl+Z 한 번, 용어집은 이 창의 "용어집 되돌리기"로 되돌립니다.',
    );
  };

  return (
    <div className="cform nsmove" role="dialog" aria-label="네임스페이스 옮기기">
      <div className="chead">
        <b>네임스페이스 옮기기</b>
        <code>옛 접두어 아래의 식별자·개념·용어집을 새 접두어로</code>
        <button type="button" className="mini" onClick={onClose} aria-label="닫기">
          닫기
        </button>
      </div>

      <div className="cgrid">
        <label>
          <span>옛 접두어</span>
          <input value={from} spellCheck={false} placeholder="https://cw.co.kr/ids" onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <span>새 접두어 (지금 사내 네임스페이스)</span>
          <input value={to} spellCheck={false} placeholder="https://cw1.co.kr/ids" onChange={(e) => setTo(e.target.value)} />
        </label>
        {candidates.length ? (
          <div className="nscands wide">
            <span>모델·용어집에서 찾은 옛 접두어</span>
            {candidates.map((c) => (
              <button
                key={c.prefix}
                type="button"
                className={c.prefix === from.replace(/\/+$/, '') ? 'on' : undefined}
                onClick={() => setFrom(c.prefix)}
              >
                <b>{c.prefix}</b> <small>{c.count}곳</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!plan.ok ? (
        <p className="nswarn">{plan.rejection?.ko}</p>
      ) : (
        <>
          <ul className="nssum">
            <li className="dir">
              <code>{plan.from}</code> → <code>{plan.to}</code>
            </li>
            <li>
              <b>모델</b> 식별자 {count('identifier')}
              {plan.references ? ` (가리키던 참조 ${plan.references}곳 함께)` : ''} · 자산 {count('asset')} · 개념{' '}
              {count('concept')}
            </li>
            <li>
              <b>용어집</b> 옮김 {gplan?.moved.length ?? 0} · 샘플·파일의 뜻을 새 IRI로 담음 {gplan?.copied.length ?? 0}
              {gplan?.conflicts.length ? ` · 새 IRI에 이미 있어 그대로 둔 것 ${gplan.conflicts.length}` : ''}
            </li>
            <li className="dim">
              admin-shell.io · IEC CDD(0112/…) · eCl@ss(0173-…) 식별자는 건드리지 않습니다.
            </li>
            {plan.rawMentions ? (
              <li className="dim">
                불러온 파일의 원본 데이터(raw)에 옛 접두어가 남아 있습니다 — 남의 데이터라 고치지 않습니다.
                내보낼 때 옛 IRI의 개념 설명이 함께 실릴 수 있습니다.
              </li>
            ) : null}
          </ul>

          {total === 0 ? (
            <p className="nswarn">옛 접두어 아래에 옮길 것이 없습니다.</p>
          ) : (
            <ul className="nslist">
              {plan.steps.slice(0, 300).map((s, k) => (
                <li key={`m${k}`}>
                  <span className="k">{KIND_LABEL[s.kind]}</span>
                  <span className="p" title={`${s.path} · ${s.field}`}>
                    {s.path}
                    {s.field === 'semanticId' || s.field === 'identifier' ? '' : ` · ${s.field}`}
                  </span>
                  <span className="v" title={`${s.before} → ${s.after}`}>
                    {tail(s.before, plan.from)}
                  </span>
                </li>
              ))}
              {gplan?.moved.map((g) => (
                <li key={`g${g.before}`}>
                  <span className="k">용어집</span>
                  <span className="p">{g.term}</span>
                  <span className="v" title={`${g.before} → ${g.after}`}>
                    {tail(g.before, plan.from)}
                  </span>
                </li>
              ))}
              {gplan?.copied.map((g) => (
                <li key={`c${g.after}`}>
                  <span className="k">용어집</span>
                  <span className="p">{g.term}</span>
                  <span className="v" title={g.after}>
                    {g.source === 'sample' ? '샘플' : '파일'}의 뜻을 <b>{tail(g.after, plan.to)}</b>로
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="cfoot">
        <span className="note">모델은 한 번의 실행취소로 되돌아갑니다. 적용하면 사내 네임스페이스도 새 접두어로 바뀝니다.</span>
        {hasBackup ? (
          <button
            type="button"
            className="ghost"
            onClick={() =>
              notify(useTerms.getState().undoReplace() ? '용어집을 옮기기 전으로 되돌렸습니다.' : '되돌릴 용어집이 없습니다.')
            }
          >
            용어집 되돌리기
          </button>
        ) : null}
        <button type="button" className="primary" disabled={!plan.ok || total === 0} onClick={applyMove}>
          옮기기 ({total})
        </button>
      </div>
    </div>
  );
}
