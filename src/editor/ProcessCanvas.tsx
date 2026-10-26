import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import { forwardRef, useCallback, useEffect, useMemo } from 'react';
import type {
  AnchorPosition,
  PrepArtifact,
  PrepModelFile,
} from '../domain/model';
import {
  getArtifactsForActiveProcess,
  getRelationsForActiveProcess,
} from '../domain/processHierarchy';
import { getProcessGridGeometry } from '../domain/processGrid';
import { useModelStore, type ElementSelection, type ViewMode } from '../store/modelStore';
import {
  PREP_DRAG_MIME,
  type PaletteElementKind,
} from '../components/Palette';
import { edgeTypes } from './edgeTypes';
import { CANVAS_VIEWPORT_INTERACTION_PROPS } from './canvasViewportInteraction';
import type {
  PrepFlowEdge,
  PrepFlowNode,
  ProcessGridColumnView,
  ProcessGridLaneView,
} from './flowTypes';
import { nodeTypes } from './nodeTypes';

const ARTIFACT_WIDTH = 200;
const ARTIFACT_HEIGHT = 116;
const DEFAULT_PROCESS_VIEWPORT = { x: 20, y: 20, zoom: 0.85 };

export interface ProcessConnectionRequest {
  sourceId: string;
  targetId: string;
  sourceAnchor: AnchorPosition;
  targetAnchor: AnchorPosition;
}

export interface ProcessCanvasProps {
  model: PrepModelFile;
  activeProcessId: string;
  selection: ElementSelection[];
  viewMode: ViewMode;
  exporting?: boolean;
  onOpenProcess: (processId: string) => void;
  onConnectionRequest: (connection: ProcessConnectionRequest) => void;
  onDropElement: (
    element: PaletteElementKind,
    position: { x: number; y: number },
  ) => void;
}

interface CellGeometry {
  actorId: string;
  processId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function anchorOr(
  value: AnchorPosition | string | null | undefined,
  fallback: AnchorPosition,
): AnchorPosition {
  return value && value !== 'auto' ? (value as AnchorPosition) : fallback;
}

function visualFlags(
  id: string,
  kind: 'node' | 'edge',
  viewMode: ViewMode,
  model: PrepModelFile,
) {
  const state = useModelStore.getState();
  if (viewMode === 'risk') {
    const risk =
      kind === 'node'
        ? model.artifacts.find((artifact) => artifact.id === id)?.risk.level
        : model.relations.find((relation) => relation.id === id)?.risk.level;
    const highlighted = risk === 'medium' || risk === 'high';
    return { highlighted, dimmed: !highlighted };
  }
  if (viewMode === 'assurance' && state.assuranceTrace) {
    const trace = state.assuranceTrace;
    const highlighted =
      kind === 'node'
        ? id === trace.startArtifactId ||
          trace.upstreamArtifactIds.includes(id) ||
          trace.downstreamArtifactIds.includes(id)
        : trace.traversedRelationIds.includes(id);
    return { highlighted, dimmed: !highlighted };
  }
  if (viewMode === 'impact' && state.impactAnalysis) {
    const impact = state.impactAnalysis;
    if (kind === 'node') {
      if (id === impact.startArtifactId) return { highlighted: true, dimmed: false };
      if (impact.explicitArtifactIds.includes(id)) {
        return { highlighted: true, dimmed: false, impactKind: 'explicit' as const };
      }
      if (impact.inferredArtifactIds.includes(id)) {
        return { highlighted: true, dimmed: false, impactKind: 'inferred' as const };
      }
    } else {
      if (impact.explicitRelationIds.includes(id)) {
        return { highlighted: true, dimmed: false, impactKind: 'explicit' as const };
      }
      if (impact.inferredRelationIds.includes(id)) {
        return { highlighted: true, dimmed: false, impactKind: 'inferred' as const };
      }
    }
    return { highlighted: false, dimmed: true, impactKind: 'none' as const };
  }
  return { highlighted: false, dimmed: false };
}

function relationColor(id: string, viewMode: ViewMode, model: PrepModelFile) {
  const flags = visualFlags(id, 'edge', viewMode, model);
  if (flags.impactKind === 'explicit') return '#dc2626';
  if (flags.impactKind === 'inferred') return '#d97706';
  if (viewMode === 'assurance' && flags.highlighted) return '#2563eb';
  const risk = model.relations.find((relation) => relation.id === id)?.risk.level;
  if (viewMode === 'risk' && risk === 'high') return '#dc2626';
  if (viewMode === 'risk' && risk === 'medium') return '#d97706';
  return '#64748b';
}

export const ProcessCanvas = forwardRef<HTMLDivElement, ProcessCanvasProps>(
  function ProcessCanvas(
    {
      model,
      activeProcessId,
      selection,
      viewMode,
      exporting = false,
      onOpenProcess,
      onConnectionRequest,
      onDropElement,
    },
    ref,
  ) {
    const flow = useReactFlow<PrepFlowNode, PrepFlowEdge>();
    const setSelection = useModelStore((state) => state.setSelection);
    const clearSelection = useModelStore((state) => state.clearSelection);
    const updateArtifact = useModelStore((state) => state.updateArtifact);
    const deleteElements = useModelStore((state) => state.deleteElements);
    const beginHistoryTransaction = useModelStore((state) => state.beginHistoryTransaction);
    const endHistoryTransaction = useModelStore((state) => state.endHistoryTransaction);
    const upsertArtifactPlacement = useModelStore((state) => state.upsertArtifactPlacement);
    const updateSubprocessColumnLayout = useModelStore((state) => state.updateSubprocessColumnLayout);
    const updateActorLaneHeight = useModelStore((state) => state.updateActorLaneHeight);
    const setProcessViewport = useModelStore((state) => state.setProcessViewport);
    const focusRequest = useModelStore((state) => state.focusRequest);
    const clearFocusRequest = useModelStore((state) => state.clearFocusRequest);

    const activeProcess = model.processes.find((process) => process.id === activeProcessId);
    const viewLayout = model.layout.processViews?.find(
      (view) => view.processId === activeProcessId,
    );
    const savedViewport = viewLayout?.viewport ?? DEFAULT_PROCESS_VIEWPORT;
    const selected = useMemo(
      () => new Set(selection.map((item) => `${item.type}:${item.id}`)),
      [selection],
    );

    const artifacts = getArtifactsForActiveProcess(model, activeProcessId);
    const geometry = useMemo(
      () => getProcessGridGeometry(model, activeProcessId),
      [activeProcessId, model],
    );
    const lanes: ProcessGridLaneView[] = geometry.lanes.map((lane) => ({
      laneId: lane.id,
      actorId: lane.actorId,
      actorName: lane.actorName || '不明なアクター',
      role: lane.role,
      height: lane.height,
      selected: selected.has(`actor:${lane.actorId}`),
    }));
    const columns: ProcessGridColumnView[] = geometry.columns.map((column) => ({
      processId: column.processId,
      name: column.processName || '名称未設定のサブプロセス',
      goal: model.processes.find((process) => process.id === column.processId)?.goal,
      width: column.width,
      height: column.height,
      autoHeight: column.autoHeight,
      selected: selected.has(`process:${column.processId}`),
      unclassified: column.isUnclassified,
    }));
    const cells: CellGeometry[] = geometry.cells;
    const gridWidth = geometry.totalWidth;
    const gridHeight = geometry.totalHeight;

    const nodes = useMemo<PrepFlowNode[]>(() => {
      const gridNode: PrepFlowNode = {
        id: `process-grid:${activeProcessId}`,
        type: 'processGrid',
        position: { x: 0, y: 0 },
        width: gridWidth,
        height: gridHeight,
        draggable: false,
        selectable: false,
        deletable: false,
        focusable: false,
        zIndex: -10,
        data: {
          processName: activeProcess?.name ?? '',
          lanes,
          columns,
          width: gridWidth,
          height: gridHeight,
          exporting,
          onSelectActor: (actorId: string) => setSelection([{ type: 'actor', id: actorId }]),
          onSelectProcess: (processId: string) => setSelection([{ type: 'process', id: processId }]),
          onOpenProcess,
          onResizeColumn: (processId: string, patch: { width?: number; height?: number | null }) =>
            updateSubprocessColumnLayout(activeProcessId, processId, patch),
          onResizeLane: (actorId: string, height: number) =>
            updateActorLaneHeight(activeProcessId, actorId, height),
          onResizeStart: beginHistoryTransaction,
          onResizeEnd: endHistoryTransaction,
          getZoom: () => flow.getZoom(),
        },
      };
      const resizeNode: PrepFlowNode = {
        id: `process-grid-resize:${activeProcessId}`,
        type: 'processGridResize',
        position: { x: 0, y: 0 },
        width: gridWidth,
        height: gridHeight,
        draggable: false,
        selectable: false,
        deletable: false,
        focusable: false,
        zIndex: 20,
        data: gridNode.data,
      };

      const placementMap = new Map(
        (viewLayout?.artifactPlacements ?? []).map((placement) => [placement.artifactId, placement]),
      );
      const artifactNodes = artifacts.flatMap<PrepFlowNode>((artifact, index) => {
        const cell = cells.find(
          (candidate) =>
            candidate.actorId === artifact.responsibleActorId &&
            candidate.processId === artifact.processId,
        );
        if (!cell) return [];
        const placement = placementMap.get(artifact.id);
        const fallbackX = 24 + (index % 2) * 32;
        const fallbackY = 34 + (index % 3) * 24;
        const offsetX = Math.min(
          Math.max(12, placement?.offsetX ?? fallbackX),
          Math.max(12, cell.width - ARTIFACT_WIDTH - 12),
        );
        const offsetY = Math.min(
          Math.max(12, placement?.offsetY ?? fallbackY),
          Math.max(12, cell.height - ARTIFACT_HEIGHT - 12),
        );
        const flags = visualFlags(artifact.id, 'node', viewMode, model);
        return [{
          id: artifact.id,
          type: 'artifact',
          position: { x: cell.x + offsetX, y: cell.y + offsetY },
          width: ARTIFACT_WIDTH,
          height: ARTIFACT_HEIGHT,
          zIndex: 10,
          selected: selected.has(`artifact:${artifact.id}`),
          data: { artifact, ...flags, exporting },
        }];
      });
      return [gridNode, resizeNode, ...artifactNodes];
    }, [activeProcess?.name, activeProcessId, artifacts, beginHistoryTransaction, cells, columns, endHistoryTransaction, exporting, flow, gridHeight, gridWidth, lanes, model, onOpenProcess, selected, setSelection, updateActorLaneHeight, updateSubprocessColumnLayout, viewLayout?.artifactPlacements, viewMode]);

    const visibleArtifactIds = useMemo(
      () => new Set(artifacts.map((artifact) => artifact.id)),
      [artifacts],
    );
    const edges = useMemo<PrepFlowEdge[]>(
      () =>
        getRelationsForActiveProcess(model, activeProcessId).map((relation) => {
          const flags = visualFlags(relation.id, 'edge', viewMode, model);
          const color = relationColor(relation.id, viewMode, model);
          return {
            id: relation.id,
            source: relation.sourceId,
            target: relation.targetId,
            sourceHandle: anchorOr(relation.sourceAnchor, 'e'),
            targetHandle: anchorOr(relation.targetAnchor, 'w'),
            type: 'prepRelation',
            selected: selected.has(`relation:${relation.id}`),
            zIndex: 5,
            data: {
              relation,
              ...flags,
              showRisk: viewMode === 'risk',
              exporting,
            },
            markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
            markerStart:
              relation.prepType === 'sync'
                ? { type: MarkerType.ArrowClosed, color, width: 18, height: 18 }
                : undefined,
          };
        }),
      [activeProcessId, exporting, model, selected, viewMode],
    );

    const moveArtifact = useCallback(
      (artifact: PrepArtifact, position: { x: number; y: number }) => {
        const center = {
          x: position.x + ARTIFACT_WIDTH / 2,
          y: position.y + ARTIFACT_HEIGHT / 2,
        };
        const cell = cells.find(
          (candidate) =>
            center.x >= candidate.x &&
            center.x <= candidate.x + candidate.width &&
            center.y >= candidate.y &&
            center.y <= candidate.y + candidate.height,
        );
        if (!cell) {
          const originalCell = cells.find(
            (candidate) =>
              candidate.actorId === artifact.responsibleActorId &&
              candidate.processId === artifact.processId,
          );
          if (!originalCell) return;
          const placement = viewLayout?.artifactPlacements.find(
            (item) => item.artifactId === artifact.id,
          );
          // Persisting the original cell-relative position forces the
          // controlled React Flow node to snap back after an invalid drop.
          upsertArtifactPlacement(activeProcessId, {
            artifactId: artifact.id,
            offsetX: placement?.offsetX ?? 28,
            offsetY: placement?.offsetY ?? 34,
          });
          return;
        }
        if (
          artifact.responsibleActorId !== cell.actorId ||
          artifact.processId !== cell.processId
        ) {
          updateArtifact(artifact.id, {
            responsibleActorId: cell.actorId,
            processId: cell.processId,
          });
        }
        upsertArtifactPlacement(activeProcessId, {
          artifactId: artifact.id,
          offsetX: Math.max(0, position.x - cell.x),
          offsetY: Math.max(0, position.y - cell.y),
        });
      },
      [activeProcessId, cells, updateArtifact, upsertArtifactPlacement, viewLayout?.artifactPlacements],
    );

    const handleNodeChanges = useCallback(
      (changes: NodeChange<PrepFlowNode>[]) => {
        for (const change of changes) {
          if (!('id' in change)) continue;
          if (
            change.id.startsWith('process-grid:') ||
            change.id.startsWith('process-grid-resize:')
          ) continue;
          const artifact = model.artifacts.find((item) => item.id === change.id);
          if (!artifact) continue;
          if (change.type === 'position') {
            if (change.dragging) beginHistoryTransaction();
            if (change.position) moveArtifact(artifact, change.position);
            if (change.dragging === false) endHistoryTransaction();
          } else if (change.type === 'remove') {
            deleteElements([{ type: 'artifact', id: change.id }]);
          }
        }
      },
      [beginHistoryTransaction, deleteElements, endHistoryTransaction, model.artifacts, moveArtifact],
    );

    const handleEdgeChanges = useCallback(
      (changes: EdgeChange<PrepFlowEdge>[]) => {
        const removed = changes
          .filter((change) => change.type === 'remove')
          .map((change) => ({ type: 'relation' as const, id: change.id }));
        if (removed.length > 0) deleteElements(removed);
      },
      [deleteElements],
    );

    const handleSelection = useCallback(
      ({ nodes: nextNodes, edges: nextEdges }: OnSelectionChangeParams) => {
        setSelection([
          ...nextNodes
            .filter((node) => node.type === 'artifact')
            .map((node) => ({ type: 'artifact' as const, id: node.id })),
          ...nextEdges.map((edge) => ({ type: 'relation' as const, id: edge.id })),
        ]);
      },
      [setSelection],
    );

    const selectFromClick = useCallback(
      (item: ElementSelection, additive: boolean) => {
        if (!additive) {
          setSelection([item]);
          return;
        }
        const alreadySelected = selection.some(
          (selectedItem) =>
            selectedItem.type === item.type && selectedItem.id === item.id,
        );
        setSelection(
          alreadySelected
            ? selection.filter(
                (selectedItem) =>
                  selectedItem.type !== item.type || selectedItem.id !== item.id,
              )
            : [...selection, item],
        );
      },
      [selection, setSelection],
    );

    const handleConnect = useCallback(
      (connection: Connection) => {
        if (
          !connection.source ||
          !connection.target ||
          !visibleArtifactIds.has(connection.source) ||
          !visibleArtifactIds.has(connection.target)
        ) return;
        onConnectionRequest({
          sourceId: connection.source,
          targetId: connection.target,
          sourceAnchor: anchorOr(connection.sourceHandle, 'e'),
          targetAnchor: anchorOr(connection.targetHandle, 'w'),
        });
      },
      [onConnectionRequest, visibleArtifactIds],
    );

    const emptyGrid = lanes.length === 0 || columns.length === 0;

    useEffect(() => {
      if (!focusRequest) return;
      const target = focusRequest.target;
      const node =
        target.type === 'artifact' ? flow.getNode(target.id) : undefined;
      const relation =
        target.type === 'relation'
          ? model.relations.find((item) => item.id === target.id)
          : undefined;
      const relationNodes = relation
        ? [flow.getNode(relation.sourceId), flow.getNode(relation.targetId)].filter(
            (item): item is PrepFlowNode => item !== undefined,
          )
        : [];
      window.requestAnimationFrame(() => {
        if (node) {
          void flow.fitView({ nodes: [node], padding: 0.7, maxZoom: 1.35, duration: 260 });
        } else if (relationNodes.length > 0) {
          void flow.fitView({ nodes: relationNodes, padding: 0.55, maxZoom: 1.2, duration: 260 });
        } else if (target.type === 'model' || target.type === 'process') {
          void flow.fitView({ padding: 0.08, duration: 260 });
        }
        clearFocusRequest(focusRequest.requestId);
      });
    }, [clearFocusRequest, flow, focusRequest, model.relations]);

    useEffect(() => {
      if (!flow.viewportInitialized) return;
      const current = flow.getViewport();
      if (
        current.x === savedViewport.x &&
        current.y === savedViewport.y &&
        current.zoom === savedViewport.zoom
      ) {
        return;
      }
      void flow.setViewport(savedViewport);
    }, [activeProcessId, flow, savedViewport.x, savedViewport.y, savedViewport.zoom]);

    return (
      <div ref={ref} className="model-canvas process-canvas" data-testid="process-canvas">
        <ReactFlow<PrepFlowNode, PrepFlowEdge>
          nodes={emptyGrid ? [] : nodes}
          edges={emptyGrid ? [] : edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          onNodesChange={handleNodeChanges}
          onEdgesChange={handleEdgeChanges}
          onSelectionChange={handleSelection}
          onNodeClick={(event, node) => {
            if (node.type !== 'artifact') return;
            selectFromClick(
              { type: 'artifact', id: node.id },
              event.metaKey || event.ctrlKey,
            );
          }}
          onEdgeClick={(event, edge) => {
            selectFromClick(
              { type: 'relation', id: edge.id },
              event.metaKey || event.ctrlKey,
            );
          }}
          onConnect={handleConnect}
          onPaneClick={clearSelection}
          onMoveEnd={(_, viewport) => setProcessViewport(activeProcessId, viewport)}
          defaultViewport={savedViewport}
          minZoom={0.2}
          maxZoom={2}
          snapToGrid
          snapGrid={[12, 12]}
          selectionOnDrag
          panOnDrag={[1, 2]}
          {...CANVAS_VIEWPORT_INTERACTION_PROPS}
          nodesConnectable={!exporting}
          nodesDraggable={!exporting}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(event) => {
            event.preventDefault();
            const value = event.dataTransfer.getData(PREP_DRAG_MIME);
            if (!value) return;
            try {
              const payload = JSON.parse(value) as PaletteElementKind;
              onDropElement(payload, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
            } catch {
              // Ignore unrelated drag payloads.
            }
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d3dbe5" />
          {!exporting && <Controls position="bottom-left" />}
          {!exporting && <MiniMap pannable zoomable position="bottom-right" />}
        </ReactFlow>
        {emptyGrid && (
          <div className="process-grid-empty" role="status">
            <strong>責任グリッドを準備してください</strong>
            <p>
              {lanes.length === 0 && '左のパレットからアクターを追加してください。'}
              {columns.length === 0 && 'サブプロセスを1つ以上追加してください。'}
            </p>
          </div>
        )}
      </div>
    );
  },
);
