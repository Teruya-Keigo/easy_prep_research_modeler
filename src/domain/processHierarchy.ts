import type {
  PrepActor,
  PrepArtifact,
  PrepModelFile,
  PrepProcess,
  PrepRelation,
  ProcessActorLane,
} from './model';

export type ProcessHierarchySource =
  | readonly PrepProcess[]
  | Pick<PrepModelFile, 'processes'>;

function processList(source: ProcessHierarchySource): readonly PrepProcess[] {
  return 'processes' in source
    ? source.processes
    : (source as readonly PrepProcess[]);
}

function processMap(source: ProcessHierarchySource): Map<string, PrepProcess> {
  return new Map(processList(source).map((process) => [process.id, process]));
}

export function getTopLevelProcesses(
  source: ProcessHierarchySource,
): PrepProcess[] {
  return processList(source).filter((process) => !process.parentProcessId);
}

export function getDirectChildProcesses(
  source: ProcessHierarchySource,
  parentProcessId: string,
): PrepProcess[] {
  return processList(source).filter(
    (process) => process.parentProcessId === parentProcessId,
  );
}

/** Alias matching the terminology used by the process-grid code. */
export const getChildProcesses = getDirectChildProcesses;

/**
 * Returns ancestors from the direct parent towards the root.  Invalid parent
 * references stop the walk; a malformed cycle is safely bounded.
 */
export function getProcessAncestors(
  source: ProcessHierarchySource,
  processId: string,
): PrepProcess[] {
  const byId = processMap(source);
  const result: PrepProcess[] = [];
  const visited = new Set<string>([processId]);
  let current = byId.get(processId);

  while (current?.parentProcessId) {
    if (visited.has(current.parentProcessId)) break;
    const parent = byId.get(current.parentProcessId);
    if (!parent) break;
    visited.add(parent.id);
    result.push(parent);
    current = parent;
  }

  return result;
}

export const getAncestors = getProcessAncestors;

/** Stable, depth-first descendants in the same sibling order as the model. */
export function getProcessDescendants(
  source: ProcessHierarchySource,
  processId: string,
): PrepProcess[] {
  const processes = processList(source);
  const children = new Map<string, PrepProcess[]>();
  for (const process of processes) {
    if (!process.parentProcessId) continue;
    const siblings = children.get(process.parentProcessId) ?? [];
    siblings.push(process);
    children.set(process.parentProcessId, siblings);
  }

  const result: PrepProcess[] = [];
  const visited = new Set<string>([processId]);
  const visit = (parentId: string) => {
    for (const child of children.get(parentId) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      result.push(child);
      visit(child.id);
    }
  };
  visit(processId);
  return result;
}

export const getDescendants = getProcessDescendants;

export function isProcessDescendant(
  source: ProcessHierarchySource,
  candidateProcessId: string,
  ancestorProcessId: string,
): boolean {
  if (candidateProcessId === ancestorProcessId) return false;
  return getProcessAncestors(source, candidateProcessId).some(
    (ancestor) => ancestor.id === ancestorProcessId,
  );
}

export function getTopLevelAncestor(
  source: ProcessHierarchySource,
  processId: string,
): PrepProcess | undefined {
  const byId = processMap(source);
  const start = byId.get(processId);
  if (!start) return undefined;
  const ancestors = getProcessAncestors(source, processId);
  return ancestors.at(-1) ?? start;
}

export const getRootProcess = getTopLevelAncestor;

/** Root-to-current sequence used by process breadcrumbs. */
export function getProcessBreadcrumbs(
  source: ProcessHierarchySource,
  processId: string,
): PrepProcess[] {
  const current = processMap(source).get(processId);
  if (!current) return [];
  return [...getProcessAncestors(source, processId).reverse(), current];
}

/**
 * True when assigning `newParentProcessId` would make a process its own
 * ancestor. Missing/undefined means moving to the model root and is safe.
 */
export function wouldCreateProcessCycle(
  source: ProcessHierarchySource,
  processId: string,
  newParentProcessId?: string,
): boolean {
  if (!newParentProcessId) return false;
  if (newParentProcessId === processId) return true;
  return getProcessDescendants(source, processId).some(
    (process) => process.id === newParentProcessId,
  );
}

export const wouldCreateHierarchyCycle = wouldCreateProcessCycle;

export function canAssignProcessParent(
  source: ProcessHierarchySource,
  processId: string,
  newParentProcessId?: string,
): boolean {
  if (!newParentProcessId) return true;
  const byId = processMap(source);
  return (
    byId.has(processId) &&
    byId.has(newParentProcessId) &&
    !wouldCreateProcessCycle(source, processId, newParentProcessId)
  );
}

/**
 * Lists malformed cycles once each. The first ID is not repeated at the end;
 * callers normally only need the members for an E013 diagnostic.
 */
export function findProcessHierarchyCycles(
  source: ProcessHierarchySource,
): string[][] {
  const byId = processMap(source);
  const completelyVisited = new Set<string>();
  const cycles: string[][] = [];
  const cycleKeys = new Set<string>();

  for (const process of processList(source)) {
    if (completelyVisited.has(process.id)) continue;

    const path: string[] = [];
    const pathIndex = new Map<string, number>();
    let current: PrepProcess | undefined = process;

    while (current && !completelyVisited.has(current.id)) {
      const repeatedAt = pathIndex.get(current.id);
      if (repeatedAt !== undefined) {
        const cycle = path.slice(repeatedAt);
        const key = [...cycle].sort().join('\u0000');
        if (!cycleKeys.has(key)) {
          cycleKeys.add(key);
          cycles.push(cycle);
        }
        break;
      }
      pathIndex.set(current.id, path.length);
      path.push(current.id);
      current = current.parentProcessId
        ? byId.get(current.parentProcessId)
        : undefined;
    }

    path.forEach((id) => completelyVisited.add(id));
  }

  return cycles;
}

export function hasProcessHierarchyCycle(
  source: ProcessHierarchySource,
): boolean {
  return findProcessHierarchyCycles(source).length > 0;
}

export const detectProcessHierarchyCycles = findProcessHierarchyCycles;

/** Only the active process and its direct children belong on one detail view. */
export function getVisibleProcessIds(
  source: ProcessHierarchySource,
  activeProcessId: string,
): Set<string> {
  const byId = processMap(source);
  if (!byId.has(activeProcessId)) return new Set();
  return new Set([
    activeProcessId,
    ...getDirectChildProcesses(source, activeProcessId).map(
      (process) => process.id,
    ),
  ]);
}

export function isArtifactVisibleInProcess(
  source: ProcessHierarchySource,
  artifact: Pick<PrepArtifact, 'processId'>,
  activeProcessId: string,
): boolean {
  return (
    artifact.processId !== undefined &&
    getVisibleProcessIds(source, activeProcessId).has(artifact.processId)
  );
}

export function getArtifactsForActiveProcess(
  model: Pick<PrepModelFile, 'processes' | 'artifacts'>,
  activeProcessId: string,
): PrepArtifact[] {
  const visibleProcessIds = getVisibleProcessIds(model, activeProcessId);
  return model.artifacts.filter(
    (artifact) =>
      artifact.processId !== undefined &&
      visibleProcessIds.has(artifact.processId),
  );
}

export const getVisibleArtifacts = getArtifactsForActiveProcess;

export function getRelationsForActiveProcess(
  model: Pick<PrepModelFile, 'processes' | 'artifacts' | 'relations'>,
  activeProcessId: string,
): PrepRelation[] {
  const artifactIds = new Set(
    getArtifactsForActiveProcess(model, activeProcessId).map(
      (artifact) => artifact.id,
    ),
  );
  return model.relations.filter(
    (relation) =>
      artifactIds.has(relation.sourceId) && artifactIds.has(relation.targetId),
  );
}

export const getVisibleRelations = getRelationsForActiveProcess;

export interface ActiveProcessElements {
  activeProcess?: PrepProcess;
  childProcesses: PrepProcess[];
  visibleProcessIds: Set<string>;
  artifacts: PrepArtifact[];
  relations: PrepRelation[];
  lanes: ProcessActorLane[];
  actors: PrepActor[];
}

/**
 * A single selector for a process-detail canvas. In particular, descendants
 * deeper than one level and artifacts from sibling/root processes are absent.
 */
export function getActiveProcessElements(
  model: PrepModelFile,
  activeProcessId: string,
): ActiveProcessElements {
  const visibleProcessIds = getVisibleProcessIds(model, activeProcessId);
  const artifacts = getArtifactsForActiveProcess(model, activeProcessId);
  const relations = getRelationsForActiveProcess(model, activeProcessId);
  const lanes = (model.processActorLanes ?? [])
    .filter((lane) => lane.processId === activeProcessId)
    .sort((left, right) => left.order - right.order);
  const participatingActorIds = new Set([
    ...lanes.map((lane) => lane.actorId),
    ...artifacts.flatMap((artifact) =>
      artifact.responsibleActorId ? [artifact.responsibleActorId] : [],
    ),
  ]);

  return {
    activeProcess: model.processes.find(
      (process) => process.id === activeProcessId,
    ),
    childProcesses: getDirectChildProcesses(model, activeProcessId),
    visibleProcessIds,
    artifacts,
    relations,
    lanes,
    actors: (model.actors ?? []).filter((actor) =>
      participatingActorIds.has(actor.id),
    ),
  };
}

export const selectActiveProcessElements = getActiveProcessElements;
export const extractActiveProcessView = getActiveProcessElements;
