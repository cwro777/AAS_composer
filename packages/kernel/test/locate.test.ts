/**
 * 경로 ↔ NodeId 색인.
 *
 * 이 색인은 `serialize()`의 순회 순서를 그대로 따라가야만 맞다. 문자열을 눈으로
 * 맞추는 대신, **직렬화 결과를 실제로 따라가서** 그 자리에 그 노드가 있는지 확인한다.
 * serialize가 바뀌면 이 테스트가 먼저 깨진다.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  type AasDoc,
  type Json,
  MODEL_TYPE,
  apply,
  emptyDoc,
  newNode,
  nodeForPath,
  parse,
  pathIndex,
  serialize,
  verifyEnvironment,
} from '../src/index.js';

/** 'submodels/[0]/submodelElements/[1]' 를 따라 실제 JSON 조각을 꺼낸다 */
function follow(env: Json, path: string): Json | undefined {
  let cur: Json | undefined = env;
  for (const seg of path.split('/')) {
    if (cur === undefined || cur === null) return undefined;
    const m = /^\[(\d+)\]$/.exec(seg);
    if (m) {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[Number(m[1])];
    } else {
      if (typeof cur !== 'object' || Array.isArray(cur)) return undefined;
      cur = (cur as { [k: string]: Json })[seg];
    }
  }
  return cur;
}

const FIXTURE = fileURLToPath(new URL('./fixtures/injection-molding-imm150.json', import.meta.url));

describe('경로 색인', () => {
  const env = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Json;
  const doc = parse(env).doc;

  it('모든 노드에 경로가 있다', () => {
    const index = pathIndex(doc);
    const missing = Object.keys(doc.nodes).filter((id) => index.byNode[id] === undefined);
    expect(missing).toEqual([]);
  });

  it('각 경로가 실제로 그 노드의 JSON을 가리킨다', () => {
    const index = pathIndex(doc);
    const out = serialize(doc) as Json;
    const wrong: string[] = [];

    for (const [id, path] of Object.entries(index.byNode)) {
      const piece = follow(out, path);
      const node = doc.nodes[id]!;
      if (piece === null || typeof piece !== 'object' || Array.isArray(piece)) {
        wrong.push(`${path}: JSON 조각이 없음`);
        continue;
      }
      const rec = piece as { [k: string]: Json };
      /* Shell·Submodel은 modelType을 갖고, 요소도 갖는다 */
      const expected = MODEL_TYPE[node.t];
      if (rec['modelType'] !== expected) {
        wrong.push(`${path}: modelType ${String(rec['modelType'])} ≠ ${expected}`);
        continue;
      }
      /* List 직속 자식은 idShort가 없다(AASd-120) — 있을 때만 비교한다 */
      if (node.idShort && rec['idShort'] !== undefined && rec['idShort'] !== node.idShort) {
        wrong.push(`${path}: idShort ${String(rec['idShort'])} ≠ ${node.idShort}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('규격 위반을 노드로 잇는다', () => {
  /** 형제 idShort 중복 — AASd-022 */
  function duplicated(): AasDoc {
    let doc = emptyDoc();
    doc = apply(doc, {
      t: 'insert',
      parent: null,
      index: 0,
      node: newNode('sm', 'submodel', {
        idShort: 'Holder',
        identifier: 'https://bnb.co.kr/ids/sm/dup/1',
      }),
    }).doc;
    for (const id of ['a', 'b']) {
      doc = apply(doc, {
        t: 'insert',
        parent: 'sm',
        index: Number.MAX_SAFE_INTEGER,
        node: newNode(id, 'prop', { idShort: 'Same', valueType: 'xs:string', value: 'x' }),
      }).doc;
    }
    return doc;
  }

  it('aas-core3.0이 준 경로가 우리 노드로 해석된다', () => {
    const doc = duplicated();
    const r = verifyEnvironment(serialize(doc));
    expect(r.issues.length).toBeGreaterThan(0);

    const index = pathIndex(doc);
    const located = r.issues.map((i) => nodeForPath(index, i.path));
    /* 하나도 못 찾으면 색인이 쓸모없다 */
    expect(located.some((n) => n !== null)).toBe(true);
    for (const n of located) {
      if (n !== null) expect(doc.nodes[n]).toBeDefined();
    }
  });

  it('요소 안쪽 경로는 가장 가까운 조상 노드로 접힌다', () => {
    const doc = duplicated();
    const index = pathIndex(doc);
    const deep = 'submodels/[0]/submodelElements/[1]/value/[0]/language';
    expect(nodeForPath(index, deep)).toBe('b');
  });

  it('모르는 경로는 null이다', () => {
    expect(nodeForPath(pathIndex(emptyDoc()), 'submodels/[9]')).toBeNull();
  });
});
