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

import { API_BASE, type ApiError, createModel, importDictionary, publishModel } from '../lib/api';
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
  const [publishing, setPublishing] = useState(false);
  /** 이 세션에서 서버에 보낸 모델. 게시는 서버에 있는 것을 올린다 */
  const [serverId, setServerId] = useState<string | null>(null);
  const empty = Object.keys(doc.nodes).length === 0;

  /**
   * 서버에 보낸다. **용어집의 개념도 함께 보낸다** — 사내 용어집은 브라우저에만 있어서,
   * 보내지 않으면 서버가 단위·정의를 몰라 게시된 모델에서 빠진다.
   * 사전 넣기가 실패해도 모델은 이미 올라갔으므로 그 사실만 알린다.
   */
  const sendToServer = async (): Promise<string | null> => {
    setSending(true);
    try {
      const shell = doc.roots.map((r) => doc.nodes[r]).find((n) => n?.t === 'shell');
      const { id } = await createModel(shell?.idShort || 'AAS 모델', doc, layout);
      setServerId(id);

      const { env, concepts } = buildExport(doc, useTerms.getState().book());
      let sent = 0;
      if (concepts) {
        try {
          sent = (await importDictionary(env, `editor:${id}`)).concepts;
        } catch {
          notify(`서버에 보냈습니다 — ${id.slice(0, 8)}. 다만 개념 ${concepts}건을 사전에 넣지 못했습니다.`);
          return id;
        }
      }
      notify(
        `서버에 보냈습니다 — ${id.slice(0, 8)}.` +
          (sent ? ` 개념 ${sent}건도 사전에 넣었습니다.` : '') +
          ' 운전 모니터링에서 보입니다.',
      );
      return id;
    } catch (e) {
      const err = e as ApiError;
      notify(
        err.offline
          ? `API 서버에 닿지 못했습니다 (${API_BASE}). pnpm dev로 함께 띄우십시오.`
          : `서버가 거절했습니다: ${err.code}`,
      );
      return null;
    } finally {
      setSending(false);
    }
  };

  /**
   * BaSyx에 게시한다. 서버에 없는 모델이면 먼저 보낸다 — 두 번 누르게 하지 않는다.
   *
   * 오류가 있는 모델은 서버가 422로 막는다. 강행은 **사람이 보고 결정한다** — 깨진 모델을
   * 저장소에 올리면 받는 쪽이 먼저 곤란해진다.
   */
  const publishToBasyx = async (force = false): Promise<void> => {
    const id = serverId ?? (await sendToServer());
    if (!id) return;
    setPublishing(true);
    try {
      const r = await publishModel(id, { force });
      const failed = r.items.filter((i) => !i.ok);
      notify(
        `BaSyx에 ${r.ok}건 올렸습니다 (개념 ${r.concepts}건 포함).` +
          (failed.length ? ` 실패 ${failed.length}건 — ${failed[0]!.idShort} ${failed[0]!.status}.` : '') +
          (r.unresolved.length
            ? ` 사전이 모르는 개념 ${r.unresolved.length}건은 단위·정의 없이 나갔습니다.`
            : ''),
      );
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 422) {
        const n = (err.body as { errors?: number } | null)?.errors ?? 0;
        if (window.confirm(`검증 오류 ${n}건이 있습니다.\n깨진 모델을 올리면 받는 쪽이 먼저 곤란해집니다.\n\n그래도 게시할까요?`)) {
          setPublishing(false);
          await publishToBasyx(true);
          return;
        }
        notify(`게시하지 않았습니다 — 검증 오류 ${n}건을 먼저 고치십시오.`);
      } else if (err.status === 502) {
        const target = (err.body as { target?: string } | null)?.target ?? '';
        notify(`BaSyx에 닿지 못했습니다 (${target}). scripts\\aas full로 띄우십시오.`);
      } else {
        notify(
          err.offline
            ? `API 서버에 닿지 못했습니다 (${API_BASE}).`
            : `게시가 거절됐습니다: ${err.code}`,
        );
      }
    } finally {
      setPublishing(false);
    }
  };

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
        onClick={() => void sendToServer()}
      >
        {sending ? '보내는 중…' : '서버에 보내기'}
      </button>

      <button
        type="button"
        disabled={empty || publishing}
        title="BaSyx V2(AAS V3 API)에 셸·서브모델·개념 설명을 등록합니다. 보내지 않은 모델은 먼저 서버에 보냅니다."
        onClick={() => void publishToBasyx()}
      >
        {publishing ? '게시 중…' : 'BaSyx에 게시'}
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
