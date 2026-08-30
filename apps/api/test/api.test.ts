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
    expect(body.changes[1]!.text).toContain('kind');
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

describe('아직 없는 것', () => {
  it('사전·게시·일괄은 501과 함께 어느 단계인지 알려 준다', async () => {
    const app = fresh();
    for (const p of ['/dictionary/search', '/publish/x', '/batch']) {
      const res = await app.request(p);
      expect(res.status).toBe(501);
      const body = (await res.json()) as { note: string };
      expect(body.note).toMatch(/P[78]/);
    }
  });
});
