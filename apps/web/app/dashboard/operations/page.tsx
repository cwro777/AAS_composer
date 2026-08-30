'use client';

/**
 * /dashboard/operations — 설비 운전 모니터링 (P9).
 *
 * 이 화면이 답해야 하는 질문은 하나다: **지금 값이 들어오고 있는가.**
 * 그래서 값보다 먼저 보이는 것이 지연이고, 값이 온 적 없는 신호가 목록에서
 * 빠지지 않으며, 붙지 못한 접점은 이유와 함께 남는다.
 *
 * 서버가 없을 때·모델이 없을 때·수집을 켜지 않았을 때를 각각 다른 화면으로 안내한다.
 * 세 경우에 사용자가 할 일이 전부 다르기 때문이다.
 */

import { useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { SignalChart } from '../../../components/ops/SignalChart';
import {
  API_BASE,
  ApiError,
  type CollectJob,
  collectPlan,
  collectStatus,
  listModels,
  listSignals,
  startCollect,
  stopCollect,
  timeseries,
} from '../../../lib/api';
import { LAG_PRESETS, lagOf, worstLag } from '../../../lib/lag';

const REFRESH_MS = 3000;

export default function OperationsPage(): React.JSX.Element {
  const qc = useQueryClient();
  const [modelId, setModelId] = useState<string | null>(null);
  const [signal, setSignal] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number>(30_000);
  const [live, setLive] = useState(true);
  const poll = live ? REFRESH_MS : false;

  const models = useQuery({ queryKey: ['models'], queryFn: listModels });
  const status = useQuery({ queryKey: ['collect-status'], queryFn: collectStatus, refetchInterval: poll });

  /* 고르지 않았으면 첫 모델. 수집 중인 것이 있으면 그것을 먼저 본다 */
  const chosen = useMemo(() => {
    const list = models.data?.models ?? [];
    if (modelId && list.some((m) => m.id === modelId)) return modelId;
    const running = status.data?.jobs[0]?.modelId;
    return (running && list.some((m) => m.id === running) ? running : list[0]?.id) ?? null;
  }, [modelId, models.data, status.data]);

  const signals = useQuery({
    queryKey: ['signals', chosen],
    queryFn: () => listSignals(chosen!),
    enabled: Boolean(chosen),
    refetchInterval: poll,
  });

  const plan = useQuery({
    queryKey: ['plan', chosen],
    queryFn: () => collectPlan(chosen!),
    enabled: Boolean(chosen),
  });

  const rows = signals.data?.signals ?? [];
  const current = signal && rows.some((r) => r.signal === signal) ? signal : (rows[0]?.signal ?? null);

  const series = useQuery({
    queryKey: ['timeseries', chosen, current],
    queryFn: () => timeseries(chosen!, current!, 500),
    enabled: Boolean(chosen && current),
    refetchInterval: poll,
  });

  const job: CollectJob | undefined = status.data?.jobs.find((j) => j.modelId === chosen);

  const toggle = useMutation<unknown, ApiError>({
    mutationFn: async () => (job ? stopCollect(chosen!) : startCollect(chosen!)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['collect-status'] });
      void qc.invalidateQueries({ queryKey: ['signals', chosen] });
    },
  });

  /* 탭이 뒤에 있으면 굳이 3초마다 묻지 않는다 */
  useEffect(() => {
    const onVis = (): void => setLive(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const now = signals.data?.now ?? new Date().toISOString();
  const lags = rows.map((r) => lagOf(r.lastAt, now, threshold));
  const worst = worstLag(lags);

  /* ── 서버가 없다 ── */
  if (models.isError) {
    const e = models.error as ApiError;
    return (
      <Shell>
        <div className="state err">
          <h2>{e.offline ? 'API 서버에 닿지 못했습니다' : `서버가 거절했습니다 — ${e.code}`}</h2>
          <p>
            수집 상태와 시계열은 서버에만 있습니다. 이 화면은 <code>{API_BASE}</code>를 봅니다.
          </p>
          {e.offline ? (
            <pre>
              pnpm dev{'\n'}
              {'  '}또는 API만: pnpm --filter @aas/api dev
            </pre>
          ) : null}
          <button type="button" onClick={() => void models.refetch()}>
            다시 시도
          </button>
        </div>
      </Shell>
    );
  }

  if (models.isLoading) {
    return (
      <Shell>
        <div className="state">불러오는 중…</div>
      </Shell>
    );
  }

  /* ── 서버에 모델이 없다 ── */
  if ((models.data?.models.length ?? 0) === 0) {
    return (
      <Shell>
        <div className="state">
          <h2>서버에 모델이 없습니다</h2>
          <p>
            에디터는 브라우저 안에만 저장합니다. 수집을 붙이려면 모델을 서버로 보내야 합니다 —
            에디터 상단의 <b>서버에 보내기</b>를 쓰십시오.
          </p>
          <a href="/editor">에디터로 이동</a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="ops">
        <aside className="models">
          <h2>모델</h2>
          <ul>
            {(models.data?.models ?? []).map((m) => {
              const j = status.data?.jobs.find((x) => x.modelId === m.id);
              /* 수집을 켰다는 것과 실제로 붙었다는 것은 다르다 — 접점 0이면 켠 것이 아니다 */
              const dot = !j ? 'idle' : j.sources.length ? 'run' : 'fail';
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={m.id === chosen ? 'on' : ''}
                    onClick={() => {
                      setModelId(m.id);
                      setSignal(null);
                    }}
                  >
                    <span className="nm">{m.name}</span>
                    <span
                      className={`dot ${dot}`}
                      title={dot === 'run' ? '수집 중' : dot === 'fail' ? '켰지만 붙지 못함' : '멈춤'}
                    />
                    <span className="sub">
                      v{m.version}
                      {dot === 'run' ? ` · ${j!.received.toLocaleString()}건` : ''}
                      {dot === 'fail' ? ` · 붙지 못함 ${j!.skipped.length}건` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {status.data && !status.data.available ? (
            <p className="warnbox">
              서버에 수집기가 없습니다. <code>DATABASE_URL</code> 없이 뜬 API는 값을 둘 곳이 없어
              수집을 켜지 않습니다.
            </p>
          ) : null}
        </aside>

        <main className="panel">
          <div className="phead">
            <h2>{models.data?.models.find((m) => m.id === chosen)?.name ?? '—'}</h2>
            <label className="thr">
              지연 기준
              <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
                {LAG_PRESETS.map((p) => (
                  <option key={p.ms} value={p.ms}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={job ? 'stop' : 'start'}
              disabled={toggle.isPending || !status.data?.available}
              onClick={() => toggle.mutate()}
            >
              {toggle.isPending ? '…' : job ? '수집 정지' : '수집 시작'}
            </button>
          </div>

          {toggle.isError ? <ErrorNote error={toggle.error as ApiError} /> : null}

          <div className="kpis">
            <Kpi
              label="가장 낡은 값"
              value={worst ? worst.text : '—'}
              level={worst?.level}
              hint="이 설비의 상태는 가장 늦게 들어온 신호가 말한다"
            />
            <Kpi label="접점" value={job ? `${job.sources.length}` : '0'} hint="붙어 있는 인터페이스" />
            <Kpi
              label="신호"
              value={signals.isError ? '—' : `${rows.length}`}
              hint={signals.isError ? '목록을 읽지 못했습니다' : 'AID가 읽으라고 적어 둔 것'}
              level={signals.isError ? 'stale' : undefined}
            />
            <Kpi
              label="받은 값"
              value={job ? job.received.toLocaleString() : '0'}
              hint={job ? `시작 ${job.startedAt.slice(11, 19)}` : '수집을 켜지 않았습니다'}
            />
          </div>

          {!job ? (
            <div className="state inline">
              <h3>수집이 꺼져 있습니다</h3>
              {plan.data?.sources.length ? (
                <p>
                  AID에 접점 {plan.data.sources.length}개 ·{' '}
                  {plan.data.sources.reduce((n, s) => n + s.signals.length, 0)}개 신호가 있습니다 —{' '}
                  {plan.data.sources.map((s) => `${s.protocol} ${s.base}`).join(' · ')}
                </p>
              ) : (
                <p>
                  이 모델에는 읽을 접점이 없습니다. Asset Interfaces Description 서브모델을 채워야
                  수집할 곳을 알 수 있습니다.
                </p>
              )}
            </div>
          ) : null}

          <table className="sig">
            <thead>
              <tr>
                <th>신호</th>
                <th>접점</th>
                <th className="r">마지막 값</th>
                <th className="r">지연</th>
                <th className="r">건수</th>
                <th>주소</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const lag = lags[i]!;
                return (
                  <tr
                    key={r.signal}
                    className={`${r.signal === current ? 'on' : ''} ${r.retired ? 'retired' : ''}`}
                    onClick={() => setSignal(r.signal)}
                  >
                    <td>
                      <b>{r.signal}</b>
                      {r.retired ? <span className="tag">AID에서 빠짐</span> : null}
                    </td>
                    <td className="dim">
                      {r.interfaceName ?? '—'}
                      {r.protocol ? <span className="proto">{r.protocol}</span> : null}
                    </td>
                    <td className="r val">
                      {r.numValue ?? r.textValue ?? '—'}
                      {r.unit ? <span className="unit">{r.unit}</span> : null}
                    </td>
                    <td className={`r lag ${lag.level}`}>{lag.text}</td>
                    <td className="r dim">{r.count.toLocaleString()}</td>
                    <td className="dim addr" title={r.address ?? ''}>
                      {r.address ?? '—'}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={signals.isError ? 'center' : 'dim center'}>
                    {signals.isLoading ? (
                      '불러오는 중…'
                    ) : signals.isError ? (
                      /* 조회 실패를 "신호 없음"으로 보이면 안 된다 — 정반대의 상태다 */
                      <span className="failed">
                        신호 목록을 읽지 못했습니다 — {(signals.error as ApiError).code}
                      </span>
                    ) : (
                      'AID에 읽을 신호가 없습니다.'
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {current ? (
            <section className="series">
              <h3>
                {current}
                <span className="dim">
                  최근 {series.data?.count ?? 0}건 / 전체 {series.data?.total?.toLocaleString() ?? 0}건
                </span>
              </h3>
              <SignalChart
                samples={series.data?.samples ?? []}
                unit={rows.find((r) => r.signal === current)?.unit ?? null}
                now={now}
              />
            </section>
          ) : null}

          <Problems job={job} planProblems={plan.data?.problems ?? []} />
        </main>
      </div>

      <footer className="ticker">
        <span className={live ? 'on' : ''}>{live ? `${REFRESH_MS / 1000}초마다 갱신` : '탭이 뒤에 있어 멈춤'}</span>
        {signals.data ? <span>서버 시각 {now.slice(11, 19)}</span> : null}
        {job?.lastAt ? <span>마지막 수신 {job.lastAt.slice(11, 19)}</span> : null}
        <span className="dim">{API_BASE}</span>
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="dash">
      <header className="dhead">
        <a href="/" className="back">
          ←
        </a>
        <b>설비 운전 모니터링</b>
        <span className="dim">수집 지연이 1급 지표입니다</span>
        <a href="/editor" className="link">
          에디터
        </a>
      </header>
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  level,
}: {
  label: string;
  value: string;
  hint?: string;
  level?: string;
}): React.JSX.Element {
  /* 숫자가 아닌 값(“값이 온 적 없음”)에 모노 글꼴을 쓰면 한글이 벌어져 읽히지 않는다 */
  const numeric = /^[\d.,\s—-]*$/.test(value);
  return (
    <div className={`kpi ${level ?? ''}`}>
      <span className="klab">{label}</span>
      <span className={numeric ? 'kval' : 'kval text'}>{value}</span>
      {hint ? <span className="khint">{hint}</span> : null}
    </div>
  );
}

function ErrorNote({ error }: { error: ApiError }): React.JSX.Element {
  const body = error.body as { problems?: string[]; hint?: string } | null;
  const map: Record<string, string> = {
    NOTHING_TO_COLLECT: 'AID에서 읽을 접점을 찾지 못했습니다.',
    NO_COLLECTOR: '서버에 수집기가 없습니다 (DATABASE_URL 없이 떴습니다).',
    OFFLINE: 'API 서버에 닿지 못했습니다.',
  };
  return (
    <div className="note err">
      <b>{map[error.code] ?? error.code}</b>
      {body?.hint ? <span>{body.hint}</span> : null}
      {body?.problems?.map((p) => (
        <span key={p}>{p}</span>
      ))}
    </div>
  );
}

/**
 * 붙지 못한 접점과 읽기 문제.
 *
 * 접어 두지 않는다. 절반만 도는 수집을 성공으로 보이게 하지 않는 것이 이 화면의 요점이다.
 */
function Problems({
  job,
  planProblems,
}: {
  job: CollectJob | undefined;
  planProblems: string[];
}): React.JSX.Element | null {
  const skipped = job?.skipped ?? [];
  const problems = job?.problems ?? [];
  const all = skipped.length + problems.length + planProblems.length;
  if (all === 0) return null;

  return (
    <section className="problems">
      <h3>
        걸린 것 <span className="count">{all}</span>
      </h3>
      <ul>
        {skipped.map((s) => (
          <li key={`${s.interfaceName}-${s.reason}`} className="err">
            <b>{s.interfaceName}</b>
            <span className="proto">{s.protocol}</span>
            {s.reason}
          </li>
        ))}
        {problems.map((p) => (
          <li key={p} className="warn">
            {p}
          </li>
        ))}
        {planProblems.map((p) => (
          <li key={p} className="warn">
            {p}
          </li>
        ))}
        {job?.lastError ? <li className="err">{job.lastError}</li> : null}
      </ul>
    </section>
  );
}
