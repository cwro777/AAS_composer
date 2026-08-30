/**
 * 개발용 값 발생기 — 운영 화면을 실제로 움직이는 값으로 보기 위한 것.
 *
 * 설비가 없는 자리에서 대시보드를 만들면 "값이 들어오는 화면"을 상상으로 그리게 된다.
 * 이 스크립트는 브로커에 실제로 값을 밀어 넣는다. 설비 흉내는 여기까지이고,
 * 수집 경로(AID → 계획 → 어댑터 → 시계열)는 실제 코드가 그대로 돈다.
 *
 *   pnpm --filter @aas/api exec tsx scripts/feed-demo.ts
 *   pnpm --filter @aas/api exec tsx scripts/feed-demo.ts --topic machine/imm150/x --period 500
 *
 * Ctrl+C로 멈춘다. 멈추면 화면의 지연이 올라가기 시작한다 — 그것이 이 화면의 요점이다.
 */

import process from 'node:process';

import mqtt from 'mqtt';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};

const BROKER = arg('broker', process.env['MQTT_URL'] ?? 'mqtt://localhost:1883');
const TOPIC = arg('topic', 'machine/imm150/barrelTemperature');
const PERIOD = Number(arg('period', '1000'));

const client = await mqtt.connectAsync(BROKER);
console.log(`[feed] ${BROKER} → ${TOPIC} · ${PERIOD}ms마다`);

let t = 0;
let sent = 0;
const timer = setInterval(() => {
  t += 1;
  /* 사출 사이클 비슷하게 오르내리게 하고, 가끔 스파이크를 준다 —
     구간 최대·최소를 남기는 차트 축약이 그것을 지우지 않는지 눈으로 보려는 것이다 */
  const base = 235 + Math.sin(t / 9) * 8;
  const spike = t % 37 === 0 ? 24 : 0;
  const value = Math.round((base + spike) * 10) / 10;
  void client.publishAsync(TOPIC, JSON.stringify({ value, ts: new Date().toISOString() }));
  sent += 1;
  if (sent % 20 === 0) console.log(`[feed] ${sent}건 · 마지막 ${value}`);
}, PERIOD);

const bye = (): void => {
  clearInterval(timer);
  void client.endAsync().then(() => {
    console.log(`[feed] 멈춤 — ${sent}건 보냈습니다.`);
    process.exit(0);
  });
};
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
