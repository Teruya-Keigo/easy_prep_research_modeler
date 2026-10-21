import type { Edge, Node } from '@xyflow/react';
import type {
  ExternalProcess,
  PrepArtifact,
  ProcessHandoff,
  PrepProcess,
  PrepRelation,
} from '../domain/model';

export type ImpactKind = 'explicit' | 'inferred' | 'none';

export interface ArtifactNodeData extends Record<string, unknown> {
  artifact: PrepArtifact;
  dimmed: boolean;
  highlighted: boolean;
  exporting: boolean;
  impactKind?: ImpactKind;
}

export interface ProcessNodeData extends Record<string, unknown> {
  process: PrepProcess;
  collapsed: boolean;
  dimmed: boolean;
  exporting: boolean;
  onToggleCollapsed: (id: string) => void;
}

export interface ExternalProcessNodeData extends Record<string, unknown> {
  externalProcess: ExternalProcess;
  dimmed: boolean;
  highlighted: boolean;
  exporting: boolean;
  impactKind?: ImpactKind;
}

export interface RelationEdgeData extends Record<string, unknown> {
  relation: PrepRelation;
  dimmed: boolean;
  highlighted: boolean;
  showRisk: boolean;
  exporting: boolean;
  impactKind?: ImpactKind;
}

export interface OverviewProcessNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  kind: 'process' | 'external-process';
  exporting: boolean;
  onOpen?: (id: string) => void;
}

export interface ProcessHandoffEdgeData extends Record<string, unknown> {
  handoff: ProcessHandoff;
  label?: string;
  exporting: boolean;
}

export interface ProcessGridLaneView extends Record<string, unknown> {
  laneId: string;
  actorId: string;
  actorName: string;
  role?: string;
  height: number;
  selected: boolean;
}

export interface ProcessGridColumnView extends Record<string, unknown> {
  processId: string;
  name: string;
  goal?: string;
  width: number;
  height: number;
  autoHeight: boolean;
  selected: boolean;
  unclassified?: boolean;
}

export interface ProcessGridNodeData extends Record<string, unknown> {
  processName: string;
  lanes: ProcessGridLaneView[];
  columns: ProcessGridColumnView[];
  width: number;
  height: number;
  exporting: boolean;
  onSelectActor: (actorId: string) => void;
  onSelectProcess: (processId: string) => void;
  onOpenProcess: (processId: string) => void;
  onResizeColumn: (
    processId: string,
    patch: { width?: number; height?: number | null },
  ) => void;
  onResizeLane: (actorId: string, height: number) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
  getZoom: () => number;
}

export type ArtifactFlowNode = Node<ArtifactNodeData, 'artifact'>;
export type ProcessFlowNode = Node<ProcessNodeData, 'process'>;
export type ExternalProcessFlowNode = Node<
  ExternalProcessNodeData,
  'externalProcess'
>;
export type OverviewProcessFlowNode = Node<
  OverviewProcessNodeData,
  'overviewProcess'
>;
export type ProcessGridFlowNode = Node<ProcessGridNodeData, 'processGrid'>;
export type ProcessGridResizeFlowNode = Node<
  ProcessGridNodeData,
  'processGridResize'
>;
export type PrepFlowNode =
  | ArtifactFlowNode
  | ProcessFlowNode
  | ExternalProcessFlowNode
  | OverviewProcessFlowNode
  | ProcessGridFlowNode
  | ProcessGridResizeFlowNode;

export type PrepRelationFlowEdge = Edge<RelationEdgeData, 'prepRelation'>;
export type ProcessHandoffFlowEdge = Edge<
  ProcessHandoffEdgeData,
  'processHandoff'
>;
export type PrepFlowEdge = PrepRelationFlowEdge | ProcessHandoffFlowEdge;
