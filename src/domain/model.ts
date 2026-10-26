/** The schema written by every newly-created or migrated model. */
export const PREP_SCHEMA_VERSION = '1.3.0' as const;

/** Versions which can be read by the v1.3 migration boundary. */
export const SUPPORTED_PREP_SCHEMA_VERSIONS = [
  '1.0.0',
  '1.1.0',
  '1.2.0',
  PREP_SCHEMA_VERSION,
] as const;

export const MIN_SUBPROCESS_COLUMN_WIDTH = 260;
export const MIN_SUBPROCESS_COLUMN_HEIGHT = 160;

export type PrepSchemaVersion =
  (typeof SUPPORTED_PREP_SCHEMA_VERSIONS)[number];

export type ModelPhase = 'as-is' | 'to-be' | 'unspecified';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export type ArtifactType =
  | 'intermediate'
  | 'final'
  | 'milestone'
  | 'intangible';

export type ArtifactScope =
  | 'internal'
  | 'external-input'
  | 'external-output';

export type PrepRelationType = 'input' | 'sync';

export type AnchorPosition =
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'nw'
  | 'auto';

export type SemanticRelationType =
  | 'derives-from'
  | 'justifies'
  | 'mitigates'
  | 'approves'
  | 'monitors'
  | 'requires-revalidation-of';

export interface KeyValueAttribute {
  id: string;
  key: string;
  value: string;
}

export interface ArtifactState {
  id: string;
  name: string;
  description?: string;
  isCurrent: boolean;
}

export interface RiskInfo {
  level: RiskLevel;
  description?: string;
}

export interface PrepSystem {
  id: string;
  name: string;
  goal: string;
  phase: ModelPhase;
  author?: string;
}

export interface PrepProcess {
  id: string;
  /** Missing for a top-level process; otherwise points at its direct parent. */
  parentProcessId?: string;
  name: string;
  goal: string;
  leadActorId?: string;
  technology?: string;
  resources?: string[];
  description?: string;
  /** @deprecated v1.0/v1.1 import compatibility. */
  responsibleActor?: string;
}

export interface PrepActor {
  id: string;
  name: string;
  description?: string;
  /** A temporary actor used for unassigned artifacts imported from old files. */
  isPlaceholder?: boolean;
}

export interface ProcessActorLane {
  id: string;
  processId: string;
  actorId: string;
  role?: string;
  order: number;
  height: number;
}

export interface PrepArtifact {
  id: string;
  /** The most specific process or subprocess that owns the artifact. */
  processId?: string;
  name: string;
  type: ArtifactType;
  scope: ArtifactScope;
  description?: string;
  states: ArtifactState[];
  attributes: KeyValueAttribute[];
  responsibleActorId?: string;
  /** Keeps an unresolved v1.0/v1.1 handoff name without losing data. */
  legacyNextProcessName?: string;
  risk: RiskInfo;
  /** @deprecated v1.0/v1.1 import compatibility. */
  responsibleActor?: string;
  /** @deprecated v1.0/v1.1 import compatibility. */
  nextProcessName?: string;
}

export interface ExternalProcess {
  id: string;
  name: string;
  description?: string;
}

export interface PrepRelation {
  id: string;
  sourceId: string;
  targetId: string;
  /** Optional only so legacy TypeScript fixtures remain source-compatible. */
  sourceAnchor?: AnchorPosition;
  /** Optional only so legacy TypeScript fixtures remain source-compatible. */
  targetAnchor?: AnchorPosition;
  prepType: PrepRelationType;
  semanticType?: SemanticRelationType;
  description?: string;
  risk: RiskInfo;
}

export type CanonicalPrepRelation = Omit<
  PrepRelation,
  'sourceAnchor' | 'targetAnchor'
> & {
  sourceAnchor: AnchorPosition;
  targetAnchor: AnchorPosition;
};

export interface ProcessHandoff {
  id: string;
  sourceProcessId: string;
  targetProcessId: string;
  sourceArtifactIds: string[];
  targetArtifactIds: string[];
  prepType: PrepRelationType;
  sourceAnchor: AnchorPosition;
  targetAnchor: AnchorPosition;
  description?: string;
}

/**
 * Legacy free-form node layout.  It remains in memory during the v1.2
 * transition so v1.1 editor code can continue to render migrated files.
 */
export interface NodeLayout {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  parentId?: string;
  collapsed?: boolean;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface ArtifactPlacement {
  artifactId: string;
  /** Position relative to the top-left of the owning lane/column cell. */
  offsetX: number;
  offsetY: number;
}

export interface SubprocessColumnLayout {
  processId: string;
  parentProcessId: string;
  order: number;
  width: number;
  /** Missing means auto-height: the sum of actor lane heights. */
  height?: number;
}

export interface ProcessViewLayout {
  processId: string;
  artifactPlacements: ArtifactPlacement[];
  subprocessColumns: SubprocessColumnLayout[];
  viewport: ViewportState;
}

export interface OverviewNodeLayout {
  id: string;
  kind: 'process' | 'external-process';
  x: number;
  y: number;
}

export interface OverviewLayout {
  nodes: OverviewNodeLayout[];
  viewport: ViewportState;
}

export interface EditorViewState {
  mode: 'process' | 'overview';
  activeProcessId?: string;
}

export interface PrepModelLayout {
  /** @deprecated v1.0/v1.1 compatibility projection. */
  nodes: NodeLayout[];
  /** @deprecated v1.0/v1.1 compatibility projection. */
  viewport: ViewportState;
  /** Optional at the type boundary for old in-repository fixtures. */
  processViews?: ProcessViewLayout[];
  /** Optional at the type boundary for old in-repository fixtures. */
  overview?: OverviewLayout;
  lastView?: EditorViewState;
}

/**
 * Application-facing model type.
 *
 * The v1.3 Zod schema and migration functions always produce 1.3.0 and all
 * v1.3 collections.  The version union and optional new collections are kept
 * here only to let existing v1.0/v1.1 TypeScript fixtures reach the migration
 * boundary without unsafe casts.
 */
export interface PrepModelFile {
  schemaVersion: PrepSchemaVersion;
  metadata: {
    modelId: string;
    modelName: string;
    createdAt: string;
    updatedAt: string;
  };
  system: PrepSystem;
  processes: PrepProcess[];
  actors?: PrepActor[];
  processActorLanes?: ProcessActorLane[];
  artifacts: PrepArtifact[];
  externalProcesses: ExternalProcess[];
  relations: PrepRelation[];
  processHandoffs?: ProcessHandoff[];
  layout: PrepModelLayout;
}

/** A narrowed view useful after canonical validation or migration. */
export type CanonicalPrepModelFile = Omit<
  PrepModelFile,
  | 'schemaVersion'
  | 'actors'
  | 'processActorLanes'
  | 'processHandoffs'
  | 'relations'
  | 'layout'
> & {
  schemaVersion: typeof PREP_SCHEMA_VERSION;
  actors: PrepActor[];
  processActorLanes: ProcessActorLane[];
  processHandoffs: ProcessHandoff[];
  relations: CanonicalPrepRelation[];
  layout: PrepModelLayout & {
    processViews: ProcessViewLayout[];
    overview: OverviewLayout;
  };
};
