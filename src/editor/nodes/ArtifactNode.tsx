import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Box, CheckCircle2, Sparkles } from 'lucide-react';
import type { ArtifactFlowNode } from '../flowTypes';

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

const typeLabels = {
  intermediate: '中間成果物',
  final: '最終成果物',
  milestone: 'マイルストーン',
  intangible: '無実体成果物',
} as const;

const typeIcons = {
  intermediate: Box,
  final: CheckCircle2,
  milestone: CheckCircle2,
  intangible: Sparkles,
} as const;

export function ArtifactNode({
  data,
  selected,
}: NodeProps<ArtifactFlowNode>) {
  const { artifact } = data;
  const currentState = artifact.states.find((state) => state.isCurrent);
  const TypeIcon = typeIcons[artifact.type];
  const riskPresent =
    artifact.risk.level === 'medium' || artifact.risk.level === 'high';

  return (
    <article
      className={[
        'artifact-node',
        `artifact-node--${artifact.type}`,
        selected && !data.exporting ? 'is-selected' : '',
        data.dimmed ? 'is-dimmed' : '',
        data.highlighted ? 'is-highlighted' : '',
        data.impactKind ? `impact-${data.impactKind}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${artifact.name || '名称未設定'}、${typeLabels[artifact.type]}、現在状態 ${
        currentState?.name || '未設定'
      }、リスク ${artifact.risk.level}`}
      data-testid={`artifact-node-${artifact.id}`}
    >
      {anchorHandles.map(({ id, position }) => (
        <Handle
          key={id}
          id={id}
          type="source"
          position={position}
          className={`connection-handle connection-handle--${id}`}
          aria-label={`${artifact.name || '成果物'}の${id}接続点`}
          data-anchor={id}
        />
      ))}
      <header className="artifact-node__header">
        <span className="artifact-node__type">
          <TypeIcon aria-hidden="true" size={13} />
          {typeLabels[artifact.type]}
        </span>
        {riskPresent && (
          <span
            className={`risk-indicator risk-indicator--${artifact.risk.level}`}
            title={`${artifact.risk.level === 'high' ? '高' : '中'}リスク`}
            aria-label={`${artifact.risk.level === 'high' ? '高' : '中'}リスク`}
          >
            <AlertTriangle size={16} aria-hidden="true" />
          </span>
        )}
      </header>
      <div className="artifact-node__body">
        <strong className="artifact-node__name">
          {artifact.name || '名称未設定'}
        </strong>
        <span className="artifact-node__state">
          {currentState?.name || '状態未設定'}
        </span>
        <span className="artifact-node__mark" aria-hidden="true" />
      </div>
    </article>
  );
}
