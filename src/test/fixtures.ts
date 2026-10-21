import {
  PREP_SCHEMA_VERSION,
  type PrepArtifact,
  type PrepModelFile,
  type PrepProcess,
  type PrepRelation,
} from '../domain/model';

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

export function makeArtifact(
  overrides: Partial<PrepArtifact> = {},
): PrepArtifact {
  return {
    id: 'artifact-default',
    processId: 'process-default',
    name: '成果物',
    type: 'intermediate',
    scope: 'internal',
    states: [
      {
        id: 'state-default',
        name: '作成済み',
        isCurrent: true,
      },
    ],
    attributes: [],
    responsibleActorId: 'actor-default',
    risk: { level: 'none' },
    ...overrides,
  };
}

export function makeRelation(
  overrides: Partial<PrepRelation> = {},
): PrepRelation {
  return {
    id: 'relation-default',
    sourceId: 'artifact-source',
    targetId: 'artifact-final',
    sourceAnchor: 'e',
    targetAnchor: 'w',
    prepType: 'input',
    risk: { level: 'none' },
    ...overrides,
  };
}

export function makeProcess(
  overrides: Partial<PrepProcess> = {},
): PrepProcess {
  return {
    id: 'process-default',
    name: 'テスト設計',
    goal: '追跡可能な成果物を作成する',
    ...overrides,
  };
}

export function makePrepModel(
  overrides: Partial<PrepModelFile> = {},
): PrepModelFile {
  const source = makeArtifact({
    id: 'artifact-source',
    name: '入力成果物',
    scope: 'external-input',
  });
  const finalArtifact = makeArtifact({
    id: 'artifact-final',
    name: '最終成果物',
    type: 'final',
    scope: 'external-output',
    states: [
      {
        id: 'state-final',
        name: '完成',
        isCurrent: true,
      },
    ],
  });

  return {
    schemaVersion: PREP_SCHEMA_VERSION,
    metadata: {
      modelId: 'model-test',
      modelName: 'テストモデル',
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
    system: {
      id: 'system-test',
      name: 'テスト対象システム',
      goal: 'モデルを検証する',
      phase: 'unspecified',
    },
    processes: [makeProcess()],
    actors: [
      {
        id: 'actor-default',
        name: 'テスト担当者',
      },
    ],
    processActorLanes: [
      {
        id: 'lane-default',
        processId: 'process-default',
        actorId: 'actor-default',
        role: '設計担当',
        order: 0,
        height: 220,
      },
    ],
    artifacts: [source, finalArtifact],
    externalProcesses: [],
    relations: [makeRelation()],
    processHandoffs: [],
    layout: {
      nodes: [
        { id: 'process-default', x: 0, y: 0 },
        {
          id: 'artifact-source',
          x: 100,
          y: 100,
          parentId: 'process-default',
        },
        {
          id: 'artifact-final',
          x: 400,
          y: 100,
          parentId: 'process-default',
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      processViews: [
        {
          processId: 'process-default',
          artifactPlacements: [
            {
              artifactId: 'artifact-source',
              offsetX: 100,
              offsetY: 100,
            },
            {
              artifactId: 'artifact-final',
              offsetX: 400,
              offsetY: 100,
            },
          ],
          subprocessColumns: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      ],
      overview: {
        nodes: [
          {
            id: 'process-default',
            kind: 'process',
            x: 0,
            y: 0,
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      lastView: {
        mode: 'process',
        activeProcessId: 'process-default',
      },
    },
    ...overrides,
  };
}

export const createArtifactFixture = makeArtifact;
export const createRelationFixture = makeRelation;
export const createModelFixture = makePrepModel;

export const validModelFixture: PrepModelFile = makePrepModel();

export function cloneModel(model: PrepModelFile): PrepModelFile {
  return structuredClone(model);
}
