import type {
  ArtifactPlacement,
  PrepArtifact,
  PrepModelFile,
  ProcessActorLane,
  ProcessViewLayout,
  SubprocessColumnLayout,
} from './model';
import {
  getArtifactsForActiveProcess,
  getDirectChildProcesses,
} from './processHierarchy';

export const PROCESS_GRID_ACTOR_HEADER_WIDTH = 200;
export const PROCESS_GRID_COLUMN_HEADER_HEIGHT = 80;
export const DEFAULT_LANE_HEIGHT = 220;
export const MIN_LANE_HEIGHT = 160;
export const DEFAULT_COLUMN_WIDTH = 360;
export const MIN_COLUMN_WIDTH = 260;
export const MIN_COLUMN_HEIGHT = 160;
export const DEFAULT_ARTIFACT_WIDTH = 200;
export const DEFAULT_ARTIFACT_HEIGHT = 116;
export const COLUMN_CONTENT_PADDING = 24;

export interface ProcessGridPoint {
  x: number;
  y: number;
}

export interface ProcessGridRect extends ProcessGridPoint {
  width: number;
  height: number;
}

export interface ProcessGridOptions {
  actorHeaderWidth?: number;
  columnHeaderHeight?: number;
  defaultLaneHeight?: number;
  minLaneHeight?: number;
  defaultColumnWidth?: number;
  minColumnWidth?: number;
  minColumnHeight?: number;
  /** Always show the virtual column representing artifacts directly in P. */
  includeUnclassifiedColumn?: boolean;
}

export interface ProcessGridLane extends ProcessActorLane {
  actorName: string;
  y: number;
  width: number;
  rect: ProcessGridRect;
}

export interface ProcessGridColumn extends SubprocessColumnLayout {
  processName: string;
  isUnclassified: boolean;
  autoHeight: boolean;
  x: number;
  /** Resolved content-box height; excludes the column header. */
  height: number;
  /** The visible box over the actor lanes; excludes the column header. */
  rect: ProcessGridRect;
}

export interface ProcessGridCell {
  id: string;
  activeProcessId: string;
  laneId: string;
  actorId: string;
  /** Child process ID, or activeProcessId for the virtual unclassified column. */
  processId: string;
  columnProcessId: string;
  isUnclassified: boolean;
  laneOrder: number;
  columnOrder: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rect: ProcessGridRect;
}

export interface ProcessGridGeometry {
  activeProcessId: string;
  actorHeaderWidth: number;
  columnHeaderHeight: number;
  lanes: ProcessGridLane[];
  columns: ProcessGridColumn[];
  cells: ProcessGridCell[];
  contentWidth: number;
  contentHeight: number;
  totalWidth: number;
  totalHeight: number;
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function resolvedGridOptions(options: ProcessGridOptions) {
  const minLaneHeight = positive(options.minLaneHeight, MIN_LANE_HEIGHT);
  const minColumnWidth = positive(options.minColumnWidth, MIN_COLUMN_WIDTH);
  const minColumnHeight = positive(options.minColumnHeight, MIN_COLUMN_HEIGHT);
  return {
    actorHeaderWidth: nonNegative(
      options.actorHeaderWidth,
      PROCESS_GRID_ACTOR_HEADER_WIDTH,
    ),
    columnHeaderHeight: nonNegative(
      options.columnHeaderHeight,
      PROCESS_GRID_COLUMN_HEADER_HEIGHT,
    ),
    minLaneHeight,
    minColumnWidth,
    minColumnHeight,
    defaultLaneHeight: Math.max(
      positive(options.defaultLaneHeight, DEFAULT_LANE_HEIGHT),
      minLaneHeight,
    ),
    defaultColumnWidth: Math.max(
      positive(options.defaultColumnWidth, DEFAULT_COLUMN_WIDTH),
      minColumnWidth,
    ),
    includeUnclassifiedColumn: options.includeUnclassifiedColumn ?? false,
  };
}

function stableOrder<T extends { order: number }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        left.item.order - right.item.order || left.index - right.index,
    )
    .map(({ item }) => item);
}

function getViewLayout(
  model: PrepModelFile,
  processId: string,
): ProcessViewLayout | undefined {
  return model.layout.processViews?.find((view) => view.processId === processId);
}

function derivedLanes(
  model: PrepModelFile,
  activeProcessId: string,
  defaultHeight: number,
): ProcessActorLane[] {
  const persisted = (model.processActorLanes ?? []).filter(
    (lane) => lane.processId === activeProcessId,
  );
  if (persisted.length > 0) return stableOrder(persisted);

  const childIds = new Set(
    getDirectChildProcesses(model, activeProcessId).map((process) => process.id),
  );
  const actorIds: string[] = [];
  const seen = new Set<string>();
  for (const artifact of model.artifacts) {
    if (
      artifact.processId !== activeProcessId &&
      !childIds.has(artifact.processId ?? '')
    ) {
      continue;
    }
    if (
      artifact.responsibleActorId &&
      !seen.has(artifact.responsibleActorId)
    ) {
      seen.add(artifact.responsibleActorId);
      actorIds.push(artifact.responsibleActorId);
    }
  }

  return actorIds.map((actorId, order) => ({
    id: `derived-lane:${activeProcessId}:${actorId}`,
    processId: activeProcessId,
    actorId,
    order,
    height: defaultHeight,
  }));
}

function derivedColumns(
  model: PrepModelFile,
  activeProcessId: string,
  defaultWidth: number,
  includeUnclassifiedColumn: boolean,
): Array<SubprocessColumnLayout & { isUnclassified: boolean }> {
  const children = getDirectChildProcesses(model, activeProcessId);
  const childIds = new Set(children.map((child) => child.id));
  const saved = (getViewLayout(model, activeProcessId)?.subprocessColumns ?? [])
    .filter(
      (column) =>
        column.parentProcessId === activeProcessId &&
        childIds.has(column.processId),
    );
  const savedByProcess = new Map(saved.map((column) => [column.processId, column]));
  const columns = children.map((child, fallbackOrder) => {
    const persisted = savedByProcess.get(child.id);
    return {
      processId: child.id,
      parentProcessId: activeProcessId,
      order: persisted?.order ?? fallbackOrder,
      width: persisted?.width ?? defaultWidth,
      height: persisted?.height,
      isUnclassified: false,
    };
  });

  const hasDirectArtifacts = model.artifacts.some(
    (artifact) => artifact.processId === activeProcessId,
  );
  if (includeUnclassifiedColumn || hasDirectArtifacts) {
    columns.push({
      processId: activeProcessId,
      parentProcessId: activeProcessId,
      order: -1,
      width: defaultWidth,
      height: undefined,
      isUnclassified: true,
    });
  }

  return stableOrder(columns);
}

/**
 * Calculates the fixed lane x subprocess grid used by a process detail view.
 * Rows/columns are normalized by order without mutating the saved model.
 */
export function getProcessGridGeometry(
  model: PrepModelFile,
  activeProcessId: string,
  options: ProcessGridOptions = {},
): ProcessGridGeometry {
  const config = resolvedGridOptions(options);
  const actorNames = new Map(
    (model.actors ?? []).map((actor) => [actor.id, actor.name]),
  );
  const rawLanes = derivedLanes(
    model,
    activeProcessId,
    config.defaultLaneHeight,
  );
  const rawColumns = derivedColumns(
    model,
    activeProcessId,
    config.defaultColumnWidth,
    config.includeUnclassifiedColumn,
  );

  const contentWidth = rawColumns.reduce(
    (sum, column) =>
      sum + Math.max(positive(column.width, config.defaultColumnWidth), config.minColumnWidth),
    0,
  );
  const contentHeight = rawLanes.reduce(
    (sum, lane) =>
      sum + Math.max(positive(lane.height, config.defaultLaneHeight), config.minLaneHeight),
    0,
  );

  let laneY = config.columnHeaderHeight;
  const lanes: ProcessGridLane[] = rawLanes.map((lane, normalizedOrder) => {
    const height = Math.max(
      positive(lane.height, config.defaultLaneHeight),
      config.minLaneHeight,
    );
    const rect = {
      x: 0,
      y: laneY,
      width: config.actorHeaderWidth + contentWidth,
      height,
    };
    laneY += height;
    return {
      ...lane,
      order: normalizedOrder,
      height,
      actorName: actorNames.get(lane.actorId) ?? lane.actorId,
      y: rect.y,
      width: rect.width,
      rect,
    };
  });

  const processNames = new Map(
    model.processes.map((process) => [process.id, process.name]),
  );
  let columnX = config.actorHeaderWidth;
  const columns: ProcessGridColumn[] = rawColumns.map(
    (column, normalizedOrder) => {
      const width = Math.max(
        positive(column.width, config.defaultColumnWidth),
        config.minColumnWidth,
      );
      const autoHeight = column.height === undefined;
      const height = autoHeight
        ? contentHeight
        : Math.max(
            positive(column.height, config.minColumnHeight),
            config.minColumnHeight,
          );
      const rect = {
        x: columnX,
        y: config.columnHeaderHeight,
        width,
        height,
      };
      columnX += width;
      return {
        ...column,
        order: normalizedOrder,
        width,
        processName: column.isUnclassified
          ? '未分類'
          : (processNames.get(column.processId) ?? column.processId),
        x: rect.x,
        height,
        autoHeight,
        rect,
      };
    },
  );

  const cells = lanes.flatMap((lane) =>
    columns.flatMap((column) => {
      const cellBottom = Math.min(
        lane.rect.y + lane.rect.height,
        column.rect.y + column.rect.height,
      );
      const cellTop = Math.max(lane.rect.y, column.rect.y);
      if (cellBottom <= cellTop) return [];
      const rect = {
        x: column.x,
        y: cellTop,
        width: column.width,
        height: cellBottom - cellTop,
      };
      return [{
        id: `${lane.id}::${column.processId}`,
        activeProcessId,
        laneId: lane.id,
        actorId: lane.actorId,
        processId: column.processId,
        columnProcessId: column.processId,
        isUnclassified: column.isUnclassified,
        laneOrder: lane.order,
        columnOrder: column.order,
        ...rect,
        rect,
      } satisfies ProcessGridCell];
    }),
  );

  const resolvedContentHeight = Math.max(
    contentHeight,
    ...columns.map((column) => column.height),
  );

  return {
    activeProcessId,
    actorHeaderWidth: config.actorHeaderWidth,
    columnHeaderHeight: config.columnHeaderHeight,
    lanes,
    columns,
    cells,
    contentWidth,
    contentHeight,
    totalWidth: config.actorHeaderWidth + contentWidth,
    totalHeight: config.columnHeaderHeight + resolvedContentHeight,
  };
}

/**
 * Smallest box which preserves every owned artifact's outer edge with a
 * 24px gap. Saved placements are cell-relative, so lane offsets matter for
 * the vertical bound but later column widths do not.
 */
export function getSubprocessColumnMinimumSize(
  model: PrepModelFile,
  parentProcessId: string,
  processId: string,
  options: ProcessGridOptions = {},
): { width: number; height: number } {
  const geometry = getProcessGridGeometry(model, parentProcessId, options);
  const column = geometry.columns.find(
    (candidate) =>
      !candidate.isUnclassified && candidate.processId === processId,
  );
  const config = resolvedGridOptions(options);
  if (!column) {
    return { width: config.minColumnWidth, height: config.minColumnHeight };
  }

  const placements = new Map(
    (getViewLayout(model, parentProcessId)?.artifactPlacements ?? []).map(
      (placement) => [placement.artifactId, placement],
    ),
  );
  const nodeLayouts = new Map(model.layout.nodes.map((node) => [node.id, node]));
  let width = config.minColumnWidth;
  let height = config.minColumnHeight;

  getArtifactsForActiveProcess(model, parentProcessId).forEach(
    (artifact, index) => {
      if (artifact.processId !== processId) return;
      const lane = geometry.lanes.find(
        (candidate) => candidate.actorId === artifact.responsibleActorId,
      );
      if (!lane) return;
      const placement = placements.get(artifact.id);
      const node = nodeLayouts.get(artifact.id);
      const offsetX = Math.max(
        12,
        placement?.offsetX ?? 24 + (index % 2) * 32,
      );
      const offsetY = Math.max(
        12,
        placement?.offsetY ?? 34 + (index % 3) * 24,
      );
      const artifactWidth = positive(node?.width, DEFAULT_ARTIFACT_WIDTH);
      const artifactHeight = positive(node?.height, DEFAULT_ARTIFACT_HEIGHT);
      width = Math.max(
        width,
        offsetX + artifactWidth + COLUMN_CONTENT_PADDING,
      );
      height = Math.max(
        height,
        lane.y - geometry.columnHeaderHeight + offsetY + artifactHeight +
          COLUMN_CONTENT_PADDING,
      );
    },
  );

  return { width, height };
}

/**
 * Smallest lane height which keeps the outer edge of every owned artifact
 * inside its row with the same 24px breathing room as a subprocess box.
 * Placements are cell-relative, so changing an earlier row never alters an
 * artifact's offset within its own row.
 */
export function getActorLaneMinimumHeight(
  model: PrepModelFile,
  activeProcessId: string,
  actorId: string,
  options: ProcessGridOptions = {},
): number {
  const config = resolvedGridOptions(options);
  const geometry = getProcessGridGeometry(model, activeProcessId, options);
  if (!geometry.lanes.some((lane) => lane.actorId === actorId)) {
    return config.minLaneHeight;
  }

  const placements = new Map(
    (getViewLayout(model, activeProcessId)?.artifactPlacements ?? []).map(
      (placement) => [placement.artifactId, placement],
    ),
  );
  const nodeLayouts = new Map(model.layout.nodes.map((node) => [node.id, node]));
  let height = config.minLaneHeight;

  getArtifactsForActiveProcess(model, activeProcessId).forEach(
    (artifact, index) => {
      if (artifact.responsibleActorId !== actorId) return;
      const placement = placements.get(artifact.id);
      const node = nodeLayouts.get(artifact.id);
      const offsetY = Math.max(
        12,
        placement?.offsetY ?? 34 + (index % 3) * 24,
      );
      const artifactHeight = positive(node?.height, DEFAULT_ARTIFACT_HEIGHT);
      height = Math.max(
        height,
        offsetY + artifactHeight + COLUMN_CONTENT_PADDING,
      );
    },
  );

  return height;
}

/**
 * A taller row moves all following rows down. In a manually sized subprocess
 * box this could push an artifact past the box's lower edge, so cap growth at
 * the smallest available gap. Auto-height boxes grow with the rows instead.
 */
export function getActorLaneMaximumHeight(
  model: PrepModelFile,
  activeProcessId: string,
  actorId: string,
  options: ProcessGridOptions = {},
): number {
  const geometry = getProcessGridGeometry(model, activeProcessId, options);
  const target = geometry.lanes.find((lane) => lane.actorId === actorId);
  if (!target) return Number.POSITIVE_INFINITY;

  const placements = new Map(
    (getViewLayout(model, activeProcessId)?.artifactPlacements ?? []).map(
      (placement) => [placement.artifactId, placement],
    ),
  );
  const nodeLayouts = new Map(model.layout.nodes.map((node) => [node.id, node]));
  let maximum = Number.POSITIVE_INFINITY;

  getArtifactsForActiveProcess(model, activeProcessId).forEach(
    (artifact, index) => {
      const lane = geometry.lanes.find(
        (candidate) => candidate.actorId === artifact.responsibleActorId,
      );
      if (!lane || lane.order <= target.order) return;
      const column = geometry.columns.find(
        (candidate) => candidate.processId === artifact.processId,
      );
      if (!column || column.autoHeight) return;

      const placement = placements.get(artifact.id);
      const node = nodeLayouts.get(artifact.id);
      const offsetY = Math.max(
        12,
        placement?.offsetY ?? 34 + (index % 3) * 24,
      );
      const artifactHeight = positive(node?.height, DEFAULT_ARTIFACT_HEIGHT);
      const requiredBottom =
        lane.y - geometry.columnHeaderHeight + offsetY + artifactHeight +
        COLUMN_CONTENT_PADDING;
      maximum = Math.min(
        maximum,
        target.height + column.height - requiredBottom,
      );
    },
  );

  // Existing imported layouts can already violate the padding rule. Do not
  // make a resize gesture shrink such a lane unexpectedly.
  return Math.max(target.height, maximum);
}

export const calculateProcessGrid = getProcessGridGeometry;

export function pointIsInsideRect(
  point: ProcessGridPoint,
  rect: ProcessGridRect,
): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}

export function findProcessGridCellAtPoint(
  geometry: Pick<ProcessGridGeometry, 'cells'>,
  point: ProcessGridPoint,
): ProcessGridCell | undefined {
  return geometry.cells.find((cell) => pointIsInsideRect(point, cell.rect));
}

export const findCellAtPoint = findProcessGridCellAtPoint;

export function getArtifactGridCell(
  model: PrepModelFile,
  activeProcessId: string,
  artifact: Pick<PrepArtifact, 'processId' | 'responsibleActorId'>,
  options?: ProcessGridOptions,
): ProcessGridCell | undefined {
  if (!artifact.processId || !artifact.responsibleActorId) return undefined;
  return getProcessGridGeometry(model, activeProcessId, options).cells.find(
    (cell) =>
      cell.processId === artifact.processId &&
      cell.actorId === artifact.responsibleActorId,
  );
}

export function updateArtifactForGridCell(
  artifact: PrepArtifact,
  targetCell: Pick<ProcessGridCell, 'actorId' | 'processId'>,
): PrepArtifact {
  return {
    ...artifact,
    processId: targetCell.processId,
    responsibleActorId: targetCell.actorId,
  };
}

function updatePlacement(
  views: readonly ProcessViewLayout[] | undefined,
  activeProcessId: string,
  artifactId: string,
  placement: ArtifactPlacement,
  fallbackViewport: PrepModelFile['layout']['viewport'],
): ProcessViewLayout[] {
  const result = (views ?? []).map((view) => ({
    ...view,
    artifactPlacements: [...view.artifactPlacements],
    subprocessColumns: [...view.subprocessColumns],
    viewport: { ...view.viewport },
  }));
  const index = result.findIndex((view) => view.processId === activeProcessId);
  if (index < 0) {
    result.push({
      processId: activeProcessId,
      artifactPlacements: [placement],
      subprocessColumns: [],
      viewport: { ...fallbackViewport },
    });
    return result;
  }

  const current = result[index];
  current.artifactPlacements = [
    ...current.artifactPlacements.filter(
      (candidate) => candidate.artifactId !== artifactId,
    ),
    placement,
  ];
  return result;
}

/**
 * Immutably moves an artifact to a valid cell. Both domain ownership fields
 * and its cell-relative placement are updated in one operation.
 */
export function moveArtifactToCell(
  model: PrepModelFile,
  artifactId: string,
  targetCell: ProcessGridCell,
  offset: Partial<Pick<ArtifactPlacement, 'offsetX' | 'offsetY'>> = {},
): PrepModelFile {
  const artifactIndex = model.artifacts.findIndex(
    (artifact) => artifact.id === artifactId,
  );
  if (artifactIndex < 0) return model;

  const existingPlacement = model.layout.processViews
    ?.find((view) => view.processId === targetCell.activeProcessId)
    ?.artifactPlacements.find(
      (placement) => placement.artifactId === artifactId,
    );
  const placement = {
    artifactId,
    offsetX: Math.max(0, offset.offsetX ?? existingPlacement?.offsetX ?? 0),
    offsetY: Math.max(0, offset.offsetY ?? existingPlacement?.offsetY ?? 0),
  };

  const artifacts = [...model.artifacts];
  artifacts[artifactIndex] = updateArtifactForGridCell(
    artifacts[artifactIndex],
    targetCell,
  );
  const processViews = updatePlacement(
    model.layout.processViews,
    targetCell.activeProcessId,
    artifactId,
    placement,
    model.layout.viewport,
  );
  const nodes = model.layout.nodes.map((node) =>
    node.id === artifactId
      ? {
          ...node,
          parentId: targetCell.processId,
          x: targetCell.x + placement.offsetX,
          y: targetCell.y + placement.offsetY,
        }
      : node,
  );

  return {
    ...model,
    artifacts,
    layout: {
      ...model.layout,
      nodes,
      processViews,
    },
  };
}

export const moveArtifactInProcessGrid = moveArtifactToCell;

/** A drop outside every cell is rejected by returning the original snapshot. */
export function moveArtifactToGridPoint(
  model: PrepModelFile,
  activeProcessId: string,
  artifactId: string,
  point: ProcessGridPoint,
  options?: ProcessGridOptions,
): PrepModelFile {
  const geometry = getProcessGridGeometry(model, activeProcessId, options);
  const cell = findProcessGridCellAtPoint(geometry, point);
  if (!cell) return model;
  return moveArtifactToCell(model, artifactId, cell, {
    offsetX: point.x - cell.x,
    offsetY: point.y - cell.y,
  });
}
