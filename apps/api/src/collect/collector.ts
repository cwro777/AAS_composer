/**
 * 값 수집기.
 *
 * 계획(AID)에서 나온 접점에 붙어 값을 받고, 두 곳에 쓴다:
 *   1. 시계열 저장소 — 이력
 *   2. AAS의 해당 노드 — **마지막 값 한 벌만**
 *
 * AAS는 구조와 의미의 원본이지 시계열 데이터베이스가 아니다(P0 실측).
 *
 * 프로토콜은 어댑터 뒤에 둔다. 테스트는 가짜 어댑터로 돌고, 실제 MQTT·OPC UA는 같은
 * 인터페이스다. **어댑터가 없는 프로토콜은 없다고 말한다** — 있는 척하지 않는다.
 */

import type { Protocol, SignalPlan, SourcePlan } from './plan.js';

export interface IncomingSample {
  signal: string;
  node: string;
  /** 문자열이면 textValue로, 숫자로 읽히면 numValue로 간다 */
  raw: string;
  at: Date;
}

export interface StoredSample {
  modelId: string;
  node: string;
  signal: string;
  semanticId: string | null;
  unit: string | null;
  at: Date;
  numValue: number | null;
  textValue: string | null;
}

/** 신호 하나의 현재 상태 — 마지막 값과 그것이 들어온 시각 */
export interface SignalSummary {
  signal: string;
  node: string;
  unit: string | null;
  semanticId: string | null;
  lastAt: string;
  numValue: number | null;
  textValue: string | null;
  count: number;
}

export interface SampleStore {
  insert(samples: StoredSample[]): Promise<number>;
  recent(modelId: string, signal?: string, limit?: number): Promise<StoredSample[]>;
  count(modelId: string): Promise<number>;
  /**
   * 신호별 **마지막 한 건**. 수집 지연을 재는 근거다.
   *
   * 최근 N건을 받아 화면에서 묶으면 안 된다 — 수다스러운 신호 하나가 창을 다 채우면
   * 조용한 신호가 목록에서 사라지고, 멈춘 신호가 그렇게 보이지 않게 된다.
   */
  summary(modelId: string): Promise<SignalSummary[]>;
}

export type StopFn = () => Promise<void>;

export interface SourceAdapter {
  protocol: Protocol;
  /**
   * 붙어서 값이 올 때마다 onSample을 부른다. 되돌려주는 함수로 끊는다.
   *
   * 값으로 삼을 수 없는 것(주소를 못 찾음, 상태 코드 Bad)은 onSample이 아니라
   * onProblem으로 보낸다 — 시계열에 가짜 값이 섞이지 않게, 그러나 조용하지도 않게.
   */
  start(
    source: SourcePlan,
    onSample: (s: IncomingSample) => void,
    onProblem?: (reason: string) => void,
  ): Promise<StopFn>;
}

export interface JobStatus {
  modelId: string;
  startedAt: string;
  sources: Array<{ interfaceName: string; protocol: Protocol; base: string; signals: number }>;
  received: number;
  lastAt: string | null;
  lastError: string | null;
  /** 어댑터가 없어 붙지 못한 인터페이스 */
  skipped: Array<{ interfaceName: string; protocol: Protocol; reason: string }>;
  /** 붙은 뒤에 생긴 읽기 문제. 최근 것부터 최대 20건 */
  problems: string[];
}

export interface Collector {
  start(modelId: string, plan: { sources: SourcePlan[] }): Promise<JobStatus>;
  stop(modelId: string): Promise<boolean>;
  status(modelId?: string): JobStatus[];
  stopAll(): Promise<void>;
}

interface Job {
  status: JobStatus;
  stops: StopFn[];
}

function toStored(
  modelId: string,
  sig: SignalPlan,
  s: IncomingSample,
): StoredSample {
  const n = Number(s.raw);
  const numeric = s.raw.trim() !== '' && Number.isFinite(n);
  return {
    modelId,
    node: sig.node,
    signal: sig.name,
    semanticId: sig.semanticId,
    unit: sig.unit,
    at: s.at,
    numValue: numeric ? n : null,
    textValue: numeric ? null : s.raw,
  };
}

export interface CollectorOptions {
  adapters: SourceAdapter[];
  store: SampleStore;
  /** 마지막 값을 AAS 노드에 되쓴다. 없으면 시계열에만 쌓는다 */
  onLatest?: (modelId: string, sample: StoredSample) => void;
  now?: () => Date;
}

export function createCollector(opts: CollectorOptions): Collector {
  const jobs = new Map<string, Job>();
  const now = opts.now ?? ((): Date => new Date());

  return {
    async start(modelId, plan) {
      await this.stop(modelId);

      const job: Job = {
        status: {
          modelId,
          startedAt: now().toISOString(),
          sources: [],
          received: 0,
          lastAt: null,
          lastError: null,
          skipped: [],
          problems: [],
        },
        stops: [],
      };

      for (const source of plan.sources) {
        const adapter = opts.adapters.find((a) => a.protocol === source.protocol);
        if (!adapter) {
          job.status.skipped.push({
            interfaceName: source.interfaceName,
            protocol: source.protocol,
            reason: `${source.protocol} 어댑터가 없습니다.`,
          });
          continue;
        }
        if (source.signals.length === 0) {
          job.status.skipped.push({
            interfaceName: source.interfaceName,
            protocol: source.protocol,
            reason: '읽을 신호가 없습니다.',
          });
          continue;
        }

        const byName = new Map(source.signals.map((s) => [s.name, s]));
        try {
          const stop = await adapter.start(
            source,
            (incoming) => {
              const sig = byName.get(incoming.signal);
              if (!sig) return;
              const stored = toStored(modelId, sig, incoming);
              job.status.received += 1;
              job.status.lastAt = stored.at.toISOString();
              void opts.store.insert([stored]).catch((e: unknown) => {
                job.status.lastError = `저장 실패: ${(e as Error).message}`;
              });
              opts.onLatest?.(modelId, stored);
            },
            (reason) => {
              const line = `${source.interfaceName}: ${reason}`;
              job.status.problems = [line, ...job.status.problems.filter((p) => p !== line)].slice(0, 20);
            },
          );
          job.stops.push(stop);
          job.status.sources.push({
            interfaceName: source.interfaceName,
            protocol: source.protocol,
            base: source.base,
            signals: source.signals.length,
          });
        } catch (e) {
          /* 한 접점이 죽어도 나머지는 계속 받는다 */
          job.status.skipped.push({
            interfaceName: source.interfaceName,
            protocol: source.protocol,
            reason: `붙지 못했습니다: ${(e as Error).message}`,
          });
        }
      }

      jobs.set(modelId, job);
      return job.status;
    },

    async stop(modelId) {
      const job = jobs.get(modelId);
      if (!job) return false;
      for (const s of job.stops) await s().catch(() => undefined);
      jobs.delete(modelId);
      return true;
    },

    status(modelId) {
      const list = [...jobs.values()].map((j) => j.status);
      return modelId ? list.filter((s) => s.modelId === modelId) : list;
    },

    async stopAll() {
      for (const id of [...jobs.keys()]) await this.stop(id);
    },
  };
}

/** 테스트용 메모리 시계열 저장소 */
export function createMemorySampleStore(): SampleStore {
  const rows: StoredSample[] = [];
  return {
    async insert(samples) {
      rows.push(...samples);
      return samples.length;
    },
    async recent(modelId, signal, limit = 50) {
      return rows
        .filter((r) => r.modelId === modelId && (signal === undefined || r.signal === signal))
        .slice(-limit)
        .reverse();
    },
    async count(modelId) {
      return rows.filter((r) => r.modelId === modelId).length;
    },
    async summary(modelId) {
      const last = new Map<string, SignalSummary>();
      for (const r of rows.filter((x) => x.modelId === modelId)) {
        const prev = last.get(r.signal);
        const at = r.at.toISOString();
        if (prev && prev.lastAt > at) {
          last.set(r.signal, { ...prev, count: prev.count + 1 });
          continue;
        }
        last.set(r.signal, {
          signal: r.signal,
          node: r.node,
          unit: r.unit,
          semanticId: r.semanticId,
          lastAt: at,
          numValue: r.numValue,
          textValue: r.textValue,
          count: (prev?.count ?? 0) + 1,
        });
      }
      return [...last.values()].sort((a, b) => a.signal.localeCompare(b.signal));
    },
  };
}
