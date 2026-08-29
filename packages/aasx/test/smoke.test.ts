import { describe, expect, it } from 'vitest';
import { readAasx, writeAasx } from '../src/index.js';

describe('@aas/aasx 스캐폴드', () => {
  it('쓰기는 P7까지 스텁이며, 그 사실을 숨기지 않는다', () => {
    expect(() => writeAasx({ environment: {} })).toThrow(/P7/);
  });

  it('읽기도 마찬가지', () => {
    expect(() => readAasx(new Uint8Array())).toThrow(/P7/);
  });
});
