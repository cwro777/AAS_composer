/**
 * semanticId가 없을 때 할 수 있는 두 가지.
 *
 *  1. 사내 용어집에 **같은 이름**이 있으면 그 식별자를 쓴다.
 *  2. 없으면 우리 이름으로 발행한다. 표준 IRDI를 지어내지 않는다.
 *
 * 둘 다 추측이 아니다. 첫째는 근거가 있고, 둘째는 근거가 없다는 것을 밝히는 행위다.
 */

import { describe, expect, it } from 'vitest';

import { SAMPLE_TERMS, selfIssuedIri, termByName } from '../src/index.js';

const NS = 'https://bnb.co.kr/ids';

describe('이름으로 용어 찾기', () => {
  it('영문 이름이 같으면 찾는다', () => {
    expect(termByName('MachineState')?.semanticId).toBe(`${NS}/cd/MachineState/1/0`);
  });

  it('대소문자·밑줄·공백은 무시한다', () => {
    expect(termByName('machine_state')?.semanticId).toBe(`${NS}/cd/MachineState/1/0`);
    expect(termByName('Machine State')?.semanticId).toBe(`${NS}/cd/MachineState/1/0`);
  });

  it('한글 용어와 별칭으로도 찾는다', () => {
    expect(termByName('배럴온도')?.nameEn).toBe('Barrel temperature');
    expect(termByName('가열대온도')?.nameEn).toBe('Barrel temperature');
  });

  it('부분일치는 찾지 않는다 — 비슷한 개념을 붙이면 안 된다', () => {
    expect(termByName('Machine')).toBeUndefined();
    expect(termByName('State')).toBeUndefined();
    expect(termByName('')).toBeUndefined();
  });

  it('나중에 넣은 책이 이긴다', () => {
    const mine = {
      terms: [
        {
          term: '기계상태',
          nameEn: 'Machine state',
          semanticId: 'https://acme.example/ids/cd/MachineState/1/0',
          dataType: 'STRING',
          origin: 'local' as const,
          verified: 'none' as const,
        },
      ],
    };
    expect(termByName('MachineState', { terms: [...SAMPLE_TERMS.terms, ...mine.terms] })?.semanticId).toBe(
      'https://acme.example/ids/cd/MachineState/1/0',
    );
  });
});

describe('자체 발행 IRI', () => {
  it('저장소가 이미 쓰는 꼴을 따른다', () => {
    expect(selfIssuedIri(NS, 'MyProperty')).toBe(`${NS}/cd/MyProperty/1/0`);
  });

  it('끝의 슬래시를 두 번 넣지 않는다', () => {
    expect(selfIssuedIri(`${NS}/`, 'MyProperty')).toBe(`${NS}/cd/MyProperty/1/0`);
  });

  it('목록 항목은 목록 자신과 다른 개념이다', () => {
    /* 같은 IRI를 쓰면 "목록"과 "목록의 한 칸"이 같은 뜻이 되어 버린다 */
    expect(selfIssuedIri(NS, 'MyList', 'Element')).toBe(`${NS}/cd/MyList/Element/1/0`);
    expect(selfIssuedIri(NS, 'MyList')).not.toBe(selfIssuedIri(NS, 'MyList', 'Element'));
  });

  it('IRI에 쓸 수 없는 글자는 지운다', () => {
    expect(selfIssuedIri(NS, 'My Property!')).toBe(`${NS}/cd/MyProperty/1/0`);
  });

  it('이름이 없으면 발행하지 않는다', () => {
    expect(selfIssuedIri(NS, '')).toBe('');
    expect(selfIssuedIri(NS, '   ')).toBe('');
  });
});
