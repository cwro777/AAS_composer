/**
 * P0 실측 — 사출성형기 한 대를 끝까지 모델링한다.
 *
 * 목적은 픽스처를 얻는 것만이 아니다. **템플릿만으로 실제 설비가 표현되는지**,
 * 어디서 막히는지를 드러내는 것이 이 파일의 존재 이유다. 막힌 지점은 주석으로 남긴다.
 *
 * 대상: 전동식 사출성형기 IM-150E (형체력 150 tonf), 2호기, 라인 2
 * 제조사·모델명은 가공의 값이다. 구조와 단위는 실제 사출성형기 사양을 따랐다.
 */

import {
  type AasDoc,
  type Cmd,
  type Json,
  type NodeId,
  apply,
  emptyDoc,
  newNode,
} from '@aas/kernel';

import { getTemplate, instantiate } from '../src/index.js';

const NS = 'https://bnb.co.kr/ids';
const SLUG = 'imm-150e-002';

/** 거부되면 조용히 넘어가지 않는다 — 실측의 목적이 막히는 지점을 찾는 것이다. */
function ap(doc: AasDoc, cmd: Cmd): AasDoc {
  const r = apply(doc, cmd);
  if (r.rejected) throw new Error(`명령이 거부됨: ${JSON.stringify(r.rejected)}`);
  return r.doc;
}

/** idShort 경로로 자손을 찾는다. 'GeneralInformation/ManufacturerName' */
function at(doc: AasDoc, from: NodeId, path: string): NodeId {
  let cur = from;
  for (const seg of path.split('/')) {
    const hit = (doc.order[cur] ?? []).find((c) => doc.nodes[c]?.idShort === seg);
    if (!hit) throw new Error(`경로를 찾지 못함: ${path} (${seg}에서 막힘)`);
    cur = hit;
  }
  return cur;
}

function set(doc: AasDoc, node: NodeId, path: string, value: Json): AasDoc {
  return ap(doc, { t: 'set', node, path, value });
}

function submodelOf(doc: AasDoc, idShort: string): NodeId {
  const hit = Object.keys(doc.nodes).find(
    (id) => doc.nodes[id]!.t === 'submodel' && doc.nodes[id]!.idShort === idShort,
  );
  if (!hit) throw new Error(`서브모델을 찾지 못함: ${idShort}`);
  return hit;
}

export interface Imm {
  doc: AasDoc;
  shell: NodeId;
  /** 실측에서 걸린 지점 — 테스트가 이 목록을 골든으로 잡는다 */
  friction: string[];
}

export function buildInjectionMoldingMachine(): Imm {
  const friction: string[] = [];
  let seq = 0;
  const newId = (): NodeId => `imm${++seq}`;

  let doc = emptyDoc();

  /* ── 셸 ─────────────────────────────────────────────── */
  const shell = newId();
  doc = ap(doc, {
    t: 'insert',
    parent: null,
    index: 0,
    node: newNode(shell, 'shell', {
      idShort: 'IMM_150E_002_AAS',
      identifier: `${NS}/aas/${SLUG}`,
      assetKind: 'Instance',
      globalAssetId: `${NS}/asset/${SLUG}`,
      administration: { version: '1', revision: '0' },
      /* 사내 설비번호와 MES 자원 id — 연동의 접점이다 */
      specificAssetIds: [
        { name: 'EquipmentNo', value: 'IMM-02' },
        { name: 'MesResourceId', value: 'RES-2201' },
      ],
      description: [
        { language: 'ko', text: '2공장 라인2 전동식 사출성형기 2호기' },
        { language: 'en', text: 'All-electric injection moulding machine, plant 2 line 2' },
      ],
    }),
  });

  /* ── ① 명판 (IDTA 02006-3-0) ────────────────────────── */
  doc = ap(doc, instantiate(getTemplate('idta-02006')!, { newId, namespace: NS, assetSlug: SLUG, shell }));
  const np = submodelOf(doc, 'Nameplate');

  doc = set(doc, at(doc, np, 'URIOfTheProduct'), 'value', 'https://acme-plastics.example/products/IM-150E/004417');
  doc = set(doc, at(doc, np, 'ManufacturerName'), 'value', [
    { language: 'en', text: 'ACME Plastics Machinery' },
    { language: 'ko', text: '에이스플라스틱기계' },
  ] as unknown as Json);
  doc = set(doc, at(doc, np, 'ManufacturerProductDesignation'), 'value', [
    { language: 'en', text: 'All-electric injection moulding machine IM-150E' },
    { language: 'ko', text: '전동식 사출성형기 IM-150E' },
  ] as unknown as Json);
  doc = set(doc, at(doc, np, 'ManufacturerProductRoot'), 'value', [
    { language: 'en', text: 'Injection moulding machine' },
  ] as unknown as Json);
  doc = set(doc, at(doc, np, 'ManufacturerProductFamily'), 'value', [
    { language: 'en', text: 'IM series' },
  ] as unknown as Json);
  doc = set(doc, at(doc, np, 'ManufacturerProductType'), 'value', 'IM-150E');
  doc = set(doc, at(doc, np, 'OrderCodeOfManufacturer'), 'value', 'IM150E-KR-2026');
  doc = set(doc, at(doc, np, 'ProductArticleNumberOfManufacturer'), 'value', 'IM-150E-STD');
  doc = set(doc, at(doc, np, 'SerialNumber'), 'value', 'SN-IM150E-004417');
  doc = set(doc, at(doc, np, 'YearOfConstruction'), 'value', '2025');
  doc = set(doc, at(doc, np, 'DateOfManufacture'), 'value', '2025-11-08');
  doc = set(doc, at(doc, np, 'CountryOfOrigin'), 'value', 'KR');
  doc = set(doc, at(doc, np, 'CompanyLogo'), 'value', '/aasx/files/acme_plastics_logo.png');
  doc = set(doc, at(doc, np, 'AddressInformation/Street'), 'value', [
    { language: 'ko', text: '과학산단로 123' },
  ] as unknown as Json);
  doc = set(doc, at(doc, np, 'AddressInformation/Zipcode'), 'value', [
    { language: 'ko', text: '46744' },
  ] as unknown as Json);
  doc = set(doc, at(doc, np, 'AddressInformation/CityTown'), 'value', [
    { language: 'ko', text: '부산' },
  ] as unknown as Json);
  doc = set(doc, at(doc, np, 'AddressInformation/NationalCode'), 'value', [
    { language: 'en', text: 'KR' },
  ] as unknown as Json);

  /* ── ② 기술 데이터 (IDTA 02003-1-2) ─────────────────── */
  doc = ap(doc, instantiate(getTemplate('idta-02003')!, { newId, namespace: NS, assetSlug: SLUG, shell }));
  const td = submodelOf(doc, 'TechnicalData');

  doc = set(doc, at(doc, td, 'GeneralInformation/ManufacturerName'), 'value', 'ACME Plastics Machinery');
  doc = set(doc, at(doc, td, 'GeneralInformation/ManufacturerArticleNumber'), 'value', 'IM-150E-STD');
  doc = set(doc, at(doc, td, 'GeneralInformation/ManufacturerOrderCode'), 'value', 'IM150E-KR-2026');
  doc = set(doc, at(doc, td, 'ProductClassifications/ProductClassificationItem/ProductClassificationSystem'), 'value', 'ECLASS');
  doc = set(doc, at(doc, td, 'ProductClassifications/ProductClassificationItem/ClassificationSystemVersion'), 'value', '14.0 (BASIC)');
  /* 사출성형기 eCl@ss 분류 코드. 라이선스가 없어 대조하지 못했다 — 값은 확인 대상이다 */
  doc = set(doc, at(doc, td, 'ProductClassifications/ProductClassificationItem/ProductClassId'), 'value', '21-03-01-01');
  friction.push(
    'eCl@ss 분류 코드(ProductClassId)를 확인할 수 없다 — 라이선스가 없어 사전 조회가 안 된다. P6 사내 용어 매핑으로 보완해야 한다.',
  );

  /* 템플릿의 예시 속성은 CNC 기준이다. 사출성형기에 맞게 손본다.
     RatedPower·AmbientTemperature는 그대로 쓰고(값만 교체), 주축 회전수는 지운다. */
  const tp = at(doc, td, 'TechnicalProperties');
  doc = set(doc, at(doc, tp, 'RatedPower'), 'value', '22');
  doc = set(doc, at(doc, tp, 'AmbientTemperature'), 'min', '10');
  doc = set(doc, at(doc, tp, 'AmbientTemperature'), 'max', '35');
  doc = ap(doc, { t: 'remove', node: at(doc, tp, 'MaxSpindleSpeed') });
  friction.push(
    '템플릿의 예시 속성이 CNC 기준이라 사출성형기에는 맞지 않는다. 이름을 그대로 두고 다른 의미로 쓰면 T-002가 뜬다(적합성 검사가 옳게 잡는다). 자산 종류별 예시 묶음이 필요하다.',
  );

  const prop = (
    d: AasDoc,
    parent: NodeId,
    idShort: string,
    valueType: string,
    value: string,
    concept: string,
  ): AasDoc =>
    ap(d, {
      t: 'insert',
      parent,
      index: Number.MAX_SAFE_INTEGER,
      node: newNode(newId(), 'prop', {
        idShort,
        valueType,
        value,
        semanticId: `${NS}/cd/${concept}/1/0`,
      }),
    });

  doc = prop(doc, tp, 'ClampingForce', 'xs:double', '1471', 'ClampingForce');
  doc = prop(doc, tp, 'ScrewDiameter', 'xs:double', '45', 'ScrewDiameter');
  doc = prop(doc, tp, 'ShotWeightPS', 'xs:double', '320', 'ShotWeightPS');
  doc = prop(doc, tp, 'MaxInjectionPressure', 'xs:double', '200', 'MaxInjectionPressure');
  doc = prop(doc, tp, 'TieBarDistanceH', 'xs:double', '470', 'TieBarDistanceHorizontal');
  doc = prop(doc, tp, 'TieBarDistanceV', 'xs:double', '470', 'TieBarDistanceVertical');
  doc = prop(doc, tp, 'BarrelHeatingZones', 'xs:int', '5', 'BarrelHeatingZones');
  doc = prop(doc, tp, 'DriveType', 'xs:string', 'AllElectric', 'DriveType');
  /* 금형 두께 허용 범위 — Range가 제 역할을 하는 자리다 */
  doc = ap(doc, {
    t: 'insert',
    parent: tp,
    index: Number.MAX_SAFE_INTEGER,
    node: newNode(newId(), 'range', {
      idShort: 'MoldHeight',
      valueType: 'xs:double',
      min: '150',
      max: '450',
      semanticId: `${NS}/cd/MoldHeight/1/0`,
    }),
  });
  friction.push(
    '단위(kN·mm·g·MPa·kW)를 담을 자리가 없다. 값만 남으면 수신 측이 해석하지 못한다 — P6의 ConceptDescription 생성이 있어야 완결된다.',
  );

  /* ── ③ 구성 계층 BoM (IDTA 02011-1-1) ───────────────── */
  doc = ap(doc, instantiate(getTemplate('idta-02011')!, { newId, namespace: NS, assetSlug: SLUG, shell }));
  const hs = submodelOf(doc, 'HierarchicalStructures');
  doc = set(doc, at(doc, hs, 'ArcheType'), 'value', 'OneDown');

  const entry = at(doc, hs, 'EntryNode');
  /* 템플릿이 넣어 준 Node를 실제 부품 이름으로 바꾼다.
     공식 템플릿도 EditIdShort=True를 달고 있다 — 이름을 바꿔 쓰라는 뜻이다. */
  const first = at(doc, entry, 'Node');
  doc = set(doc, first, 'idShort', 'InjectionUnit');
  /* 자동으로 딸려 온 중첩 Node는 이 설비에서는 쓰지 않는다 */
  const nested = (doc.order[first] ?? []).find((c) => doc.nodes[c]?.idShort === 'Node');
  if (nested) doc = ap(doc, { t: 'remove', node: nested });

  for (const name of ['ClampingUnit', 'ControlCabinet', 'Mold']) {
    doc = ap(doc, {
      t: 'insert',
      parent: entry,
      index: Number.MAX_SAFE_INTEGER,
      node: newNode(newId(), 'entity', {
        idShort: name,
        entityType: 'CoManagedEntity',
        semanticId: 'https://admin-shell.io/idta/HierarchicalStructures/Node/1/0',
      }),
    });
  }
  friction.push(
    'BoM의 Node는 이름을 바꿔 쓰는 요소인데(EditIdShort=True) 적합성 검사가 idShort로 대조하면 이름을 바꾼 순간 T-001이 뜬다. semanticId로 대조해야 한다.',
  );

  /* ── ④ OPC UA 접점 (IDTA 02017-1-1) ─────────────────── */
  doc = ap(doc, instantiate(getTemplate('idta-02017-opcua')!, { newId, namespace: NS, assetSlug: SLUG, shell }));
  const aid = submodelOf(doc, 'AssetInterfacesDescription');
  const iface = at(doc, aid, 'InterfaceOPCUA');
  doc = set(doc, at(doc, iface, 'title'), 'value', 'IM-150E controller');
  doc = set(doc, at(doc, iface, 'EndpointMetadata/base'), 'value', 'opc.tcp://10.20.30.40:4840');
  doc = set(
    doc,
    at(doc, iface, 'EndpointMetadata/securityDefinitions/opcua_channel_sc/uav_securityMode'),
    'value',
    'SignAndEncrypt',
  );

  const signals = at(doc, iface, 'InteractionMetadata/properties');
  const tmpl = at(doc, signals, 'property_name');
  doc = set(doc, tmpl, 'idShort', 'BarrelTemperatureZone1');
  doc = set(doc, at(doc, tmpl, 'key'), 'value', 'barrelTemperatureZone1');
  doc = set(doc, at(doc, tmpl, 'title'), 'value', 'Barrel temperature zone 1');
  doc = set(doc, at(doc, tmpl, 'unit'), 'value', 'CEL');
  doc = set(doc, at(doc, tmpl, 'forms/href'), 'value', 'opc.tcp://10.20.30.40:4840');
  doc = set(
    doc,
    at(doc, tmpl, 'forms/uav_browsePath'),
    'value',
    '/Objects/2:IM150E/2:Barrel/2:Zone1/2:Temperature',
  );
  friction.push(
    '신호 하나를 기술하는 데 노드 8개가 든다. 신호가 20개면 160개다 — 캔버스로는 불가능하고 표 편집(P5)이 없으면 못 쓴다.',
  );

  /* ── ⑤ 운전 데이터 (사내 정의) ──────────────────────── */
  const od = newId();
  doc = ap(doc, {
    t: 'insert',
    parent: shell,
    index: Number.MAX_SAFE_INTEGER,
    node: newNode(od, 'submodel', {
      idShort: 'OperationalData',
      identifier: `${NS}/sm/${SLUG}/operational`,
      kind: 'Instance',
      semanticId: `${NS}/cd/InjectionMoldingOperationalData/1/0`,
    }),
  });
  doc = prop(doc, od, 'MachineState', 'xs:string', 'Producing', 'MachineState');
  doc = prop(doc, od, 'CycleTime', 'xs:double', '28.4', 'CycleTime');
  doc = prop(doc, od, 'ShotCount', 'xs:long', '1284771', 'ShotCount');
  doc = prop(doc, od, 'ClampForceActual', 'xs:double', '1465', 'ClampForceActual');
  doc = prop(doc, od, 'ScrewRotationSpeed', 'xs:double', '180', 'ScrewRotationSpeed');
  doc = prop(doc, od, 'CushionValue', 'xs:double', '5.2', 'CushionValue');

  const barrel = newId();
  doc = ap(doc, {
    t: 'insert',
    parent: od,
    index: Number.MAX_SAFE_INTEGER,
    node: newNode(barrel, 'smc', {
      idShort: 'BarrelTemperature',
      semanticId: `${NS}/cd/BarrelTemperature/1/0`,
    }),
  });
  const zones = ['235.4', '241.2', '248.0', '250.6', '246.1'];
  zones.forEach((v, i) => {
    doc = prop(doc, barrel, `Zone${i + 1}`, 'xs:double', v, `BarrelTemperatureZone`);
  });
  doc = prop(doc, od, 'Timestamp', 'xs:dateTime', '2026-08-30T09:30:00+09:00', 'SampleTimestamp');
  friction.push(
    '운전 데이터는 시계열이다. AAS에는 마지막 값 한 벌만 두고 이력은 시계열 저장소로 보내야 한다 — 이 서브모델을 폴링 대상으로 삼으면 안 된다.',
  );

  return { doc, shell, friction };
}
