import type {
  PrepArtifact,
  PrepModelFile,
  PrepRelation,
  ProcessHandoff,
  SemanticRelationType,
} from './model';

const ASSURANCE_SEMANTIC_TYPES = new Set<SemanticRelationType>([
  'derives-from',
  'justifies',
  'mitigates',
  'monitors',
]);

export type AssuranceTraceDirection = 'upstream' | 'downstream';

export interface AssuranceTraceStep {
  artifactId: string;
  direction: AssuranceTraceDirection;
  depth: number;
  /**
   * The traversed edge ID. For historical compatibility this keeps its old
   * name; when the edge is a ProcessHandoff the same ID is also exposed by
   * viaHandoffId.
   */
  viaRelationId: string;
  viaHandoffId?: string;
}

export interface HighRiskElementRef {
  id: string;
  type: 'artifact' | 'relation';
}

export interface AssuranceTraceResult {
  startArtifactId: string;
  startFound: boolean;
  upstreamArtifactIds: string[];
  downstreamArtifactIds: string[];
  traversedRelationIds: string[];
  /** Process boundaries encountered while following the assurance chain. */
  traversedHandoffIds: string[];
  traversalOrder: AssuranceTraceStep[];
  reachesFinalArtifact: boolean;
  highRiskElementIds: string[];
  highRiskElements: HighRiskElementRef[];
}

interface GraphArc {
  artifactId: string;
  edgeId: string;
  edgeType: 'relation' | 'processHandoff';
  priority: number;
}

interface BoundaryHandoff {
  id: string;
}

interface TraceTraversal {
  artifactIds: string[];
  relationIds: string[];
  handoffIds: string[];
  steps: AssuranceTraceStep[];
}

const isAssuranceRelation = (relation: PrepRelation): boolean =>
  relation.semanticType !== undefined
    ? ASSURANCE_SEMANTIC_TYPES.has(relation.semanticType)
    : relation.prepType === 'input';

function addArc(
  graph: Map<string, GraphArc[]>,
  fromId: string,
  toId: string,
  edgeId: string,
  edgeType: GraphArc['edgeType'],
  priority: number,
): void {
  graph.get(fromId)?.push({
    artifactId: toId,
    edgeId,
    edgeType,
    priority,
  });
}

function addBoundaryHandoff(
  graph: Map<string, BoundaryHandoff[]>,
  artifactId: string,
  handoff: ProcessHandoff,
): void {
  graph.get(artifactId)?.push({ id: handoff.id });
}

function buildTraceGraphs(model: PrepModelFile): {
  outgoing: Map<string, GraphArc[]>;
  incoming: Map<string, GraphArc[]>;
  outgoingBoundaryHandoffs: Map<string, BoundaryHandoff[]>;
  incomingBoundaryHandoffs: Map<string, BoundaryHandoff[]>;
} {
  const artifactIds = new Set(model.artifacts.map((artifact) => artifact.id));
  const outgoing = new Map<string, GraphArc[]>();
  const incoming = new Map<string, GraphArc[]>();
  const outgoingBoundaryHandoffs = new Map<string, BoundaryHandoff[]>();
  const incomingBoundaryHandoffs = new Map<string, BoundaryHandoff[]>();

  for (const artifact of model.artifacts) {
    outgoing.set(artifact.id, []);
    incoming.set(artifact.id, []);
    outgoingBoundaryHandoffs.set(artifact.id, []);
    incomingBoundaryHandoffs.set(artifact.id, []);
  }

  for (const relation of model.relations) {
    if (
      !isAssuranceRelation(relation) ||
      !artifactIds.has(relation.sourceId) ||
      !artifactIds.has(relation.targetId)
    ) {
      continue;
    }

    const priority = relation.semanticType === undefined ? 1 : 0;
    addArc(
      outgoing,
      relation.sourceId,
      relation.targetId,
      relation.id,
      'relation',
      priority,
    );
    addArc(
      incoming,
      relation.targetId,
      relation.sourceId,
      relation.id,
      'relation',
      priority,
    );

    // A PReP sync relation is bidirectional even though its persisted shape
    // uses sourceId and targetId for drawing.
    if (relation.prepType === 'sync') {
      addArc(
        outgoing,
        relation.targetId,
        relation.sourceId,
        relation.id,
        'relation',
        priority,
      );
      addArc(
        incoming,
        relation.sourceId,
        relation.targetId,
        relation.id,
        'relation',
        priority,
      );
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
      addBoundaryHandoff(
        outgoingBoundaryHandoffs,
        sourceArtifactId,
        handoff,
      );
      for (const targetArtifactId of targetArtifactIds) {
        addArc(
          outgoing,
          sourceArtifactId,
          targetArtifactId,
          handoff.id,
          'processHandoff',
          1,
        );
        addArc(
          incoming,
          targetArtifactId,
          sourceArtifactId,
          handoff.id,
          'processHandoff',
          1,
        );
      }
    }

    for (const targetArtifactId of targetArtifactIds) {
      addBoundaryHandoff(
        incomingBoundaryHandoffs,
        targetArtifactId,
        handoff,
      );
    }

    // A sync handoff carries assurance context in both directions, just like
    // a sync PrepRelation. The persisted source/target still determines how
    // the boundary is drawn in the overview.
    if (handoff.prepType === 'sync') {
      for (const targetArtifactId of targetArtifactIds) {
        addBoundaryHandoff(
          outgoingBoundaryHandoffs,
          targetArtifactId,
          handoff,
        );
        for (const sourceArtifactId of sourceArtifactIds) {
          addArc(
            outgoing,
            targetArtifactId,
            sourceArtifactId,
            handoff.id,
            'processHandoff',
            1,
          );
          addArc(
            incoming,
            sourceArtifactId,
            targetArtifactId,
            handoff.id,
            'processHandoff',
            1,
          );
        }
      }

      for (const sourceArtifactId of sourceArtifactIds) {
        addBoundaryHandoff(
          incomingBoundaryHandoffs,
          sourceArtifactId,
          handoff,
        );
      }
    }
  }

  for (const arcs of [...outgoing.values(), ...incoming.values()]) {
    arcs.sort((left, right) => left.priority - right.priority);
  }

  return {
    outgoing,
    incoming,
    outgoingBoundaryHandoffs,
    incomingBoundaryHandoffs,
  };
}

function traverse(
  graph: Map<string, GraphArc[]>,
  boundaryHandoffs: Map<string, BoundaryHandoff[]>,
  startArtifactId: string,
  direction: AssuranceTraceDirection,
): TraceTraversal {
  const visited = new Set([startArtifactId]);
  const relationIds: string[] = [];
  const handoffIds: string[] = [];
  const visitedEdgeIds = new Set<string>();
  const artifactIds: string[] = [];
  const steps: AssuranceTraceStep[] = [];
  const queue: Array<{ artifactId: string; depth: number }> = [
    { artifactId: startArtifactId, depth: 0 },
  ];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];

    for (const handoff of boundaryHandoffs.get(current.artifactId) ?? []) {
      if (!visitedEdgeIds.has(handoff.id)) {
        visitedEdgeIds.add(handoff.id);
        handoffIds.push(handoff.id);
      }
    }

    for (const arc of graph.get(current.artifactId) ?? []) {
      if (!visitedEdgeIds.has(arc.edgeId)) {
        visitedEdgeIds.add(arc.edgeId);
        if (arc.edgeType === 'relation') {
          relationIds.push(arc.edgeId);
        } else {
          handoffIds.push(arc.edgeId);
        }
      }

      if (visited.has(arc.artifactId)) {
        continue;
      }

      const depth = current.depth + 1;
      visited.add(arc.artifactId);
      artifactIds.push(arc.artifactId);
      const step: AssuranceTraceStep = {
        artifactId: arc.artifactId,
        direction,
        depth,
        viaRelationId: arc.edgeId,
      };
      if (arc.edgeType === 'processHandoff') {
        step.viaHandoffId = arc.edgeId;
      }
      steps.push(step);
      queue.push({ artifactId: arc.artifactId, depth });
    }
  }

  return { artifactIds, relationIds, handoffIds, steps };
}

const emptyTrace = (startArtifactId: string): AssuranceTraceResult => ({
  startArtifactId,
  startFound: false,
  upstreamArtifactIds: [],
  downstreamArtifactIds: [],
  traversedRelationIds: [],
  traversedHandoffIds: [],
  traversalOrder: [],
  reachesFinalArtifact: false,
  highRiskElementIds: [],
  highRiskElements: [],
});

export function traceAssurance(
  model: PrepModelFile,
  startArtifactId: string,
): AssuranceTraceResult {
  const artifactsById = new Map<string, PrepArtifact>(
    model.artifacts.map((artifact) => [artifact.id, artifact]),
  );
  const startArtifact = artifactsById.get(startArtifactId);

  if (startArtifact === undefined) {
    return emptyTrace(startArtifactId);
  }

  const {
    outgoing,
    incoming,
    outgoingBoundaryHandoffs,
    incomingBoundaryHandoffs,
  } = buildTraceGraphs(model);
  const upstream = traverse(
    incoming,
    incomingBoundaryHandoffs,
    startArtifactId,
    'upstream',
  );
  const downstream = traverse(
    outgoing,
    outgoingBoundaryHandoffs,
    startArtifactId,
    'downstream',
  );

  const traversedRelationIds = [
    ...upstream.relationIds,
    ...downstream.relationIds.filter(
      (relationId) => !upstream.relationIds.includes(relationId),
    ),
  ];
  const traversedHandoffIds = [
    ...upstream.handoffIds,
    ...downstream.handoffIds.filter(
      (handoffId) => !upstream.handoffIds.includes(handoffId),
    ),
  ];
  const reachedArtifactIds = new Set([
    startArtifactId,
    ...upstream.artifactIds,
    ...downstream.artifactIds,
  ]);
  const highRiskElements: HighRiskElementRef[] = [];

  for (const artifact of model.artifacts) {
    if (
      reachedArtifactIds.has(artifact.id) &&
      artifact.risk.level === 'high'
    ) {
      highRiskElements.push({ id: artifact.id, type: 'artifact' });
    }
  }

  const traversedRelationIdSet = new Set(traversedRelationIds);
  for (const relation of model.relations) {
    if (
      traversedRelationIdSet.has(relation.id) &&
      relation.risk.level === 'high'
    ) {
      highRiskElements.push({ id: relation.id, type: 'relation' });
    }
  }

  return {
    startArtifactId,
    startFound: true,
    upstreamArtifactIds: upstream.artifactIds,
    downstreamArtifactIds: downstream.artifactIds,
    traversedRelationIds,
    traversedHandoffIds,
    traversalOrder: [...upstream.steps, ...downstream.steps],
    reachesFinalArtifact:
      startArtifact.type === 'final' ||
      downstream.artifactIds.some(
        (artifactId) => artifactsById.get(artifactId)?.type === 'final',
      ),
    highRiskElementIds: highRiskElements.map((element) => element.id),
    highRiskElements,
  };
}

/** Compatibility alias for callers that use a noun-first API. */
export const getAssuranceTrace = traceAssurance;
