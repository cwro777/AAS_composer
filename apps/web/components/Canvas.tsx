'use client';

/**
 * 캔버스 — 트리와 **같은 스토어**를 본다.
 *
 * 여기서 만드는 것도 전부 `Cmd`다. 연결선을 그으면 move 명령이 나가고, 커널이
 * 포함 규칙으로 거부하면 사유가 토스트로 뜬다. 노드를 끄는 것은 Layout만 바꾸므로
 * 실행취소 대상이 아니다.
 */

import { useCallback, useEffect, useMemo } from 'react';

import {
  Background,
  Controls,
  Handle,
  MiniMap,
  type Edge,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { type AasNode, type NodeId, MODEL_TYPE, acceptsOf, childrenOf } from '@aas/kernel';

import { treeLayout } from '../lib/layout';
import { useEditor } from '../lib/store';

interface CardData extends Record<string, unknown> {
  node: AasNode;
  childCount: number;
}

function shortSem(s: string): string {
  return s.length > 30 ? `${s.slice(0, 14)}…${s.slice(-14)}` : s;
}

function preview(n: AasNode): string {
  switch (n.t) {
    case 'prop':
      return `${(n.valueType ?? '').replace('xs:', '')} = ${n.value || '—'}`;
    case 'range':
      return `${(n.valueType ?? '').replace('xs:', '')} [${n.min || '—'} … ${n.max || '—'}]`;
    case 'mlp':
      return n.value
        .filter((l) => l.text)
        .map((l) => `${l.language}: ${l.text}`)
        .join(' · ');
    case 'file':
      return n.value || '—';
    case 'sml':
      return n.typeValueListElement;
    case 'entity':
      return n.entityType;
    case 'shell':
      return n.assetKind;
    case 'submodel':
      return n.identifier || '—';
    default:
      return '';
  }
}

function Card({ data, selected }: NodeProps): React.JSX.Element {
  const { node, childCount } = data as CardData;
  const text = preview(node);
  return (
    <div className={`card${selected ? ' sel' : ''}`}>
      <i className="stripe" style={{ background: `var(--n-${node.t})` }} />
      <Handle type="target" position={Position.Left} />
      <div className="head">
        <span className="kind" style={{ color: `var(--n-${node.t})` }}>
          {MODEL_TYPE[node.t]}
        </span>
        {childCount ? <span className="kids">{childCount}</span> : null}
      </div>
      <div className="name">{node.idShort || '(이름 없음)'}</div>
      <div className="sem">{node.semanticId ? shortSem(node.semanticId) : '⚠ semanticId 없음'}</div>
      {text ? <div className="val">{text}</div> : null}
      {acceptsOf(node.t).length ? <Handle type="source" position={Position.Right} /> : null}
    </div>
  );
}

const nodeTypes = { card: Card };

export function Canvas(): React.JSX.Element {
  const doc = useEditor((s) => s.doc);
  const pos = useEditor((s) => s.layout.pos);
  const selected = useEditor((s) => s.selected);
  const select = useEditor((s) => s.select);
  const moveTo = useEditor((s) => s.moveTo);
  const run = useEditor((s) => s.run);
  const { fitView } = useReactFlow();

  /* 좌표가 없는 노드는 트리 배치로 채운다 — 새로 넣은 노드가 원점에 겹치지 않게 */
  const auto = useMemo(() => treeLayout(doc), [doc]);

  const nodes = useMemo<Node[]>(
    () =>
      Object.keys(doc.nodes).map((id) => ({
        id,
        type: 'card',
        position: pos[id] ?? auto[id] ?? { x: 0, y: 0 },
        selected: id === selected,
        data: { node: doc.nodes[id]!, childCount: childrenOf(doc, id).length } satisfies CardData,
      })),
    [doc, pos, auto, selected],
  );

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    for (const [parent, kids] of Object.entries(doc.order)) {
      for (const k of kids) out.push({ id: `${parent}->${k}`, source: parent, target: k });
    }
    return out;
  }, [doc.order]);

  /* 문서가 비었다가 채워지면 한 번 맞춰 준다 */
  useEffect(() => {
    if (nodes.length) void fitView({ duration: 200, padding: 0.2 });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [nodes.length === 0]);

  const onConnect = useCallback(
    ({ source, target }: { source: string | null; target: string | null }) => {
      if (!source || !target) return;
      run(
        { t: 'move', node: target as NodeId, parent: source as NodeId, index: Number.MAX_SAFE_INTEGER },
        '연결',
      );
    },
    [run],
  );

  if (nodes.length === 0) {
    return (
      <div className="empty">
        <b>캔버스가 비어 있습니다</b>
        <span>왼쪽 팔레트에서 AAS Shell을 추가하거나 IDTA 템플릿을 눌러 시작하세요.</span>
      </div>
    );
  }

  return (
    <div className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onlyRenderVisibleElements
        minZoom={0.2}
        maxZoom={2.2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => select(n.id as NodeId)}
        onPaneClick={() => select(null)}
        onNodeDragStop={(_, n) => moveTo(n.id as NodeId, n.position)}
        onConnect={onConnect}
      >
        <Background gap={22} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
