/**
 * P1 완료 기준 ④ — 실제 자산 JSON이 의미 동등으로 왕복한다.
 *
 * 픽스처는 프로토타입이 만든 실물이다. P0에서 설비 3대를 모델링하면
 * 그 JSON을 여기에 추가한다. 남의 파일을 손상시키지 않는지도 여기서 지킨다.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { canonicalize, parse, serialize } from '../src/index.js';

const dir = fileURLToPath(new URL('./fixtures', import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

describe('실물 JSON 왕복', () => {
  it('픽스처가 있다', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    describe(f, () => {
      const env = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, unknown>;

      it('의미 동등으로 왕복한다', () => {
        const { doc, warnings } = parse(env);
        expect(warnings.filter((w) => w.code !== 'UNKNOWN_MODEL_TYPE')).toEqual([]);
        const again = serialize(doc);
        expect(canonicalize(again as never)).toEqual(canonicalize(env as never));
      });

      it('두 번 왕복해도 더 이상 바뀌지 않는다 (멱등)', () => {
        const once = serialize(parse(env).doc);
        const twice = serialize(parse(once).doc);
        expect(canonicalize(twice as never)).toEqual(canonicalize(once as never));
      });
    });
  }
});

describe('_raw 보존 — 남의 AASX를 손상시키지 않는다', () => {
  const env = {
    assetAdministrationShells: [
      {
        modelType: 'AssetAdministrationShell',
        id: 'https://other.example/aas/1',
        idShort: 'Foreign',
        administration: { version: '1', revision: '2' },
        assetInformation: {
          assetKind: 'Instance',
          globalAssetId: 'https://other.example/asset/1',
          specificAssetIds: [{ name: 'PlantNo', value: 'A-17' }],
        },
        submodels: [
          { type: 'ModelReference', keys: [{ type: 'Submodel', value: 'https://other.example/sm/1' }] },
        ],
      },
    ],
    submodels: [
      {
        modelType: 'Submodel',
        id: 'https://other.example/sm/1',
        idShort: 'Foreign',
        kind: 'Instance',
        qualifiers: [{ type: 'Cardinality', valueType: 'xs:string', value: 'One' }],
        submodelElements: [
          {
            modelType: 'Property',
            idShort: 'Known',
            valueType: 'xs:string',
            value: 'x',
            qualifiers: [{ type: 'Multiplicity', valueType: 'xs:string', value: 'ZeroToOne' }],
            extensions: [{ name: 'vendorFlag', valueType: 'xs:boolean', value: 'true' }],
          },
        ],
      },
    ],
  };

  it('알게 된 필드(administration·qualifiers·extensions·specificAssetIds)가 그대로 재출력된다', () => {
    const { doc } = parse(env);
    const out = serialize(doc);
    expect(canonicalize(out as never)).toEqual(canonicalize(env as never));
  });

  it('P2 이후 qualifiers·extensions는 raw가 아니라 1급 필드로 파싱된다', () => {
    const { doc } = parse(env);
    const prop = Object.values(doc.nodes).find((n) => n.idShort === 'Known')!;
    expect(prop.raw).toBeUndefined();
    expect(prop.qualifiers).toEqual([
      { type: 'Multiplicity', valueType: 'xs:string', value: 'ZeroToOne' },
    ]);
    expect(prop.extensions).toEqual([
      { name: 'vendorFlag', valueType: 'xs:boolean', value: 'true' },
    ]);
    const shell = Object.values(doc.nodes).find((n) => n.t === 'shell')!;
    expect(shell.administration).toEqual({ version: '1', revision: '2' });
    expect((shell as { specificAssetIds?: unknown }).specificAssetIds).toEqual([
      { name: 'PlantNo', value: 'A-17' },
    ]);
  });

  it('그래도 정말 모르는 필드는 raw로 남는다', () => {
    const weird = {
      assetAdministrationShells: [],
      submodels: [
        {
          modelType: 'Submodel',
          id: 'https://other.example/sm/2',
          idShort: 'Weird',
          kind: 'Instance',
          embeddedDataSpecifications: [{ dataSpecification: { type: 'ExternalReference', keys: [] } }],
          submodelElements: [
            {
              modelType: 'Property',
              idShort: 'P',
              valueType: 'xs:string',
              value: 'v',
              someVendorField: { a: 1 },
            },
          ],
        },
      ],
    };
    const { doc } = parse(weird);
    const sm = Object.values(doc.nodes).find((n) => n.t === 'submodel')!;
    const prop = Object.values(doc.nodes).find((n) => n.idShort === 'P')!;
    expect(Object.keys(sm.raw ?? {})).toEqual(['embeddedDataSpecifications']);
    expect(Object.keys(prop.raw ?? {})).toEqual(['someVendorField']);
    expect(canonicalize(serialize(doc) as never)).toEqual(canonicalize(weird as never));
  });
});
