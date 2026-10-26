import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ExternalLink, Layers3 } from 'lucide-react';
import type { OverviewProcessFlowNode } from '../flowTypes';

const anchorHandles = [
  { id: 'n', position: Position.Top },
  { id: 'ne', position: Position.Right },
  { id: 'e', position: Position.Right },
  { id: 'se', position: Position.Right },
  { id: 's', position: Position.Bottom },
  { id: 'sw', position: Position.Left },
  { id: 'w', position: Position.Left },
  { id: 'nw', position: Position.Left },
] as const;

export function OverviewProcessNode({
  data,
  selected,
}: NodeProps<OverviewProcessFlowNode>) {
  const external = data.kind === 'external-process';
  const open = () => {
    if (!external) data.onOpen?.(data.id);
  };

  return (
    <article
      className={[
        'overview-process-node',
        external ? 'overview-process-node--external' : '',
        selected && !data.exporting ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${external ? '外部プロセス' : 'プロセス'} ${
        data.name || '名称未設定'
      }`}
      data-testid={`overview-${external ? 'external-' : ''}process-${data.id}`}
      tabIndex={external ? -1 : 0}
      onDoubleClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          open();
        }
      }}
    >
      <span className="overview-process-node__inner" aria-hidden="true" />
      <span className="overview-process-node__label">
        {external ? <ExternalLink size={14} /> : <Layers3 size={14} />}
        <strong>{data.name || '名称未設定'}</strong>
      </span>
      {anchorHandles.map(({ id, position }) => (
        <Handle
          key={id}
          id={id}
          type="source"
          position={position}
          className={`connection-handle connection-handle--${id}`}
          aria-label={`${data.name || 'プロセス'}の${id}接続点`}
          data-anchor={id}
        />
      ))}
    </article>
  );
}
