'use client';

/**
 * 파일 — 새로 만들기 · 가져오기 · 내보내기 · 복사.
 *
 * 자동 저장은 브라우저 안에만 남는다. 남과 주고받는 것은 Environment JSON 파일이다.
 *
 * **서버에 보내기**는 다르다 — 수집과 시계열은 서버에만 있으므로, 설비를 붙이려면
 * 모델이 서버에 있어야 한다. 지금은 새 모델로 만들기만 한다(덮어쓰기·버전 잠금은 미구현).
 */

import { useRef, useState } from 'react';

import { emptyDoc } from '@aas/kernel';

import { API_BASE, type ApiError, createModel } from '../lib/api';
import { treeLayout } from '../lib/layout';
import {
  buildAasx,
  buildExport,
  clearLocal,
  downloadBytes,
  downloadText,
  environmentText,
  importEnvironment,
  suggestFilename,
} from '../lib/persist';
import { useEditor } from '../lib/store';
import { useTerms } from '../lib/terms';

export function FileMenu(): React.JSX.Element {
  const doc = useEditor((s) => s.doc);
  const layout = useEditor((s) => s.layout);
  const load = useEditor((s) => s.load);
  const notify = useEditor((s) => s.notify);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const empty = Object.keys(doc.nodes).length === 0;

  const onPick = async (file: File): Promise<void> => {
    try {
      const { doc: next, warnings } = importEnvironment(await file.text());
      const count = Object.keys(next.nodes).length;
      if (count === 0) {
        notify(`${file.name}: 읽을 수 있는 AAS 요소가 없습니다.`);
        return;
      }
      /* 좌표는 파일에 없다 — 트리 배치로 만들어 캔버스에서 바로 보이게 한다 */
      load(next, { pos: treeLayout(next), collapsed: {}, label: {} });
      notify(
        warnings.length
          ? `${file.name}: 노드 ${count}개. 경고 ${warnings.length}건 — ${warnings[0]}`
          : `${file.name}: 노드 ${count}개를 불러왔습니다.`,
      );
    } catch (e) {
      notify(`JSON을 해석할 수 없습니다: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!empty && !window.confirm('현재 모델을 지우고 새로 시작할까요? 되돌릴 수 없습니다.')) {
            return;
          }
          clearLocal();
          load(emptyDoc());
          notify('새 모델을 시작했습니다.');
        }}
      >
        새로 만들기
      </button>

      <button type="button" onClick={() => fileRef.current?.click()}>
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
          if (f) void onPick(f);
        }}
      />

      <button
        type="button"
        disabled={empty}
        onClick={() => {
          /* 검증 패널과 같은 용어집을 봐야 한다 — 화면과 파일이 갈라지면 손실을 못 알아챈다 */
          const book = useTerms.getState().book();
          const { concepts, unresolved } = buildExport(doc, book);
          downloadText(suggestFilename(doc), environmentText(doc, book));
          notify(
            unresolved
              ? `${suggestFilename(doc)} — 개념 ${concepts}건 포함, ${unresolved}건은 단위·정의를 몰라 빠졌습니다.`
              : `${suggestFilename(doc)} — 개념 ${concepts}건을 함께 담았습니다.`,
          );
        }}
      >
        내보내기
      </button>

      <button
        type="button"
        disabled={empty}
        title="OPC 패키지. 첨부까지 한 묶음으로 주고받는 형식입니다."
        onClick={() => {
          const { bytes, concepts, missingFiles } = buildAasx(doc, useTerms.getState().book());
          const name = suggestFilename(doc).replace(/\.json$/, '.aasx');
          downloadBytes(name, bytes, 'application/asset-administration-shell-package');
          notify(
            missingFiles
              ? `${name} — 개념 ${concepts}건 포함. File 요소 ${missingFiles}건의 첨부는 아직 담지 못합니다.`
              : `${name} — 개념 ${concepts}건을 함께 담았습니다.`,
          );
        }}
      >
        AASX
      </button>

      <button
        type="button"
        disabled={empty || sending}
        title="수집·시계열은 서버에만 있습니다. 운전 모니터링을 붙이려면 여기서 보냅니다."
        onClick={() => {
          setSending(true);
          const shell = doc.roots.map((r) => doc.nodes[r]).find((n) => n?.t === 'shell');
          createModel(shell?.idShort || 'AAS 모델', doc, layout)
            .then((r) => notify(`서버에 보냈습니다 — ${r.id.slice(0, 8)}. 운전 모니터링에서 보입니다.`))
            .catch((e: ApiError) =>
              notify(
                e.offline
                  ? `API 서버에 닿지 못했습니다 (${API_BASE}). pnpm dev로 함께 띄우십시오.`
                  : `서버가 거절했습니다: ${e.code}`,
              ),
            )
            .finally(() => setSending(false));
        }}
      >
        {sending ? '보내는 중…' : '서버에 보내기'}
      </button>

      <button
        type="button"
        disabled={empty}
        onClick={() => {
          const text = environmentText(doc, useTerms.getState().book());
          navigator.clipboard.writeText(text).then(
            () => notify(`JSON을 복사했습니다 (${text.length.toLocaleString()}자).`),
            () => notify('복사하지 못했습니다. 아래 출력 JSON에서 직접 선택하십시오.'),
          );
        }}
      >
        복사
      </button>
    </>
  );
}
