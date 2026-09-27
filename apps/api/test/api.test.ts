/**
 * API — 네트워크 없이 `app.request()`로 검사한다.
 *
 * 지키려는 것 세 가지:
 *  1. 서버가 **같은 커널**로 검증한다. 에디터가 통과시킨 것이 서버에서 거절되지 않는다.
 *  2. 충돌은 409로 잡히고, 절반만 적용된 문서를 남기지 않는다.
 *  3. 버전 비교가 "무엇이 바뀌었는지"를 문장으로 준다.
 */

import { describe, expect, it } from 'vitest';

import { type AasDoc, apply, emptyDoc, newNode } from '@aas/kernel';

import { createApp } from '../src/app.js';
import { createMemoryStore } from '../src/store.js';

function fresh(): ReturnType<typeof createApp> {
  let n = 0;
  let t = 0;
  return createApp(
    createMemoryStore({
      newId: () => `m${++n}`,
      now: () => new Date(Date.UTC(2026, 7, 30, 0, 0, ++t)).toISOString(),
    }),
  );
}

/** 셸 하나짜리 최소 문서 */
function seedDoc(): AasDoc {
  return apply(emptyDoc(), {
    t: 'insert',
    parent: null,
    index: 0,
    node: newNode('n1', 'shell', {
      idShort: 'IMM_150E_AAS',
      identifier: 'https://bnb.co.kr/ids/aas/imm',
      globalAssetId: 'https://bnb.co.kr/ids/asset/imm',
    }),
  }).doc;
}

async function createModel(app: ReturnType<typeof createApp>): Promise<{ id: string; version: number }> {
  const res = await app.request('/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '사출성형기 2호기', doc: seedDoc() }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { id: string; version: number };
  return body;
}

describe('모델 저장', () => {
  it('만들면 버전 1이고 ETag가 붙는다', async () => {
    const app = fresh();
    const res = await app.request('/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '사출성형기 2호기', doc: seedDoc() }),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('ETag')).toBe('1');
    const body = (await res.json()) as { version: number; issues: unknown[] };
    expect(body.version).toBe(1);
    /* 저장 시점에 서버도 검증한다 — 셸에 서브모델이 없으니 경고가 있어야 한다 */
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('형태가 아니면 400', async () => {
    const app = fresh();
    const res = await app.request('/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', doc: { nope: true } }),
    });
    expect(res.status).toBe(400);
  });

  it('없는 모델은 404', async () => {
    expect((await fresh().request('/models/nope')).status).toBe(404);
  });
});

describe('낙관적 잠금', () => {
  it('If-Match 없이는 덮어쓰지 않는다', async () => {
    const app = fresh();
    const { id } = await createModel(app);
    const res = await app.request(`/models/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doc: seedDoc() }),
    });
    expect(res.status).toBe(428);
  });

  it('버전이 어긋나면 409와 함께 다시 불러오라고 알린다', async () => {
    const app = fresh();
    const { id } = await createModel(app);
    /* 다른 탭이 먼저 저장한 상황 */
    await app.request(`/models/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'If-Match': '1' },
      body: JSON.stringify({ doc: seedDoc() }),
    });
    const stale = await app.request(`/models/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'If-Match': '1' },
      body: JSON.stringify({ doc: seedDoc() }),
    });
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { actual: number; hint: string };
    expect(body.actual).toBe(2);
    expect(body.hint).toContain('다시 불러온');
  });
});

describe('명령 로그', () => {
  it('명령을 덧붙이면 버전이 그만큼 오른다', async () => {
    const app = fresh();
    const { id } = await createModel(app);
    const res = await app.request(`/models/${id}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'If-Match': '1' },
      body: JSON.stringify({
        author: '홍길동',
        commands: [
          {
            t: 'insert',
            parent: 'n1',
            index: 0,
            node: newNode('n2', 'submodel', {
              idShort: 'Nameplate',
              identifier: 'https://bnb.co.kr/ids/sm/imm/nameplate',
            }),
          },
          { t: 'set', node: 'n1', path: 'idShort', value: 'IMM_150E_002_AAS' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number; doc: AasDoc };
    expect(body.version).toBe(3);
    expect(body.doc.nodes['n2']).toBeDefined();
    expect(body.doc.nodes['n1']!.idShort).toBe('IMM_150E_002_AAS');
  });

  it('커널이 거부하면 절반만 적용되지 않는다', async () => {
    const app = fresh();
    const { id } = await createModel(app);
    const res = await app.request(`/models/${id}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'If-Match': '1' },
      body: JSON.stringify({
        commands: [
          {
            t: 'insert',
            parent: 'n1',
            index: 0,
            node: newNode('n2', 'submodel', {
              idShort: 'Nameplate',
              identifier: 'https://bnb.co.kr/ids/sm/imm/nameplate',
            }),
          },
          /* Shell 안에는 Property를 넣을 수 없다 */
          { t: 'insert', parent: 'n1', index: 1, node: newNode('n3', 'prop', { idShort: 'Bad' }) },
        ],
      }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { at: number; rejected: { code: string } };
    expect(body.at).toBe(1);
    expect(body.rejected.code).toBe('CONTAINMENT');

    /* 첫 명령도 남지 않아야 한다 */
    const after = (await (await app.request(`/models/${id}`)).json()) as { version: number; doc: AasDoc };
    expect(after.version).toBe(1);
    expect(after.doc.nodes['n2']).toBeUndefined();
  });
});

describe('버전 비교', () => {
  it('무엇이 바뀌었는지 문장으로 준다', async () => {
    const app = fresh();
    const { id } = await createModel(app);
    await app.request(`/models/${id}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'If-Match': '1' },
      body: JSON.stringify({
        author: '홍길동',
        commands: [
          {
            t: 'insert',
            parent: 'n1',
            index: 0,
            node: newNode('n2', 'submodel', {
              idShort: 'Nameplate',
              identifier: 'https://bnb.co.kr/ids/sm/imm/nameplate',
            }),
          },
          { t: 'set', node: 'n2', path: 'kind', value: 'Instance' },
        ],
      }),
    });

    const res = await app.request(`/models/${id}/diff`);
    const body = (await res.json()) as { changes: Array<{ version: number; text: string; author: string }> };
    expect(body.changes).toHaveLength(2);
    expect(body.changes[0]!.text).toContain('Submodel Nameplate 추가');
    expect(body.changes[0]!.text).toContain('IMM_150E_AAS');
    /* 이전 값은 역명령에서 온다 — "A → B"로 읽혀야 한다 */
    expect(body.changes[1]!.text).toContain('kind');
    expect(body.changes[1]!.text).toContain('→');
    expect(body.changes[0]!.author).toBe('홍길동');
  });

  it('버전 목록이 나온다', async () => {
    const app = fresh();
    const { id } = await createModel(app);
    await app.request(`/models/${id}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'If-Match': '1' },
      body: JSON.stringify({ commands: [{ t: 'set', node: 'n1', path: 'idShort', value: 'X_AAS' }] }),
    });
    const body = (await (await app.request(`/models/${id}/versions`)).json()) as {
      current: number;
      versions: unknown[];
    };
    expect(body.current).toBe(2);
    expect(body.versions).toHaveLength(1);
  });
});

describe('내보내기', () => {
  it('AASX 바이트를 준다', async () => {
    const app = fresh();
    const { id } = await createModel(app);
    const res = await app.request(`/models/${id}/aasx`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('.aasx');
    const bytes = new Uint8Array(await res.arrayBuffer());
    /* ZIP은 PK로 시작한다 */
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes.length).toBeGreaterThan(200);
  });
});

describe('BaSyx 게시', () => {
  /** 실제 BaSyx 없이 응답을 흉내 낸다 */
  const fakeBasyx = (statusFor: (url: string) => number) => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchLike = async (url: string, init?: { method?: string }) => {
      calls.push({ url, method: init?.method ?? 'GET' });
      const status = statusFor(url);
      return { ok: status < 400, status, text: async () => (status < 400 ? '' : 'boom') };
    };
    return { calls, fetchLike };
  };

  const withStore = (fetchLike: ReturnType<typeof fakeBasyx>['fetchLike']): ReturnType<typeof createApp> =>
    createApp(createMemoryStore({ newId: () => 'm1', now: () => '2026-08-30T00:00:00.000Z' }), {
      fetchLike,
    });

  /** 서브모델 하나가 달린 셸 — 게시할 것이 있는 문서 */
  async function seeded(app: ReturnType<typeof createApp>): Promise<string> {
    const doc = apply(
      apply(emptyDoc(), {
        t: 'insert',
        parent: null,
        index: 0,
        node: newNode('n1', 'shell', {
          idShort: 'IMM_AAS',
          identifier: 'https://bnb.co.kr/ids/aas/imm',
          globalAssetId: 'https://bnb.co.kr/ids/asset/imm',
        }),
      }).doc,
      {
        t: 'insert',
        parent: 'n1',
        index: 0,
        node: newNode('n2', 'submodel', {
          idShort: 'Nameplate',
          identifier: 'https://bnb.co.kr/ids/sm/imm/nameplate',
          semanticId: 'https://admin-shell.io/idta/nameplate/3/0/Nameplate',
        }),
      },
    ).doc;
    const res = await app.request('/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'imm', doc }),
    });
    return ((await res.json()) as { id: string }).id;
  }

  it('서브모델을 먼저, 셸을 나중에 올린다 — 셸이 참조하기 때문이다', async () => {
    const fake = fakeBasyx(() => 201);
    const app = withStore(fake.fetchLike);
    const id = await seeded(app);

    const res = await app.request(`/publish/${id}`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: number; failed: number; items: Array<{ kind: string }> };
    expect(body.ok).toBe(2);
    expect(body.failed).toBe(0);
    expect(body.items.map((i) => i.kind)).toEqual(['submodel', 'shell']);
    expect(fake.calls.map((c) => c.url.replace('http://localhost:8081', ''))).toEqual([
      '/submodels',
      '/shells',
    ]);
  });

  it('이미 있으면 PUT으로 갱신한다 — 두 번 눌러도 409가 쌓이지 않는다', async () => {
    const fake = fakeBasyx((url) => (url.includes('/submodels/') ? 204 : url.endsWith('/submodels') ? 409 : 201));
    const app = withStore(fake.fetchLike);
    const id = await seeded(app);

    const res = await app.request(`/publish/${id}`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ updated: boolean; ok: boolean }> };
    expect(body.items[0]!.updated).toBe(true);
    expect(body.items[0]!.ok).toBe(true);
    /* Base64URL로 인코딩한 id로 PUT을 보냈는지 */
    expect(fake.calls[1]!.method).toBe('PUT');
    expect(fake.calls[1]!.url).toContain('/submodels/aHR0cHM6Ly9ibmIuY28ua3IvaWRzL3NtL2ltbS9uYW1lcGxhdGU');
  });

  it('일부만 실패하면 207과 항목별 결과를 준다 — 롤백하지 않는다', async () => {
    const fake = fakeBasyx((url) => (url.endsWith('/shells') ? 500 : 201));
    const app = withStore(fake.fetchLike);
    const id = await seeded(app);

    const res = await app.request(`/publish/${id}`, { method: 'POST' });
    expect(res.status).toBe(207);
    const body = (await res.json()) as { ok: number; failed: number; items: Array<{ error?: string }> };
    expect(body.ok).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.items[1]!.error).toContain('boom');
  });

  it('오류가 있는 모델은 막는다 — force로만 강행한다', async () => {
    const fake = fakeBasyx(() => 201);
    const app = withStore(fake.fetchLike);
    /* idShort가 숫자로 시작 → POL-NAME 오류. 식별자는 있으므로 올릴 것은 있다 */
    const doc = apply(emptyDoc(), {
      t: 'insert',
      parent: null,
      index: 0,
      node: newNode('n1', 'submodel', {
        idShort: '1Bad',
        identifier: 'https://bnb.co.kr/ids/sm/broken',
      }),
    }).doc;
    const id = ((await (
      await app.request('/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'broken', doc }),
      })
    ).json()) as { id: string }).id;

    const blocked = await app.request(`/publish/${id}`, { method: 'POST' });
    expect(blocked.status).toBe(422);
    expect(fake.calls).toHaveLength(0);

    const forced = await app.request(`/publish/${id}?force=1`, { method: 'POST' });
    expect(forced.status).toBe(200);
    expect(fake.calls.length).toBeGreaterThan(0);
  });

  /**
   * 개념 설명도 함께 올린다.
   *
   * 올리지 않으면 내보내기 파일에는 단위·정의가 있는데 게시된 것에는 없다 — 받는 쪽이
   * `0.34`를 해석하지 못한다(실측: 게시 뒤 BaSyx의 /concept-descriptions가 0건이었다).
   * 서버는 브라우저 용어집을 모르므로 **사전이 답한 것만** 올린다. 지어내지 않는다.
   */
  it('사전이 아는 개념을 개념 설명으로 함께 올린다 — 서브모델보다 먼저', async () => {
    const fake = fakeBasyx(() => 201);
    const app = withStore(fake.fetchLike);
    const id = await seeded(app);

    /* 에디터가 모델을 보낼 때 함께 넣는 것과 같은 경로 */
    await app.request('/dictionary/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entries: [
          {
            irdi: 'https://admin-shell.io/idta/nameplate/3/0/Nameplate',
            scheme: 'iri',
            status: 'unknown',
            nameEn: 'Digital nameplate',
            definition: 'Digital nameplate of the asset.',
          },
        ],
      }),
    });

    const res = await app.request(`/publish/${id}`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      concepts: number;
      unresolved: string[];
      items: Array<{ kind: string; id: string }>;
    };
    expect(body.concepts).toBe(1);
    expect(body.unresolved).toEqual([]);
    expect(body.items.map((i) => i.kind)).toEqual(['concept', 'submodel', 'shell']);
    expect(fake.calls[0]!.url).toContain('/concept-descriptions');
  });

  /**
   * mock은 우리가 지어내거나 라이선스를 가정한 자료다(파일이 스스로 "Do not ship"이라고 적는다).
   * 개발 중에는 사전이 답하게 두되, 남의 서버에 남기지 않는다.
   */
  it('mock 시드에서 온 개념은 빼고 올린다 — 무엇을 뺐는지 말한다', async () => {
    const fake = fakeBasyx(() => 201);
    const app = withStore(fake.fetchLike);
    const id = await seeded(app);

    await app.request('/dictionary/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origin: 'idta:MOCK-idta-missing-concepts.json',
        entries: [
          {
            irdi: 'https://admin-shell.io/idta/nameplate/3/0/Nameplate',
            scheme: 'iri',
            status: 'unknown',
            nameEn: 'Digital nameplate',
            definition: '지어낸 정의 — 내보내면 안 된다',
            origin: 'idta:MOCK-idta-missing-concepts.json',
          },
        ],
      }),
    });

    const res = await app.request(`/publish/${id}`, { method: 'POST' });
    const body = (await res.json()) as {
      concepts: number;
      mock: string[];
      unresolved: string[];
      items: Array<{ kind: string }>;
    };
    expect(body.concepts).toBe(0);
    expect(body.mock).toEqual(['https://admin-shell.io/idta/nameplate/3/0/Nameplate']);
    /* 뺀 것을 모르는 것으로 두 번 세지 않는다 */
    expect(body.unresolved).toEqual([]);
    expect(body.items.map((i) => i.kind)).toEqual(['submodel', 'shell']);
    expect(fake.calls.some((c) => c.url.includes('/concept-descriptions'))).toBe(false);
  });

  /**
   * 실제로 당한 경로다: 에디터가 모델을 보내며 개념을 함께 넣었고, 그 안에 사전이 mock으로
   * 답했던 개념이 섞여 origin이 `editor:…`로 덮였다. 그 뒤로는 게시에서 걸러낼 근거가 없었다.
   */
  it('나중에 들어온 import가 mock 표시를 지우지 못한다', async () => {
    const fake = fakeBasyx(() => 201);
    const app = withStore(fake.fetchLike);
    const id = await seeded(app);
    const entry = {
      irdi: 'https://admin-shell.io/idta/nameplate/3/0/Nameplate',
      scheme: 'iri',
      status: 'unknown',
      nameEn: 'Digital nameplate',
      definition: '지어낸 정의',
    };

    const push = (origin: string): Promise<Response> =>
      app.request('/dictionary/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin, entries: [{ ...entry, origin }] }),
      });

    await push('idta:MOCK-idta-missing-concepts.json');
    await push('editor:abc'); /* 에디터가 같은 개념을 다시 밀어 넣는다 */

    const res = await app.request(`/publish/${id}`, { method: 'POST' });
    const body = (await res.json()) as { concepts: number; mock: string[] };
    expect(body.concepts).toBe(0);
    expect(body.mock).toEqual([entry.irdi]);
  });

  it('사전도 샘플도 모르는 개념은 올리지 않고 무엇인지 돌려준다', async () => {
    const fake = fakeBasyx(() => 201);
    const app = withStore(fake.fetchLike);
    const id = await seeded(app);

    const res = await app.request(`/publish/${id}`, { method: 'POST' });
    const body = (await res.json()) as { concepts: number; unresolved: string[]; items: Array<{ kind: string }> };
    expect(body.concepts).toBe(0);
    expect(body.unresolved).toEqual(['https://admin-shell.io/idta/nameplate/3/0/Nameplate']);
    expect(body.items.map((i) => i.kind)).toEqual(['submodel', 'shell']);
  });

  it('BaSyx가 죽어 있으면 502로 알린다', async () => {
    const app = withStore(async () => {
      throw new Error('ECONNREFUSED');
    });
    const id = await seeded(app);
    const res = await app.request(`/publish/${id}`, { method: 'POST' });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; target: string };
    expect(body.error).toBe('UNREACHABLE');
    expect(body.target).toContain('8081');
  });
});

describe('아직 없는 것', () => {
  it('일괄 생성은 501과 함께 어느 단계인지 알려 준다', async () => {
    const res = await fresh().request('/batch');
    expect(res.status).toBe(501);
    const body = (await res.json()) as { note: string };
    expect(body.note).toMatch(/P8/);
  });
});
