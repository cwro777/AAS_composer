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

/** 테스트가 가짜 클라이언트를 끼울 수 있게 최소한만 요구한다 */
export interface MqttClientLike {
  on(event: string, cb: (...args: never[]) => void): unknown;
  once(event: string, cb: (...args: never[]) => void): unknown;
  removeListener(event: string, cb: (...args: never[]) => void): unknown;
  subscribeAsync(topics: string[]): Promise<unknown>;
  end(force?: boolean, cb?: () => void): unknown;
  endAsync(force?: boolean): Promise<void>;
}

export interface MqttOptions {
  connectTimeoutMs?: number;
  /** 기본은 실제 mqtt.js. 테스트에서만 바꾼다 */
  connect?: (url: string, options: { connectTimeout: number; reconnectPeriod: number }) => MqttClientLike;
}

export function createMqttAdapter(opts?: MqttOptions): SourceAdapter {
  const timeoutMs = opts?.connectTimeoutMs ?? 8000;
  const connect =
    opts?.connect ?? ((url, options): MqttClientLike => mqtt.connect(url, options) as unknown as MqttClientLike);

  return {
    protocol: 'mqtt',
    async start(
      source: SourcePlan,
      onSample: (s: IncomingSample) => void,
      onProblem?: (reason: string) => void,
    ): Promise<StopFn> {
      const topics = new Map<string, { signal: string; node: string; key: string | null }>();
      for (const s of source.signals) {
        topics.set(topicOf(s.address, source.base), { signal: s.name, node: s.node, key: s.key });
      }

      const client = connect(source.base, { connectTimeout: timeoutMs, reconnectPeriod: 2000 });

      /**
       * 붙을 때까지 기다린다.
       *
       * 시간 초과 타이머는 **반드시 지운다.** 지우지 않으면 붙은 지 timeoutMs 뒤에
       * 그 타이머가 살아 있는 연결을 끊는다. 이미 resolve된 뒤라 reject는 무시되고,
       * 오류도 남지 않아 값만 조용히 멎는다.
       */
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let timer: NodeJS.Timeout;
        const onConnect = (): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          client.removeListener('error', onError as never);
          resolve();
        };
        const onError = (e: Error): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          client.end(true, () => undefined);
          reject(e);
        };
        timer = setTimeout(() => onError(new Error('연결 시간 초과')), timeoutMs);
        client.once('connect', onConnect as never);
        client.once('error', onError as never);
      });

      /**
       * 붙은 뒤의 오류에도 듣는 사람이 있어야 한다. mqtt.js는 EventEmitter라
       * 'error'를 아무도 듣지 않으면 **던진다** — API 프로세스 전체가 죽는다.
       */
      client.on('error', ((e: Error) => onProblem?.(`브로커 오류: ${e.message}`)) as never);
      client.on('offline', (() => onProblem?.('브로커 연결이 끊겼습니다. 다시 붙는 중입니다.')) as never);

      await client.subscribeAsync([...topics.keys()]);

      client.on('message', ((topic: string, payload: Buffer) => {
        const sig = topics.get(topic);
        if (!sig) return;
        onSample({
          signal: sig.signal,
          node: sig.node,
          raw: readPayload(payload.toString('utf8'), sig.key),
          at: new Date(),
        });
      }) as never);

      return async () => {
        await client.endAsync(true);
      };
    },
  };
}
