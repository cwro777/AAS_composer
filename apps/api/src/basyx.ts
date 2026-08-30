/**
 * BaSyx V2 게시 (AAS V3 API).
 *
 * 원칙 (계획서 09장): **부분 실패를 롤백하지 않는다.** 셸 20개 중 3개가 실패했을 때
 * 전부 지우는 것은 도움이 되지 않는다. 항목별 결과를 돌려주고 실패한 것만 다시 시도한다.
 *
 * `{smId}`는 전역 id를 Base64URL로 인코딩한 값이다. 이 인코딩을 틀리면 404가 나는데,
 * 원인을 찾기 어려우므로 한 곳에서만 만든다.
 */

import type { Environment, Json } from '@aas/kernel';

/** AAS V3 API의 식별자 인코딩 — Base64URL, 패딩 없음 */
export function encodeId(id: string): string {
  const b64 = Buffer.from(id, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface PublishItem {
  kind: 'shell' | 'submodel';
  id: string;
  idShort: string;
  status: number;
  ok: boolean;
  /** 이미 있어서 갱신한 경우 */
  updated: boolean;
  error?: string;
}

export interface PublishResult {
  target: string;
  items: PublishItem[];
  ok: number;
  failed: number;
}

interface Identifiable {
  id?: unknown;
  idShort?: unknown;
}

function idsOf(env: Environment, key: string): Array<{ id: string; idShort: string; body: Json }> {
  const list = env[key];
  if (!Array.isArray(list)) return [];
  return list
    .filter((x): x is Json & Identifiable => typeof x === 'object' && x !== null)
    .map((x) => ({
      id: typeof x.id === 'string' ? x.id : '',
      idShort: typeof x.idShort === 'string' ? x.idShort : '',
      body: x as Json,
    }))
    .filter((x) => x.id !== '');
}

/**
 * 셸과 서브모델을 등록한다.
 *
 * 이미 있으면 PUT으로 갱신한다 — 두 번 눌렀을 때 409가 쌓이는 것보다 낫다.
 */
export async function publish(
  env: Environment,
  opts: { baseUrl: string; fetchLike: FetchLike; apiKey?: string },
): Promise<PublishResult> {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.apiKey) headers['Authorization'] = `Bearer ${opts.apiKey}`;

  const items: PublishItem[] = [];

  const send = async (
    kind: 'shell' | 'submodel',
    collection: string,
    entry: { id: string; idShort: string; body: Json },
  ): Promise<void> => {
    const body = JSON.stringify(entry.body);
    let res = await opts.fetchLike(`${base}/${collection}`, { method: 'POST', headers, body });
    let updated = false;

    /* 이미 있으면 갱신한다 */
    if (res.status === 409) {
      updated = true;
      res = await opts.fetchLike(`${base}/${collection}/${encodeId(entry.id)}`, {
        method: 'PUT',
        headers,
        body,
      });
    }

    items.push({
      kind,
      id: entry.id,
      idShort: entry.idShort,
      status: res.status,
      ok: res.ok,
      updated,
      ...(res.ok ? {} : { error: (await res.text().catch(() => '')).slice(0, 300) }),
    });
  };

  /* 서브모델을 먼저 올린다 — 셸이 참조하기 때문이다 */
  for (const sm of idsOf(env, 'submodels')) await send('submodel', 'submodels', sm);
  for (const shell of idsOf(env, 'assetAdministrationShells')) {
    await send('shell', 'shells', shell);
  }

  return {
    target: base,
    items,
    ok: items.filter((i) => i.ok).length,
    failed: items.filter((i) => !i.ok).length,
  };
}

/** 값 하나만 갱신한다 — 수집 경로가 쓰는 문이다 */
export async function patchValue(
  opts: { baseUrl: string; fetchLike: FetchLike; apiKey?: string },
  submodelId: string,
  idShortPath: string,
  value: Json,
): Promise<{ ok: boolean; status: number }> {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.apiKey) headers['Authorization'] = `Bearer ${opts.apiKey}`;
  const url = `${base}/submodels/${encodeId(submodelId)}/submodel-elements/${idShortPath}/$value`;
  const res = await opts.fetchLike(url, { method: 'PATCH', headers, body: JSON.stringify(value) });
  return { ok: res.ok, status: res.status };
}
