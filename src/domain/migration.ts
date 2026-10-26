import { z } from 'zod';

import {
  MIN_SUBPROCESS_COLUMN_WIDTH,
  PREP_SCHEMA_VERSION,
  type CanonicalPrepModelFile,
  type NodeLayout,
  type PrepActor,
  type PrepArtifact,
  type PrepProcess,
  type ProcessActorLane,
  type ProcessHandoff,
  type ProcessViewLayout,
  type SubprocessColumnLayout,
} from './model';
import {
  legacyPrepModelV10Schema,
  legacyPrepModelV11Schema,
  legacyPrepModelV12Schema,
  parsePrepModel,
  type LegacyPrepModel,
  type LegacyPrepModelV10,
  type LegacyPrepModelV11,
} from './schema';

export const MIGRATED_DEFAULT_LANE_HEIGHT = 220;
export const MIGRATED_DEFAULT_COLUMN_WIDTH = 360;

const supportedVersionEnvelopeSchema = z.object({
  schemaVersion: z.enum(['1.0.0', '1.1.0', '1.2.0', PREP_SCHEMA_VERSION]),
});

type LegacyArtifact = LegacyPrepModel['artifacts'][number];

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function createIdAllocator(model: LegacyPrepModel) {
  const used = new Set<string>([
    model.system.id,
    ...model.processes.map((process) => process.id),
    ...model.artifacts.map((artifact) => artifact.id),
    ...model.externalProcesses.map((process) => process.id),
    ...model.relations.map((relation) => relation.id),
  ]);

  return (preferred: string): string => {
    let candidate = preferred;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${preferred}-${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  };
}

function migrateLegacyModel(model: LegacyPrepModel): CanonicalPrepModelFile {
  const allocateId = createIdAllocator(model);
  const actors: PrepActor[] = [];
  const actorIdByName = new Map<string, string>();

  const actorIdForName = (rawName: string | undefined) => {
    const name = nonBlank(rawName);
    if (!name) return undefined;
    const existing = actorIdByName.get(name);
    if (existing) return existing;
    const id = allocateId(`migrated-actor-${actors.length + 1}`);
    actors.push({ id, name });
    actorIdByName.set(name, id);
    return id;
  };

  // Process responsibilities are visited first, then artifact responsibilities;
  // this makes migration deterministic while deduplicating identical names.
  model.processes.forEach((process) => actorIdForName(process.responsibleActor));
  model.artifacts.forEach((artifact) =>
    actorIdForName(artifact.responsibleActor),
  );

  const needsPlaceholder = model.artifacts.some(
    (artifact) => !nonBlank(artifact.responsibleActor),
  );
  const placeholderActorId = needsPlaceholder
    ? allocateId('actor-unassigned')
    : undefined;
  if (placeholderActorId) {
    actors.push({
      id: placeholderActorId,
      name: '未割当',
      isPlaceholder: true,
    });
  }

  const isV11 = model.schemaVersion === '1.1.0';
  const processes: PrepProcess[] = model.processes.map((process) => ({
    id: process.id,
    ...(isV11 && 'parentProcessId' in process && process.parentProcessId
      ? { parentProcessId: process.parentProcessId }
      : {}),
    name: process.name,
    goal: process.goal,
    ...(actorIdForName(process.responsibleActor)
      ? { leadActorId: actorIdForName(process.responsibleActor) }
      : {}),
    ...(process.technology !== undefined
      ? { technology: process.technology }
      : {}),
    ...(process.resources !== undefined
      ? { resources: [...process.resources] }
      : {}),
    ...(process.description !== undefined
      ? { description: process.description }
      : {}),
  }));
  const processById = new Map(
    processes.map((process) => [process.id, process]),
  );

  const topLevelId = (processId: string | undefined): string | undefined => {
    if (!processId) return undefined;
    let current = processById.get(processId);
    const visited = new Set<string>();
    while (current?.parentProcessId && !visited.has(current.id)) {
      visited.add(current.id);
      current = processById.get(current.parentProcessId);
    }
    return current?.id;
  };

  const topLevelProcesses = processes.filter(
    (process) => !process.parentProcessId,
  );
  const artifactNextProcessNames = new Map<string, string>();
  const artifacts: PrepArtifact[] = model.artifacts.map((artifact) => {
    const responsibleActorId =
      actorIdForName(artifact.responsibleActor) ?? placeholderActorId;
    const nextProcessName = nonBlank(artifact.nextProcessName);
    if (nextProcessName) {
      artifactNextProcessNames.set(artifact.id, nextProcessName);
    }
    return {
      id: artifact.id,
      ...(artifact.processId !== undefined
        ? { processId: artifact.processId }
        : {}),
      name: artifact.name,
      type: artifact.type,
      scope: artifact.scope,
      ...(artifact.description !== undefined
        ? { description: artifact.description }
        : {}),
      states: artifact.states.map((state) => ({ ...state })),
      attributes: artifact.attributes.map((attribute) => ({ ...attribute })),
      ...(responsibleActorId ? { responsibleActorId } : {}),
      risk: { ...artifact.risk },
    };
  });

  // Resolve legacy nextProcessName values and group artifacts that share the
  // same source/target pair into one ProcessHandoff.
  const handoffByPair = new Map<string, ProcessHandoff>();
  artifacts.forEach((artifact) => {
    const nextProcessName = artifactNextProcessNames.get(artifact.id);
    if (!nextProcessName) return;
    const targets = topLevelProcesses.filter(
      (process) => process.name.trim() === nextProcessName,
    );
    const sourceProcessId = topLevelId(artifact.processId);
    const target = targets.length === 1 ? targets[0] : undefined;
    if (
      artifact.type !== 'final' ||
      !sourceProcessId ||
      !target ||
      target.id === sourceProcessId
    ) {
      artifact.legacyNextProcessName = nextProcessName;
      return;
    }

    const pair = `${sourceProcessId}\u0000${target.id}`;
    let handoff = handoffByPair.get(pair);
    if (!handoff) {
      handoff = {
        id: allocateId(`migrated-handoff-${handoffByPair.size + 1}`),
        sourceProcessId,
        targetProcessId: target.id,
        sourceArtifactIds: [],
        targetArtifactIds: [],
        prepType: 'input',
        sourceAnchor: 'auto',
        targetAnchor: 'auto',
      };
      handoffByPair.set(pair, handoff);
    }
    handoff.sourceArtifactIds.push(artifact.id);
  });
  const processHandoffs = [...handoffByPair.values()];

  const legacyNodeById = new Map(
    model.layout.nodes.map((node) => [node.id, node]),
  );
  const processIndex = new Map(
    processes.map((process, index) => [process.id, index]),
  );

  const displayViewIdForArtifact = (
    artifact: Pick<PrepArtifact, 'processId'>,
  ) => {
    if (!artifact.processId) return undefined;
    const owner = processById.get(artifact.processId);
    return owner?.parentProcessId ?? owner?.id;
  };

  const viewIdByArtifactId = new Map(
    artifacts.map((artifact) => [
      artifact.id,
      displayViewIdForArtifact(artifact),
    ]),
  );

  const processViews: ProcessViewLayout[] = processes.map((process) => {
    const children = processes
      .filter((candidate) => candidate.parentProcessId === process.id)
      .sort((left, right) => {
        const leftX = legacyNodeById.get(left.id)?.x;
        const rightX = legacyNodeById.get(right.id)?.x;
        return (
          (leftX ?? Number.POSITIVE_INFINITY) -
            (rightX ?? Number.POSITIVE_INFINITY) ||
          (processIndex.get(left.id) ?? 0) -
            (processIndex.get(right.id) ?? 0)
        );
      });
    const subprocessColumns: SubprocessColumnLayout[] = children.map(
      (child, order) => ({
        processId: child.id,
        parentProcessId: process.id,
        order,
        width:
          Math.max(
            legacyNodeById.get(child.id)?.width ??
              MIGRATED_DEFAULT_COLUMN_WIDTH,
            MIN_SUBPROCESS_COLUMN_WIDTH,
          ),
      }),
    );
    const artifactPlacements = artifacts
      .filter(
        (artifact) => viewIdByArtifactId.get(artifact.id) === process.id,
      )
      .map((artifact) => {
        const node = legacyNodeById.get(artifact.id);
        return {
          artifactId: artifact.id,
          // Legacy child positions are already local to their parent React
          // Flow node. They become local to the corresponding grid cell.
          offsetX: Math.max(0, node?.x ?? 0),
          offsetY: Math.max(0, node?.y ?? 0),
        };
      });
    return {
      processId: process.id,
      artifactPlacements,
      subprocessColumns,
      viewport: { ...model.layout.viewport },
    };
  });

  const actorIndex = new Map(actors.map((actor, index) => [actor.id, index]));
  const processActorLanes: ProcessActorLane[] = [];
  for (const process of processes) {
    const participatingActorIds = new Set<string>();
    if (process.leadActorId) participatingActorIds.add(process.leadActorId);
    for (const child of processes) {
      if (child.parentProcessId === process.id && child.leadActorId) {
        participatingActorIds.add(child.leadActorId);
      }
    }
    artifacts.forEach((artifact) => {
      if (
        viewIdByArtifactId.get(artifact.id) === process.id &&
        artifact.responsibleActorId
      ) {
        participatingActorIds.add(artifact.responsibleActorId);
      }
    });
    [...participatingActorIds]
      .sort(
        (left, right) =>
          (actorIndex.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (actorIndex.get(right) ?? Number.MAX_SAFE_INTEGER),
      )
      .forEach((actorId, order) => {
        processActorLanes.push({
          id: allocateId(`migrated-lane-${process.id}-${order + 1}`),
          processId: process.id,
          actorId,
          order,
          height: MIGRATED_DEFAULT_LANE_HEIGHT,
        });
      });
  }

  const overviewNodes = [
    ...topLevelProcesses.map((process, index) => {
      const node = legacyNodeById.get(process.id);
      return {
        id: process.id,
        kind: 'process' as const,
        x: node?.x ?? index * 240,
        y: node?.y ?? 0,
      };
    }),
    ...model.externalProcesses.map((process, index) => {
      const node = legacyNodeById.get(process.id);
      return {
        id: process.id,
        kind: 'external-process' as const,
        x: node?.x ?? index * 240,
        y: node?.y ?? 240,
      };
    }),
  ];

  const compatibilityNodes: NodeLayout[] = model.layout.nodes.map((node) => ({
    ...node,
  }));
  const migrated = {
    schemaVersion: PREP_SCHEMA_VERSION,
    metadata: { ...model.metadata },
    system: { ...model.system },
    processes,
    actors,
    processActorLanes,
    artifacts,
    externalProcesses: model.externalProcesses.map((process) => ({
      ...process,
    })),
    relations: model.relations.map((relation) => ({
      id: relation.id,
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      sourceAnchor: 'auto' as const,
      targetAnchor: 'auto' as const,
      prepType: relation.prepType,
      ...(relation.semanticType !== undefined
        ? { semanticType: relation.semanticType }
        : {}),
      ...(relation.description !== undefined
        ? { description: relation.description }
        : {}),
      risk: { ...relation.risk },
    })),
    processHandoffs,
    layout: {
      nodes: compatibilityNodes,
      viewport: { ...model.layout.viewport },
      processViews,
      overview: {
        nodes: overviewNodes,
        viewport: { ...model.layout.viewport },
      },
      lastView:
        topLevelProcesses.length === 1
          ? {
              mode: 'process' as const,
              activeProcessId: topLevelProcesses[0].id,
            }
          : { mode: 'overview' as const },
    },
  };

  // Running the result through the canonical schema is intentional: migration
  // must never return a partially valid hybrid document.
  return parsePrepModel(migrated);
}

export function migratePrepModelV10(
  input: LegacyPrepModelV10 | unknown,
): CanonicalPrepModelFile {
  return migrateLegacyModel(legacyPrepModelV10Schema.parse(input));
}

export function migratePrepModelV11(
  input: LegacyPrepModelV11 | unknown,
): CanonicalPrepModelFile {
  return migrateLegacyModel(legacyPrepModelV11Schema.parse(input));
}

/** The v1.2 format has no column height, so migrated columns stay auto. */
export function migratePrepModelV12(input: unknown): CanonicalPrepModelFile {
  const model = legacyPrepModelV12Schema.parse(input);
  return parsePrepModel({
    ...model,
    schemaVersion: PREP_SCHEMA_VERSION,
    layout: {
      ...model.layout,
      processViews: model.layout.processViews.map((view) => ({
        ...view,
        subprocessColumns: view.subprocessColumns.map((column) => ({
          ...column,
          width: Math.max(column.width, MIN_SUBPROCESS_COLUMN_WIDTH),
        })),
      })),
    },
  });
}

export const migrateV10ToV13 = migratePrepModelV10;
export const migrateV11ToV13 = migratePrepModelV11;
export const migrateV12ToV13 = migratePrepModelV12;

/** @deprecated Use migrateV10ToV13; retained for source compatibility. */
export const migrateV10ToV12 = migratePrepModelV10;
/** @deprecated Use migrateV11ToV13; retained for source compatibility. */
export const migrateV11ToV12 = migratePrepModelV11;

/** Reads canonical v1.3 or migrates validated v1.0/v1.1/v1.2 input. */
export function migratePrepModel(input: unknown): CanonicalPrepModelFile {
  const { schemaVersion } = supportedVersionEnvelopeSchema.parse(input);
  switch (schemaVersion) {
    case PREP_SCHEMA_VERSION:
      return parsePrepModel(input);
    case '1.0.0':
      return migratePrepModelV10(input);
    case '1.1.0':
      return migratePrepModelV11(input);
    case '1.2.0':
      return migratePrepModelV12(input);
  }
}

export type SafeMigratePrepModelResult =
  | { success: true; data: CanonicalPrepModelFile }
  | { success: false; error: z.ZodError };

export function safeMigratePrepModel(
  input: unknown,
): SafeMigratePrepModelResult {
  try {
    return { success: true, data: migratePrepModel(input) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error };
    }
    throw error;
  }
}

export function isLegacyPrepModel(input: unknown): boolean {
  const result = supportedVersionEnvelopeSchema.safeParse(input);
  return (
    result.success &&
    (result.data.schemaVersion === '1.0.0' ||
      result.data.schemaVersion === '1.1.0' ||
      result.data.schemaVersion === '1.2.0')
  );
}
