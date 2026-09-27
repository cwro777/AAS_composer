/**
 * API 클라이언트.
 *
 * 에디터는 브라우저 안에서만 살지만(localStorage), 수집·시계열은 서버에만 있다.
 * 이 파일이 그 경계다 — 여기서만 fetch를 한다.
 *
 * 오류를 문자열로 뭉개지 않는다. 서버가 준 코드(`NO_COLLECTOR`, `NOTHING_TO_COLLECT`)가
 * 화면의 안내 문구를 고르는 근거이기 때문이다. 서버가 아예 없는 경우(`offline`)와
 * 서버가 거절한 경우는 사용자가 할 일이 전혀 다르다.
 */

export const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8787';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: unknown,
  ) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
  }
  /** 서버에 닿지도 못했다 — 켜져 있지 않거나 주소가 다르다 */
  get offline(): boolean {
    return this.status === 0;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
    });
  } catch (e) {
    throw new ApiError(0, 'OFFLINE', (e as Error).message);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (body as { error?: string } | null)?.error ?? `HTTP_${res.status}`;
    throw new ApiError(res.status, code, body);
  }
  return body as T;
}

/* ── 모델 ───────────────────────────────────────── */

export interface ModelSummary {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  errors: number;
  warnings: number;
}

export const listModels = (): Promise<{ models: ModelSummary[] }> => call('/models');

export const createModel = (name: string, doc: unknown, layout?: unknown): Promise<{ id: string }> =>
  call('/models', { method: 'POST', body: JSON.stringify({ name, doc, layout }) });

export interface PublishItem {
  kind: 'shell' | 'submodel' | 'concept';
  id: string;
  idShort: string;
  status: number;
  ok: boolean;
  updated: boolean;
  error?: string;
}

export interface PublishResult {
  target: string;
  items: PublishItem[];
  ok: number;
  failed: number;
  /** 함께 올린 개념 설명 수 */
  concepts: number;
  /** 서버 사전도 샘플도 몰라 올리지 못한 개념 */
  unresolved: string[];
  /** 사전은 알지만 mock(가정·창작 자료)이라 일부러 빼고 올린 개념 */
  mock: string[];
}

/**
 * BaSyx V2에 게시한다. 오류가 있는 모델은 서버가 422로 막는다 — `force`는 사람이 보고 누를 때만.
 * 일부만 실패하면 207과 함께 항목별 결과가 온다(롤백하지 않는다).
 */
export const publishModel = (id: string, opts?: { force?: boolean }): Promise<PublishResult> =>
  call(`/publish/${id}${opts?.force ? '?force=1' : ''}`, { method: 'POST' });

/**
 * 사내 용어집의 개념을 서버 사전에 넣는다.
 *
 * 브라우저 용어집은 서버에 없다. 이것을 보내지 않으면 게시된 모델에 단위·정의가 빠진다 —
 * 내보내기 파일과 게시가 서로 다른 것을 말하게 된다.
 */
export const importDictionary = (
  environment: unknown,
  origin: string,
): Promise<{ concepts: number; terms: number; total: number }> =>
  call('/dictionary/import', { method: 'POST', body: JSON.stringify({ environment, origin }) });

/* ── 사전 ───────────────────────────────────────── */

export interface DictEntry {
  irdi: string;
  scheme: string;
  source?: string | null;
  nameEn?: string | null;
  nameKo?: string | null;
  definition?: string | null;
  unit?: string | null;
  dataType?: string | null;
  status: string;
  origin?: string | null;
}

/** 여러 개를 한 번에. 모르는 것은 `missing`으로 온다 — 조용히 빠지지 않는다 */
export const lookupConcepts = (
  ids: string[],
): Promise<{ asked: number; entries: DictEntry[]; missing: string[] }> =>
  call('/dictionary/lookup', { method: 'POST', body: JSON.stringify({ ids }) });

export const dictionaryStatus = (): Promise<{ cached: number; upstream: string | null }> =>
  call('/dictionary/status');

/* ── 수집 ───────────────────────────────────────── */

export type Protocol = 'mqtt' | 'opcua' | 'http' | 'modbus' | 'unknown';

export interface CollectJob {
  modelId: string;
  startedAt: string;
  sources: Array<{ interfaceName: string; protocol: Protocol; base: string; signals: number }>;
  received: number;
  lastAt: string | null;
  lastError: string | null;
  skipped: Array<{ interfaceName: string; protocol: Protocol; reason: string }>;
  problems: string[];
}

export interface CollectPlan {
  submodel: string | null;
  sources: Array<{
    interfaceName: string;
    protocol: Protocol;
    base: string;
    signals: Array<{ name: string; address: string; unit: string | null }>;
  }>;
  problems: string[];
}

export const collectStatus = (): Promise<{ jobs: CollectJob[]; available: boolean }> =>
  call('/collect/status');

export const collectPlan = (id: string): Promise<CollectPlan> => call(`/collect/${id}/plan`);

export const startCollect = (id: string): Promise<CollectJob> =>
  call(`/collect/${id}/start`, { method: 'POST' });

export const stopCollect = (id: string): Promise<{ stopped: boolean }> =>
  call(`/collect/${id}/stop`, { method: 'POST' });

/* ── 신호와 시계열 ──────────────────────────────── */

export interface SignalRow {
  signal: string;
  node: string;
  interfaceName: string | null;
  protocol: Protocol | null;
  address: string | null;
  unit: string | null;
  semanticId: string | null;
  /** 한 번도 오지 않았으면 null — 그 상태를 감추지 않는다 */
  lastAt: string | null;
  numValue: number | null;
  textValue: string | null;
  count: number;
  retired?: boolean;
}

export interface SignalsResponse {
  /** 서버 시각. 지연은 이것으로 잰다 — 브라우저 시계는 어긋나 있을 수 있다 */
  now: string;
  signals: SignalRow[];
  problems: string[];
}

export const listSignals = (id: string): Promise<SignalsResponse> => call(`/models/${id}/signals`);

export interface Sample {
  signal: string;
  at: string;
  numValue: number | null;
  textValue: string | null;
  unit: string | null;
}

export const timeseries = (
  id: string,
  signal: string,
  limit = 500,
): Promise<{ count: number; total: number; samples: Sample[] }> =>
  call(`/models/${id}/timeseries?signal=${encodeURIComponent(signal)}&limit=${limit}`);
