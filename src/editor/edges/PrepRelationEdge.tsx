import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import type { PrepRelationFlowEdge } from '../flowTypes';

export function PrepRelationEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerStart,
  markerEnd,
  data,
  selected,
}: EdgeProps<PrepRelationFlowEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
    offset: 10,
  });

  if (!data) return null;
  const relation = data.relation;
  const riskClass =
    data.showRisk &&
    (relation.risk.level === 'high' || relation.risk.level === 'medium')
      ? `risk-${relation.risk.level}`
      : '';

  return (
    <g
      className={[
        'prep-edge',
        `prep-edge--${relation.prepType}`,
        selected && !data.exporting ? 'is-selected' : '',
        data.dimmed ? 'is-dimmed' : '',
        data.highlighted ? 'is-highlighted' : '',
        data.impactKind ? `impact-${data.impactKind}` : '',
        riskClass,
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`relation-edge-${id}`}
    >
      <BaseEdge
        id={id}
        path={edgePath}
        markerStart={markerStart}
        markerEnd={markerEnd}
        className="prep-edge__path"
      />
      {relation.semanticType && (
        <EdgeLabelRenderer>
          <div
            className="prep-edge__label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {relation.semanticType}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}
