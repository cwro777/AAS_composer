'use client';

/**
 * 대시보드는 서버 상태를 본다 — TanStack Query가 그 자리다(CLAUDE.md 규약).
 * 에디터(Zustand)와 섞지 않는다. 에디터는 문서를 갖고, 여기는 서버를 비출 뿐이다.
 */

import { useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './dashboard.css';

export default function DashboardLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /* 값은 계속 바뀐다. 캐시를 오래 붙들면 화면이 조용히 낡는다 */
            staleTime: 0,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
