import type { NodeProps } from '@xyflow/react';
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type {
  ProcessGridColumnView,
  ProcessGridLaneView,
  ProcessGridNodeData,
  ProcessGridResizeFlowNode,
} from '../flowTypes';
import {
  PROCESS_GRID_ACTOR_HEADER_WIDTH,
  PROCESS_GRID_COLUMN_HEADER_HEIGHT,
} from '../../domain/processGrid';

type ResizeDirection = 'right' | 'bottom' | 'corner';

interface ResizeGesture {
  pointerId: number;
  direction: ResizeDirection;
  startX: number;
  startY: number;
  width: number;
  height: number;
  zoom: number;
}

function ResizeControls({
  column,
  left,
  data,
}: {
  column: ProcessGridColumnView;
  left: number;
  data: ProcessGridNodeData;
}) {
  const gesture = useRef<ResizeGesture | null>(null);

  const resizeToPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const deltaX = (event.clientX - active.startX) / active.zoom;
    const deltaY = (event.clientY - active.startY) / active.zoom;
    data.onResizeColumn(column.processId, {
      ...(active.direction !== 'bottom' ? { width: active.width + deltaX } : {}),
      ...(active.direction !== 'right' ? { height: active.height + deltaY } : {}),
    });
  };

  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    resizeToPointer(event);
    gesture.current = null;
    data.onResizeEnd();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.stopPropagation();
  };

  const startResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    direction: ResizeDirection,
  ) => {
    if (event.button !== 0 || gesture.current) return;
    event.preventDefault();
    event.stopPropagation();
    data.onSelectProcess(column.processId);
    gesture.current = {
      pointerId: event.pointerId,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      width: column.width,
      height: column.height,
      zoom: data.getZoom() || 1,
    };
    data.onResizeStart();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  return (
    <div
      className="process-grid-resize-node__box"
      style={{
        left,
        top: PROCESS_GRID_COLUMN_HEADER_HEIGHT,
        width: column.width,
        height: column.height,
      }}
    >
      {(['right', 'bottom', 'corner'] as const).map((direction) => (
        <button
          key={direction}
          type="button"
          className={`process-grid-node__resize-handle process-grid-node__resize-handle--${direction} nodrag nopan`}
          data-testid={`subprocess-resize-${direction}-${column.processId}`}
          aria-label={`${column.name}の${direction === 'right' ? '幅' : direction === 'bottom' ? '高さ' : '幅と高さ'}を変更`}
          title={direction === 'bottom' ? 'ドラッグで高さ変更、ダブルクリックで自動高さ' : undefined}
          onPointerDown={(event) => startResize(event, direction)}
          onPointerMove={resizeToPointer}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onLostPointerCapture={(event) => {
            if (gesture.current?.pointerId === event.pointerId) {
              gesture.current = null;
              data.onResizeEnd();
            }
          }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => {
            if (direction === 'right') return;
            event.stopPropagation();
            data.onResizeColumn(column.processId, { height: null });
          }}
        />
      ))}
    </div>
  );
}

function LaneResizeControl({
  lane,
  top,
  data,
}: {
  lane: ProcessGridLaneView;
  top: number;
  data: ProcessGridNodeData;
}) {
  const gesture = useRef<{
    pointerId: number;
    startY: number;
    height: number;
    zoom: number;
  } | null>(null);

  const resizeToPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.stopPropagation();
    data.onResizeLane(
      lane.actorId,
      active.height + (event.clientY - active.startY) / active.zoom,
    );
  };

  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    resizeToPointer(event);
    gesture.current = null;
    data.onResizeEnd();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.stopPropagation();
  };

  return (
    <button
      type="button"
      className="process-grid-node__resize-handle process-grid-node__resize-handle--lane nodrag nopan"
      style={{ top: top + lane.height }}
      data-testid={`actor-lane-resize-bottom-${lane.laneId}`}
      aria-label={`${lane.actorName}のレーン高さを変更`}
      title="ドラッグでレーン高さを変更"
      onPointerDown={(event) => {
        if (event.button !== 0 || gesture.current) return;
        event.preventDefault();
        event.stopPropagation();
        data.onSelectActor(lane.actorId);
        gesture.current = {
          pointerId: event.pointerId,
          startY: event.clientY,
          height: lane.height,
          zoom: data.getZoom() || 1,
        };
        data.onResizeStart();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={resizeToPointer}
      onPointerUp={finishResize}
      onPointerCancel={finishResize}
      onLostPointerCapture={(event) => {
        if (gesture.current?.pointerId === event.pointerId) {
          gesture.current = null;
          data.onResizeEnd();
        }
      }}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

/** Transparent interaction layer above relation edges, without obscuring them. */
export function ProcessGridResizeNode({ data }: NodeProps<ProcessGridResizeFlowNode>) {
  let left = PROCESS_GRID_ACTOR_HEADER_WIDTH;
  let top = PROCESS_GRID_COLUMN_HEADER_HEIGHT;
  return (
    <div
      className="process-grid-resize-node nodrag"
      style={{ width: data.width, height: data.height }}
      aria-label="サブプロセス範囲のリサイズ操作"
    >
      {data.columns.map((column) => {
        const columnLeft = left;
        left += column.width;
        return column.unclassified || !column.selected || data.exporting
          ? null
          : (
              <ResizeControls
                key={column.processId}
                column={column}
                left={columnLeft}
                data={data}
              />
            );
      })}
      {data.lanes.map((lane) => {
        const laneTop = top;
        top += lane.height;
        return !lane.selected || data.exporting
          ? null
          : (
              <LaneResizeControl
                key={lane.laneId}
                lane={lane}
                top={laneTop}
                data={data}
              />
            );
      })}
    </div>
  );
}
