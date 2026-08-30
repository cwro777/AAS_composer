'use client';

/**
 * 하단 서랍 — 출력 JSON과 검증 이슈.
 *
 * 이슈를 누르면 그 노드로 간다. 규격(core) 이슈는 aas-core3.0이 경로만 주므로
 * 커널의 `pathIndex`로 노드를 찾는다. 경로가 요소 안쪽을 가리키면 가장 가까운 조상으로 접힌다.
 */

import { useState } from 'react';

import { type UiIssue, useIssues, useJson } from '../lib/derived';
import { useEditor } from '../lib/store';

const LAYER_LABEL: Record<UiIssue['layer'], string> = {
  core: '규격',
  policy: '정책',
  template: '템플릿',
};

export function Drawer(): React.JSX.Element {
  const doc = useEditor((s) => s.doc);
  const select = useEditor((s) => s.select);
  const [tab, setTab] = useState<'json' | 'issues'>('json');
  const json = useJson(doc);
  const issues = useIssues(doc);

  const errors = issues.filter((i) => i.severity === 'error').length;
  const badge = errors ? 'e' : issues.length ? 'w' : 'o';

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
      </div>

      <div className="panes">
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
                  <span className={`sv ${i.severity}`}>{i.severity === 'error' ? 'ERROR' : i.severity === 'warn' ? 'WARN' : 'INFO'}</span>
                  <span className="lay">{LAYER_LABEL[i.layer]}</span>
                  <span className="code">{i.code}</span>
                  <span className="msg">{i.text}</span>
                  <span className="loc">{i.path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
