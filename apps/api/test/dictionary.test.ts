/**
 * 사전 프록시.
 *
 * 지키려는 것:
 *  1. 상류가 없으면 **없다고 말한다.** 있는 척하지 않는다.
 *  2. 상류가 죽어도 편집은 멈추지 않는다 — stale 캐시 + 경고.
 *  3. IDTA 템플릿의 conceptDescriptions가 실제로 캐시를 채운다(단위·자료형까지).
 *  4. 한글 용어로 찾힌다.
 */

import { describe, expect, it } from 'vitest';

import { SAMPLE_TERMS } from '@aas/semantic';

import { createApp } from '../src/app.js';
import { entriesFromEnvironment, entriesFromTermBook, entriesFromTermsFile } from '../src/dict/harvest.js';
import { createDictionary } from '../src/dict/service.js';
import { type DictEntry, createMemoryDictStore } from '../src/dict/store.js';
import { createMemoryStore } from '../src/store.js';

/** 실제 IDTA 템플릿에 들어 있는 모양의 ConceptDescription */
const envWithCds = {
  assetAdministrationShells: [],
  submodels: [],
  conceptDescriptions: [
    {
      modelType: 'ConceptDescription',
      id: '0112/2///61987#ABA565#009',
      idShort: 'ManufacturerName',
      embeddedDataSpecifications: [
        {
          dataSpecification: { type: 'ExternalReference', keys: [] },
          dataSpecificationContent: {
            modelType: 'DataSpecificationIec61360',
            preferredName: [{ language: 'en', text: 'Manufacturer name' }],
            definition: [{ language: 'en', text: 'Legal designation of the manufacturer.' }],
            dataType: 'STRING',
          },
        },
      ],
    },
    {
      modelType: 'ConceptDescription',
      id: '0173-1#02-BAA120#008',
      idShort: 'AmbientTemperature',
      embeddedDataSpecifications: [
        {
          dataSpecification: { type: 'ExternalReference', keys: [] },
          dataSpecificationContent: {
            modelType: 'DataSpecificationIec61360',
            preferredName: [{ language: 'en', text: 'Ambient temperature' }],
            unit: '°C',
            dataType: 'REAL_MEASURE',
          },
        },
      ],
    },
    /* 아무 정보도 없는 껍데기 — 캐시에 넣지 않는다 */
    { modelType: 'ConceptDescription', id: '0173-1#02-ZZZ999#001' },
  ],
};

describe('IDTA 템플릿에서 씨앗 긁기', () => {
  const entries = entriesFromEnvironment(envWithCds as never, 'idta:test');

  it('빈 껍데기는 넣지 않는다', () => {
    expect(entries.map((e) => e.irdi)).toEqual(['0112/2///61987#ABA565#009', '0173-1#02-BAA120#008']);
  });

  it('단위와 자료형이 따라온다', () => {
    const temp = entries.find((e) => e.irdi === '0173-1#02-BAA120#008')!;
    expect(temp.unit).toBe('°C');
    expect(temp.dataType).toBe('REAL_MEASURE');
    expect(temp.scheme).toBe('eclass');
  });

  it('IEC CDD는 출처 표준까지 분해된다', () => {
    const name = entries.find((e) => e.irdi.startsWith('0112/'))!;
    expect(name.scheme).toBe('iec-cdd');
    expect(name.source).toBe('61987');
    expect(name.definition).toContain('Legal designation');
  });
});

describe('사내 용어집에서 씨앗 긁기', () => {
  const { entries, terms } = entriesFromTermBook(SAMPLE_TERMS);

  it('용어와 별칭이 모두 링크된다', () => {
    expect(entries.length).toBe(SAMPLE_TERMS.terms.length);
    expect(terms.some((t) => t.term === '형체력')).toBe(true);
    expect(terms.some((t) => t.term === '클램핑포스' && t.note === '별칭')).toBe(true);
  });
});

/**
 * 용어 파일 — IEC CDD 화면에서 사람이 옮겨 적은 개념, 회사 용어집, 에디터 내보내기.
 * 받는 기준이 웹의 가져오기와 같아야 한다. 서버는 받고 웹은 버리면(또는 반대) 같은 파일이
 * 어디서 넣느냐에 따라 다른 결과를 낸다.
 */
describe('용어 파일에서 씨앗 긁기', () => {
  const file = {
    terms: [
      {
        semanticId: '0112/2///61987#ABA951#009',
        term: '시리얼번호',
        aliases: ['S/N'],
        nameEn: 'serial number',
        definition: 'Unique combination of numbers and letters used to identify the device.',
        dataType: 'STRING',
        provenance: 'cdd.iec.ch에서 옮겨 적음',
      },
      { semanticId: '0112/2///61987#ABA565#009', term: '제조사명', nameEn: '', definition: '' },
      { semanticId: '0112/2///61987#ABA951', term: '버전 빠짐', nameEn: 'x', definition: 'x' },
      { term: 'id 없음', nameEn: 'x', definition: 'x' },
    ],
  };

  it('영문 이름·정의가 있는 것만 받고, 못 받은 이유를 남긴다', () => {
    const r = entriesFromTermsFile(file, 'terms:cdd.json');
    expect(r.entries.map((e) => e.irdi)).toEqual(['0112/2///61987#ABA951#009']);
    expect(r.entries[0]).toMatchObject({ scheme: 'iec-cdd', source: '61987', nameKo: '시리얼번호', origin: 'terms:cdd.json' });
    expect(r.skipped.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(r.skipped[0]!.reason).toContain('AASc-3a-002');
    expect(r.skipped[1]!.reason).toContain('버전');
  });

  it('한글 용어와 별칭이 링크된다 — 한글로 찾힌다', async () => {
    const store = createMemoryDictStore();
    const dict = createDictionary(store);
    const r = entriesFromTermsFile(file.terms, 'terms:cdd.json');
    await dict.importEntries(r.entries, r.terms);
    expect((await dict.lookup('0112/2///61987#ABA951#009')).entry?.definition).toContain('identify');
    expect((await dict.search('S/N', 3)).entries[0]?.irdi).toBe('0112/2///61987#ABA951#009');
  });

  it('모양이 틀리면 알아볼 수 있게 거절한다', () => {
    expect(() => entriesFromTermsFile({ foo: 1 }, 'x')).toThrow('terms');
  });
});

describe('상류가 없을 때', () => {
  it('없는 개념은 없다고 말한다 — 지어내지 않는다', async () => {
    const dict = createDictionary(createMemoryDictStore());
    const r = await dict.lookup('0112/2///61987#ABA565#009');
    expect(r.source).toBe('none');
    expect(r.entry).toBeUndefined();
    expect(r.warning).toContain('import');
  });

  it('import 한 것은 캐시가 답한다', async () => {
    const store = createMemoryDictStore();
    const dict = createDictionary(store);
    await dict.importEntries(entriesFromEnvironment(envWithCds as never, 'idta:test'));
    const r = await dict.lookup('0173-1#02-BAA120#008');
    expect(r.source).toBe('cache');
    expect(r.entry?.unit).toBe('°C');
  });

  it('폐기된 개념은 후속 값을 알려 준다', async () => {
    const store = createMemoryDictStore();
    const dict = createDictionary(store);
    await dict.importEntries([
      {
        irdi: '0173-1#02-OLD001#001',
        scheme: 'eclass',
        status: 'superseded',
        successor: '0173-1#02-NEW001#002',
        nameEn: 'Old thing',
      } as DictEntry,
    ]);
    const r = await dict.lookup('0173-1#02-OLD001#001');
    expect(r.successor).toBe('0173-1#02-NEW001#002');
    expect(r.warning).toContain('폐기');
  });
});

describe('상류가 있을 때', () => {
  const upstream = (impl: (irdi: string) => Promise<DictEntry | undefined>) => ({
    name: 'iec-cdd',
    lookup: impl,
  });

  it('상류가 답하면 캐시에 남는다', async () => {
    const store = createMemoryDictStore();
    const dict = createDictionary(
      store,
      upstream(async (irdi) => ({ irdi, scheme: 'iec-cdd', status: 'current', unit: 'kN' }) as DictEntry),
    );
    const first = await dict.lookup('0112/2///61987#ABC123#001');
    expect(first.source).toBe('upstream');
    expect(await store.get('0112/2///61987#ABC123#001')).toBeDefined();
  });

  it('상류가 죽으면 캐시로 답하고 경고를 남긴다 — 편집은 멈추지 않는다', async () => {
    const store = createMemoryDictStore();
    await store.upsertMany([
      { irdi: '0112/2///61987#ABA565#009', scheme: 'iec-cdd', status: 'current', unit: null } as DictEntry,
    ]);
    const dict = createDictionary(
      store,
      upstream(async () => {
        throw new Error('ETIMEDOUT');
      }),
    );
    const r = await dict.lookup('0112/2///61987#ABA565#009');
    expect(r.source).toBe('cache');
    expect(r.stale).toBe(true);
    expect(r.warning).toContain('ETIMEDOUT');
  });
});

describe('라우트', () => {
  const withDict = () => {
    const store = createMemoryDictStore();
    return {
      store,
      app: createApp(createMemoryStore(), { dictionary: createDictionary(store) }),
    };
  };

  it('상태가 상류 없음을 감추지 않는다', async () => {
    const { app } = withDict();
    const body = (await (await app.request('/dictionary/status')).json()) as {
      cached: number;
      upstream: string | null;
    };
    expect(body.upstream).toBeNull();
    expect(body.cached).toBe(0);
  });

  it('Environment를 밀어 넣으면 캐시가 찬다', async () => {
    const { app } = withDict();
    const res = await app.request('/dictionary/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ environment: envWithCds, origin: 'idta:02006-3-0' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { concepts: number; total: number };
    expect(body.concepts).toBe(2);
    expect(body.total).toBe(2);
  });

  it('한글 용어로 찾는다', async () => {
    const { app } = withDict();
    const { entries, terms } = entriesFromTermBook(SAMPLE_TERMS);
    await app.request('/dictionary/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries, terms }),
    });

    const res = await app.request('/dictionary/search?q=' + encodeURIComponent('형체력'));
    const body = (await res.json()) as { count: number; results: Array<{ nameEn: string; unit: string }> };
    expect(body.count).toBeGreaterThan(0);
    expect(body.results[0]!.nameEn).toBe('Clamping force');
    expect(body.results[0]!.unit).toBe('kN');
  });

  it('별칭으로도 찾는다', async () => {
    const { app } = withDict();
    const { entries, terms } = entriesFromTermBook(SAMPLE_TERMS);
    await app.request('/dictionary/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries, terms }),
    });
    const body = (await (
      await app.request('/dictionary/search?q=' + encodeURIComponent('실린더온도'))
    ).json()) as { results: Array<{ nameKo: string }> };
    expect(body.results[0]!.nameKo).toBe('배럴온도');
  });

  it('IRDI 단일 조회는 슬래시가 들어가도 된다', async () => {
    const { app } = withDict();
    await app.request('/dictionary/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ environment: envWithCds }),
    });
    const irdi = '0112/2///61987#ABA565#009';
    const res = await app.request(`/dictionary/${encodeURIComponent(irdi)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entry: { source: string; nameEn: string } };
    expect(body.entry.nameEn).toBe('Manufacturer name');
  });

  it('모르는 IRDI는 404와 함께 무엇을 하라고 알려 준다', async () => {
    const { app } = withDict();
    const res = await app.request('/dictionary/' + encodeURIComponent('0173-1#02-NOPE#001'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { warning: string };
    expect(body.warning).toContain('import');
  });

  it('빈 질의는 400', async () => {
    const { app } = withDict();
    expect((await withDict().app.request('/dictionary/search?q=')).status).toBe(400);
    void app;
  });
});
