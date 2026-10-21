import type {
  PrepModelFile,
  PrepRelation,
  ProcessHandoff,
} from './model';

export type ImpactKind = 'explicit' | 'inferred';

export interface ImpactStep {
  artifactId: string;
  kind: ImpactKind;
  depth: number;
  /**
   * The traversed edge ID. For a process handoff the ID is additionally
   * exposed by viaHandoffId so callers do not have to infer the edge kind.
   */
  viaRelationId: string;
  viaHandoffId?: string;
}

export interface ImpactAnalysisResult {
  startArtifactId: string;
  startFound: boolean;
  explicitArtifactIds: string[];
  inferredArtifactIds: string[];
  unaffectedArtifactIds: string[];
  explicitRelationIds: string[];
  inferredRelationIds: string[];
  /** Artifacts reached directly on the receiving side of a handoff. */
  interProcessArtifactIds: string[];
  /** Receiving top-level processes in first-encounter order. */
  interProcessProcessIds: string[];
  /** ProcessHandoff edges crossed or reached at a process boundary. */
  interProcessHandoffIds: string[];
  impactOrder: ImpactStep[];
}

interface QueueItem {
  artifactId: string;
  kind: ImpactKind;
  depth: number;
}

interface OrderedImpactStep extends ImpactStep {
  discoveryOrder: number;
}

interface HandoffTransition {
  handoff: ProcessHandoff;
  targetProcessId: string;
  targetArtifactIds: string[];
}

const emptyImpact = (startArtifactId: string): ImpactAnalysisResult => ({
  startArtifactId,
  startFound: false,
  explicitArtifactIds: [],
  inferredArtifactIds: [],
  unaffectedArtifactIds: [],
  explicitRelationIds: [],
  inferredRelationIds: [],
  interProcessArtifactIds: [],
  interProcessProcessIds: [],
  interProcessHandoffIds: [],
  impactOrder: [],
});

function addToMap(
  map: Map<string, PrepRelation[]>,
  sourceId: string,
  relation: PrepRelation,
): void {
  map.get(sourceId)?.push(relation);
}

function addHandoffTransition(
  map: Map<string, HandoffTransition[]>,
  artifactId: string,
  transition: HandoffTransition,
): void {
  map.get(artifactId)?.push(transition);
}

/**
 * Explicit revalidation edges are selected before ordinary input edges at
 * each affected artifact. When an explicit chain ends, its input successors
 * are followed as inferred impact. Once a path becomes inferred, a later
 * explicit edge cannot make the whole path explicit again.
 */
export function analyzeImpact(
  model: PrepModelFile,
  startArtifactId: string,
): ImpactAnalysisResult {
  const artifactIds = new Set(model.artifacts.map((artifact) => artifact.id));

  if (!artifactIds.has(startArtifactId)) {
    return {
      ...emptyImpact(startArtifactId),
      unaffectedArtifactIds: model.artifacts.map((artifact) => artifact.id),
    };
  }

  const explicitOutgoing = new Map<string, PrepRelation[]>();
  const inputOutgoing = new Map<string, PrepRelation[]>();
  const handoffOutgoing = new Map<string, HandoffTransition[]>();

  for (const artifact of model.artifacts) {
    explicitOutgoing.set(artifact.id, []);
    inputOutgoing.set(artifact.id, []);
    handoffOutgoing.set(artifact.id, []);
  }

  for (const relation of model.relations) {
    if (
      !artifactIds.has(relation.sourceId) ||
      !artifactIds.has(relation.targetId)
    ) {
      continue;
    }

    if (relation.semanticType === 'requires-revalidation-of') {
      addToMap(explicitOutgoing, relation.sourceId, relation);
    }

    if (relation.prepType === 'input') {
      addToMap(inputOutgoing, relation.sourceId, relation);
    }
  }

  for (const handoff of model.processHandoffs ?? []) {
    const sourceArtifactIds = handoff.sourceArtifactIds.filter((id) =>
      artifactIds.has(id),
    );
    const targetArtifactIds = handoff.targetArtifactIds.filter((id) =>
      artifactIds.has(id),
    );

    for (const sourceArtifactId of sourceArtifactIds) {
      addHandoffTransition(handoffOutgoing, sourceArtifactId, {
        handoff,
        targetProcessId: handoff.targetProcessId,
        targetArtifactIds,
      });
    }

    // A sync handoff represents mutual dependency, so a change on the
    // receiving artifact also propagates back across the process boundary.
    if (handoff.prepType === 'sync') {
      for (const targetArtifactId of targetArtifactIds) {
        addHandoffTransition(handoffOutgoing, targetArtifactId, {
          handoff,
          targetProcessId: handoff.sourceProcessId,
          targetArtifactIds: sourceArtifactIds,
        });
      }
    }
  }

  const bestKind = new Map<string, ImpactKind>([
    [startArtifactId, 'explicit'],
  ]);
  const stepByArtifactId = new Map<string, OrderedImpactStep>();
  const explicitRelationIds = new Set<string>();
  const inferredRelationIds = new Set<string>();
  const interProcessArtifactIds: string[] = [];
  const interProcessArtifactIdSet = new Set<string>();
  const interProcessProcessIds: string[] = [];
  const interProcessProcessIdSet = new Set<string>();
  const interProcessHandoffIds: string[] = [];
  const interProcessHandoffIdSet = new Set<string>();
  const processedStates = new Set<string>();
  const queue: QueueItem[] = [
    { artifactId: startArtifactId, kind: 'explicit', depth: 0 },
  ];
  let discoveryOrder = 0;

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    const stateKey = `${current.kind}:${current.artifactId}`;

    if (
      processedStates.has(stateKey) ||
      bestKind.get(current.artifactId) !== current.kind
    ) {
      continue;
    }
    processedStates.add(stateKey);

    const preferredExplicit =
      explicitOutgoing.get(current.artifactId) ?? [];
    const outgoing =
      preferredExplicit.length > 0
        ? preferredExplicit
        : (inputOutgoing.get(current.artifactId) ?? []);
    const nextKind: ImpactKind =
      current.kind === 'explicit' && preferredExplicit.length > 0
        ? 'explicit'
        : 'inferred';

    for (const relation of outgoing) {
      if (nextKind === 'explicit') {
        explicitRelationIds.add(relation.id);
        inferredRelationIds.delete(relation.id);
      } else if (!explicitRelationIds.has(relation.id)) {
        inferredRelationIds.add(relation.id);
      }

      if (relation.targetId === startArtifactId) {
        continue;
      }

      const previousKind = bestKind.get(relation.targetId);
      const isPromotion =
        previousKind === 'inferred' && nextKind === 'explicit';

      if (previousKind !== undefined && !isPromotion) {
        continue;
      }

      bestKind.set(relation.targetId, nextKind);
      const step: OrderedImpactStep = {
        artifactId: relation.targetId,
        kind: nextKind,
        depth: current.depth + 1,
        viaRelationId: relation.id,
        discoveryOrder,
      };
      discoveryOrder += 1;
      stepByArtifactId.set(relation.targetId, step);
      queue.push({
        artifactId: relation.targetId,
        kind: nextKind,
        depth: step.depth,
      });
    }

    // Process handoffs are reported independently from local explicit and
    // inferred relations. They remain discoverable even when an explicit
    // local edge exists or no receiving artifact has been assigned yet.
    for (const transition of handoffOutgoing.get(current.artifactId) ?? []) {
      if (interProcessHandoffIdSet.has(transition.handoff.id)) {
        continue;
      }
      interProcessHandoffIdSet.add(transition.handoff.id);
      interProcessHandoffIds.push(transition.handoff.id);
      if (!interProcessProcessIdSet.has(transition.targetProcessId)) {
        interProcessProcessIdSet.add(transition.targetProcessId);
        interProcessProcessIds.push(transition.targetProcessId);
      }

      for (const targetArtifactId of transition.targetArtifactIds) {
        if (
          targetArtifactId !== startArtifactId &&
          !interProcessArtifactIdSet.has(targetArtifactId)
        ) {
          interProcessArtifactIdSet.add(targetArtifactId);
          interProcessArtifactIds.push(targetArtifactId);
        }

        if (targetArtifactId === startArtifactId) {
          continue;
        }

        const previousKind = bestKind.get(targetArtifactId);
        if (previousKind !== undefined) {
          continue;
        }

        bestKind.set(targetArtifactId, 'inferred');
        const step: OrderedImpactStep = {
          artifactId: targetArtifactId,
          kind: 'inferred',
          depth: current.depth + 1,
          viaRelationId: transition.handoff.id,
          viaHandoffId: transition.handoff.id,
          discoveryOrder,
        };
        discoveryOrder += 1;
        stepByArtifactId.set(targetArtifactId, step);
        queue.push({
          artifactId: targetArtifactId,
          kind: 'inferred',
          depth: step.depth,
        });
      }
    }
  }

  const impactOrder = [...stepByArtifactId.values()]
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'explicit' ? -1 : 1;
      }
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }
      return left.discoveryOrder - right.discoveryOrder;
    })
    .map(({ discoveryOrder: _discoveryOrder, ...step }) => step);
  const explicitArtifactIds = impactOrder
    .filter((step) => step.kind === 'explicit')
    .map((step) => step.artifactId);
  const inferredArtifactIds = impactOrder
    .filter((step) => step.kind === 'inferred')
    .map((step) => step.artifactId);
  const impactedArtifactIds = new Set([
    ...explicitArtifactIds,
    ...inferredArtifactIds,
  ]);

  return {
    startArtifactId,
    startFound: true,
    explicitArtifactIds,
    inferredArtifactIds,
    unaffectedArtifactIds: model.artifacts
      .map((artifact) => artifact.id)
      .filter(
        (artifactId) =>
          artifactId !== startArtifactId &&
          !impactedArtifactIds.has(artifactId),
      ),
    explicitRelationIds: model.relations
      .filter((relation) => explicitRelationIds.has(relation.id))
      .map((relation) => relation.id),
    inferredRelationIds: model.relations
      .filter(
        (relation) =>
          inferredRelationIds.has(relation.id) &&
          !explicitRelationIds.has(relation.id),
      )
      .map((relation) => relation.id),
    interProcessArtifactIds,
    interProcessProcessIds,
    interProcessHandoffIds,
    impactOrder,
  };
}

/** Compatibility alias for callers that use a noun-first API. */
export const getImpactAnalysis = analyzeImpact;
