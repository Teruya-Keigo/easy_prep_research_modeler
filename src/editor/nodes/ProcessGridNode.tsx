import type { NodeProps } from '@xyflow/react';
import { ArrowRight, UserRound } from 'lucide-react';
import type {
  ProcessGridColumnView,
  ProcessGridFlowNode,
  ProcessGridNodeData,
} from '../flowTypes';
import {
  PROCESS_GRID_ACTOR_HEADER_WIDTH,
  PROCESS_GRID_COLUMN_HEADER_HEIGHT,
} from '../../domain/processGrid';

export {
  PROCESS_GRID_ACTOR_HEADER_WIDTH,
  PROCESS_GRID_COLUMN_HEADER_HEIGHT,
} from '../../domain/processGrid';

function SubprocessRangeBox({
  column,
  left,
  data,
}: {
  column: ProcessGridColumnView;
  left: number;
  data: ProcessGridNodeData;
}) {
  return (
    <div
      className={`process-grid-node__range-box${column.selected ? ' is-selected' : ''}`}
      style={{
        left,
        top: PROCESS_GRID_COLUMN_HEADER_HEIGHT,
        width: column.width,
        height: column.height,
      }}
      data-testid={`subprocess-box-${column.processId}`}
      role="button"
      tabIndex={0}
      aria-label={`${column.name}の範囲ボックス`}
      aria-pressed={column.selected}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        data.onSelectProcess(column.processId);
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        data.onSelectProcess(column.processId);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        data.onResizeColumn(column.processId, { height: null });
      }}
    />
  );
}

export function ProcessGridNode({ data }: NodeProps<ProcessGridFlowNode>) {
  let rowTop = PROCESS_GRID_COLUMN_HEADER_HEIGHT;
  let columnLeft = PROCESS_GRID_ACTOR_HEADER_WIDTH;

  return (
    <section
      className="process-grid-node nodrag"
      style={{ width: data.width, height: data.height }}
      data-testid="process-grid"
      aria-label={`${data.processName}の責任グリッド`}
    >
      <div
        className="process-grid-node__corner"
        style={{
          width: PROCESS_GRID_ACTOR_HEADER_WIDTH,
          height: PROCESS_GRID_COLUMN_HEADER_HEIGHT,
        }}
      >
        <small>ACTOR × SUBPROCESS</small>
        <strong>{data.processName || 'プロセス詳細'}</strong>
      </div>

      {data.columns.map((column) => {
        const left = columnLeft;
        columnLeft += column.width;
        return (
          <header
            key={column.processId}
            className={[
              'process-grid-node__column-header',
              column.unclassified ? 'is-unclassified' : '',
              column.selected ? 'is-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              left,
              width: column.width,
              height: PROCESS_GRID_COLUMN_HEADER_HEIGHT,
            }}
          >
            <button
              type="button"
              className="process-grid-node__column-select nodrag"
              onClick={() => data.onSelectProcess(column.processId)}
            >
              <strong>{column.name}</strong>
              <small>{column.goal || (column.unclassified ? '親プロセス直下の成果物' : 'ゴール未設定')}</small>
            </button>
            {!column.unclassified && (
              <button
                type="button"
                className="process-grid-node__open nodrag"
                onClick={() => data.onOpenProcess(column.processId)}
                aria-label={`${column.name}を開く`}
              >
                開く <ArrowRight size={12} />
              </button>
            )}
          </header>
        );
      })}

      {data.lanes.map((lane, rowIndex) => {
        const top = rowTop;
        rowTop += lane.height;
        let cellLeft = PROCESS_GRID_ACTOR_HEADER_WIDTH;
        return (
          <div key={lane.laneId}>
            <button
              type="button"
              className={`process-grid-node__lane-header nodrag${lane.selected ? ' is-selected' : ''}`}
              style={{
                top,
                width: PROCESS_GRID_ACTOR_HEADER_WIDTH,
                height: lane.height,
              }}
              onClick={() => data.onSelectActor(lane.actorId)}
            >
              <UserRound size={16} />
              <span>
                <strong>{lane.actorName}</strong>
                <small>{lane.role || '役割未設定'}</small>
              </span>
            </button>
            {data.columns.map((column) => {
              const left = cellLeft;
              cellLeft += column.width;
              const visibleHeight = Math.max(
                0,
                Math.min(top + lane.height, PROCESS_GRID_COLUMN_HEADER_HEIGHT + column.height) - top,
              );
              if (visibleHeight === 0) return null;
              return (
                <div
                  key={`${lane.laneId}:${column.processId}`}
                  className={[
                    'process-grid-node__cell',
                    rowIndex % 2 ? 'is-alternate' : '',
                    column.unclassified ? 'is-unclassified' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-lane-id={lane.laneId}
                  data-actor-id={lane.actorId}
                  data-process-id={column.processId}
                  style={{ left, top, width: column.width, height: visibleHeight }}
                />
              );
            })}
            {lane.selected && (
              <div
                className="process-grid-node__lane-outline"
                style={{ top, width: data.width, height: lane.height }}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}

      {data.columns.map((column) => {
        const left = PROCESS_GRID_ACTOR_HEADER_WIDTH +
          data.columns
            .slice(0, data.columns.indexOf(column))
            .reduce((sum, item) => sum + item.width, 0);
        return column.unclassified ? null : (
          <SubprocessRangeBox
            key={column.processId}
            column={column}
            left={left}
            data={data}
          />
        );
      })}
    </section>
  );
}
