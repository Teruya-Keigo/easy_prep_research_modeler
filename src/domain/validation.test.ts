import { describe, expect, it } from 'vitest';

import {
  makeArtifact,
  makePrepModel,
  makeProcess,
  makeRelation,
} from '../test/fixtures';
import { findInputCycleRelations, validateModel } from './validation';

const codes = (model: ReturnType<typeof makePrepModel>) =>
  new Set(validateModel(model).issues.map((issue) => issue.code));

describe('validateModel errors', () => {
  it('reports empty system fields and missing model elements', () => {
    const model = makePrepModel({
      system: {
        id: 'system-test',
        name: '  ',
        goal: '',
        phase: 'unspecified',
      },
      processes: [],
      actors: [],
      processActorLanes: [],
      artifacts: [],
      relations: [],
    });

    expect(codes(model)).toEqual(
      new Set(['E001', 'E002', 'E003', 'E006', 'E007']),
    );
  });

  it('reports blank process fields', () => {
    const model = makePrepModel({
      processes: [makeProcess({ name: '', goal: '   ' })],
    });

    expect([...codes(model)]).toEqual(
      expect.arrayContaining(['E004', 'E005']),
    );
  });

  it('reports E023 for an invalid subprocess width or manual height', () => {
    const model = makePrepModel();
    model.processes.push(
      makeProcess({ id: 'child', parentProcessId: 'process-default' }),
    );
    model.layout.processViews![0].subprocessColumns.push({
      processId: 'child',
      parentProcessId: 'process-default',
      order: 0,
      width: 259,
      height: 159,
    });

    expect(validateModel(model).errors).toContainEqual(
      expect.objectContaining({
        code: 'E023',
        elementId: 'child',
        elementType: 'process',
      }),
    );

    model.layout.processViews![0].subprocessColumns[0].width = 260;
    model.layout.processViews![0].subprocessColumns[0].height = undefined;
    expect(codes(model).has('E023')).toBe(false);
  });

  it('reports dangling endpoints, a self sync, and multiple current states', () => {
    const artifact = makeArtifact({
      id: 'artifact-multiple-current',
      states: [
        { id: 'state-1', name: '状態1', isCurrent: true },
        { id: 'state-2', name: '状態2', isCurrent: true },
      ],
    });
    const finalArtifact = makeArtifact({
      id: 'artifact-final',
      type: 'final',
      scope: 'external-output',
      nextProcessName: '後続',
    });
    const model = makePrepModel({
      artifacts: [artifact, finalArtifact],
      relations: [
        makeRelation({
          id: 'relation-dangling',
          sourceId: 'missing',
          targetId: artifact.id,
        }),
        makeRelation({
          id: 'relation-self-sync',
          sourceId: artifact.id,
          targetId: artifact.id,
          prepType: 'sync',
        }),
      ],
    });

    expect([...codes(model)]).toEqual(
      expect.arrayContaining(['E008', 'E009', 'E010']),
    );
  });
});

describe('validateModel warnings', () => {
  it('implements W001 through W009', () => {
    const cycleA = makeArtifact({
      id: 'artifact-cycle-a',
      name: '循環A',
      risk: { level: 'none' },
    });
    const cycleB = makeArtifact({
      id: 'artifact-cycle-b',
      name: '循環B',
      risk: { level: 'none' },
    });
    const highRisk = makeArtifact({
      id: 'artifact-high-risk',
      name: '高リスク成果物',
      risk: { level: 'high', description: '重大な影響' },
    });
    const intangible = makeArtifact({
      id: 'artifact-intangible',
      name: '知見',
      type: 'intangible',
      risk: { level: 'low' },
    });
    const milestone = makeArtifact({
      id: 'artifact-milestone',
      name: '品質ゲート',
      type: 'milestone',
    });
    const finalArtifact = makeArtifact({
      id: 'artifact-final',
      name: '最終成果物',
      type: 'final',
      scope: 'external-output',
      nextProcessName: '',
    });
    const model = makePrepModel({
      artifacts: [
        cycleA,
        cycleB,
        highRisk,
        intangible,
        milestone,
        finalArtifact,
      ],
      relations: [
        makeRelation({
          id: 'relation-cycle-a-b',
          sourceId: cycleA.id,
          targetId: cycleB.id,
        }),
        makeRelation({
          id: 'relation-cycle-b-a',
          sourceId: cycleB.id,
          targetId: cycleA.id,
        }),
        makeRelation({
          id: 'relation-sync-no-risk',
          sourceId: cycleA.id,
          targetId: finalArtifact.id,
          prepType: 'sync',
        }),
      ],
    });

    expect([...codes(model)]).toEqual(
      expect.arrayContaining([
        'W001',
        'W002',
        'W003',
        'W004',
        'W005',
        'W006',
        'W007',
        'W008',
        'W009',
      ]),
    );
    expect(findInputCycleRelations(model)).toHaveLength(1);
  });

  it('does not emit W007 when a high-risk artifact has a mitigation edge', () => {
    const highRisk = makeArtifact({
      id: 'artifact-high-risk',
      risk: { level: 'high' },
      scope: 'external-input',
    });
    const finalArtifact = makeArtifact({
      id: 'artifact-final',
      type: 'final',
      scope: 'external-output',
      nextProcessName: '後続',
    });
    const model = makePrepModel({
      artifacts: [highRisk, finalArtifact],
      relations: [
        makeRelation({
          sourceId: highRisk.id,
          targetId: finalArtifact.id,
          semanticType: 'mitigates',
        }),
      ],
    });

    expect(
      validateModel(model).warnings.some(
        (issue) =>
          issue.code === 'W007' && issue.elementId === highRisk.id,
      ),
    ).toBe(false);
  });

  it('returns separate error and warning collections', () => {
    const result = validateModel(makePrepModel());

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(4);
    expect(new Set(result.warnings.map((issue) => issue.code))).toEqual(
      new Set(['W001', 'W012', 'W014']),
    );
    expect(result.isValid).toBe(true);
  });
});
