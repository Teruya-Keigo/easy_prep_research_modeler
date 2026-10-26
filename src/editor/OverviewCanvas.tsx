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
import type { AnchorPosition, PrepModelFile } from '../domain/model';
import { useModelStore, type ElementSelection } from '../store/modelStore';
import {
  PREP_DRAG_MIME,
  type PaletteElementKind,
} from '../components/Palette';
import { edgeTypes } from './edgeTypes';
import { CANVAS_VIEWPORT_INTERACTION_PROPS } from './canvasViewportInteraction';
import type { PrepFlowEdge, PrepFlowNode } from './flowTypes';
import { nodeTypes } from './nodeTypes';

export interface OverviewConnectionRequest {
  sourceId: string;
  targetId: string;
  sourceAnchor: AnchorPosition;
  targetAnchor: AnchorPosition;
}

export interface OverviewCanvasProps {
  model: PrepModelFile;
  selection: ElementSelection[];
  exporting?: boolean;
  onOpenProcess: (processId: string) => void;
  onConnectionRequest: (connection: OverviewConnectionRequest) => void;
  onDropElement: (
    element: PaletteElementKind,
    position: { x: number; y: number },
  ) => void;
}

const anchor = (value: string | null | undefined, fallback: AnchorPosition) =>
  (value && value !== 'auto' ? value : fallback) as AnchorPosition;

const DEFAULT_OVERVIEW_VIEWPORT = { x: 0, y: 0, zoom: 1 };

export const OverviewCanvas = forwardRef<HTMLDivElement, OverviewCanvasProps>(
  function OverviewCanvas(
    {
      model,
      selection,
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
    const deleteElements = useModelStore((state) => state.deleteElements);
    const beginHistoryTransaction = useModelStore(
      (state) => state.beginHistoryTransaction,
    );
    const endHistoryTransaction = useModelStore(
      (state) => state.endHistoryTransaction,
    );
    const updateOverviewNodeLayout = useModelStore(
      (state) => state.updateOverviewNodeLayout,
    );
    const setOverviewViewport = useModelStore(
      (state) => state.setOverviewViewport,
    );
    const focusRequest = useModelStore((state) => state.focusRequest);
    const clearFocusRequest = useModelStore((state) => state.clearFocusRequest);

    const selected = useMemo(
      () => new Set(selection.map((item) => `${item.type}:${item.id}`)),
      [selection],
    );
    const overviewNodes = model.layout.overview?.nodes ?? [];
    const savedViewport =
      model.layout.overview?.viewport ?? DEFAULT_OVERVIEW_VIEWPORT;

    const nodes = useMemo<PrepFlowNode[]>(() => {
      const topLevel = model.processes.filter(
        (process) => !process.parentProcessId,
      );
      const processNodes: PrepFlowNode[] = topLevel.map((process, index) => {
        const layout = overviewNodes.find(
          (item) => item.id === process.id && item.kind === 'process',
        );
        return {
          id: process.id,
          type: 'overviewProcess',
          position: {
            x: layout?.x ?? 100 + (index % 4) * 230,
            y: layout?.y ?? 100 + Math.floor(index / 4) * 210,
          },
          width: 128,
          height: 128,
          selected: selected.has(`process:${process.id}`),
          data: {
            id: process.id,
            name: process.name,
            kind: 'process',
            exporting,
            onOpen: onOpenProcess,
          },
        };
      });
      const externalNodes: PrepFlowNode[] = model.externalProcesses.map(
        (process, index) => {
          const layout = overviewNodes.find(
            (item) =>
              item.id === process.id && item.kind === 'external-process',
          );
          return {
            id: process.id,
            type: 'overviewProcess',
            position: {
              x: layout?.x ?? 900,
              y: layout?.y ?? 100 + index * 190,
            },
            width: 128,
            height: 128,
            selected: selected.has(`externalProcess:${process.id}`),
            data: {
              id: process.id,
              name: process.name,
              kind: 'external-process',
              exporting,
            },
          };
        },
      );
      return [...processNodes, ...externalNodes];
    }, [exporting, model.externalProcesses, model.processes, onOpenProcess, overviewNodes, selected]);

    const edges = useMemo<PrepFlowEdge[]>(
      () =>
        (model.processHandoffs ?? []).map((handoff) => {
          const sourceNames = handoff.sourceArtifactIds
            .map((id) => model.artifacts.find((item) => item.id === id)?.name)
            .filter(Boolean) as string[];
          const label =
            sourceNames.length === 1
              ? sourceNames[0]
              : sourceNames.length > 1
                ? `${sourceNames.length}件の成果物`
                : handoff.description;
          return {
            id: handoff.id,
            source: handoff.sourceProcessId,
            target: handoff.targetProcessId,
            sourceHandle: anchor(handoff.sourceAnchor, 'e'),
            targetHandle: anchor(handoff.targetAnchor, 'w'),
            type: 'processHandoff',
            selected: selected.has(`processHandoff:${handoff.id}`),
            data: { handoff, label, exporting },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#475569',
              width: 18,
              height: 18,
            },
            markerStart:
              handoff.prepType === 'sync'
                ? {
                    type: MarkerType.ArrowClosed,
                    color: '#475569',
                    width: 18,
                    height: 18,
                  }
                : undefined,
          };
        }),
      [exporting, model.artifacts, model.processHandoffs, selected],
    );

    const handleNodeChanges = useCallback(
      (changes: NodeChange<PrepFlowNode>[]) => {
        for (const change of changes) {
          if (!('id' in change)) continue;
          const node = nodes.find((item) => item.id === change.id);
          if (!node) continue;
          if (change.type === 'position') {
            if (change.dragging) beginHistoryTransaction();
            if (change.position) {
              updateOverviewNodeLayout(
                change.id,
                node.data.kind === 'external-process'
                  ? 'external-process'
                  : 'process',
                change.position,
              );
            }
            if (change.dragging === false) endHistoryTransaction();
          } else if (change.type === 'remove') {
            deleteElements([
              {
                id: change.id,
                type:
                  node.data.kind === 'external-process'
                    ? 'externalProcess'
                    : 'process',
              },
            ]);
          }
        }
      },
      [beginHistoryTransaction, deleteElements, endHistoryTransaction, nodes, updateOverviewNodeLayout],
    );

    const handleEdgeChanges = useCallback(
      (changes: EdgeChange<PrepFlowEdge>[]) => {
        const removed = changes
          .filter((change) => change.type === 'remove')
          .map((change) => ({
            type: 'processHandoff' as const,
            id: change.id,
          }));
        if (removed.length > 0) deleteElements(removed);
      },
      [deleteElements],
    );

    const handleSelection = useCallback(
      ({ nodes: nextNodes, edges: nextEdges }: OnSelectionChangeParams) => {
        const next: ElementSelection[] = [
          ...nextNodes.map((node) => ({
            id: node.id,
            type:
              node.data.kind === 'external-process'
                ? ('externalProcess' as const)
                : ('process' as const),
          })),
          ...nextEdges.map((edge) => ({
            id: edge.id,
            type: 'processHandoff' as const,
          })),
        ];
        setSelection(next);
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
        if (!connection.source || !connection.target) return;
        const topLevelIds = new Set(
          model.processes
            .filter((process) => !process.parentProcessId)
            .map((process) => process.id),
        );
        if (
          connection.source === connection.target ||
          !topLevelIds.has(connection.source) ||
          !topLevelIds.has(connection.target)
        ) {
          return;
        }
        onConnectionRequest({
          sourceId: connection.source,
          targetId: connection.target,
          sourceAnchor: anchor(connection.sourceHandle, 'e'),
          targetAnchor: anchor(connection.targetHandle, 'w'),
        });
      },
      [model.processes, onConnectionRequest],
    );

    useEffect(() => {
      if (!focusRequest) return;
      const target = focusRequest.target;
      const node =
        target.type === 'process' || target.type === 'externalProcess'
          ? flow.getNode(target.id)
          : undefined;
      window.requestAnimationFrame(() => {
        if (node) {
          void flow.fitView({ nodes: [node], padding: 0.7, maxZoom: 1.25, duration: 260 });
        } else if (target.type === 'model' || target.type === 'processHandoff') {
          void flow.fitView({ padding: 0.16, duration: 260 });
        }
        clearFocusRequest(focusRequest.requestId);
      });
    }, [clearFocusRequest, flow, focusRequest]);

    useEffect(() => {
      if (!flow.viewportInitialized || !model.layout.overview?.viewport) return;
      const current = flow.getViewport();
      if (
        current.x === savedViewport.x &&
        current.y === savedViewport.y &&
        current.zoom === savedViewport.zoom
      ) {
        return;
      }
      void flow.setViewport(savedViewport);
    }, [flow, model.layout.overview?.viewport, savedViewport.x, savedViewport.y, savedViewport.zoom]);

    return (
      <div ref={ref} className="model-canvas overview-canvas" data-testid="overview-canvas">
        <ReactFlow<PrepFlowNode, PrepFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          onNodesChange={handleNodeChanges}
          onEdgesChange={handleEdgeChanges}
          onSelectionChange={handleSelection}
          onNodeClick={(event, node) => {
            selectFromClick(
              {
                id: node.id,
                type:
                  node.data.kind === 'external-process'
                    ? 'externalProcess'
                    : 'process',
              },
              event.metaKey || event.ctrlKey,
            );
          }}
          onEdgeClick={(event, edge) => {
            selectFromClick(
              { type: 'processHandoff', id: edge.id },
              event.metaKey || event.ctrlKey,
            );
          }}
          onConnect={handleConnect}
          onPaneClick={clearSelection}
          onMoveEnd={(_, viewport) => setOverviewViewport(viewport)}
          defaultViewport={savedViewport}
          minZoom={0.2}
          maxZoom={2}
          snapToGrid
          snapGrid={[12, 12]}
          selectionOnDrag
          panOnDrag={[1, 2]}
          {...CANVAS_VIEWPORT_INTERACTION_PROPS}
          fitView={nodes.length > 0 && !(model.layout.overview?.viewport)}
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
              onDropElement(
                payload,
                flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
              );
            } catch {
              // Ignore unrelated drag payloads.
            }
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
          {!exporting && <Controls position="bottom-left" />}
          {!exporting && <MiniMap pannable zoomable position="bottom-right" />}
        </ReactFlow>
      </div>
    );
  },
);
