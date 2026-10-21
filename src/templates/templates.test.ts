import { describe, expect, it } from 'vitest';

import { safeParsePrepModel } from '../domain/schema';
import {
  createCoffeeProcessModel,
  createConstrainedMlcTestingModel,
  createEmptyModel,
  createModelFromTemplate,
  modelTemplates,
} from '.';

const timestamp = '2026-01-01T00:00:00.000Z';

describe('model templates', () => {
  it('provides the three specified templates as schema-valid model data', () => {
    expect(modelTemplates.map((template) => template.id)).toEqual([
      'empty',
      'constrained-mlc',
      'coffee',
    ]);

    for (const template of modelTemplates) {
      const model = template.createModel(timestamp);
      expect(model.schemaVersion).toBe('1.3.0');
      expect(safeParsePrepModel(model).success).toBe(true);
    }
  });

  it('creates an empty model with one blank process', () => {
    const model = createEmptyModel(timestamp);

    expect(model.processes).toHaveLength(1);
    expect(model.processes[0]).toMatchObject({ name: '', goal: '' });
    expect(model.artifacts).toHaveLength(0);
    expect(model.relations).toHaveLength(0);
  });

  it('creates the constrained MLC model with 8 artifacts and 8 unlabeled input relations', () => {
    const model = createConstrainedMlcTestingModel(timestamp);

    expect(model.artifacts.map((artifact) => artifact.name)).toEqual([
      '信頼性要求',
      '制約定義',
      'リスクシナリオ',
      'テストケース集合',
      '評価基準',
      '評価結果',
      '残余リスク評価',
      '引継ぎ条件',
    ]);
    expect(model.artifacts).toHaveLength(8);
    expect(model.relations).toHaveLength(8);
    expect(
      model.layout.processViews?.[0].subprocessColumns.every(
        (column) => column.height === undefined,
      ),
    ).toBe(true);
    expect(
      model.relations.every(
        (relation) =>
          relation.prepType === 'input' &&
          relation.semanticType === undefined,
      ),
    ).toBe(true);
  });

  it('creates the coffee model with four artifacts and a process handoff', () => {
    const model = createCoffeeProcessModel(timestamp);

    expect(model.system.goal).toBe(
      '要求品質を満たすコーヒーを提供する',
    );
    expect(model.artifacts).toHaveLength(4);
    expect(model.externalProcesses).toHaveLength(0);
    expect(model.relations).toHaveLength(3);
    expect(model.processHandoffs).toHaveLength(1);
    expect(model.processHandoffs?.[0]).toMatchObject({
      prepType: 'input',
      sourceArtifactIds: ['artifact-serving-coffee'],
      targetArtifactIds: [],
    });
    expect(model.artifacts.at(-1)).toMatchObject({
      name: '提供用コーヒー',
      type: 'final',
    });
  });

  it('returns fresh model objects for every creation', () => {
    const first = createModelFromTemplate('constrained-mlc', timestamp);
    const second = createModelFromTemplate('constrained-mlc', timestamp);

    first.artifacts[0].name = '変更済み';

    expect(second.artifacts[0].name).toBe('信頼性要求');
  });
});
