import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import type { ProcessHandoffFlowEdge } from '../flowTypes';

export function ProcessHandoffEdge({
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
}: EdgeProps<ProcessHandoffFlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 18,
    offset: 18,
  });
  if (!data) return null;

  return (
    <g
      className={[
        'handoff-edge',
        `handoff-edge--${data.handoff.prepType}`,
        selected && !data.exporting ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`process-handoff-edge-${id}`}
    >
      <BaseEdge
        id={id}
        path={path}
        markerStart={markerStart}
        markerEnd={markerEnd}
        className="handoff-edge__path"
      />
      {data.label && (
        <EdgeLabelRenderer>
          <div
            className="handoff-edge__label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}
