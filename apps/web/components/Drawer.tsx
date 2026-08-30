'use client';

/**
 * 하단 서랍 — 출력 JSON과 검증 이슈.
 *
 * 이슈를 누르면 그 노드로 간다. 규격(core) 이슈는 aas-core3.0이 경로만 주므로
 * 커널의 `pathIndex`로 노드를 찾는다. 경로가 요소 안쪽을 가리키면 가장 가까운 조상으로 접힌다.
 *
 * 이슈 줄은 버튼이지만 **글자는 고를 수 있어야 한다.** 브라우저는 버튼 안에서
 * 드래그를 클릭으로 보기 때문에, 선택만 믿지 말고 복사 버튼을 따로 둔다.
 */

import { useEffect, useState } from 'react';

import { type UiIssue, useIssues, useJson } from '../lib/derived';
import { DEFAULT_IRI_PREFIX, useSettings } from '../lib/settings';
import { useEditor } from '../lib/store';
import { useTerms } from '../lib/terms';
import { ConceptForm } from './ConceptForm';

const LAYER_LABEL: Record<UiIssue['layer'], string> = {
  core: '규격',
  policy: '정책',
  template: '템플릿',
  dictionary: '사전',
};

const SEVERITY_LABEL = { error: 'ERROR', warn: 'WARN', info: 'INFO' } as const;

/** 붙여넣었을 때 표로 읽히도록 탭으로 나눈다 */
function asText(i: UiIssue): string {
  return [SEVERITY_LABEL[i.severity], i.code, i.path, i.text].filter(Boolean).join('\t');
}

/**
 * 클립보드는 실패할 수 있다 — 보안 컨텍스트가 아니거나 권한이 없을 때다.
 * 그때는 숨은 textarea로 옮겨 적는다. 조용히 실패하지 않는 것이 요점이다.
 */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function Drawer(): React.JSX.Element {
  const doc = useEditor((s) => s.doc);
  const select = useEditor((s) => s.select);
  const notify = useEditor((s) => s.notify);
  const iriPrefix = useSettings((s) => s.iriPrefix);
  const setIriPrefix = useSettings((s) => s.setIriPrefix);
  const restore = useSettings((s) => s.restore);
  const restoreTerms = useTerms((s) => s.restore);
  const [tab, setTab] = useState<'json' | 'issues'>('json');
  const json = useJson(doc);
  const issues = useIssues(doc);

  /* 서버 렌더와 어긋나지 않게 마운트 뒤에 읽는다 */
  useEffect(() => {
    restore();
    restoreTerms();
  }, [restore, restoreTerms]);

  const errors = issues.filter((i) => i.severity === 'error').length;
  const badge = errors ? 'e' : issues.length ? 'w' : 'o';

  const copyOne = (i: UiIssue): void => {
    void copy(asText(i)).then((ok) =>
      notify(ok ? '이슈를 복사했습니다.' : '복사하지 못했습니다. 글자를 직접 선택하십시오.'),
    );
  };

  const copyAll = (): void => {
    const text = `${['심각도', '코드', '경로', '내용'].join('\t')}\n${issues.map(asText).join('\n')}\n`;
    void copy(text).then((ok) =>
      notify(ok ? `이슈 ${issues.length}건을 복사했습니다.` : '복사하지 못했습니다.'),
    );
  };

  return (
    <section className="drawer">
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'json'}
          className={tab === 'json' ? 'on' : ''}
          onClick={() => setTab('json')}
        >
          출력 JSON
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'issues'}
          className={tab === 'issues' ? 'on' : ''}
          onClick={() => setTab('issues')}
        >
          검증 <span className={`count ${badge}`}>{issues.length}</span>
        </button>

        {tab === 'issues' ? (
          <div className="tabtools">
            <label className="ns" title="전역 식별자가 이 접두어로 시작하는지 검사합니다. 비우면 검사하지 않습니다.">
              사내 네임스페이스
              <input
                type="text"
                value={iriPrefix}
                spellCheck={false}
                placeholder="검사 안 함"
                onChange={(e) => setIriPrefix(e.target.value)}
              />
            </label>
            {iriPrefix !== DEFAULT_IRI_PREFIX ? (
              <button type="button" className="mini" onClick={() => setIriPrefix(DEFAULT_IRI_PREFIX)}>
                기본값
              </button>
            ) : null}
            <button type="button" className="mini" disabled={issues.length === 0} onClick={copyAll}>
              전체 복사
            </button>
          </div>
        ) : null}
      </div>

      <div className="panes">
        {tab === 'issues' ? <ConceptForm /> : null}
        {tab === 'json' ? (
          <pre className="json">{json}</pre>
        ) : issues.length === 0 ? (
          <p className="clean">✓ 모든 검사를 통과했습니다.</p>
        ) : (
          <ul className="issues">
            {issues.map((i, k) => (
              <li key={`${i.code}-${i.path}-${k}`}>
                <button
                  type="button"
                  className={i.node ? 'iss' : 'iss flat'}
                  disabled={!i.node}
                  onClick={() => i.node && select(i.node)}
                >
                  <span className={`sv ${i.severity}`}>{SEVERITY_LABEL[i.severity]}</span>
                  <span className="lay">{LAYER_LABEL[i.layer]}</span>
                  <span className="code">{i.code}</span>
                  <span className="msg">{i.text}</span>
                  <span className="loc">{i.path}</span>
                </button>
                {i.fix ? (
                  <button
                    type="button"
                    className="fix"
                    onClick={(e) => {
                      e.stopPropagation();
                      i.fix?.run();
                    }}
                  >
                    {i.fix.label}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="copy"
                  title="이 이슈를 복사합니다"
                  aria-label={`${i.code} 복사`}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyOne(i);
                  }}
                >
                  복사
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
