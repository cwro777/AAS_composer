/**
 * IRDI/IRI 파서 — 실제 템플릿에 들어 있는 값으로 검사한다.
 * 지어낸 예시가 아니라 IDTA 공식 Template JSON에서 가져온 문자열이다.
 */

import { describe, expect, it } from 'vitest';

import { formatSemanticId, parseSemanticId, sameConcept } from '../src/index.js';

describe('eCl@ss IRDI', () => {
  it('자리마다 분해한다', () => {
    const r = parseSemanticId('0173-1#02-AAO677#002');
    expect(r).toMatchObject({
      scheme: 'eclass',
      icd: '0173',
      csi: '02',
      code: 'AAO677',
      version: '002',
    });
  });

  it('CSI로 종류를 구분할 수 있다 — 02는 속성, 01은 분류 클래스', () => {
    expect(parseSemanticId('0173-1#01-AHF578#003').csi).toBe('01');
  });

  it('버전이 빠지면 해석하지 않는다', () => {
    expect(parseSemanticId('0173-1#02-AAO677').scheme).toBe('unknown');
  });
});

describe('IEC CDD IRDI', () => {
  it('출처 표준과 코드를 분해한다', () => {
    const r = parseSemanticId('0112/2///61987#ABA565#009');
    expect(r).toMatchObject({ scheme: 'iec-cdd', icd: '0112', source: '61987', code: 'ABA565', version: '009' });
  });

  it('출처에 밑줄이 들어간 것도 읽는다', () => {
    expect(parseSemanticId('0112/2///61360_7#AAS011#001').source).toBe('61360_7');
  });

  it('슬래시 개수가 다르면 다른 식별자다 — 해석하지 않는다', () => {
    expect(parseSemanticId('0112/2//61987#ABA565#009').scheme).toBe('unknown');
    expect(parseSemanticId('0112/2////61987#ABA565#009').scheme).toBe('unknown');
  });
});

describe('IRI', () => {
  it('경로에 박힌 버전을 뽑는다', () => {
    const r = parseSemanticId('https://admin-shell.io/idta/nameplate/3/0/Nameplate');
    expect(r.scheme).toBe('iri');
    expect(r.iriVersion).toBe('3/0');
  });

  it('버전이 없어도 IRI로 인정한다', () => {
    expect(parseSemanticId('https://bnb.co.kr/ids/cd/ClampingForce').scheme).toBe('iri');
  });
});

describe('이어 붙은 값', () => {
  /* Nameplate 3.0의 AssetSpecificProperties에 실제로 있는 모양 */
  it('두 IRDI가 슬래시로 이어진 것을 composite로 표시한다', () => {
    const r = parseSemanticId('0173-1#02-ABI218#003/0173-1#01-AGZ672#004');
    expect(r.scheme).toBe('eclass');
    expect(r.composite).toBe(true);
    expect(r.code).toBe('ABI218');
  });
});

describe('추측하지 않는다', () => {
  for (const bad of ['', '   ', 'ManufacturerName', '0173-1#02', 'urn:something:else']) {
    it(`"${bad}" → unknown`, () => {
      expect(parseSemanticId(bad).scheme).toBe('unknown');
    });
  }
});

describe('표시와 비교', () => {
  it('사람이 읽는 짧은 표기', () => {
    expect(formatSemanticId(parseSemanticId('0112/2///61987#ABA565#009'))).toBe('IEC CDD 61987/ABA565#009');
    expect(formatSemanticId(parseSemanticId('0173-1#02-AAO677#002'))).toBe('eCl@ss AAO677#002');
    expect(formatSemanticId(parseSemanticId('https://admin-shell.io/idta/nameplate/3/0/Nameplate'))).toBe(
      'Nameplate (3/0)',
    );
  });

  it('버전만 다른 것은 같은 개념이다', () => {
    const a = parseSemanticId('0173-1#02-AAO677#002');
    const b = parseSemanticId('0173-1#02-AAO677#004');
    expect(sameConcept(a, b)).toBe(true);
    expect(a.raw).not.toBe(b.raw);
  });

  it('코드가 다르면 다른 개념이다', () => {
    expect(sameConcept(parseSemanticId('0173-1#02-AAO677#002'), parseSemanticId('0173-1#02-AAO676#003'))).toBe(
      false,
    );
  });
});
