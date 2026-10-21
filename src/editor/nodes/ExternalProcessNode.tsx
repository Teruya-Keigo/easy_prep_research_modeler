import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { ExternalLink } from 'lucide-react';
import type { ExternalProcessFlowNode } from '../flowTypes';

export function ExternalProcessNode({
  data,
  selected,
}: NodeProps<ExternalProcessFlowNode>) {
  const item = data.externalProcess;

  return (
    <article
      className={[
        'external-process-node',
        selected && !data.exporting ? 'is-selected' : '',
        data.dimmed ? 'is-dimmed' : '',
        data.highlighted ? 'is-highlighted' : '',
        data.impactKind ? `impact-${data.impactKind}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`外部プロセス ${item.name || '名称未設定'}`}
      data-testid={`external-process-node-${item.id}`}
    >
      <NodeResizer
        minWidth={150}
        minHeight={64}
        isVisible={selected && !data.exporting}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <Handle
        id="target"
        type="target"
        position={Position.Left}
        className="connection-handle"
      />
      <ExternalLink size={15} aria-hidden="true" />
      <span>{item.name || '外部プロセス'}</span>
      <Handle
        id="source"
        type="source"
        position={Position.Right}
        className="connection-handle"
      />
    </article>
  );
}
