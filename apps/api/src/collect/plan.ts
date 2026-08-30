/**
 * 수집 계획 — **AID 서브모델이 곧 설정 파일이다.**
 *
 * 접점을 따로 적어 두면 모델과 설정이 갈라진다. Asset Interfaces Description은
 * 프로토콜·엔드포인트·신호 경로를 이미 담고 있으므로, 그것을 그대로 읽는다.
 * P3에서 AID 템플릿을 넣은 이유가 이것이고, P0 실측에서 그 구조를 확인했다.
 *
 * 읽지 못하는 것은 조용히 넘기지 않고 `problems`에 남긴다 — 신호가 하나 빠진 채
 * 수집이 도는 것이 가장 나쁘다.
 */

import { type AasDoc, type NodeId, childrenOf } from '@aas/kernel';

export type Protocol = 'mqtt' | 'opcua' | 'http' | 'modbus' | 'unknown';

export interface SignalPlan {
  /** 우리 노드 — 값을 어디에 되쓸지 알아야 한다 */
  node: NodeId;
  /** AID의 property_name idShort — 신호 이름 */
  name: string;
  key: string | null;
  /** 값이 있는 자리. MQTT는 토픽이 든 href, OPC UA는 browsePath */
  address: string;
  unit: string | null;
  type: string | null;
  semanticId: string | null;
}

export interface SourcePlan {
  node: NodeId;
  interfaceName: string;
  protocol: Protocol;
  /** mqtt://host:1883 · opc.tcp://host:4840 */
  base: string;
  contentType: string | null;
  signals: SignalPlan[];
}

export interface CollectionPlan {
  submodel: NodeId | null;
  sources: SourcePlan[];
  problems: string[];
}

const AID_SUBMODEL = 'https://admin-shell.io/idta/AssetInterfacesDescription/1/1/Submodel';
const AID_INTERFACE = 'https://admin-shell.io/idta/AssetInterfacesDescription/1/0/Interface';

function childBy(doc: AasDoc, parent: NodeId, idShort: string): NodeId | undefined {
  return childrenOf(doc, parent).find((c) => doc.nodes[c]?.idShort === idShort);
}

function valueOf(doc: AasDoc, id: NodeId | undefined): string | null {
  if (!id) return null;
  const n = doc.nodes[id];
  if (!n) return null;
  const v = (n as { value?: unknown }).value;
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/** 보조 semanticId로 프로토콜을 가려낸다 — AID가 그렇게 표시한다 */
function protocolOf(doc: AasDoc, iface: NodeId): Protocol {
  const n = doc.nodes[iface];
  const sup = ((n as { supplementalSemanticIds?: string[] })?.supplementalSemanticIds ?? []).join(' ');
  const name = (n?.idShort ?? '').toLowerCase();
  if (sup.includes('mqtt') || name.includes('mqtt')) return 'mqtt';
  if (sup.includes('opcfoundation') || sup.includes('opcua') || name.includes('opcua')) return 'opcua';
  if (sup.includes('modbus') || name.includes('modbus')) return 'modbus';
  if (sup.includes('2011/http') || name.includes('http')) return 'http';
  return 'unknown';
}

export function planFor(doc: AasDoc): CollectionPlan {
  const problems: string[] = [];

  const submodel =
    Object.keys(doc.nodes).find(
      (id) => doc.nodes[id]!.t === 'submodel' && doc.nodes[id]!.semanticId === AID_SUBMODEL,
    ) ?? null;

  if (!submodel) {
    return {
      submodel: null,
      sources: [],
      problems: ['Asset Interfaces Description 서브모델이 없습니다. 수집할 접점을 알 수 없습니다.'],
    };
  }

  const sources: SourcePlan[] = [];

  for (const iface of childrenOf(doc, submodel)) {
    const n = doc.nodes[iface]!;
    if (n.semanticId !== AID_INTERFACE) continue;

    const protocol = protocolOf(doc, iface);
    const endpoint = childBy(doc, iface, 'EndpointMetadata');
    const base = endpoint ? valueOf(doc, childBy(doc, endpoint, 'base')) : null;

    if (!base) {
      problems.push(`${n.idShort}: EndpointMetadata/base가 비어 있어 어디에 붙을지 알 수 없습니다.`);
      continue;
    }
    if (protocol === 'unknown') {
      problems.push(`${n.idShort}: 프로토콜을 가려내지 못했습니다. 보조 semanticId를 확인하십시오.`);
    }

    const signals: SignalPlan[] = [];
    const interaction = childBy(doc, iface, 'InteractionMetadata');
    const properties = interaction ? childBy(doc, interaction, 'properties') : undefined;

    for (const sig of properties ? childrenOf(doc, properties) : []) {
      const s = doc.nodes[sig]!;
      const forms = childBy(doc, sig, 'forms');
      if (!forms) {
        problems.push(`${n.idShort}/${s.idShort}: forms가 없어 값 위치를 모릅니다.`);
        continue;
      }
      /* OPC UA는 browsePath, 나머지는 href가 주소다 */
      const href = valueOf(doc, childBy(doc, forms, 'href'));
      const browse = valueOf(doc, childBy(doc, forms, 'uav_browsePath'));
      const address = protocol === 'opcua' ? (browse ?? href) : href;

      if (!address) {
        problems.push(`${n.idShort}/${s.idShort}: 주소(href·browsePath)가 비어 있습니다.`);
        continue;
      }

      signals.push({
        node: sig,
        name: s.idShort,
        key: valueOf(doc, childBy(doc, sig, 'key')),
        address,
        unit: valueOf(doc, childBy(doc, sig, 'unit')),
        type: valueOf(doc, childBy(doc, sig, 'type')),
        semanticId: (s as { semanticId?: string }).semanticId ?? null,
      });
    }

    if (signals.length === 0) {
      problems.push(`${n.idShort}: 읽을 신호가 없습니다. InteractionMetadata/properties를 채우십시오.`);
    }

    sources.push({
      node: iface,
      interfaceName: n.idShort,
      protocol,
      base,
      contentType: endpoint ? valueOf(doc, childBy(doc, endpoint, 'contentType')) : null,
      signals,
    });
  }

  if (sources.length === 0) problems.push('AID에 인터페이스가 하나도 없습니다.');
  return { submodel, sources, problems };
}
