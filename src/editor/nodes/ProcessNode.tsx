import { NodeResizer, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, Layers3 } from 'lucide-react';
import type { ProcessFlowNode } from '../flowTypes';

export function ProcessNode({ data, selected }: NodeProps<ProcessFlowNode>) {
  const { process } = data;

  return (
    <section
      className={[
        'process-node',
        selected && !data.exporting ? 'is-selected' : '',
        data.dimmed ? 'is-dimmed' : '',
        data.collapsed ? 'is-collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`プロセス ${process.name || '名称未設定'}。ゴール ${
        process.goal || '未設定'
      }`}
      data-testid={`process-node-${process.id}`}
    >
      <NodeResizer
        minWidth={360}
        minHeight={220}
        isVisible={selected && !data.collapsed && !data.exporting}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <header className="process-node__header">
        <button
          className="process-node__toggle nodrag"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            data.onToggleCollapsed(process.id);
          }}
          aria-expanded={!data.collapsed}
          aria-label={`${process.name || 'プロセス'}を${
            data.collapsed ? '展開' : '折り畳み'
          }`}
        >
          {data.collapsed ? (
            <ChevronRight size={16} aria-hidden="true" />
          ) : (
            <ChevronDown size={16} aria-hidden="true" />
          )}
        </button>
        <Layers3 size={15} aria-hidden="true" />
        <strong>{process.name || '名称未設定のプロセス'}</strong>
        <span className="process-node__badge">プロセス</span>
      </header>
      {!data.collapsed && (
        <p className="process-node__goal">{process.goal || 'ゴール未設定'}</p>
      )}
    </section>
  );
}
