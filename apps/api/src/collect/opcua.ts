/**
 * OPC UA 어댑터.
 *
 * P0 실측 설비(IM-150E)가 이 프로토콜이다. AID는 값의 자리를 **browsePath**로 적는다 —
 * `/Objects/2:IM150E/2:Barrel/2:Zone1/2:Temperature`. NodeId가 아니다.
 * 그래서 붙자마자 TranslateBrowsePathsToNodeIds로 한 번 옮기고, 그 다음부터 구독한다.
 *
 * 폴링하지 않고 **구독(MonitoredItem)** 한다. 설비 쪽에서 값이 바뀔 때만 오는 것이
 * 초당 한 번씩 묻는 것보다 정확하고 가볍다.
 *
 * 읽지 못한 것은 조용히 넘기지 않는다:
 *  - browsePath가 서버에 없으면 그 신호만 problem으로 남기고 나머지는 계속 받는다.
 *  - 신호를 하나도 못 찾으면 던진다 — 수집기가 `skipped`에 이유와 함께 담는다.
 *  - 상태 코드가 Bad면 값으로 취급하지 않는다. **못 읽은 것과 0은 다르다.**
 *
 * 보안은 아직 None/익명뿐이다. 인증서·사용자 인증이 필요한 엔드포인트는
 * 연결 단계에서 서버가 거절하고, 그 사유가 그대로 `skipped`에 남는다. 있는 척하지 않는다.
 */

import type { DataValue } from 'node-opcua-client';

import type { IncomingSample, SourceAdapter, StopFn } from './collector.js';
import type { SourcePlan } from './plan.js';

/** `ns=2;i=1234` · `ns=2;s=Foo` · `i=2258` 처럼 생겼으면 NodeId다 */
export function isNodeId(address: string): boolean {
  return /^(ns=\d+;)?[isgb]=/.test(address.trim());
}

/**
 * AID의 browsePath를 OPC UA RelativePath 표기로 맞춘다.
 *
 * 앞의 `/Objects`는 RootFolder 기준의 첫 마디이므로 그대로 두고,
 * 앞뒤 공백과 중복 슬래시만 정리한다. 마디 이름(`2:Barrel`)은 건드리지 않는다 —
 * 네임스페이스 번호를 우리가 바꾸면 다른 노드를 가리키게 된다.
 */
export function relativePathOf(address: string): string {
  const p = address.trim().replace(/\/{2,}/g, '/');
  return p.startsWith('/') ? p : `/${p}`;
}

/**
 * DataValue에서 문자열 하나를 뽑는다. 읽을 값이 없으면 null.
 *
 * 상태 코드의 상위 2비트가 심각도다 — 00이 Good이다. Bad·Uncertain은 값이 아니다.
 */
export function rawOf(dv: DataValue): { raw: string } | { problem: string } {
  const code = dv.statusCode as unknown as { value: number; name?: string };
  if ((code.value & 0xc0000000) !== 0) {
    return { problem: `상태 코드 ${code.name ?? code.value}` };
  }
  const v: unknown = dv.value?.value;
  if (v === null || v === undefined) return { problem: '값이 비어 있습니다' };
  if (v instanceof Date) return { raw: v.toISOString() };
  if (Array.isArray(v) || ArrayBuffer.isView(v)) {
    /* 배열 값은 그대로 보존한다. 첫 원소만 취해 숫자인 척하지 않는다 */
    return { raw: JSON.stringify(Array.from(v as ArrayLike<unknown>)) };
  }
  return { raw: String(v) };
}

export interface OpcuaOptions {
  /** 구독 주기(ms). 설비가 이보다 빨리 바뀌어도 이 간격으로 묶여 온다 */
  samplingIntervalMs?: number;
  connectTimeoutMs?: number;
  /** 사용자 인증이 필요한 엔드포인트용. 없으면 익명 */
  credentials?: { userName: string; password: string };
}

export function createOpcuaAdapter(opts?: OpcuaOptions): SourceAdapter {
  const sampling = opts?.samplingIntervalMs ?? 1000;

  return {
    protocol: 'opcua',
    async start(
      source: SourcePlan,
      onSample: (s: IncomingSample) => void,
      onProblem?: (reason: string) => void,
    ): Promise<StopFn> {
      /* 무거운 라이브러리다 — 실제로 붙을 때만 불러온다 */
      const {
        AttributeIds,
        MessageSecurityMode,
        OPCUAClient,
        SecurityPolicy,
        TimestampsToReturn,
        UserTokenType,
        makeBrowsePath,
        resolveNodeId,
      } = await import('node-opcua-client');

      const client = OPCUAClient.create({
        applicationName: 'AAS Composer',
        endpointMustExist: false,
        securityMode: MessageSecurityMode.None,
        securityPolicy: SecurityPolicy.None,
        connectionStrategy: { maxRetry: 1, initialDelay: 400, maxDelay: 2000 },
        requestedSessionTimeout: 60_000,
      });

      await client.connect(source.base);

      let session;
      try {
        session = await client.createSession(
          opts?.credentials
            ? { type: UserTokenType.UserName, ...opts.credentials }
            : { type: UserTokenType.Anonymous },
        );
      } catch (e) {
        await client.disconnect();
        throw e;
      }

      try {
        /* 1. browsePath → NodeId. 여기서 한 번만 옮긴다 */
        const targets: Array<{ signal: string; node: string; nodeId: unknown }> = [];
        for (const sig of source.signals) {
          if (isNodeId(sig.address)) {
            targets.push({ signal: sig.name, node: sig.node, nodeId: resolveNodeId(sig.address) });
            continue;
          }
          const result = await session.translateBrowsePath(
            makeBrowsePath('RootFolder', relativePathOf(sig.address)),
          );
          const target = result.targets?.[0];
          if (!target || (result.statusCode.value & 0xc0000000) !== 0) {
            onProblem?.(`${sig.name}: ${sig.address}를 서버에서 찾지 못했습니다.`);
            continue;
          }
          targets.push({ signal: sig.name, node: sig.node, nodeId: target.targetId });
        }

        if (targets.length === 0) {
          throw new Error('AID의 browsePath가 서버 주소공간과 맞지 않습니다. 하나도 찾지 못했습니다.');
        }

        /* 2. 구독 */
        const subscription = await session.createSubscription2({
          requestedPublishingInterval: sampling,
          requestedLifetimeCount: 100,
          requestedMaxKeepAliveCount: 10,
          maxNotificationsPerPublish: 200,
          publishingEnabled: true,
          priority: 10,
        });

        for (const t of targets) {
          const item = await subscription.monitor(
            { nodeId: t.nodeId as never, attributeId: AttributeIds.Value },
            { samplingInterval: sampling, discardOldest: true, queueSize: 10 },
            TimestampsToReturn.Both,
          );
          item.on('changed', (dv: DataValue) => {
            const read = rawOf(dv);
            if ('problem' in read) {
              onProblem?.(`${t.signal}: ${read.problem}`);
              return;
            }
            onSample({
              signal: t.signal,
              node: t.node,
              raw: read.raw,
              /* 설비가 찍은 시각을 쓴다. 없을 때만 우리 시각 */
              at: dv.sourceTimestamp ?? dv.serverTimestamp ?? new Date(),
            });
          });
        }

        return async () => {
          await subscription.terminate().catch(() => undefined);
          await session.close().catch(() => undefined);
          await client.disconnect().catch(() => undefined);
        };
      } catch (e) {
        await session.close().catch(() => undefined);
        await client.disconnect().catch(() => undefined);
        throw e;
      }
    },
  };
}
