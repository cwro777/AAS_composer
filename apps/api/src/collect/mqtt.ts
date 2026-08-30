/**
 * MQTT 어댑터.
 *
 * AID의 href가 토픽을 담는다 — `mqtt://broker:1883/machine/mx200/spindleTemperature`.
 * 브로커 주소는 EndpointMetadata/base에, 토픽은 href의 경로 부분에 있다.
 *
 * 페이로드가 JSON이면 값 하나를 꺼내고, 아니면 문자열 그대로 쓴다.
 * **해석하지 못한 페이로드를 0으로 만들지 않는다** — 값이 없는 것과 0은 다르다.
 */

import mqtt from 'mqtt';

import type { IncomingSample, SourceAdapter, StopFn } from './collector.js';
import type { SourcePlan } from './plan.js';

/** href에서 토픽만 뽑는다. 절대 URL이면 경로가 토픽이다 */
export function topicOf(href: string, base: string): string {
  try {
    const u = new URL(href);
    return u.pathname.replace(/^\/+/, '');
  } catch {
    /* 상대 표기면 그대로 토픽으로 본다 */
    void base;
    return href.replace(/^\/+/, '');
  }
}

/** JSON이면 값 하나를 꺼낸다. key가 있으면 그 필드를 먼저 본다 */
export function readPayload(payload: string, key: string | null): string {
  const text = payload.trim();
  if (text === '') return '';
  if (!text.startsWith('{') && !text.startsWith('[')) return text;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object') return String(parsed);
    const rec = parsed as Record<string, unknown>;
    for (const k of [key, 'value', 'v'].filter((x): x is string => typeof x === 'string' && x !== '')) {
      if (rec[k] !== undefined && rec[k] !== null) return String(rec[k]);
    }
    return text;
  } catch {
    return text;
  }
}

export function createMqttAdapter(opts?: { connectTimeoutMs?: number }): SourceAdapter {
  return {
    protocol: 'mqtt',
    async start(source: SourcePlan, onSample: (s: IncomingSample) => void): Promise<StopFn> {
      const topics = new Map<string, { signal: string; node: string; key: string | null }>();
      for (const s of source.signals) {
        topics.set(topicOf(s.address, source.base), { signal: s.name, node: s.node, key: s.key });
      }

      const client = mqtt.connect(source.base, {
        connectTimeout: opts?.connectTimeoutMs ?? 8000,
        reconnectPeriod: 2000,
      });

      await new Promise<void>((resolve, reject) => {
        const fail = (e: Error): void => {
          client.end(true, () => undefined);
          reject(e);
        };
        client.once('connect', () => resolve());
        client.once('error', fail);
        setTimeout(() => fail(new Error('연결 시간 초과')), opts?.connectTimeoutMs ?? 8000);
      });

      await client.subscribeAsync([...topics.keys()]);

      client.on('message', (topic: string, payload: Buffer) => {
        const sig = topics.get(topic);
        if (!sig) return;
        onSample({
          signal: sig.signal,
          node: sig.node,
          raw: readPayload(payload.toString('utf8'), sig.key),
          at: new Date(),
        });
      });

      return async () => {
        await client.endAsync(true);
      };
    },
  };
}
