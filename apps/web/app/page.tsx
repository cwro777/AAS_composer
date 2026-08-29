const ROUTES = [
  { href: '/editor', label: '에디터', phase: 'P4', note: '캔버스 · 트리 · 표 세 뷰' },
  { href: '/dashboard/models', label: '모델 자산 관리', phase: 'P9', note: '표준 준수 히트맵 · 검증 이슈 큐' },
  { href: '/dashboard/operations', label: '설비 운전 모니터링', phase: 'P9', note: '수집 지연을 1급 지표로' },
];

export default function Home() {
  return (
    <main style={{ maxWidth: '46rem', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '0.66rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          margin: '0 0 0.8rem',
        }}
      >
        IEC 63278 · V3.0 · 스캐폴드
      </p>
      <h1 style={{ fontSize: '2rem', letterSpacing: '-0.02em', margin: '0 0 0.6rem' }}>AAS Composer</h1>
      <p style={{ color: 'var(--ink-2)', margin: '0 0 2rem', lineHeight: 1.7 }}>
        커널(<code>@aas/kernel</code>)과 템플릿 레지스트리는 동작합니다. 아래 화면은 아직 만들지
        않았습니다 — 각 항목의 단계 표시가 계획서(<code>docs/plan.html</code>)의 단계와 같습니다.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {ROUTES.map((r) => (
          <li
            key={r.href}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '0.75rem',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r)',
              background: 'var(--surface)',
              padding: '0.7rem 0.9rem',
            }}
          >
            <span style={{ fontWeight: 600 }}>{r.label}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--ink-3)' }}>{r.href}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--ink-2)', fontSize: '0.8rem' }}>{r.note}</span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '0.66rem',
                fontWeight: 700,
                background: 'var(--surface-3)',
                color: 'var(--ink-2)',
                borderRadius: '3px',
                padding: '0.15rem 0.4rem',
              }}
            >
              {r.phase}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
