import { describe, expect, it } from 'vitest';

import {
  makeArtifact,
  makePrepModel,
  makeProcess,
  makeRelation,
} from '../test/fixtures';
import { createConstrainedMlcTestingModel } from '../templates';
import { traceAssurance } from './assuranceTrace';

describe('traceAssurance', () => {
  it('finds upstream and downstream artifacts in arrival order', () => {
    const model = createConstrainedMlcTestingModel(
      '2026-01-01T00:00:00.000Z',
    );

    const result = traceAssurance(
      model,
      'artifact-constraint-definition',
    );

    expect(result.startFound).toBe(true);
    expect(result.upstreamArtifactIds).toEqual([
      'artifact-reliability-requirements',
    ]);
    expect(result.downstreamArtifactIds).toContain('artifact-test-cases');
    expect(result.downstreamArtifactIds.at(-1)).toBe(
      'artifact-handover-conditions',
    );
    expect(result.reachesFinalArtifact).toBe(true);
    expect(result.traversalOrder[0]).toMatchObject({
      artifactId: 'artifact-reliability-requirements',
      direction: 'upstream',
      depth: 1,
    });
  });

  it('uses supported semantics, ignores unrelated semantics, and falls back to input', () => {
    const artifactA = makeArtifact({
      id: 'artifact-a',
      scope: 'external-input',
    });
    const artifactB = makeArtifact({ id: 'artifact-b' });
    const artifactC = makeArtifact({ id: 'artifact-c' });
    const finalArtifact = makeArtifact({
      id: 'artifact-final',
      type: 'final',
      scope: 'external-output',
      nextProcessName: '後続',
    });
    const model = makePrepModel({
      artifacts: [artifactA, artifactB, artifactC, finalArtifact],
      relations: [
        makeRelation({
          id: 'relation-ignored',
          sourceId: artifactA.id,
          targetId: artifactB.id,
          semanticType: 'approves',
        }),
        makeRelation({
          id: 'relation-semantic',
          sourceId: artifactA.id,
          targetId: artifactC.id,
          semanticType: 'justifies',
        }),
        makeRelation({
          id: 'relation-fallback',
          sourceId: artifactC.id,
          targetId: finalArtifact.id,
        }),
      ],
    });

    const result = traceAssurance(model, artifactA.id);

    expect(result.downstreamArtifactIds).toEqual([
      artifactC.id,
      finalArtifact.id,
    ]);
    expect(result.traversedRelationIds).toEqual([
      'relation-semantic',
      'relation-fallback',
    ]);
  });

  it('treats sync as bidirectional and terminates on cycles', () => {
    const artifactA = makeArtifact({ id: 'artifact-a' });
    const artifactB = makeArtifact({ id: 'artifact-b' });
    const finalArtifact = makeArtifact({
      id: 'artifact-final',
      type: 'final',
      nextProcessName: '後続',
    });
    const model = makePrepModel({
      artifacts: [artifactA, artifactB, finalArtifact],
      relations: [
        makeRelation({
          id: 'relation-sync',
          sourceId: artifactA.id,
          targetId: artifactB.id,
          prepType: 'sync',
          semanticType: 'monitors',
        }),
        makeRelation({
          id: 'relation-final',
          sourceId: artifactB.id,
          targetId: finalArtifact.id,
        }),
      ],
    });

    const result = traceAssurance(model, artifactB.id);

    expect(result.upstreamArtifactIds).toContain(artifactA.id);
    expect(result.downstreamArtifactIds).toEqual(
      expect.arrayContaining([artifactA.id, finalArtifact.id]),
    );
    expect(new Set(result.downstreamArtifactIds).size).toBe(
      result.downstreamArtifactIds.length,
    );
  });

  it('returns path high-risk elements and handles a missing start', () => {
    const model = makePrepModel();
    model.artifacts[1].risk = { level: 'high', description: '要確認' };
    model.relations[0].risk = { level: 'high', description: '要確認' };

    const result = traceAssurance(model, 'artifact-source');

    expect(result.highRiskElements).toEqual([
      { id: 'artifact-final', type: 'artifact' },
      { id: 'relation-default', type: 'relation' },
    ]);
    expect(traceAssurance(model, 'missing').startFound).toBe(false);
  });

  it('continues assurance traversal across a process handoff in both directions', () => {
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

    const downstream = traceAssurance(model, sourceInput.id);
    expect(downstream.downstreamArtifactIds).toEqual([
      sourceFinal.id,
      targetInput.id,
      targetFinal.id,
    ]);
    expect(downstream.traversedRelationIds).toEqual([
      'relation-source',
      'relation-target',
    ]);
    expect(downstream.traversedHandoffIds).toEqual(['handoff-a-b']);
    expect(
      downstream.traversalOrder.find(
        (step) => step.artifactId === targetInput.id,
      ),
    ).toMatchObject({
      viaRelationId: 'handoff-a-b',
      viaHandoffId: 'handoff-a-b',
    });

    const upstream = traceAssurance(model, targetFinal.id);
    expect(upstream.upstreamArtifactIds).toEqual([
      targetInput.id,
      sourceFinal.id,
      sourceInput.id,
    ]);
    expect(upstream.traversedHandoffIds).toEqual(['handoff-a-b']);
  });

  it('reports a terminal handoff with no receiving artifact and treats sync as bidirectional', () => {
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
          id: 'handoff-terminal',
          sourceProcessId: 'process-a',
          targetProcessId: 'process-b',
          sourceArtifactIds: [sourceFinal.id],
          targetArtifactIds: [],
          prepType: 'input',
          sourceAnchor: 'e',
          targetAnchor: 'w',
        },
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

    expect(traceAssurance(model, sourceFinal.id).traversedHandoffIds).toEqual(
      expect.arrayContaining(['handoff-terminal', 'handoff-sync']),
    );
    const reverse = traceAssurance(model, targetInput.id);
    expect(reverse.downstreamArtifactIds).toContain(sourceFinal.id);
    expect(reverse.traversedHandoffIds).toContain('handoff-sync');
  });
});
