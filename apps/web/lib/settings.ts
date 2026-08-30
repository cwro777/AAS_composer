'use client';

/**
 * 저작 설정 — 문서가 아니라 **이 사람의 작업 환경**이다.
 *
 * 사내 네임스페이스가 코드에 박혀 있으면, 도메인이 다른 곳에서는 열자마자 모든
 * 식별자가 경고로 뜨고 고칠 방법이 없다. 그래서 값으로 뺀다.
 *
 * 기본값은 `NEXT_PUBLIC_IRI_PREFIX`이고, 이것은 서버의 `IRI_PREFIX`와 **같아야 한다**.
 * 다르면 에디터가 통과시킨 것이 서버에서 경고로 뜬다 — 같은 커널을 쓰는 의미가 사라진다.
 *
 * 문서 상태(Zustand editor)와 섞지 않는다. 네임스페이스를 바꾼다고 문서가 더러워지거나
 * 실행취소 이력이 생기면 안 된다.
 */

import { create } from 'zustand';

const KEY = 'aas-composer/settings/v1';

export const DEFAULT_IRI_PREFIX =
  process.env['NEXT_PUBLIC_IRI_PREFIX'] ?? 'https://bnb.co.kr/ids';

interface SettingsState {
  /** 비우면 네임스페이스 검사를 하지 않는다 */
  iriPrefix: string;
  restored: boolean;
  setIriPrefix: (v: string) => void;
  /** 브라우저 저장소에서 복원. 서버 렌더와 어긋나지 않게 마운트 뒤에 부른다 */
  restore: () => void;
}

export const useSettings = create<SettingsState>()((set) => ({
  iriPrefix: DEFAULT_IRI_PREFIX,
  restored: false,

  setIriPrefix: (v) => {
    const iriPrefix = v.trim();
    set({ iriPrefix });
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ iriPrefix }));
    } catch {
      /* 저장하지 못해도 이번 세션에서는 적용된다 */
    }
  },

  restore: () => {
    try {
      const raw = window.localStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as { iriPrefix?: unknown }) : null;
      if (typeof saved?.iriPrefix === 'string') set({ iriPrefix: saved.iriPrefix });
    } catch {
      /* 읽지 못하면 기본값으로 간다 */
    }
    set({ restored: true });
  },
}));
