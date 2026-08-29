import { describe, expect, it } from 'vitest';
import { parseSemanticId } from '../src/index.js';
import { createCddAdapter } from '../src/dict/index.js';

describe('@aas/semantic 스캐폴드', () => {
  it('파서는 P6까지 스텁이며, 그 사실을 숨기지 않는다', () => {
    expect(() => parseSemanticId('0173-1#02-AAO677#002')).toThrow(/P6/);
  });

  it('사전 어댑터도 마찬가지', () => {
    expect(() => createCddAdapter(async () => ({ ok: true, status: 200, json: async () => ({}) }), 'https://cdd.iec.ch')).toThrow(/P6/);
  });
});
