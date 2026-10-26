import { create } from 'zustand';
import { createStore, type StateCreator } from 'zustand/vanilla';

import {
  analyzeImpact as analyzeModelImpact,
  type ImpactAnalysisResult,
} from '../domain/impactAnalysis';
import type {
  ArtifactPlacement,
  ArtifactState,
  EditorViewState,
  ExternalProcess,
  KeyValueAttribute,
  NodeLayout,
  OverviewNodeLayout,
  PrepArtifact,
  PrepActor,
  PrepModelFile,
  PrepProcess,
  PrepRelation,
  PrepSystem,
  ProcessActorLane,
  ProcessHandoff,
  ProcessViewLayout,
  SubprocessColumnLayout,
  ViewportState,
} from '../domain/model';
import {
  traceAssurance as traceModelAssurance,
  type AssuranceTraceResult,
} from '../domain/assuranceTrace';
import {
  validateModel,
  type ValidationResult,
} from '../domain/validation';
import { createEmptyModel } from '../templates/emptyModel';
import {
  DEFAULT_COLUMN_WIDTH,
  getActorLaneMaximumHeight,
  getActorLaneMinimumHeight,
  getProcessGridGeometry,
  getSubprocessColumnMinimumSize,
} from '../domain/processGrid';

const HISTORY_LIMIT = 100;

export type ViewMode = 'normal' | 'risk' | 'assurance' | 'impact';

export type SelectableElementType =
  | 'process'
  | 'actor'
  | 'artifact'
  | 'externalProcess'
  | 'relation'
  | 'processHandoff';

export interface ElementSelection {
  type: SelectableElementType;
  id: string;
}

export type FocusTarget =
  | ElementSelection
  | { type: 'model'; id?: never }
  | { type: 'system'; id?: string };

export interface FocusRequest {
  requestId: number;
  target: FocusTarget;
}

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface HistoryOptions {
  /**
   * Set this to false for transient updates such as viewport movement.
   * For drag/resize gestures prefer beginHistoryTransaction/endHistoryTransaction.
   */
  recordHistory?: boolean;
  /** Whether the persisted metadata.updatedAt field should be refreshed. */
  touchUpdatedAt?: boolean;
  /** Whether domain validation and graph-analysis results become stale. */
  invalidateDerived?: boolean;
}

export type RelationConstraintReason =
  | 'duplicate-id'
  | 'duplicate-relation'
  | 'missing-relation'
  | 'missing-source'
  | 'missing-target'
  | 'non-artifact-source'
  | 'non-artifact-target'
  | 'cross-top-level-process'
  | 'not-shared-detail-view'
  | 'sync-self-connection';

export type RelationConstraint =
  | { canAdd: true }
  | { canAdd: false; reason: RelationConstraintReason };

export type AddRelationResult =
  | { ok: true }
  | { ok: false; reason: RelationConstraintReason };

export type ProcessHandoffConstraintReason =
  | 'duplicate-id'
  | 'missing-handoff'
  | 'missing-source-process'
  | 'missing-target-process'
  | 'source-process-not-top-level'
  | 'target-process-not-top-level'
  | 'same-process'
  | 'missing-source-artifact'
  | 'missing-target-artifact'
  | 'invalid-source-artifact'
  | 'invalid-target-artifact';

export type ProcessHandoffConstraint =
  | { canAdd: true }
  | { canAdd: false; reason: ProcessHandoffConstraintReason };

export type ProcessHandoffResult =
  | { ok: true }
  | { ok: false; reason: ProcessHandoffConstraintReason };

interface HistoryTransaction {
  baseModel: PrepModelFile;
  changed: boolean;
}

interface ModelStoreData {
  model: PrepModelFile;
  past: PrepModelFile[];
  future: PrepModelFile[];
  historyTransaction: HistoryTransaction | null;
  selection: ElementSelection[];
  viewMode: ViewMode;
  editorView: EditorViewState;
  validationResult: ValidationResult | null;
  assuranceTrace: AssuranceTraceResult | null;
  impactAnalysis: ImpactAnalysisResult | null;
  focusRequest: FocusRequest | null;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  saveError: string | null;
}

export interface ModelStoreActions {
  replaceModel: (
    model: PrepModelFile,
    options?: { resetHistory?: boolean; markSaved?: boolean },
  ) => void;
  loadModel: (model: PrepModelFile) => void;
  newModel: (model?: PrepModelFile) => void;

  undo: () => boolean;
  redo: () => boolean;
  resetHistory: () => void;
  beginHistoryTransaction: () => void;
  endHistoryTransaction: () => boolean;

  setSelection: (selection: ElementSelection[]) => void;
  selectElement: (selection: ElementSelection, additive?: boolean) => void;
  clearSelection: () => void;
  setViewMode: (mode: ViewMode) => void;
  setEditorView: (view: EditorViewState) => boolean;
  openProcess: (processId: string) => boolean;
  openOverview: () => boolean;

  setValidationResult: (result: ValidationResult | null) => void;
  validate: () => ValidationResult;
  setAssuranceTrace: (result: AssuranceTraceResult | null) => void;
  traceAssurance: (startArtifactId?: string) => AssuranceTraceResult | null;
  setImpactAnalysis: (result: ImpactAnalysisResult | null) => void;
  analyzeImpact: (startArtifactId?: string) => ImpactAnalysisResult | null;
  clearAnalysis: () => void;

  requestFocus: (target?: FocusTarget) => FocusRequest;
  clearFocusRequest: (requestId?: number) => void;

  setSaveStatus: (
    status: SaveStatus,
    details?: { savedAt?: string | null; error?: string | null },
  ) => void;
  markSaving: () => void;
  markSaved: (savedAt?: string) => void;
  markSaveError: (error: unknown) => void;

  updateMetadata: (
    patch: Partial<PrepModelFile['metadata']>,
    options?: HistoryOptions,
  ) => void;
  updateSystem: (
    patch: Partial<PrepSystem>,
    options?: HistoryOptions,
  ) => void;

  addActor: (actor: PrepActor, options?: HistoryOptions) => boolean;
  updateActor: (
    id: string,
    patch: Partial<PrepActor>,
    options?: HistoryOptions,
  ) => boolean;
  deleteActorWithTransfer: (
    actorId: string,
    transferToActorId?: string,
    options?: HistoryOptions,
  ) => boolean;

  addProcessActorLane: (
    lane: ProcessActorLane,
    options?: HistoryOptions,
  ) => boolean;
  updateProcessActorLane: (
    id: string,
    patch: Partial<ProcessActorLane>,
    options?: HistoryOptions,
  ) => boolean;
  updateActorLaneHeight: (
    processId: string,
    actorId: string,
    height: number,
    options?: HistoryOptions,
  ) => boolean;
  deleteProcessActorLane: (
    id: string,
    options?: HistoryOptions,
  ) => boolean;

  addProcess: (
    process: PrepProcess,
    layout?: NodeLayout,
    options?: HistoryOptions,
  ) => boolean;
  updateProcess: (
    id: string,
    patch: Partial<PrepProcess>,
    options?: HistoryOptions,
  ) => boolean;
  deleteProcess: (id: string, options?: HistoryOptions) => boolean;

  addArtifact: (
    artifact: PrepArtifact,
    layout?: NodeLayout,
    options?: HistoryOptions,
  ) => boolean;
  updateArtifact: (
    id: string,
    patch: Partial<PrepArtifact>,
    options?: HistoryOptions,
  ) => boolean;
  deleteArtifact: (id: string, options?: HistoryOptions) => boolean;
  addArtifactState: (
    artifactId: string,
    state: ArtifactState,
    options?: HistoryOptions,
  ) => boolean;
  updateArtifactState: (
    artifactId: string,
    stateId: string,
    patch: Partial<ArtifactState>,
    options?: HistoryOptions,
  ) => boolean;
  deleteArtifactState: (
    artifactId: string,
    stateId: string,
    options?: HistoryOptions,
  ) => boolean;
  setCurrentArtifactState: (
    artifactId: string,
    stateId: string | null,
    options?: HistoryOptions,
  ) => boolean;
  addArtifactAttribute: (
    artifactId: string,
    attribute: KeyValueAttribute,
    options?: HistoryOptions,
  ) => boolean;
  updateArtifactAttribute: (
    artifactId: string,
    attributeId: string,
    patch: Partial<KeyValueAttribute>,
    options?: HistoryOptions,
  ) => boolean;
  deleteArtifactAttribute: (
    artifactId: string,
    attributeId: string,
    options?: HistoryOptions,
  ) => boolean;

  addExternalProcess: (
    process: ExternalProcess,
    layout?: NodeLayout,
    options?: HistoryOptions,
  ) => boolean;
  updateExternalProcess: (
    id: string,
    patch: Partial<ExternalProcess>,
    options?: HistoryOptions,
  ) => boolean;
  deleteExternalProcess: (id: string, options?: HistoryOptions) => boolean;

  addRelation: (
    relation: PrepRelation,
    options?: HistoryOptions,
  ) => AddRelationResult;
  updateRelation: (
    id: string,
    patch: Partial<PrepRelation>,
    options?: HistoryOptions,
  ) => AddRelationResult;
  deleteRelation: (id: string, options?: HistoryOptions) => boolean;

  addProcessHandoff: (
    handoff: ProcessHandoff,
    options?: HistoryOptions,
  ) => ProcessHandoffResult;
  updateProcessHandoff: (
    id: string,
    patch: Partial<ProcessHandoff>,
    options?: HistoryOptions,
  ) => ProcessHandoffResult;
  deleteProcessHandoff: (
    id: string,
    options?: HistoryOptions,
  ) => boolean;

  deleteElements: (
    elements: ElementSelection[],
    options?: HistoryOptions,
  ) => boolean;

  updateNodeLayout: (
    id: string,
    patch: Partial<Omit<NodeLayout, 'id'>>,
    options?: HistoryOptions,
  ) => boolean;
  applyNodeLayouts: (
    layouts: NodeLayout[],
    options?: HistoryOptions,
  ) => boolean;
  removeNodeLayout: (id: string, options?: HistoryOptions) => boolean;
  setViewport: (
    viewport: ViewportState,
    options?: HistoryOptions,
  ) => void;

  upsertArtifactPlacement: (
    processId: string,
    placement: ArtifactPlacement,
    options?: HistoryOptions,
  ) => boolean;
  removeArtifactPlacement: (
    processId: string,
    artifactId: string,
    options?: HistoryOptions,
  ) => boolean;
  updateSubprocessColumnLayout: (
    parentProcessId: string,
    processId: string,
    patch: Partial<Omit<SubprocessColumnLayout, 'processId' | 'parentProcessId' | 'height'>> & {
      /** null restores the lane-following auto height. */
      height?: number | null;
    },
    options?: HistoryOptions,
  ) => boolean;
  removeSubprocessColumnLayout: (
    parentProcessId: string,
    processId: string,
    options?: HistoryOptions,
  ) => boolean;
  setProcessViewport: (
    processId: string,
    viewport: ViewportState,
    options?: HistoryOptions,
  ) => boolean;
  removeProcessViewLayout: (
    processId: string,
    options?: HistoryOptions,
  ) => boolean;
  updateOverviewNodeLayout: (
    id: string,
    kind: OverviewNodeLayout['kind'],
    patch: Partial<Omit<OverviewNodeLayout, 'id' | 'kind'>>,
    options?: HistoryOptions,
  ) => boolean;
  removeOverviewNodeLayout: (
    id: string,
    options?: HistoryOptions,
  ) => boolean;
  setOverviewViewport: (
    viewport: ViewportState,
    options?: HistoryOptions,
  ) => boolean;
}

export type ModelStore = ModelStoreData & ModelStoreActions;

export function clonePrepModel(model: PrepModelFile): PrepModelFile {
  return clonePrepModelValue(model);
}

/** Store-level alias for the canonical empty-model template. */
export function createInitialPrepModel(
  now: string | Date = new Date(),
): PrepModelFile {
  return createEmptyModel(now);
}

function nodeIds(model: PrepModelFile): Set<string> {
  return new Set([
    ...model.processes.map(({ id }) => id),
    ...model.artifacts.map(({ id }) => id),
    ...model.externalProcesses.map(({ id }) => id),
  ]);
}

function hasAnyElementId(
  model: PrepModelFile,
  id: string,
  ignore?: { kind: 'relation' | 'processHandoff'; id: string },
): boolean {
  return (
    nodeIds(model).has(id) ||
    (model.actors ?? []).some((actor) => actor.id === id) ||
    (model.processActorLanes ?? []).some((lane) => lane.id === id) ||
    model.relations.some(
      (relation) =>
        relation.id === id &&
        !(ignore?.kind === 'relation' && ignore.id === relation.id),
    ) ||
    (model.processHandoffs ?? []).some(
      (handoff) =>
        handoff.id === id &&
        !(
          ignore?.kind === 'processHandoff' && ignore.id === handoff.id
        ),
    )
  );
}

function processById(
  model: PrepModelFile,
  processId: string | undefined,
): PrepProcess | undefined {
  return processId
    ? model.processes.find((process) => process.id === processId)
    : undefined;
}

/** Returns null for a missing process or an already-cyclic hierarchy. */
export function getTopLevelProcessId(
  model: PrepModelFile,
  processId: string | undefined,
): string | null {
  let current = processById(model, processId);
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.id)) {
      return null;
    }
    visited.add(current.id);
    if (!current.parentProcessId) {
      return current.id;
    }
    current = processById(model, current.parentProcessId);
  }

  return null;
}

export function canSetProcessParent(
  model: PrepModelFile,
  processId: string,
  parentProcessId: string | undefined,
): boolean {
  if (!parentProcessId) {
    return true;
  }
  if (parentProcessId === processId) {
    return false;
  }

  let current = processById(model, parentProcessId);
  const visited = new Set<string>();
  while (current) {
    if (current.id === processId || visited.has(current.id)) {
      return false;
    }
    visited.add(current.id);
    if (!current.parentProcessId) {
      return true;
    }
    current = processById(model, current.parentProcessId);
  }

  return false;
}

function processSubtreeIds(
  model: PrepModelFile,
  processId: string,
): Set<string> {
  const result = new Set<string>();
  const pending = [processId];
  while (pending.length > 0) {
    const next = pending.pop();
    if (!next || result.has(next)) {
      continue;
    }
    result.add(next);
    for (const process of model.processes) {
      if (process.parentProcessId === next) {
        pending.push(process.id);
      }
    }
  }
  return result;
}

function isArtifactVisibleInProcessView(
  model: PrepModelFile,
  artifact: PrepArtifact,
  processId: string,
): boolean {
  if (artifact.processId === processId) {
    return true;
  }
  return processById(model, artifact.processId)?.parentProcessId === processId;
}

function relationsStayWithinTopLevelProcesses(model: PrepModelFile): boolean {
  return model.relations.every((relation) => {
    const source = model.artifacts.find(({ id }) => id === relation.sourceId);
    const target = model.artifacts.find(({ id }) => id === relation.targetId);
    if (!source || !target) {
      return true;
    }
    const sourceRoot = getTopLevelProcessId(model, source.processId);
    const targetRoot = getTopLevelProcessId(model, target.processId);
    return !sourceRoot || !targetRoot || sourceRoot === targetRoot;
  });
}

function sameRelation(
  left: Pick<
    PrepRelation,
    'sourceId' | 'targetId' | 'prepType'
  >,
  right: Pick<
    PrepRelation,
    'sourceId' | 'targetId' | 'prepType'
  >,
): boolean {
  const sameDirection =
    left.sourceId === right.sourceId && left.targetId === right.targetId;
  const reverseSyncDirection =
    left.prepType === 'sync' &&
    right.prepType === 'sync' &&
    left.sourceId === right.targetId &&
    left.targetId === right.sourceId;

  return (
    (sameDirection || reverseSyncDirection) &&
    left.prepType === right.prepType
  );
}

/**
 * Checks structural constraints before a relation is committed. The UI can use
 * the same function to explain why a pending connection cannot be created.
 */
export function checkRelationConstraint(
  model: PrepModelFile,
  relation: PrepRelation,
  ignoreRelationId?: string,
): RelationConstraint {
  if (
    hasAnyElementId(
      model,
      relation.id,
      ignoreRelationId
        ? { kind: 'relation', id: ignoreRelationId }
        : undefined,
    )
  ) {
    return { canAdd: false, reason: 'duplicate-id' };
  }

  const source = model.artifacts.find(
    (artifact) => artifact.id === relation.sourceId,
  );
  if (!source) {
    return {
      canAdd: false,
      reason: hasAnyElementId(model, relation.sourceId)
        ? 'non-artifact-source'
        : 'missing-source',
    };
  }
  const target = model.artifacts.find(
    (artifact) => artifact.id === relation.targetId,
  );
  if (!target) {
    return {
      canAdd: false,
      reason: hasAnyElementId(model, relation.targetId)
        ? 'non-artifact-target'
        : 'missing-target',
    };
  }
  const sourceRoot = getTopLevelProcessId(model, source.processId);
  const targetRoot = getTopLevelProcessId(model, target.processId);
  if (sourceRoot && targetRoot && sourceRoot !== targetRoot) {
    return { canAdd: false, reason: 'cross-top-level-process' };
  }
  const hasSharedDetailView = model.processes.some(
    (process) =>
      isArtifactVisibleInProcessView(model, source, process.id) &&
      isArtifactVisibleInProcessView(model, target, process.id),
  );
  if (!hasSharedDetailView) {
    return { canAdd: false, reason: 'not-shared-detail-view' };
  }
  if (
    relation.prepType === 'sync' &&
    relation.sourceId === relation.targetId
  ) {
    return { canAdd: false, reason: 'sync-self-connection' };
  }
  if (
    model.relations.some(
      (candidate) =>
        candidate.id !== ignoreRelationId &&
        sameRelation(candidate, relation),
    )
  ) {
    return { canAdd: false, reason: 'duplicate-relation' };
  }

  return { canAdd: true };
}

export function checkProcessHandoffConstraint(
  model: PrepModelFile,
  handoff: ProcessHandoff,
  ignoreHandoffId?: string,
): ProcessHandoffConstraint {
  if (
    hasAnyElementId(
      model,
      handoff.id,
      ignoreHandoffId
        ? { kind: 'processHandoff', id: ignoreHandoffId }
        : undefined,
    )
  ) {
    return { canAdd: false, reason: 'duplicate-id' };
  }

  const sourceProcess = processById(model, handoff.sourceProcessId);
  if (!sourceProcess) {
    return { canAdd: false, reason: 'missing-source-process' };
  }
  const targetProcess = processById(model, handoff.targetProcessId);
  if (!targetProcess) {
    return { canAdd: false, reason: 'missing-target-process' };
  }
  if (sourceProcess.parentProcessId) {
    return { canAdd: false, reason: 'source-process-not-top-level' };
  }
  if (targetProcess.parentProcessId) {
    return { canAdd: false, reason: 'target-process-not-top-level' };
  }
  if (sourceProcess.id === targetProcess.id) {
    return { canAdd: false, reason: 'same-process' };
  }

  for (const artifactId of handoff.sourceArtifactIds) {
    const artifact = model.artifacts.find(({ id }) => id === artifactId);
    if (!artifact) {
      return { canAdd: false, reason: 'missing-source-artifact' };
    }
    if (
      artifact.type !== 'final' ||
      getTopLevelProcessId(model, artifact.processId) !== sourceProcess.id
    ) {
      return { canAdd: false, reason: 'invalid-source-artifact' };
    }
  }

  for (const artifactId of handoff.targetArtifactIds) {
    const artifact = model.artifacts.find(({ id }) => id === artifactId);
    if (!artifact) {
      return { canAdd: false, reason: 'missing-target-artifact' };
    }
    if (
      artifact.scope !== 'external-input' ||
      getTopLevelProcessId(model, artifact.processId) !== targetProcess.id
    ) {
      return { canAdd: false, reason: 'invalid-target-artifact' };
    }
  }

  return { canAdd: true };
}

function isSelectionPresent(
  model: PrepModelFile,
  selection: ElementSelection,
): boolean {
  switch (selection.type) {
    case 'process':
      return model.processes.some(({ id }) => id === selection.id);
    case 'actor':
      return (model.actors ?? []).some(({ id }) => id === selection.id);
    case 'artifact':
      return model.artifacts.some(({ id }) => id === selection.id);
    case 'externalProcess':
      return model.externalProcesses.some(({ id }) => id === selection.id);
    case 'relation':
      return model.relations.some(({ id }) => id === selection.id);
    case 'processHandoff':
      return (model.processHandoffs ?? []).some(
        ({ id }) => id === selection.id,
      );
  }
}

function selectionKey(selection: ElementSelection): string {
  return `${selection.type}:${selection.id}`;
}

function deduplicateSelection(
  model: PrepModelFile,
  selection: ElementSelection[],
): ElementSelection[] {
  const seen = new Set<string>();
  return selection.filter((item) => {
    const key = selectionKey(item);
    if (seen.has(key) || !isSelectionPresent(model, item)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function findStartArtifactId(
  state: Pick<ModelStoreData, 'model' | 'selection'>,
  requestedId?: string,
): string | null {
  if (
    requestedId &&
    state.model.artifacts.some(({ id }) => id === requestedId)
  ) {
    return requestedId;
  }

  const selectedArtifact = state.selection.find(
    ({ type }) => type === 'artifact',
  );
  return selectedArtifact?.id ?? null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'モデルを保存できませんでした';
}

function appendHistory(
  history: PrepModelFile[],
  model: PrepModelFile,
): PrepModelFile[] {
  return [...history, clonePrepModel(model)].slice(-HISTORY_LIMIT);
}

function withUpdatedAt(
  model: PrepModelFile,
  touchUpdatedAt: boolean,
): PrepModelFile {
  if (!touchUpdatedAt) {
    return model;
  }

  return {
    ...model,
    metadata: {
      ...model.metadata,
      updatedAt: new Date().toISOString(),
    },
  };
}

function derivedStateAfterEdit(
  viewMode: ViewMode,
): Pick<
  ModelStoreData,
  'validationResult' | 'assuranceTrace' | 'impactAnalysis' | 'viewMode'
> {
  return {
    validationResult: null,
    assuranceTrace: null,
    impactAnalysis: null,
    viewMode:
      viewMode === 'assurance' || viewMode === 'impact'
        ? 'normal'
        : viewMode,
  };
}

function initialEditorView(model: PrepModelFile): EditorViewState {
  const topLevelProcesses = model.processes.filter(
    (process) => !process.parentProcessId,
  );
  if (topLevelProcesses.length === 1) {
    return {
      mode: 'process',
      activeProcessId: topLevelProcesses[0].id,
    };
  }

  const saved = model.layout.lastView;
  if (
    saved?.mode === 'process' &&
    saved.activeProcessId &&
    model.processes.some(({ id }) => id === saved.activeProcessId)
  ) {
    return clonePrepModelValue(saved);
  }
  return { mode: 'overview' };
}

function ensureEditorView(
  model: PrepModelFile,
  preferred: EditorViewState,
): EditorViewState {
  if (preferred.mode === 'overview') {
    return preferred;
  }
  if (
    preferred.activeProcessId &&
    model.processes.some(({ id }) => id === preferred.activeProcessId)
  ) {
    return preferred;
  }
  return initialEditorView(model);
}

function sameEditorView(
  left: EditorViewState | undefined,
  right: EditorViewState,
): boolean {
  return (
    left?.mode === right.mode &&
    left.activeProcessId === right.activeProcessId
  );
}

function normalizeLaneOrders(
  lanes: ProcessActorLane[],
  movedLaneId?: string,
): ProcessActorLane[] {
  const byProcess = new Map<string, Array<{ lane: ProcessActorLane; index: number }>>();
  lanes.forEach((lane, index) => {
    const group = byProcess.get(lane.processId) ?? [];
    group.push({ lane, index });
    byProcess.set(lane.processId, group);
  });

  const orderById = new Map<string, number>();
  for (const group of byProcess.values()) {
    const moved = group.find(({ lane }) => lane.id === movedLaneId);
    const sorted = group
      .filter(({ lane }) => lane.id !== movedLaneId)
      .sort((left, right) =>
        left.lane.order === right.lane.order
          ? left.index - right.index
          : left.lane.order - right.lane.order,
      );
    if (moved) {
      const targetIndex = Math.max(
        0,
        Math.min(sorted.length, Math.trunc(moved.lane.order)),
      );
      sorted.splice(targetIndex, 0, moved);
    }
    sorted.forEach(({ lane }, order) => orderById.set(lane.id, order));
  }

  return lanes.map((lane) => ({
    ...lane,
    order: orderById.get(lane.id) ?? lane.order,
  }));
}

function normalizeColumnOrders(
  columns: SubprocessColumnLayout[],
  movedProcessId?: string,
): SubprocessColumnLayout[] {
  const moved = columns.find(
    ({ processId }) => processId === movedProcessId,
  );
  const sorted = [...columns]
    .filter(({ processId }) => processId !== movedProcessId)
    .map((column, index) => ({ column, index }))
    .sort((left, right) =>
      left.column.order === right.column.order
        ? left.index - right.index
        : left.column.order - right.column.order,
    );
  if (moved) {
    const targetIndex = Math.max(
      0,
      Math.min(sorted.length, Math.trunc(moved.order)),
    );
    sorted.splice(targetIndex, 0, { column: moved, index: columns.length });
  }
  return sorted.map(({ column }, order) => ({ ...column, order }));
}

function createProcessViewLayout(
  model: PrepModelFile,
  processId: string,
): ProcessViewLayout {
  return {
    processId,
    artifactPlacements: [],
    subprocessColumns: [],
    viewport: clonePrepModelValue(model.layout.viewport),
  };
}

function processHandoffsAreValid(model: PrepModelFile): boolean {
  return (model.processHandoffs ?? []).every((handoff) =>
    checkProcessHandoffConstraint(model, handoff, handoff.id).canAdd,
  );
}

function sanitizeV12Layout(model: PrepModelFile): PrepModelFile {
  const processViews = model.layout.processViews?.map((view) => ({
    ...view,
    artifactPlacements: view.artifactPlacements.filter((placement) => {
      const artifact = model.artifacts.find(
        ({ id }) => id === placement.artifactId,
      );
      return Boolean(
        artifact &&
          isArtifactVisibleInProcessView(model, artifact, view.processId),
      );
    }),
    subprocessColumns: normalizeColumnOrders(
      view.subprocessColumns.filter((column) =>
        model.processes.some(
          (process) =>
            process.id === column.processId &&
            process.parentProcessId === view.processId &&
            column.parentProcessId === view.processId,
        ),
      ),
    ),
  }));
  const overview = model.layout.overview
    ? {
        ...model.layout.overview,
        nodes: model.layout.overview.nodes.filter((node) =>
          node.kind === 'process'
            ? model.processes.some(
                (process) =>
                  process.id === node.id && !process.parentProcessId,
              )
            : model.externalProcesses.some(
                (process) => process.id === node.id,
              ),
        ),
      }
    : undefined;

  return {
    ...model,
    layout: {
      ...model.layout,
      ...(processViews ? { processViews } : {}),
      ...(overview ? { overview } : {}),
    },
  };
}

function initialData(model: PrepModelFile): ModelStoreData {
  return {
    model: clonePrepModel(model),
    past: [],
    future: [],
    historyTransaction: null,
    selection: [],
    viewMode: 'normal',
    editorView: initialEditorView(model),
    validationResult: null,
    assuranceTrace: null,
    impactAnalysis: null,
    focusRequest: null,
    saveStatus: 'idle',
    lastSavedAt: null,
    saveError: null,
  };
}

type StoreSet = Parameters<StateCreator<ModelStore>>[0];
type StoreGet = Parameters<StateCreator<ModelStore>>[1];

function mutateModel(
  set: StoreSet,
  get: StoreGet,
  update: (model: PrepModelFile) => PrepModelFile | null,
  options: HistoryOptions = {},
): boolean {
  const currentState = get();
  const updated = update(currentState.model);
  if (!updated || updated === currentState.model) {
    return false;
  }

  const nextEditorView = ensureEditorView(
    updated,
    currentState.editorView,
  );
  const editorAdjusted = !sameEditorView(
    currentState.editorView,
    nextEditorView,
  );
  const synchronized = editorAdjusted
    ? {
        ...updated,
        layout: {
          ...updated.layout,
          lastView: clonePrepModelValue(nextEditorView),
        },
      }
    : updated;
  const nextModel = withUpdatedAt(
    synchronized,
    options.touchUpdatedAt ?? true,
  );
  const recordHistory = options.recordHistory ?? true;
  const transaction =
    recordHistory && currentState.historyTransaction
      ? {
          ...currentState.historyTransaction,
          changed: true,
        }
      : currentState.historyTransaction;

  set({
    model: nextModel,
    past:
      recordHistory && !currentState.historyTransaction
        ? appendHistory(currentState.past, currentState.model)
        : currentState.past,
    future: recordHistory ? [] : currentState.future,
    historyTransaction: transaction,
    selection: deduplicateSelection(
      nextModel,
      currentState.selection,
    ),
    editorView: nextEditorView,
    saveStatus: 'dirty',
    saveError: null,
    ...((options.invalidateDerived ?? true)
      ? derivedStateAfterEdit(currentState.viewMode)
      : {}),
  });

  return true;
}

function removeNodesAndRelations(
  model: PrepModelFile,
  removedNodeIds: Set<string>,
  removedRelationIds = new Set<string>(),
): PrepModelFile {
  const removedProcessIds = new Set(
    model.processes
      .filter(({ id }) => removedNodeIds.has(id))
      .map(({ id }) => id),
  );
  const removedArtifactIds = new Set(
    model.artifacts
      .filter(({ id }) => removedNodeIds.has(id))
      .map(({ id }) => id),
  );
  const processViews = model.layout.processViews
    ?.filter(({ processId }) => !removedProcessIds.has(processId))
    .map((view) => ({
      ...view,
      artifactPlacements: view.artifactPlacements.filter(
        ({ artifactId }) => !removedArtifactIds.has(artifactId),
      ),
      subprocessColumns: view.subprocessColumns.filter(
        ({ processId, parentProcessId }) =>
          !removedProcessIds.has(processId) &&
          !removedProcessIds.has(parentProcessId),
      ),
    }));
  const overview = model.layout.overview
    ? {
        ...model.layout.overview,
        nodes: model.layout.overview.nodes.filter(
          ({ id }) => !removedNodeIds.has(id),
        ),
      }
    : undefined;

  return {
    ...model,
    processes: model.processes.filter(({ id }) => !removedNodeIds.has(id)),
    artifacts: model.artifacts.filter(({ id }) => !removedNodeIds.has(id)),
    externalProcesses: model.externalProcesses.filter(
      ({ id }) => !removedNodeIds.has(id),
    ),
    relations: model.relations.filter(
      ({ id, sourceId, targetId }) =>
        !removedRelationIds.has(id) &&
        !removedNodeIds.has(sourceId) &&
        !removedNodeIds.has(targetId),
    ),
    processActorLanes: (model.processActorLanes ?? []).filter(
      ({ processId }) => !removedProcessIds.has(processId),
    ),
    processHandoffs: (model.processHandoffs ?? [])
      .filter(
        ({ sourceProcessId, targetProcessId }) =>
          !removedProcessIds.has(sourceProcessId) &&
          !removedProcessIds.has(targetProcessId),
      )
      .map((handoff) => ({
        ...handoff,
        sourceArtifactIds: handoff.sourceArtifactIds.filter(
          (id) => !removedArtifactIds.has(id),
        ),
        targetArtifactIds: handoff.targetArtifactIds.filter(
          (id) => !removedArtifactIds.has(id),
        ),
      })),
    layout: {
      ...model.layout,
      nodes: model.layout.nodes.filter(
        ({ id, parentId }) =>
          !removedNodeIds.has(id) &&
          (!parentId || !removedNodeIds.has(parentId)),
      ),
      ...(processViews ? { processViews } : {}),
      ...(overview ? { overview } : {}),
    },
  };
}

export function createModelStoreState(
  initialModel = createInitialPrepModel(),
): StateCreator<ModelStore> {
  return (set, get) => ({
    ...initialData(initialModel),

    replaceModel: (model, options = {}) => {
      const currentState = get();
      const resetHistory = options.resetHistory ?? true;
      const nextModel = clonePrepModel(model);

      set({
        model: nextModel,
        past: resetHistory
          ? []
          : appendHistory(currentState.past, currentState.model),
        future: [],
        historyTransaction: null,
        selection: [],
        viewMode: 'normal',
        editorView: initialEditorView(nextModel),
        validationResult: null,
        assuranceTrace: null,
        impactAnalysis: null,
        focusRequest: null,
        saveStatus: options.markSaved ? 'saved' : 'idle',
        lastSavedAt: options.markSaved
          ? model.metadata.updatedAt
          : currentState.lastSavedAt,
        saveError: null,
      });
    },

    loadModel: (model) => {
      get().replaceModel(model, { resetHistory: true, markSaved: true });
    },

    newModel: (model = createInitialPrepModel()) => {
      get().replaceModel(model, { resetHistory: true, markSaved: false });
    },

    undo: () => {
      if (get().historyTransaction) {
        get().endHistoryTransaction();
      }
      const state = get();
      const previous = state.past.at(-1);
      if (!previous) {
        return false;
      }

      const restoredModel = clonePrepModel(previous);
      const nextEditorView = ensureEditorView(
        restoredModel,
        state.editorView,
      );
      const nextModel = {
        ...restoredModel,
        layout: {
          ...restoredModel.layout,
          lastView: clonePrepModelValue(nextEditorView),
        },
      };
      set({
        model: nextModel,
        past: state.past.slice(0, -1),
        future: [clonePrepModel(state.model), ...state.future].slice(
          0,
          HISTORY_LIMIT,
        ),
        selection: deduplicateSelection(nextModel, state.selection),
        editorView: nextEditorView,
        saveStatus: 'dirty',
        saveError: null,
        ...derivedStateAfterEdit(state.viewMode),
      });
      return true;
    },

    redo: () => {
      if (get().historyTransaction) {
        get().endHistoryTransaction();
      }
      const state = get();
      const next = state.future[0];
      if (!next) {
        return false;
      }

      const restoredModel = clonePrepModel(next);
      const nextEditorView = ensureEditorView(
        restoredModel,
        state.editorView,
      );
      const nextModel = {
        ...restoredModel,
        layout: {
          ...restoredModel.layout,
          lastView: clonePrepModelValue(nextEditorView),
        },
      };
      set({
        model: nextModel,
        past: appendHistory(state.past, state.model),
        future: state.future.slice(1),
        selection: deduplicateSelection(nextModel, state.selection),
        editorView: nextEditorView,
        saveStatus: 'dirty',
        saveError: null,
        ...derivedStateAfterEdit(state.viewMode),
      });
      return true;
    },

    resetHistory: () => {
      set({ past: [], future: [], historyTransaction: null });
    },

    beginHistoryTransaction: () => {
      const state = get();
      if (state.historyTransaction) {
        return;
      }
      set({
        historyTransaction: {
          baseModel: clonePrepModel(state.model),
          changed: false,
        },
      });
    },

    endHistoryTransaction: () => {
      const state = get();
      const transaction = state.historyTransaction;
      if (!transaction) {
        return false;
      }

      set({
        past: transaction.changed
          ? appendHistory(state.past, transaction.baseModel)
          : state.past,
        future: transaction.changed ? [] : state.future,
        historyTransaction: null,
      });
      return transaction.changed;
    },

    setSelection: (selection) => {
      set({ selection: deduplicateSelection(get().model, selection) });
    },

    selectElement: (selection, additive = false) => {
      const state = get();
      if (!isSelectionPresent(state.model, selection)) {
        return;
      }
      const current = additive ? state.selection : [];
      set({
        selection: deduplicateSelection(state.model, [
          ...current,
          selection,
        ]),
      });
    },

    clearSelection: () => {
      set({ selection: [] });
    },

    setViewMode: (viewMode) => {
      set({ viewMode });
    },

    setEditorView: (view) => {
      const state = get();
      const nextView: EditorViewState =
        view.mode === 'overview'
          ? { mode: 'overview' }
          : {
              mode: 'process',
              activeProcessId: view.activeProcessId,
            };
      if (
        nextView.mode === 'process' &&
        (!nextView.activeProcessId ||
          !state.model.processes.some(
            ({ id }) => id === nextView.activeProcessId,
          ))
      ) {
        return false;
      }

      const viewChanged = !sameEditorView(state.editorView, nextView);
      const persistedViewChanged = !sameEditorView(
        state.model.layout.lastView,
        nextView,
      );
      if (!viewChanged && !persistedViewChanged) {
        return false;
      }
      if (persistedViewChanged) {
        mutateModel(
          set,
          get,
          (model) => ({
            ...model,
            layout: {
              ...model.layout,
              lastView: clonePrepModelValue(nextView),
            },
          }),
          {
            recordHistory: false,
            touchUpdatedAt: false,
            invalidateDerived: false,
          },
        );
      }
      set({ editorView: nextView });
      return true;
    },

    openProcess: (processId) =>
      get().setEditorView({
        mode: 'process',
        activeProcessId: processId,
      }),

    openOverview: () => get().setEditorView({ mode: 'overview' }),

    setValidationResult: (validationResult) => {
      set({ validationResult });
    },

    validate: () => {
      const state = get();
      const result = validateModel(
        state.model,
        state.editorView.mode === 'process'
          ? state.editorView.activeProcessId
          : undefined,
      );
      set({ validationResult: result });
      return result;
    },

    setAssuranceTrace: (assuranceTrace) => {
      set({
        assuranceTrace,
        impactAnalysis: null,
        viewMode: assuranceTrace ? 'assurance' : 'normal',
      });
    },

    traceAssurance: (requestedId) => {
      const state = get();
      const startArtifactId = findStartArtifactId(state, requestedId);
      if (!startArtifactId) {
        set({ assuranceTrace: null });
        return null;
      }
      const result = traceModelAssurance(state.model, startArtifactId);
      set({
        assuranceTrace: result,
        impactAnalysis: null,
        viewMode: 'assurance',
      });
      return result;
    },

    setImpactAnalysis: (impactAnalysis) => {
      set({
        impactAnalysis,
        assuranceTrace: null,
        viewMode: impactAnalysis ? 'impact' : 'normal',
      });
    },

    analyzeImpact: (requestedId) => {
      const state = get();
      const startArtifactId = findStartArtifactId(state, requestedId);
      if (!startArtifactId) {
        set({ impactAnalysis: null });
        return null;
      }
      const result = analyzeModelImpact(state.model, startArtifactId);
      set({
        impactAnalysis: result,
        assuranceTrace: null,
        viewMode: 'impact',
      });
      return result;
    },

    clearAnalysis: () => {
      const state = get();
      set({
        assuranceTrace: null,
        impactAnalysis: null,
        viewMode:
          state.viewMode === 'assurance' || state.viewMode === 'impact'
            ? 'normal'
            : state.viewMode,
      });
    },

    requestFocus: (target = { type: 'model' }) => {
      const request: FocusRequest = {
        requestId: (get().focusRequest?.requestId ?? 0) + 1,
        target,
      };
      set({ focusRequest: request });
      return request;
    },

    clearFocusRequest: (requestId) => {
      const current = get().focusRequest;
      if (
        current &&
        (requestId === undefined || current.requestId === requestId)
      ) {
        set({ focusRequest: null });
      }
    },

    setSaveStatus: (saveStatus, details = {}) => {
      set({
        saveStatus,
        lastSavedAt:
          details.savedAt === undefined
            ? get().lastSavedAt
            : details.savedAt,
        saveError:
          details.error === undefined ? get().saveError : details.error,
      });
    },

    markSaving: () => {
      set({ saveStatus: 'saving', saveError: null });
    },

    markSaved: (savedAt = new Date().toISOString()) => {
      set({
        saveStatus: 'saved',
        lastSavedAt: savedAt,
        saveError: null,
      });
    },

    markSaveError: (error) => {
      set({ saveStatus: 'error', saveError: errorMessage(error) });
    },

    updateMetadata: (patch, options) => {
      mutateModel(
        set,
        get,
        (model) => ({
          ...model,
          metadata: { ...model.metadata, ...patch },
        }),
        options,
      );
    },

    updateSystem: (patch, options) => {
      mutateModel(
        set,
        get,
        (model) => ({
          ...model,
          system: { ...model.system, ...patch },
        }),
        options,
      );
    },

    addActor: (actor, options) => {
      if (hasAnyElementId(get().model, actor.id)) {
        return false;
      }
      return mutateModel(
        set,
        get,
        (model) => ({
          ...model,
          actors: [
            ...(model.actors ?? []),
            clonePrepModelValue(actor),
          ],
        }),
        options,
      );
    },

    updateActor: (id, patch, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const actors = model.actors ?? [];
          const index = actors.findIndex((actor) => actor.id === id);
          if (index < 0) {
            return null;
          }
          const nextActors = [...actors];
          nextActors[index] = { ...nextActors[index], ...patch, id };
          return { ...model, actors: nextActors };
        },
        options,
      ),

    deleteActorWithTransfer: (
      actorId,
      transferToActorId,
      options,
    ) =>
      mutateModel(
        set,
        get,
        (model) => {
          const actors = model.actors ?? [];
          if (!actors.some(({ id }) => id === actorId)) {
            return null;
          }
          const hasResponsibilities = model.artifacts.some(
            ({ responsibleActorId }) => responsibleActorId === actorId,
          );
          if (hasResponsibilities && !transferToActorId) {
            return null;
          }
          if (
            transferToActorId &&
            (transferToActorId === actorId ||
              !actors.some(({ id }) => id === transferToActorId))
          ) {
            return null;
          }

          const occupiedLanePairs = new Set(
            (model.processActorLanes ?? [])
              .filter(({ actorId: laneActorId }) => laneActorId !== actorId)
              .map(({ processId, actorId: laneActorId }) =>
                `${processId}:${laneActorId}`,
              ),
          );
          const lanes: ProcessActorLane[] = [];
          for (const lane of model.processActorLanes ?? []) {
            if (lane.actorId !== actorId) {
              lanes.push(lane);
              continue;
            }
            if (!transferToActorId) {
              continue;
            }
            const pair = `${lane.processId}:${transferToActorId}`;
            if (!occupiedLanePairs.has(pair)) {
              occupiedLanePairs.add(pair);
              lanes.push({ ...lane, actorId: transferToActorId });
            }
          }

          return {
            ...model,
            actors: actors.filter(({ id }) => id !== actorId),
            processActorLanes: normalizeLaneOrders(lanes),
            processes: model.processes.map((process) =>
              process.leadActorId === actorId
                ? {
                    ...process,
                    leadActorId: transferToActorId,
                  }
                : process,
            ),
            artifacts: model.artifacts.map((artifact) =>
              artifact.responsibleActorId === actorId
                ? {
                    ...artifact,
                    responsibleActorId: transferToActorId,
                  }
                : artifact,
            ),
          };
        },
        options,
      ),

    addProcessActorLane: (lane, options) => {
      const model = get().model;
      if (
        hasAnyElementId(model, lane.id) ||
        !model.processes.some(({ id }) => id === lane.processId) ||
        !(model.actors ?? []).some(({ id }) => id === lane.actorId) ||
        (model.processActorLanes ?? []).some(
          (candidate) =>
            candidate.processId === lane.processId &&
            candidate.actorId === lane.actorId,
        )
      ) {
        return false;
      }
      return mutateModel(
        set,
        get,
        (current) => ({
          ...current,
          processActorLanes: normalizeLaneOrders([
            ...(current.processActorLanes ?? []),
            clonePrepModelValue(lane),
          ], lane.id),
        }),
        options,
      );
    },

    updateProcessActorLane: (id, patch, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const lanes = model.processActorLanes ?? [];
          const index = lanes.findIndex((lane) => lane.id === id);
          if (index < 0) {
            return null;
          }
          const candidate = clonePrepModelValue({
            ...lanes[index],
            ...patch,
            id,
          });
          if (
            !model.processes.some(({ id }) => id === candidate.processId) ||
            !(model.actors ?? []).some(({ id }) => id === candidate.actorId) ||
            lanes.some(
              (lane) =>
                lane.id !== id &&
                lane.processId === candidate.processId &&
                lane.actorId === candidate.actorId,
            )
          ) {
            return null;
          }
          const nextLanes = [...lanes];
          nextLanes[index] = candidate;
          return {
            ...model,
            processActorLanes: normalizeLaneOrders(nextLanes, id),
          };
        },
        options,
      ),

    updateActorLaneHeight: (processId, actorId, height, options) => {
      if (!Number.isFinite(height)) return false;
      return mutateModel(
        set,
        get,
        (model) => {
          const geometry = getProcessGridGeometry(model, processId);
          const target = geometry.lanes.find((lane) => lane.actorId === actorId);
          if (!target) return null;
          const nextHeight = Math.min(
            Math.max(
              height,
              getActorLaneMinimumHeight(model, processId, actorId),
            ),
            getActorLaneMaximumHeight(model, processId, actorId),
          );
          if (target.height === nextHeight) return null;

          const existing = model.processActorLanes ?? [];
          const saved = existing.find(
            (lane) => lane.processId === processId && lane.actorId === actorId,
          );
          if (saved) {
            return {
              ...model,
              processActorLanes: existing.map((lane) =>
                lane.id === saved.id ? { ...lane, height: nextHeight } : lane,
              ),
            };
          }

          // A legacy/derived view has no persisted lanes. Save every visible
          // row together; persisting only one would hide all other derived rows.
          const reservedIds = new Set<string>();
          const materialized = geometry.lanes.map((lane) => {
            // Keep the ID used by the canvas so its resize handle stays
            // mounted and retains pointer capture during the first drag.
            const base = lane.id;
            let id = base;
            let suffix = 2;
            while (
              id === model.system.id ||
              hasAnyElementId(model, id) ||
              reservedIds.has(id)
            ) {
              id = `${base}:${suffix++}`;
            }
            reservedIds.add(id);
            return {
              id,
              processId,
              actorId: lane.actorId,
              order: lane.order,
              height: lane.actorId === actorId ? nextHeight : lane.height,
              ...(lane.role === undefined ? {} : { role: lane.role }),
            } satisfies ProcessActorLane;
          });
          return {
            ...model,
            processActorLanes: [...existing, ...materialized],
          };
        },
        options,
      );
    },

    deleteProcessActorLane: (id, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const lanes = model.processActorLanes ?? [];
          return lanes.some((lane) => lane.id === id)
            ? {
                ...model,
                processActorLanes: normalizeLaneOrders(
                  lanes.filter((lane) => lane.id !== id),
                ),
              }
            : null;
        },
        options,
      ),

    addProcess: (process, layout, options) => {
      const current = get().model;
      if (
        hasAnyElementId(current, process.id) ||
        !canSetProcessParent(
          current,
          process.id,
          process.parentProcessId,
        ) ||
        (process.leadActorId !== undefined &&
          !(current.actors ?? []).some(
            ({ id }) => id === process.leadActorId,
          ))
      ) {
        return false;
      }
      return mutateModel(
        set,
        get,
        (model) => ({
          ...model,
          processes: [...model.processes, clonePrepModelValue(process)],
          layout: layout
            ? {
                ...model.layout,
                nodes: [
                  ...model.layout.nodes,
                  clonePrepModelValue({
                    ...layout,
                    id: process.id,
                    parentId:
                      layout.parentId ?? process.parentProcessId,
                  }),
                ],
              }
            : model.layout,
        }),
        options,
      );
    },

    updateProcess: (id, patch, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const index = model.processes.findIndex(
            (process) => process.id === id,
          );
          if (index < 0) {
            return null;
          }
          const processes = [...model.processes];
          const candidate = clonePrepModelValue({
            ...processes[index],
            ...patch,
            id,
          });
          if (
            !canSetProcessParent(
              model,
              id,
              candidate.parentProcessId,
            ) ||
            (candidate.leadActorId !== undefined &&
              !(model.actors ?? []).some(
                ({ id: actorId }) => actorId === candidate.leadActorId,
              ))
          ) {
            return null;
          }
          processes[index] = candidate;
          const nextModel = sanitizeV12Layout({
            ...model,
            processes,
            layout: {
              ...model.layout,
              nodes: model.layout.nodes.map((node) =>
                node.id === id
                  ? { ...node, parentId: candidate.parentProcessId }
                  : node,
              ),
            },
          });
          if (
            !relationsStayWithinTopLevelProcesses(nextModel) ||
            !processHandoffsAreValid(nextModel)
          ) {
            return null;
          }
          return nextModel;
        },
        options,
      ),

    deleteProcess: (id, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          if (!model.processes.some((process) => process.id === id)) {
            return null;
          }
          const removedProcessIds = processSubtreeIds(model, id);
          const removedIds = new Set<string>(removedProcessIds);
          for (const artifact of model.artifacts) {
            if (
              artifact.processId &&
              removedProcessIds.has(artifact.processId)
            ) {
              removedIds.add(artifact.id);
            }
          }
          return removeNodesAndRelations(model, removedIds);
        },
        options,
      ),

    addArtifact: (artifact, layout, options) => {
      const current = get().model;
      if (
        hasAnyElementId(current, artifact.id) ||
        (artifact.processId !== undefined &&
          !current.processes.some(({ id }) => id === artifact.processId)) ||
        (artifact.responsibleActorId !== undefined &&
          !(current.actors ?? []).some(
            ({ id }) => id === artifact.responsibleActorId,
          ))
      ) {
        return false;
      }
      return mutateModel(
        set,
        get,
        (model) => ({
          ...model,
          artifacts: [
            ...model.artifacts,
            clonePrepModelValue(artifact),
          ],
          layout: layout
            ? {
                ...model.layout,
                nodes: [
                  ...model.layout.nodes,
                  clonePrepModelValue({
                    ...layout,
                    id: artifact.id,
                    parentId: layout.parentId ?? artifact.processId,
                  }),
                ],
              }
            : model.layout,
        }),
        options,
      );
    },

    updateArtifact: (id, patch, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const index = model.artifacts.findIndex(
            (artifact) => artifact.id === id,
          );
          if (index < 0) {
            return null;
          }
          const artifacts = [...model.artifacts];
          const candidate = clonePrepModelValue({
            ...artifacts[index],
            ...patch,
            id,
          });
          if (
            (candidate.processId !== undefined &&
              !model.processes.some(
                ({ id: processId }) => processId === candidate.processId,
              )) ||
            (candidate.responsibleActorId !== undefined &&
              !(model.actors ?? []).some(
                ({ id: actorId }) =>
                  actorId === candidate.responsibleActorId,
              ))
          ) {
            return null;
          }
          artifacts[index] = candidate;
          const nextModel = sanitizeV12Layout({
            ...model,
            artifacts,
            layout: {
              ...model.layout,
              nodes: model.layout.nodes.map((node) =>
                node.id === id
                  ? { ...node, parentId: candidate.processId }
                  : node,
              ),
            },
          });
          if (
            !relationsStayWithinTopLevelProcesses(nextModel) ||
            !processHandoffsAreValid(nextModel)
          ) {
            return null;
          }
          return nextModel;
        },
        options,
      ),

    deleteArtifact: (id, options) =>
      mutateModel(
        set,
        get,
        (model) =>
          model.artifacts.some((artifact) => artifact.id === id)
            ? removeNodesAndRelations(model, new Set([id]))
            : null,
        options,
      ),

    addArtifactState: (artifactId, state, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const index = model.artifacts.findIndex(
            (artifact) => artifact.id === artifactId,
          );
          if (
            index < 0 ||
            model.artifacts[index].states.some(({ id }) => id === state.id)
          ) {
            return null;
          }
          const artifacts = [...model.artifacts];
          artifacts[index] = {
            ...artifacts[index],
            states: [
              ...artifacts[index].states,
              clonePrepModelValue(state),
            ],
          };
          return { ...model, artifacts };
        },
        options,
      ),

    updateArtifactState: (
      artifactId,
      stateId,
      patch,
      options,
    ) =>
      mutateModel(
        set,
        get,
        (model) => {
          const artifactIndex = model.artifacts.findIndex(
            (artifact) => artifact.id === artifactId,
          );
          if (artifactIndex < 0) {
            return null;
          }
          const stateIndex = model.artifacts[
            artifactIndex
          ].states.findIndex((state) => state.id === stateId);
          if (stateIndex < 0) {
            return null;
          }
          const artifacts = [...model.artifacts];
          const states = [...artifacts[artifactIndex].states];
          states[stateIndex] = { ...states[stateIndex], ...patch, id: stateId };
          artifacts[artifactIndex] = {
            ...artifacts[artifactIndex],
            states,
          };
          return { ...model, artifacts };
        },
        options,
      ),

    deleteArtifactState: (artifactId, stateId, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const artifactIndex = model.artifacts.findIndex(
            (artifact) => artifact.id === artifactId,
          );
          if (artifactIndex < 0) {
            return null;
          }
          const artifact = model.artifacts[artifactIndex];
          if (!artifact.states.some(({ id }) => id === stateId)) {
            return null;
          }
          const artifacts = [...model.artifacts];
          artifacts[artifactIndex] = {
            ...artifact,
            states: artifact.states.filter(({ id }) => id !== stateId),
          };
          return { ...model, artifacts };
        },
        options,
      ),

    setCurrentArtifactState: (artifactId, stateId, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const artifactIndex = model.artifacts.findIndex(
            (artifact) => artifact.id === artifactId,
          );
          if (artifactIndex < 0) {
            return null;
          }
          const artifact = model.artifacts[artifactIndex];
          if (
            stateId !== null &&
            !artifact.states.some(({ id }) => id === stateId)
          ) {
            return null;
          }
          const artifacts = [...model.artifacts];
          artifacts[artifactIndex] = {
            ...artifact,
            states: artifact.states.map((state) => ({
              ...state,
              isCurrent: stateId !== null && state.id === stateId,
            })),
          };
          return { ...model, artifacts };
        },
        options,
      ),

    addArtifactAttribute: (artifactId, attribute, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const artifactIndex = model.artifacts.findIndex(
            (artifact) => artifact.id === artifactId,
          );
          if (
            artifactIndex < 0 ||
            model.artifacts[artifactIndex].attributes.some(
              ({ id }) => id === attribute.id,
            )
          ) {
            return null;
          }
          const artifacts = [...model.artifacts];
          artifacts[artifactIndex] = {
            ...artifacts[artifactIndex],
            attributes: [
              ...artifacts[artifactIndex].attributes,
              clonePrepModelValue(attribute),
            ],
          };
          return { ...model, artifacts };
        },
        options,
      ),

    updateArtifactAttribute: (
      artifactId,
      attributeId,
      patch,
      options,
    ) =>
      mutateModel(
        set,
        get,
        (model) => {
          const artifactIndex = model.artifacts.findIndex(
            (artifact) => artifact.id === artifactId,
          );
          if (artifactIndex < 0) {
            return null;
          }
          const attributeIndex = model.artifacts[
            artifactIndex
          ].attributes.findIndex(
            (attribute) => attribute.id === attributeId,
          );
          if (attributeIndex < 0) {
            return null;
          }
          const artifacts = [...model.artifacts];
          const attributes = [...artifacts[artifactIndex].attributes];
          attributes[attributeIndex] = {
            ...attributes[attributeIndex],
            ...patch,
            id: attributeId,
          };
          artifacts[artifactIndex] = {
            ...artifacts[artifactIndex],
            attributes,
          };
          return { ...model, artifacts };
        },
        options,
      ),

    deleteArtifactAttribute: (
      artifactId,
      attributeId,
      options,
    ) =>
      mutateModel(
        set,
        get,
        (model) => {
          const artifactIndex = model.artifacts.findIndex(
            (artifact) => artifact.id === artifactId,
          );
          if (artifactIndex < 0) {
            return null;
          }
          const artifact = model.artifacts[artifactIndex];
          if (
            !artifact.attributes.some(({ id }) => id === attributeId)
          ) {
            return null;
          }
          const artifacts = [...model.artifacts];
          artifacts[artifactIndex] = {
            ...artifact,
            attributes: artifact.attributes.filter(
              ({ id }) => id !== attributeId,
            ),
          };
          return { ...model, artifacts };
        },
        options,
      ),

    addExternalProcess: (process, layout, options) => {
      if (hasAnyElementId(get().model, process.id)) {
        return false;
      }
      return mutateModel(
        set,
        get,
        (model) => ({
          ...model,
          externalProcesses: [
            ...model.externalProcesses,
            clonePrepModelValue(process),
          ],
          layout: layout
            ? {
                ...model.layout,
                nodes: [
                  ...model.layout.nodes,
                  clonePrepModelValue({ ...layout, id: process.id }),
                ],
              }
            : model.layout,
        }),
        options,
      );
    },

    updateExternalProcess: (id, patch, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const index = model.externalProcesses.findIndex(
            (process) => process.id === id,
          );
          if (index < 0) {
            return null;
          }
          const externalProcesses = [...model.externalProcesses];
          externalProcesses[index] = {
            ...externalProcesses[index],
            ...patch,
            id,
          };
          return { ...model, externalProcesses };
        },
        options,
      ),

    deleteExternalProcess: (id, options) =>
      mutateModel(
        set,
        get,
        (model) =>
          model.externalProcesses.some((process) => process.id === id)
            ? removeNodesAndRelations(model, new Set([id]))
            : null,
        options,
      ),

    addRelation: (relation, options) => {
      const constraint = checkRelationConstraint(get().model, relation);
      if (!constraint.canAdd) {
        return { ok: false, reason: constraint.reason };
      }
      mutateModel(
        set,
        get,
        (model) => ({
          ...model,
          relations: [
            ...model.relations,
            clonePrepModelValue(relation),
          ],
        }),
        options,
      );
      return { ok: true };
    },

    updateRelation: (id, patch, options) => {
      const state = get();
      const current = state.model.relations.find(
        (relation) => relation.id === id,
      );
      if (!current) {
        return { ok: false, reason: 'missing-relation' };
      }
      const candidate = clonePrepModelValue({ ...current, ...patch, id });
      const constraint = checkRelationConstraint(
        state.model,
        candidate,
        id,
      );
      if (!constraint.canAdd) {
        return { ok: false, reason: constraint.reason };
      }
      mutateModel(
        set,
        get,
        (model) => ({
          ...model,
          relations: model.relations.map((relation) =>
            relation.id === id ? candidate : relation,
          ),
        }),
        options,
      );
      return { ok: true };
    },

    deleteRelation: (id, options) =>
      mutateModel(
        set,
        get,
        (model) =>
          model.relations.some((relation) => relation.id === id)
            ? {
                ...model,
                relations: model.relations.filter(
                  (relation) => relation.id !== id,
                ),
              }
            : null,
        options,
      ),

    addProcessHandoff: (handoff, options) => {
      const constraint = checkProcessHandoffConstraint(
        get().model,
        handoff,
      );
      if (!constraint.canAdd) {
        return { ok: false, reason: constraint.reason };
      }
      mutateModel(
        set,
        get,
        (model) => ({
          ...model,
          processHandoffs: [
            ...(model.processHandoffs ?? []),
            clonePrepModelValue(handoff),
          ],
        }),
        options,
      );
      return { ok: true };
    },

    updateProcessHandoff: (id, patch, options) => {
      const model = get().model;
      const current = (model.processHandoffs ?? []).find(
        (handoff) => handoff.id === id,
      );
      if (!current) {
        return { ok: false, reason: 'missing-handoff' };
      }
      const candidate = clonePrepModelValue({ ...current, ...patch, id });
      const constraint = checkProcessHandoffConstraint(
        model,
        candidate,
        id,
      );
      if (!constraint.canAdd) {
        return { ok: false, reason: constraint.reason };
      }
      mutateModel(
        set,
        get,
        (nextModel) => ({
          ...nextModel,
          processHandoffs: (nextModel.processHandoffs ?? []).map(
            (handoff) => (handoff.id === id ? candidate : handoff),
          ),
        }),
        options,
      );
      return { ok: true };
    },

    deleteProcessHandoff: (id, options) =>
      mutateModel(
        set,
        get,
        (model) =>
          (model.processHandoffs ?? []).some(
            (handoff) => handoff.id === id,
          )
            ? {
                ...model,
                processHandoffs: (model.processHandoffs ?? []).filter(
                  (handoff) => handoff.id !== id,
                ),
              }
            : null,
        options,
      ),

    deleteElements: (elements, options) => {
      const model = get().model;
      const removedNodeIds = new Set<string>();
      const removedRelationIds = new Set<string>();
      const requestedActorIds = new Set<string>();
      const removedHandoffIds = new Set<string>();

      for (const element of elements) {
        if (!isSelectionPresent(model, element)) {
          continue;
        }
        switch (element.type) {
          case 'relation':
            removedRelationIds.add(element.id);
            break;
          case 'processHandoff':
            removedHandoffIds.add(element.id);
            break;
          case 'actor':
            requestedActorIds.add(element.id);
            break;
          case 'process': {
            const subtree = processSubtreeIds(model, element.id);
            for (const processId of subtree) {
              removedNodeIds.add(processId);
            }
            for (const artifact of model.artifacts) {
              if (artifact.processId && subtree.has(artifact.processId)) {
                removedNodeIds.add(artifact.id);
              }
            }
            break;
          }
          case 'artifact':
          case 'externalProcess':
            removedNodeIds.add(element.id);
            break;
        }
      }

      const removedActorIds = new Set(
        [...requestedActorIds].filter((actorId) =>
          model.artifacts.every(
            (artifact) =>
              artifact.responsibleActorId !== actorId ||
              removedNodeIds.has(artifact.id),
          ),
        ),
      );

      if (
        removedNodeIds.size === 0 &&
        removedRelationIds.size === 0 &&
        removedActorIds.size === 0 &&
        removedHandoffIds.size === 0
      ) {
        return false;
      }
      return mutateModel(
        set,
        get,
        (current) => {
          const reduced = removeNodesAndRelations(
            current,
            removedNodeIds,
            removedRelationIds,
          );
          return {
            ...reduced,
            actors: (reduced.actors ?? []).filter(
              ({ id }) => !removedActorIds.has(id),
            ),
            processActorLanes: (reduced.processActorLanes ?? []).filter(
              ({ actorId }) => !removedActorIds.has(actorId),
            ),
            processes: reduced.processes.map((process) =>
              process.leadActorId &&
              removedActorIds.has(process.leadActorId)
                ? { ...process, leadActorId: undefined }
                : process,
            ),
            processHandoffs: (reduced.processHandoffs ?? []).filter(
              ({ id }) => !removedHandoffIds.has(id),
            ),
          };
        },
        options,
      );
    },

    updateNodeLayout: (id, patch, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const index = model.layout.nodes.findIndex(
            (layout) => layout.id === id,
          );
          if (index < 0) {
            if (!nodeIds(model).has(id)) {
              return null;
            }
            return {
              ...model,
              layout: {
                ...model.layout,
                nodes: [
                  ...model.layout.nodes,
                  {
                    id,
                    x: patch.x ?? 0,
                    y: patch.y ?? 0,
                    ...patch,
                  },
                ],
              },
            };
          }
          const nodes = [...model.layout.nodes];
          const current = nodes[index];
          const next = { ...current, ...patch, id };
          if (
            current.x === next.x &&
            current.y === next.y &&
            current.width === next.width &&
            current.height === next.height &&
            current.parentId === next.parentId
          ) {
            return null;
          }
          nodes[index] = next;
          return {
            ...model,
            layout: { ...model.layout, nodes },
          };
        },
        { invalidateDerived: false, ...options },
      ),

    applyNodeLayouts: (layouts, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          if (layouts.length === 0) {
            return null;
          }
          const validIds = nodeIds(model);
          const incoming = new Map(
            layouts
              .filter(({ id }) => validIds.has(id))
              .map((layout) => [
                layout.id,
                clonePrepModelValue(layout),
              ]),
          );
          if (incoming.size === 0) {
            return null;
          }
          const consumed = new Set<string>();
          const nodes = model.layout.nodes.map((layout) => {
            const patch = incoming.get(layout.id);
            if (!patch) {
              return layout;
            }
            consumed.add(layout.id);
            return { ...layout, ...patch, id: layout.id };
          });
          for (const [id, layout] of incoming) {
            if (!consumed.has(id)) {
              nodes.push(layout);
            }
          }
          return {
            ...model,
            layout: { ...model.layout, nodes },
          };
        },
        { invalidateDerived: false, ...options },
      ),

    removeNodeLayout: (id, options) =>
      mutateModel(
        set,
        get,
        (model) =>
          model.layout.nodes.some((layout) => layout.id === id)
            ? {
                ...model,
                layout: {
                  ...model.layout,
                  nodes: model.layout.nodes.filter(
                    (layout) => layout.id !== id,
                  ),
                },
              }
            : null,
        { invalidateDerived: false, ...options },
      ),

    setViewport: (viewport, options) => {
      mutateModel(
        set,
        get,
        (model) => {
          const current = model.layout.viewport;
          if (
            current.x === viewport.x &&
            current.y === viewport.y &&
            current.zoom === viewport.zoom
          ) {
            return null;
          }
          return {
            ...model,
            layout: {
              ...model.layout,
              viewport: clonePrepModelValue(viewport),
            },
          };
        },
        {
          recordHistory: false,
          touchUpdatedAt: false,
          invalidateDerived: false,
          ...options,
        },
      );
    },

    upsertArtifactPlacement: (processId, placement, options) => {
      const current = get().model;
      const artifact = current.artifacts.find(
        ({ id }) => id === placement.artifactId,
      );
      if (
        !current.processes.some(({ id }) => id === processId) ||
        !artifact ||
        !isArtifactVisibleInProcessView(current, artifact, processId)
      ) {
        return false;
      }
      return mutateModel(
        set,
        get,
        (model) => {
          const processViews = [...(model.layout.processViews ?? [])];
          const viewIndex = processViews.findIndex(
            (view) => view.processId === processId,
          );
          const view =
            viewIndex >= 0
              ? processViews[viewIndex]
              : createProcessViewLayout(model, processId);
          const placementIndex = view.artifactPlacements.findIndex(
            ({ artifactId }) => artifactId === placement.artifactId,
          );
          if (placementIndex >= 0) {
            const previous = view.artifactPlacements[placementIndex];
            if (
              previous.offsetX === placement.offsetX &&
              previous.offsetY === placement.offsetY
            ) {
              return null;
            }
          }
          const artifactPlacements = [...view.artifactPlacements];
          if (placementIndex >= 0) {
            artifactPlacements[placementIndex] = clonePrepModelValue(
              placement,
            );
          } else {
            artifactPlacements.push(clonePrepModelValue(placement));
          }
          const nextView = { ...view, artifactPlacements };
          if (viewIndex >= 0) {
            processViews[viewIndex] = nextView;
          } else {
            processViews.push(nextView);
          }
          return {
            ...model,
            layout: { ...model.layout, processViews },
          };
        },
        { invalidateDerived: false, ...options },
      );
    },

    removeArtifactPlacement: (processId, artifactId, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const processViews = model.layout.processViews ?? [];
          const viewIndex = processViews.findIndex(
            (view) => view.processId === processId,
          );
          if (
            viewIndex < 0 ||
            !processViews[viewIndex].artifactPlacements.some(
              (placement) => placement.artifactId === artifactId,
            )
          ) {
            return null;
          }
          const nextViews = [...processViews];
          nextViews[viewIndex] = {
            ...nextViews[viewIndex],
            artifactPlacements: nextViews[
              viewIndex
            ].artifactPlacements.filter(
              (placement) => placement.artifactId !== artifactId,
            ),
          };
          return {
            ...model,
            layout: { ...model.layout, processViews: nextViews },
          };
        },
        { invalidateDerived: false, ...options },
      ),

    updateSubprocessColumnLayout: (
      parentProcessId,
      processId,
      patch,
      options,
    ) => {
      const current = get().model;
      if (
        !current.processes.some(({ id }) => id === parentProcessId) ||
        !current.processes.some(
          (process) =>
            process.id === processId &&
            process.parentProcessId === parentProcessId,
        )
      ) {
        return false;
      }
      return mutateModel(
        set,
        get,
        (model) => {
          const processViews = [...(model.layout.processViews ?? [])];
          const viewIndex = processViews.findIndex(
            (view) => view.processId === parentProcessId,
          );
          const view =
            viewIndex >= 0
              ? processViews[viewIndex]
              : createProcessViewLayout(model, parentProcessId);
          const columnIndex = view.subprocessColumns.findIndex(
            (column) => column.processId === processId,
          );
          const previous =
            columnIndex >= 0 ? view.subprocessColumns[columnIndex] : null;
          const minimum = getSubprocessColumnMinimumSize(
            model,
            parentProcessId,
            processId,
          );
          if (
            (patch.width !== undefined && !Number.isFinite(patch.width)) ||
            (patch.height !== undefined &&
              patch.height !== null &&
              !Number.isFinite(patch.height))
          ) {
            return null;
          }
          const candidate: SubprocessColumnLayout = {
            processId,
            parentProcessId,
            order: patch.order ?? previous?.order ?? view.subprocessColumns.length,
            width: patch.width === undefined
              ? previous?.width ?? DEFAULT_COLUMN_WIDTH
              : Math.max(patch.width, minimum.width),
            ...(patch.height === null
              ? {}
              : patch.height !== undefined
                ? { height: Math.max(patch.height, minimum.height) }
                : previous?.height !== undefined
                  ? { height: previous.height }
                  : {}),
          };
          if (
            previous &&
            previous.order === candidate.order &&
            previous.width === candidate.width &&
            previous.height === candidate.height
          ) {
            return null;
          }
          const columns = [...view.subprocessColumns];
          if (columnIndex >= 0) {
            columns[columnIndex] = candidate;
          } else {
            columns.push(candidate);
          }
          const nextView = {
            ...view,
            subprocessColumns: normalizeColumnOrders(columns, processId),
          };
          if (viewIndex >= 0) {
            processViews[viewIndex] = nextView;
          } else {
            processViews.push(nextView);
          }
          return {
            ...model,
            layout: { ...model.layout, processViews },
          };
        },
        { invalidateDerived: false, ...options },
      );
    },

    removeSubprocessColumnLayout: (
      parentProcessId,
      processId,
      options,
    ) =>
      mutateModel(
        set,
        get,
        (model) => {
          const processViews = model.layout.processViews ?? [];
          const viewIndex = processViews.findIndex(
            (view) => view.processId === parentProcessId,
          );
          if (
            viewIndex < 0 ||
            !processViews[viewIndex].subprocessColumns.some(
              (column) => column.processId === processId,
            )
          ) {
            return null;
          }
          const nextViews = [...processViews];
          nextViews[viewIndex] = {
            ...nextViews[viewIndex],
            subprocessColumns: normalizeColumnOrders(
              nextViews[viewIndex].subprocessColumns.filter(
                (column) => column.processId !== processId,
              ),
            ),
          };
          return {
            ...model,
            layout: { ...model.layout, processViews: nextViews },
          };
        },
        { invalidateDerived: false, ...options },
      ),

    setProcessViewport: (processId, viewport, options) => {
      if (!get().model.processes.some(({ id }) => id === processId)) {
        return false;
      }
      return mutateModel(
        set,
        get,
        (model) => {
          const processViews = [...(model.layout.processViews ?? [])];
          const index = processViews.findIndex(
            (view) => view.processId === processId,
          );
          const view =
            index >= 0
              ? processViews[index]
              : createProcessViewLayout(model, processId);
          if (
            index >= 0 &&
            view.viewport.x === viewport.x &&
            view.viewport.y === viewport.y &&
            view.viewport.zoom === viewport.zoom
          ) {
            return null;
          }
          const nextView = {
            ...view,
            viewport: clonePrepModelValue(viewport),
          };
          if (index >= 0) {
            processViews[index] = nextView;
          } else {
            processViews.push(nextView);
          }
          return {
            ...model,
            layout: { ...model.layout, processViews },
          };
        },
        {
          recordHistory: false,
          touchUpdatedAt: false,
          invalidateDerived: false,
          ...options,
        },
      );
    },

    removeProcessViewLayout: (processId, options) =>
      mutateModel(
        set,
        get,
        (model) =>
          (model.layout.processViews ?? []).some(
            (view) => view.processId === processId,
          )
            ? {
                ...model,
                layout: {
                  ...model.layout,
                  processViews: (model.layout.processViews ?? []).filter(
                    (view) => view.processId !== processId,
                  ),
                },
              }
            : null,
        { invalidateDerived: false, ...options },
      ),

    updateOverviewNodeLayout: (id, kind, patch, options) => {
      const model = get().model;
      const isValidTarget =
        kind === 'process'
          ? model.processes.some(
              (process) =>
                process.id === id && process.parentProcessId === undefined,
            )
          : model.externalProcesses.some(
              (process) => process.id === id,
            );
      if (!isValidTarget) {
        return false;
      }
      return mutateModel(
        set,
        get,
        (current) => {
          const overview = current.layout.overview ?? {
            nodes: [],
            viewport: clonePrepModelValue(current.layout.viewport),
          };
          const index = overview.nodes.findIndex((node) => node.id === id);
          const previous = index >= 0 ? overview.nodes[index] : null;
          const candidate: OverviewNodeLayout = {
            id,
            kind,
            x: patch.x ?? previous?.x ?? 0,
            y: patch.y ?? previous?.y ?? 0,
          };
          if (
            previous &&
            previous.kind === candidate.kind &&
            previous.x === candidate.x &&
            previous.y === candidate.y
          ) {
            return null;
          }
          const nodes = [...overview.nodes];
          if (index >= 0) {
            nodes[index] = candidate;
          } else {
            nodes.push(candidate);
          }
          return {
            ...current,
            layout: {
              ...current.layout,
              overview: { ...overview, nodes },
            },
          };
        },
        { invalidateDerived: false, ...options },
      );
    },

    removeOverviewNodeLayout: (id, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const overview = model.layout.overview;
          return overview?.nodes.some((node) => node.id === id)
            ? {
                ...model,
                layout: {
                  ...model.layout,
                  overview: {
                    ...overview,
                    nodes: overview.nodes.filter((node) => node.id !== id),
                  },
                },
              }
            : null;
        },
        { invalidateDerived: false, ...options },
      ),

    setOverviewViewport: (viewport, options) =>
      mutateModel(
        set,
        get,
        (model) => {
          const overview = model.layout.overview ?? {
            nodes: [],
            viewport: clonePrepModelValue(model.layout.viewport),
          };
          if (
            overview.viewport.x === viewport.x &&
            overview.viewport.y === viewport.y &&
            overview.viewport.zoom === viewport.zoom
          ) {
            return null;
          }
          return {
            ...model,
            layout: {
              ...model.layout,
              overview: {
                ...overview,
                viewport: clonePrepModelValue(viewport),
              },
            },
          };
        },
        {
          recordHistory: false,
          touchUpdatedAt: false,
          invalidateDerived: false,
          ...options,
        },
      ),
  });
}

function clonePrepModelValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createModelStore(initialModel = createInitialPrepModel()) {
  return createStore<ModelStore>()(createModelStoreState(initialModel));
}

export const useModelStore = create<ModelStore>()(
  createModelStoreState(createInitialPrepModel()),
);

export const selectCanUndo = (state: ModelStore): boolean =>
  state.past.length > 0 ||
  Boolean(state.historyTransaction?.changed);

export const selectCanRedo = (state: ModelStore): boolean =>
  state.future.length > 0;

export const selectPrimarySelection = (
  state: ModelStore,
): ElementSelection | null => state.selection[0] ?? null;
