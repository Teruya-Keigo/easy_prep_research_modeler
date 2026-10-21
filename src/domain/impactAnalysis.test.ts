import { describe, expect, it } from 'vitest';

import {
  makeArtifact,
  makePrepModel,
  makeProcess,
  makeRelation,
} from '../test/fixtures';
import { analyzeImpact } from './impactAnalysis';

describe('analyzeImpact', () => {
  it('follows explicit revalidation transitively, then marks input successors inferred', () => {
    const artifactA = makeArtifact({
      id: 'artifact-a',
      scope: 'external-input',
    });
    const artifactB = makeArtifact({ id: 'artifact-b' });
    const artifactC = makeArtifact({ id: 'artifact-c' });
    const artifactD = makeArtifact({
      id: 'artifact-d',
      type: 'final',
      scope: 'external-output',
      nextProcessName: '後続',
    });
    const model = makePrepModel({
      artifacts: [artifactA, artifactB, artifactC, artifactD],
      relations: [
        makeRelation({
          id: 'relation-explicit-a-b',
          sourceId: artifactA.id,
          targetId: artifactB.id,
          semanticType: 'requires-revalidation-of',
        }),
        makeRelation({
          id: 'relation-explicit-b-c',
          sourceId: artifactB.id,
          targetId: artifactC.id,
          semanticType: 'requires-revalidation-of',
        }),
        makeRelation({
          id: 'relation-inferred-c-d',
          sourceId: artifactC.id,
          targetId: artifactD.id,
        }),
        makeRelation({
          id: 'relation-cycle-d-a',
          sourceId: artifactD.id,
          targetId: artifactA.id,
        }),
      ],
    });

    const result = analyzeImpact(model, artifactA.id);

    expect(result.explicitArtifactIds).toEqual([
      artifactB.id,
      artifactC.id,
    ]);
    expect(result.inferredArtifactIds).toEqual([artifactD.id]);
    expect(result.explicitRelationIds).toEqual([
      'relation-explicit-a-b',
      'relation-explicit-b-c',
    ]);
    expect(result.inferredRelationIds).toEqual([
      'relation-inferred-c-d',
      'relation-cycle-d-a',
    ]);
  });

  it('uses all downstream inputs as inferred when no explicit edge exists', () => {
    const model = makePrepModel();

    const result = analyzeImpact(model, 'artifact-source');

    expect(result.explicitArtifactIds).toEqual([]);
    expect(result.inferredArtifactIds).toEqual(['artifact-final']);
    expect(result.inferredRelationIds).toEqual(['relation-default']);
    expect(result.impactOrder[0]).toMatchObject({
      artifactId: 'artifact-final',
      kind: 'inferred',
      depth: 1,
    });
  });

  it('gives explicit impact precedence when paths overlap', () => {
    const artifactA = makeArtifact({
      id: 'artifact-a',
      scope: 'external-input',
    });
    const artifactB = makeArtifact({
      id: 'artifact-b',
      type: 'final',
      scope: 'external-output',
      nextProcessName: '後続',
    });
    const model = makePrepModel({
      artifacts: [artifactA, artifactB],
      relations: [
        makeRelation({
          id: 'relation-explicit',
          sourceId: artifactA.id,
          targetId: artifactB.id,
          semanticType: 'requires-revalidation-of',
        }),
        makeRelation({
          id: 'relation-input',
          sourceId: artifactA.id,
          targetId: artifactB.id,
        }),
      ],
    });

    const result = analyzeImpact(model, artifactA.id);

    expect(result.explicitArtifactIds).toEqual([artifactB.id]);
    expect(result.inferredArtifactIds).toEqual([]);
    expect(result.explicitRelationIds).toEqual(['relation-explicit']);
    expect(result.inferredRelationIds).toEqual([]);
  });

  it('returns all artifacts as unaffected when the start does not exist', () => {
    const model = makePrepModel();
    const result = analyzeImpact(model, 'missing');

    expect(result.startFound).toBe(false);
    expect(result.unaffectedArtifactIds).toEqual(
      model.artifacts.map((artifact) => artifact.id),
    );
  });

  it('continues inferred impact through a handoff and identifies the process boundary', () => {
    const sourceInput = makeArtifact({
      id: 'artifact-source-input',
      processId: 'process-a',
      scope: 'external-input',
    });
    const sourceFinal = makeArtifact({
      id: 'artifact-source-final',
      processId: 'process-a',
      type: 'final',
      scope: 'external-output',
    });
    const targetInput = makeArtifact({
      id: 'artifact-target-input',
      processId: 'process-b',
      scope: 'external-input',
    });
    const targetFinal = makeArtifact({
      id: 'artifact-target-final',
      processId: 'process-b',
      type: 'final',
      scope: 'external-output',
    });
    const model = makePrepModel({
      processes: [
        makeProcess({ id: 'process-a' }),
        makeProcess({ id: 'process-b' }),
      ],
      artifacts: [sourceInput, sourceFinal, targetInput, targetFinal],
      relations: [
        makeRelation({
          id: 'relation-source',
          sourceId: sourceInput.id,
          targetId: sourceFinal.id,
        }),
        makeRelation({
          id: 'relation-target',
          sourceId: targetInput.id,
          targetId: targetFinal.id,
        }),
      ],
      processHandoffs: [
        {
          id: 'handoff-a-b',
          sourceProcessId: 'process-a',
          targetProcessId: 'process-b',
          sourceArtifactIds: [sourceFinal.id],
          targetArtifactIds: [targetInput.id],
          prepType: 'input',
          sourceAnchor: 'e',
          targetAnchor: 'w',
        },
      ],
    });

    const result = analyzeImpact(model, sourceInput.id);

    expect(result.inferredArtifactIds).toEqual([
      sourceFinal.id,
      targetInput.id,
      targetFinal.id,
    ]);
    expect(result.inferredRelationIds).toEqual([
      'relation-source',
      'relation-target',
    ]);
    expect(result.interProcessArtifactIds).toEqual([targetInput.id]);
    expect(result.interProcessProcessIds).toEqual(['process-b']);
    expect(result.interProcessHandoffIds).toEqual(['handoff-a-b']);
    expect(
      result.impactOrder.find((step) => step.artifactId === targetInput.id),
    ).toMatchObject({
      kind: 'inferred',
      viaRelationId: 'handoff-a-b',
      viaHandoffId: 'handoff-a-b',
    });
  });

  it('reports a handoff alongside explicit local impact and without target artifacts', () => {
    const sourceFinal = makeArtifact({
      id: 'artifact-source-final',
      processId: 'process-a',
      type: 'final',
      scope: 'external-output',
    });
    const localArtifact = makeArtifact({
      id: 'artifact-local',
      processId: 'process-a',
    });
    const model = makePrepModel({
      processes: [
        makeProcess({ id: 'process-a' }),
        makeProcess({ id: 'process-b' }),
      ],
      artifacts: [sourceFinal, localArtifact],
      relations: [
        makeRelation({
          id: 'relation-explicit',
          sourceId: sourceFinal.id,
          targetId: localArtifact.id,
          semanticType: 'requires-revalidation-of',
        }),
      ],
      processHandoffs: [
        {
          id: 'handoff-terminal',
          sourceProcessId: 'process-a',
          targetProcessId: 'process-b',
          sourceArtifactIds: [sourceFinal.id],
          targetArtifactIds: [],
          prepType: 'input',
          sourceAnchor: 'e',
          targetAnchor: 'w',
        },
      ],
    });

    const result = analyzeImpact(model, sourceFinal.id);

    expect(result.explicitArtifactIds).toEqual([localArtifact.id]);
    expect(result.interProcessArtifactIds).toEqual([]);
    expect(result.interProcessProcessIds).toEqual(['process-b']);
    expect(result.interProcessHandoffIds).toEqual(['handoff-terminal']);
  });

  it('propagates a sync handoff in reverse without looping', () => {
    const sourceFinal = makeArtifact({
      id: 'artifact-source-final',
      processId: 'process-a',
      type: 'final',
      scope: 'external-output',
    });
    const targetInput = makeArtifact({
      id: 'artifact-target-input',
      processId: 'process-b',
      scope: 'external-input',
    });
    const model = makePrepModel({
      processes: [
        makeProcess({ id: 'process-a' }),
        makeProcess({ id: 'process-b' }),
      ],
      artifacts: [sourceFinal, targetInput],
      relations: [],
      processHandoffs: [
        {
          id: 'handoff-sync',
          sourceProcessId: 'process-a',
          targetProcessId: 'process-b',
          sourceArtifactIds: [sourceFinal.id],
          targetArtifactIds: [targetInput.id],
          prepType: 'sync',
          sourceAnchor: 'e',
          targetAnchor: 'w',
        },
      ],
    });

    const result = analyzeImpact(model, targetInput.id);

    expect(result.inferredArtifactIds).toEqual([sourceFinal.id]);
    expect(result.interProcessArtifactIds).toEqual([sourceFinal.id]);
    expect(result.interProcessProcessIds).toContain('process-a');
    expect(result.interProcessHandoffIds).toEqual(['handoff-sync']);
    expect(new Set(result.impactOrder.map((step) => step.artifactId)).size).toBe(
      result.impactOrder.length,
    );
  });
});
