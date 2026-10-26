import {
  graphlib,
  layout as runDagreLayout,
} from '@dagrejs/dagre';
import type {
  NodeLayout,
  OverviewNodeLayout,
  PrepModelFile,
  PrepRelation,
} from '../domain/model';

export type AutoLayoutDirection = 'LR' | 'RL' | 'TB' | 'BT';

export interface AutoLayoutOptions {
  direction?: AutoLayoutDirection;
  nodeSpacing?: number;
  rankSpacing?: number;
  graphMargin?: number;
  processPadding?: number;
  processHeaderHeight?: number;
  artifactWidth?: number;
  artifactHeight?: number;
  externalProcessWidth?: number;
  externalProcessHeight?: number;
  processMinWidth?: number;
  processMinHeight?: number;
}

export const DEFAULT_AUTO_LAYOUT_OPTIONS = {
  direction: 'LR',
  nodeSpacing: 60,
  rankSpacing: 100,
  graphMargin: 40,
  processPadding: 32,
  processHeaderHeight: 72,
  artifactWidth: 220,
  artifactHeight: 100,
  externalProcessWidth: 190,
  externalProcessHeight: 72,
  processMinWidth: 360,
  processMinHeight: 240,
} as const satisfies Required<AutoLayoutOptions>;

interface LayoutItem {
  id: string;
  width: number;
  height: number;
}

interface PositionedItem extends LayoutItem {
  x: number;
  y: number;
}

interface LayoutEdge {
  sourceId: string;
  targetId: string;
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function nonNegative(
  value: number | undefined,
  fallback: number,
): number {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function resolvedOptions(
  options: AutoLayoutOptions,
): Required<AutoLayoutOptions> {
  const direction = options.direction ?? DEFAULT_AUTO_LAYOUT_OPTIONS.direction;
  if (!['LR', 'RL', 'TB', 'BT'].includes(direction)) {
    throw new RangeError(`Unsupported layout direction: ${direction}`);
  }

  return {
    direction,
    nodeSpacing: nonNegative(
      options.nodeSpacing,
      DEFAULT_AUTO_LAYOUT_OPTIONS.nodeSpacing,
    ),
    rankSpacing: nonNegative(
      options.rankSpacing,
      DEFAULT_AUTO_LAYOUT_OPTIONS.rankSpacing,
    ),
    graphMargin: nonNegative(
      options.graphMargin,
      DEFAULT_AUTO_LAYOUT_OPTIONS.graphMargin,
    ),
    processPadding: nonNegative(
      options.processPadding,
      DEFAULT_AUTO_LAYOUT_OPTIONS.processPadding,
    ),
    processHeaderHeight: nonNegative(
      options.processHeaderHeight,
      DEFAULT_AUTO_LAYOUT_OPTIONS.processHeaderHeight,
    ),
    artifactWidth: positive(
      options.artifactWidth,
      DEFAULT_AUTO_LAYOUT_OPTIONS.artifactWidth,
    ),
    artifactHeight: positive(
      options.artifactHeight,
      DEFAULT_AUTO_LAYOUT_OPTIONS.artifactHeight,
    ),
    externalProcessWidth: positive(
      options.externalProcessWidth,
      DEFAULT_AUTO_LAYOUT_OPTIONS.externalProcessWidth,
    ),
    externalProcessHeight: positive(
      options.externalProcessHeight,
      DEFAULT_AUTO_LAYOUT_OPTIONS.externalProcessHeight,
    ),
    processMinWidth: positive(
      options.processMinWidth,
      DEFAULT_AUTO_LAYOUT_OPTIONS.processMinWidth,
    ),
    processMinHeight: positive(
      options.processMinHeight,
      DEFAULT_AUTO_LAYOUT_OPTIONS.processMinHeight,
    ),
  };
}

function dagreLayout(
  items: LayoutItem[],
  edges: LayoutEdge[],
  options: Required<AutoLayoutOptions>,
  margin: number,
): Map<string, PositionedItem> {
  if (items.length === 0) {
    return new Map();
  }

  const itemIds = new Set(items.map((item) => item.id));
  const graph = new graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: options.direction,
    nodesep: options.nodeSpacing,
    ranksep: options.rankSpacing,
    marginx: margin,
    marginy: margin,
  });

  for (const item of items) {
    graph.setNode(item.id, {
      width: item.width,
      height: item.height,
    });
  }

  for (const edge of edges) {
    if (
      edge.sourceId !== edge.targetId &&
      itemIds.has(edge.sourceId) &&
      itemIds.has(edge.targetId)
    ) {
      graph.setEdge(edge.sourceId, edge.targetId);
    }
  }

  runDagreLayout(graph);

  return new Map(
    items.map((item) => {
      const positioned = graph.node(item.id);
      return [
        item.id,
        {
          ...item,
          x: positioned.x - item.width / 2,
          y: positioned.y - item.height / 2,
        },
      ];
    }),
  );
}

function edgesWithin(
  relations: PrepRelation[],
  ids: Set<string>,
): LayoutEdge[] {
  return relations
    .filter(
      (relation) =>
        ids.has(relation.sourceId) && ids.has(relation.targetId),
    )
    .map((relation) => ({
      sourceId: relation.sourceId,
      targetId: relation.targetId,
    }));
}

function normalizePositions(
  positions: Map<string, PositionedItem>,
  offsetX: number,
  offsetY: number,
): Map<string, PositionedItem> {
  if (positions.size === 0) {
    return positions;
  }

  const minX = Math.min(
    ...[...positions.values()].map((item) => item.x),
  );
  const minY = Math.min(
    ...[...positions.values()].map((item) => item.y),
  );

  return new Map(
    [...positions].map(([id, item]) => [
      id,
      {
        ...item,
        x: item.x - minX + offsetX,
        y: item.y - minY + offsetY,
      },
    ]),
  );
}

/**
 * Calculates the v1.2 overview positions with Dagre.
 *
 * The overview is deliberately independent from the process-detail grid:
 * only top-level processes and external processes become nodes, and only
 * ProcessHandoff records influence their ordering.  Actor lanes,
 * subprocess columns, artifact placements, and PrepRelation records are not
 * passed to Dagre.
 */
export function layoutOverview(
  model: PrepModelFile,
  options: AutoLayoutOptions = {},
): OverviewNodeLayout[] {
  const config = resolvedOptions(options);
  // OverviewProcess nodes are rendered as 128px circles in OverviewCanvas.
  // Keeping the layout service's Dagre dimensions in sync prevents adjacent
  // circles from overlapping without coupling the domain result to React Flow.
  const overviewNodeSize = 128;
  const topLevelProcesses = model.processes.filter(
    (process) => !process.parentProcessId,
  );
  const items: LayoutItem[] = [
    ...topLevelProcesses.map((process) => ({
      id: process.id,
      width: overviewNodeSize,
      height: overviewNodeSize,
    })),
    ...model.externalProcesses.map((process) => ({
      id: process.id,
      width: overviewNodeSize,
      height: overviewNodeSize,
    })),
  ];
  const itemIds = new Set(items.map((item) => item.id));
  const edges: LayoutEdge[] = (model.processHandoffs ?? [])
    .filter(
      (handoff) =>
        itemIds.has(handoff.sourceProcessId) &&
        itemIds.has(handoff.targetProcessId),
    )
    .map((handoff) => ({
      sourceId: handoff.sourceProcessId,
      targetId: handoff.targetProcessId,
    }));
  const positions = dagreLayout(
    items,
    edges,
    config,
    config.graphMargin,
  );
  const topLevelProcessIds = new Set(
    topLevelProcesses.map((process) => process.id),
  );

  return items.map((item) => {
    const position = positions.get(item.id);
    return {
      id: item.id,
      kind: topLevelProcessIds.has(item.id)
        ? 'process'
        : 'external-process',
      x: position?.x ?? config.graphMargin,
      y: position?.y ?? config.graphMargin,
    };
  });
}

/**
 * Applies a hierarchical Dagre layout without leaking React Flow types into
 * the canonical model. Child artifact positions remain relative to their
 * process, while process and external-node positions remain absolute.
 *
 * @deprecated This is the v1.0/v1.1 compatibility layout. v1.2 process
 * details use the actor-lane x subprocess-column grid; use layoutOverview for
 * the only Dagre-driven layout in the current editor.
 */
export function layoutPrepModel(
  model: PrepModelFile,
  options: AutoLayoutOptions = {},
): PrepModelFile {
  const config = resolvedOptions(options);
  const existingLayouts = new Map(
    model.layout.nodes.map((node) => [node.id, node]),
  );
  const processIds = new Set(model.processes.map((process) => process.id));
  const artifactIds = new Set(model.artifacts.map((artifact) => artifact.id));
  const externalIds = new Set(
    model.externalProcesses.map((process) => process.id),
  );
  const entityIds = new Set([
    ...processIds,
    ...artifactIds,
    ...externalIds,
  ]);

  const validParentByArtifact = new Map<string, string>();
  for (const artifact of model.artifacts) {
    if (artifact.processId && processIds.has(artifact.processId)) {
      validParentByArtifact.set(artifact.id, artifact.processId);
    }
  }

  const artifactItems = new Map(
    model.artifacts.map((artifact) => {
      const existing = existingLayouts.get(artifact.id);
      return [
        artifact.id,
        {
          id: artifact.id,
          width: positive(existing?.width, config.artifactWidth),
          height: positive(existing?.height, config.artifactHeight),
        },
      ];
    }),
  );

  const childPositions = new Map<string, PositionedItem>();
  const processItems = new Map<string, LayoutItem>();

  for (const process of model.processes) {
    const children = model.artifacts
      .filter(
        (artifact) =>
          validParentByArtifact.get(artifact.id) === process.id,
      )
      .map((artifact) => artifactItems.get(artifact.id))
      .filter((item): item is LayoutItem => item !== undefined);
    const childIds = new Set(children.map((child) => child.id));
    const rawPositions = dagreLayout(
      children,
      edgesWithin(model.relations, childIds),
      config,
      0,
    );
    const positions = normalizePositions(
      rawPositions,
      config.processPadding,
      config.processHeaderHeight,
    );

    for (const [id, item] of positions) {
      childPositions.set(id, item);
    }

    const requiredWidth =
      children.length === 0
        ? 0
        : Math.max(
            ...[...positions.values()].map(
              (item) => item.x + item.width + config.processPadding,
            ),
          );
    const requiredHeight =
      children.length === 0
        ? 0
        : Math.max(
            ...[...positions.values()].map(
              (item) => item.y + item.height + config.processPadding,
            ),
          );
    const existing = existingLayouts.get(process.id);

    processItems.set(process.id, {
      id: process.id,
      width: Math.max(
        config.processMinWidth,
        positive(existing?.width, config.processMinWidth),
        requiredWidth,
      ),
      height: Math.max(
        config.processMinHeight,
        positive(existing?.height, config.processMinHeight),
        requiredHeight,
      ),
    });
  }

  const rootArtifactItems = model.artifacts
    .filter((artifact) => !validParentByArtifact.has(artifact.id))
    .map((artifact) => artifactItems.get(artifact.id))
    .filter((item): item is LayoutItem => item !== undefined);
  const externalItems: LayoutItem[] = model.externalProcesses.map(
    (externalProcess) => {
      const existing = existingLayouts.get(externalProcess.id);
      return {
        id: externalProcess.id,
        width: positive(existing?.width, config.externalProcessWidth),
        height: positive(existing?.height, config.externalProcessHeight),
      };
    },
  );
  const topLevelItems = [
    ...processItems.values(),
    ...rootArtifactItems,
    ...externalItems,
  ];

  const topLevelOwner = new Map<string, string>();
  for (const item of topLevelItems) {
    topLevelOwner.set(item.id, item.id);
  }
  for (const [artifactId, processId] of validParentByArtifact) {
    topLevelOwner.set(artifactId, processId);
  }

  const topLevelEdges: LayoutEdge[] = model.relations
    .map((relation) => ({
      sourceId: topLevelOwner.get(relation.sourceId),
      targetId: topLevelOwner.get(relation.targetId),
    }))
    .filter(
      (
        edge,
      ): edge is {
        sourceId: string;
        targetId: string;
      } =>
        edge.sourceId !== undefined &&
        edge.targetId !== undefined &&
        edge.sourceId !== edge.targetId,
    );
  const topLevelPositions = dagreLayout(
    topLevelItems,
    topLevelEdges,
    config,
    config.graphMargin,
  );

  const positionedById = new Map<string, PositionedItem>([
    ...topLevelPositions,
    ...childPositions,
  ]);
  const orderedEntityIds: string[] = [];
  const seen = new Set<string>();

  for (const existing of model.layout.nodes) {
    if (entityIds.has(existing.id) && !seen.has(existing.id)) {
      seen.add(existing.id);
      orderedEntityIds.push(existing.id);
    }
  }
  for (const id of entityIds) {
    if (!seen.has(id)) {
      seen.add(id);
      orderedEntityIds.push(id);
    }
  }

  const nodes: NodeLayout[] = orderedEntityIds.map((id) => {
    const existing = existingLayouts.get(id);
    const positioned = positionedById.get(id);
    if (!positioned) {
      // Entity sets and positioned sets are built from the same source. This
      // guard keeps a useful fallback should a future entity kind be added.
      return existing ? { ...existing } : { id, x: 0, y: 0 };
    }

    const node: NodeLayout = {
      ...existing,
      id,
      x: positioned.x,
      y: positioned.y,
      width: positioned.width,
      height: positioned.height,
    };
    const parentId = validParentByArtifact.get(id);

    if (parentId) {
      node.parentId = parentId;
    } else {
      delete node.parentId;
    }

    return node;
  });

  // Unknown layout entries are retained untouched for forward compatibility.
  for (const existing of model.layout.nodes) {
    if (!entityIds.has(existing.id)) {
      nodes.push({ ...existing });
    }
  }

  return {
    ...model,
    layout: {
      nodes,
      viewport: { ...model.layout.viewport },
    },
  };
}

export const autoLayoutModel = layoutPrepModel;
