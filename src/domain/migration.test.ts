import { describe, expect, it } from 'vitest';

import { createConstrainedMlcTestingModel } from '../templates/constrainedMlcTesting';
import { migratePrepModel, safeMigratePrepModel } from './migration';

const legacyMetadata = {
  modelId: 'model-legacy',
  modelName: '旧モデル',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const legacySystem = {
  id: 'system-legacy',
  name: 'システム',
  goal: 'ゴール',
  phase: 'unspecified' as const,
};

const risk = { level: 'none' as const };

function artifact(
  id: string,
  processId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    processId,
    name: id,
    type: 'intermediate' as const,
    scope: 'internal' as const,
    states: [],
    attributes: [],
    risk,
    ...overrides,
  };
}

describe('migratePrepModel', () => {
  it('deduplicates v1.1 actors, creates a placeholder and cell layouts', () => {
    const migrated = migratePrepModel({
      schemaVersion: '1.1.0',
      metadata: legacyMetadata,
      system: legacySystem,
      processes: [
        { id: 'root', name: 'ルート', goal: 'ゴール' },
        {
          id: 'right',
          parentProcessId: 'root',
          name: '右',
          goal: '右',
        },
        {
          id: 'left',
          parentProcessId: 'root',
          name: '左',
          goal: '左',
        },
      ],
      artifacts: [
        artifact('a', 'left', { responsibleActor: '担当者' }),
        artifact('b', 'right', { responsibleActor: '担当者' }),
        artifact('c', 'right'),
      ],
      externalProcesses: [],
      relations: [],
      layout: {
        nodes: [
          { id: 'right', x: 500, y: 0 },
          { id: 'left', x: 100, y: 0 },
          { id: 'a', x: 24, y: 30, parentId: 'left' },
          { id: 'b', x: 40, y: 50, parentId: 'right' },
          { id: 'c', x: 80, y: 90, parentId: 'right' },
        ],
        viewport: { x: 1, y: 2, zoom: 1 },
      },
    });

    expect(migrated.schemaVersion).toBe('1.3.0');
    expect(migrated.actors.filter((actor) => actor.name === '担当者')).toHaveLength(
      1,
    );
    expect(migrated.actors.find((actor) => actor.isPlaceholder)?.name).toBe(
      '未割当',
    );
    expect(migrated.artifacts[0].responsibleActorId).toBe(
      migrated.artifacts[1].responsibleActorId,
    );
    expect(migrated.artifacts[2].responsibleActorId).toBe(
      migrated.actors.find((actor) => actor.isPlaceholder)?.id,
    );
    expect(
      migrated.layout.processViews
        .find((view) => view.processId === 'root')
        ?.subprocessColumns.map((column) => column.processId),
    ).toEqual(['left', 'right']);
    expect(
      migrated.layout.processViews
        .find((view) => view.processId === 'root')
        ?.subprocessColumns.every((column) => column.height === undefined),
    ).toBe(true);
    expect(
      migrated.layout.processViews
        .find((view) => view.processId === 'root')
        ?.artifactPlacements.find((placement) => placement.artifactId === 'a'),
    ).toMatchObject({ offsetX: 24, offsetY: 30 });
  });

  it('resolves a unique legacy nextProcessName and preserves ambiguous names', () => {
    const migrated = migratePrepModel({
      schemaVersion: '1.0.0',
      metadata: legacyMetadata,
      system: legacySystem,
      processes: [
        { id: 'source', name: '生成', goal: '生成' },
        { id: 'target', name: '利用', goal: '利用' },
      ],
      artifacts: [
        artifact('resolved', 'source', {
          type: 'final',
          scope: 'external-output',
          nextProcessName: '利用',
          responsibleActor: 'A',
        }),
        artifact('unresolved', 'source', {
          type: 'final',
          scope: 'external-output',
          nextProcessName: '不明',
          responsibleActor: 'A',
        }),
      ],
      externalProcesses: [],
      relations: [],
      layout: {
        nodes: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });

    expect(migrated.processHandoffs).toHaveLength(1);
    expect(migrated.processHandoffs[0]).toMatchObject({
      sourceProcessId: 'source',
      targetProcessId: 'target',
      sourceArtifactIds: ['resolved'],
      sourceAnchor: 'auto',
      targetAnchor: 'auto',
    });
    expect(
      migrated.artifacts.find((item) => item.id === 'resolved')
        ?.legacyNextProcessName,
    ).toBeUndefined();
    expect(
      migrated.artifacts.find((item) => item.id === 'unresolved')
        ?.legacyNextProcessName,
    ).toBe('不明');
  });

  it('reports unsupported versions without throwing from the safe API', () => {
    const result = safeMigratePrepModel({ schemaVersion: '9.0.0' });
    expect(result.success).toBe(false);
  });

  it('migrates v1.2 columns to auto height and preserves their width', () => {
    const oldModel = structuredClone(
      createConstrainedMlcTestingModel('2026-01-01'),
    );
    oldModel.schemaVersion = '1.2.0';
    const rootView = oldModel.layout.processViews?.find(
      (view) => view.processId === 'process-mlc-test-design',
    );
    expect(rootView).toBeDefined();
    rootView!.subprocessColumns[0].width = 420;
    rootView!.subprocessColumns[1].width = 200;

    const migrated = migratePrepModel(oldModel);
    const columns = migrated.layout.processViews.find(
      (view) => view.processId === 'process-mlc-test-design',
    )?.subprocessColumns;

    expect(migrated.schemaVersion).toBe('1.3.0');
    expect(columns?.[0]).toMatchObject({ width: 420 });
    expect(columns?.[1]).toMatchObject({ width: 260 });
    expect(columns?.every((column) => column.height === undefined)).toBe(true);
    expect(migrated.artifacts).toEqual(oldModel.artifacts);
  });
});
