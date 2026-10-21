import { describe, expect, it } from 'vitest';

import type { PrepModelFile, PrepRelation } from '../domain/model';
import { getProcessGridGeometry } from '../domain/processGrid';
import { makePrepModel } from '../test/fixtures';
import {
  checkRelationConstraint,
  clonePrepModel,
  createModelStore,
  selectCanRedo,
  selectCanUndo,
} from './modelStore';

function fixtureModel(): PrepModelFile {
  return {
    schemaVersion: '1.0.0',
    metadata: {
      modelId: 'model-1',
      modelName: 'テストモデル',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    system: {
      id: 'system-1',
      name: 'テストシステム',
      goal: '正しくモデルを編集する',
      phase: 'to-be',
    },
    processes: [
      {
        id: 'process-1',
        name: 'テスト設計',
        goal: '品質を確認する',
      },
    ],
    artifacts: [
      {
        id: 'artifact-1',
        processId: 'process-1',
        name: '要求',
        type: 'intermediate',
        scope: 'internal',
        states: [
          {
            id: 'state-1',
            name: '作成済み',
            isCurrent: true,
          },
        ],
        attributes: [],
        risk: { level: 'none' },
      },
      {
        id: 'artifact-2',
        processId: 'process-1',
        name: '結果',
        type: 'final',
        scope: 'external-output',
        nextProcessName: '利用プロセス',
        states: [],
        attributes: [],
        risk: { level: 'none' },
      },
    ],
    externalProcesses: [
      {
        id: 'external-1',
        name: '利用プロセス',
      },
    ],
    relations: [
      {
        id: 'relation-1',
        sourceId: 'artifact-1',
        targetId: 'artifact-2',
        prepType: 'input',
        risk: { level: 'none' },
      },
    ],
    layout: {
      nodes: [
        {
          id: 'process-1',
          x: 10,
          y: 10,
          width: 700,
          height: 400,
        },
        {
          id: 'artifact-1',
          x: 50,
          y: 80,
          width: 220,
          height: 120,
          parentId: 'process-1',
        },
        {
          id: 'artifact-2',
          x: 360,
          y: 80,
          width: 220,
          height: 120,
          parentId: 'process-1',
        },
        {
          id: 'external-1',
          x: 820,
          y: 100,
        },
      ],
      viewport: { x: 5, y: 10, zoom: 0.9 },
    },
  };
}

describe('modelStore', () => {
  it('keeps an owned PrepModelFile copy and supports undo/redo', () => {
    const source = fixtureModel();
    const store = createModelStore(source);

    store.getState().updateArtifact('artifact-1', {
      name: '更新済み要求',
    });

    expect(store.getState().model.artifacts[0].name).toBe('更新済み要求');
    expect(source.artifacts[0].name).toBe('要求');
    expect(selectCanUndo(store.getState())).toBe(true);
    expect(selectCanRedo(store.getState())).toBe(false);

    expect(store.getState().undo()).toBe(true);
    expect(store.getState().model.artifacts[0].name).toBe('要求');
    expect(selectCanRedo(store.getState())).toBe(true);

    expect(store.getState().redo()).toBe(true);
    expect(store.getState().model.artifacts[0].name).toBe('更新済み要求');
  });

  it('groups continuous layout changes into one history item', () => {
    const store = createModelStore(fixtureModel());

    store.getState().beginHistoryTransaction();
    store
      .getState()
      .updateNodeLayout('artifact-1', { x: 100, y: 120 });
    store
      .getState()
      .updateNodeLayout('artifact-1', { x: 140, y: 160 });
    expect(store.getState().past).toHaveLength(0);

    expect(store.getState().endHistoryTransaction()).toBe(true);
    expect(store.getState().past).toHaveLength(1);
    expect(
      store
        .getState()
        .model.layout.nodes.find(({ id }) => id === 'artifact-1'),
    ).toMatchObject({ x: 140, y: 160 });

    store.getState().undo();
    expect(
      store
        .getState()
        .model.layout.nodes.find(({ id }) => id === 'artifact-1'),
    ).toMatchObject({ x: 50, y: 80 });
  });

  it('resizes subprocess boxes within artifact bounds and restores auto height', () => {
    const model = makePrepModel();
    model.processes.push(
      { id: 'child-1', parentProcessId: 'process-default', name: 'C1', goal: '' },
      { id: 'child-2', parentProcessId: 'process-default', name: 'C2', goal: '' },
    );
    model.actors!.push({ id: 'actor-2', name: 'A2' });
    model.processActorLanes!.push({
      id: 'lane-2', processId: 'process-default', actorId: 'actor-2', order: 1, height: 220,
    });
    model.artifacts.push({
      id: 'child-artifact', processId: 'child-1', responsibleActorId: 'actor-2',
      name: 'X', type: 'intermediate', scope: 'internal', states: [],
      attributes: [], risk: { level: 'none' },
    });
    model.layout.nodes.push({ id: 'child-artifact', x: 0, y: 0, width: 200, height: 116 });
    model.layout.processViews![0].artifactPlacements.push({
      artifactId: 'child-artifact', offsetX: 120, offsetY: 100,
    });
    model.layout.processViews![0].subprocessColumns.push(
      { processId: 'child-1', parentProcessId: 'process-default', order: 0, width: 360 },
      { processId: 'child-2', parentProcessId: 'process-default', order: 1, width: 360 },
    );
    const store = createModelStore(model);
    const beforeArtifacts = structuredClone(store.getState().model.artifacts);
    const beforePlacements = structuredClone(
      store.getState().model.layout.processViews![0].artifactPlacements,
    );

    store.getState().beginHistoryTransaction();
    expect(store.getState().updateSubprocessColumnLayout('process-default', 'child-1', {
      width: 600, height: 600,
    })).toBe(true);
    expect(store.getState().updateSubprocessColumnLayout('process-default', 'child-1', {
      width: 100, height: 100,
    })).toBe(true);
    expect(store.getState().endHistoryTransaction()).toBe(true);
    expect(store.getState().past).toHaveLength(1);
    expect(store.getState().model.layout.processViews![0].subprocessColumns).toEqual([
      { processId: 'child-1', parentProcessId: 'process-default', order: 0, width: 344, height: 460 },
      { processId: 'child-2', parentProcessId: 'process-default', order: 1, width: 360 },
    ]);
    expect(store.getState().model.artifacts).toEqual(beforeArtifacts);
    expect(store.getState().model.layout.processViews![0].artifactPlacements).toEqual(beforePlacements);

    expect(store.getState().updateSubprocessColumnLayout('process-default', 'child-1', {
      height: null,
    })).toBe(true);
    expect(store.getState().model.layout.processViews![0].subprocessColumns[0]).not.toHaveProperty('height');
    expect(store.getState().updateSubprocessColumnLayout('process-default', 'child-1', {
      width: Number.NaN,
    })).toBe(false);
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().model.layout.processViews![0].subprocessColumns[0].height).toBe(460);
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().model.layout.processViews![0].subprocessColumns[0].width).toBe(360);
  });

  it('resizes a saved actor lane without moving its artifacts', () => {
    const model = makePrepModel();
    model.processActorLanes![0].height = 400;
    model.layout.processViews![0].artifactPlacements[0].offsetY = 170;
    model.layout.processViews![0].artifactPlacements[1].offsetY = 20;
    const store = createModelStore(model);
    const beforePlacements = structuredClone(model.layout.processViews![0].artifactPlacements);

    expect(store.getState().updateActorLaneHeight('process-default', 'actor-default', 100)).toBe(true);
    expect(store.getState().model.processActorLanes![0].height).toBe(310);
    expect(store.getState().model.layout.processViews![0].artifactPlacements).toEqual(beforePlacements);
    expect(store.getState().updateActorLaneHeight('process-default', 'actor-default', Number.NaN)).toBe(false);
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().model.processActorLanes![0].height).toBe(400);
  });

  it('materializes every derived lane and groups a resize gesture into one undo', () => {
    const model = makePrepModel();
    model.actors!.push({ id: 'actor-2', name: 'A2' });
    model.artifacts[1].responsibleActorId = 'actor-2';
    model.processActorLanes = [];
    model.layout.processViews![0].artifactPlacements.forEach((placement) => {
      placement.offsetY = 20;
    });
    const store = createModelStore(model);
    const beforeArtifacts = structuredClone(model.artifacts);
    const beforeLaneIds = getProcessGridGeometry(store.getState().model, 'process-default')
      .lanes.map((lane) => lane.id);

    store.getState().beginHistoryTransaction();
    expect(store.getState().updateActorLaneHeight('process-default', 'actor-default', 330)).toBe(true);
    expect(getProcessGridGeometry(store.getState().model, 'process-default')
      .lanes.map((lane) => lane.id)).toEqual(beforeLaneIds);
    expect(store.getState().updateActorLaneHeight('process-default', 'actor-default', 100)).toBe(true);
    expect(store.getState().endHistoryTransaction()).toBe(true);

    expect(store.getState().past).toHaveLength(1);
    expect(store.getState().model.processActorLanes).toMatchObject([
      { processId: 'process-default', actorId: 'actor-default', order: 0, height: 160 },
      { processId: 'process-default', actorId: 'actor-2', order: 1, height: 220 },
    ]);
    expect(store.getState().model.artifacts).toEqual(beforeArtifacts);
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().model.processActorLanes).toEqual([]);
    expect(store.getState().redo()).toBe(true);
    expect(store.getState().model.processActorLanes).toHaveLength(2);
  });

  it('falls back to a unique lane ID if a derived ID is already used', () => {
    const model = makePrepModel();
    model.processActorLanes = [];
    model.externalProcesses.push({
      id: 'derived-lane:process-default:actor-default',
      name: 'ID衝突',
    });
    model.layout.processViews![0].artifactPlacements.forEach((placement) => {
      placement.offsetY = 20;
    });
    const store = createModelStore(model);

    expect(store.getState().updateActorLaneHeight('process-default', 'actor-default', 330)).toBe(true);
    expect(store.getState().model.processActorLanes![0].id).toBe(
      'derived-lane:process-default:actor-default:2',
    );
  });

  it('limits growth of an earlier lane when a later artifact is in a manual box', () => {
    const model = makePrepModel();
    model.processes.push({
      id: 'child-1', parentProcessId: 'process-default', name: 'C1', goal: '',
    });
    model.actors!.push({ id: 'actor-2', name: 'A2' });
    model.processActorLanes!.push({
      id: 'lane-2', processId: 'process-default', actorId: 'actor-2', order: 1, height: 220,
    });
    model.artifacts[0].processId = 'child-1';
    model.artifacts[0].responsibleActorId = 'actor-2';
    model.layout.processViews![0].artifactPlacements.forEach((placement) => {
      placement.offsetY = 20;
    });
    model.layout.processViews![0].subprocessColumns.push({
      processId: 'child-1', parentProcessId: 'process-default', order: 0,
      width: 360, height: 400,
    });
    const store = createModelStore(model);
    const beforeArtifacts = structuredClone(model.artifacts);
    const beforePlacements = structuredClone(model.layout.processViews![0].artifactPlacements);

    expect(store.getState().updateActorLaneHeight('process-default', 'actor-default', 600)).toBe(true);
    expect(store.getState().model.processActorLanes![0].height).toBe(240);
    expect(store.getState().updateActorLaneHeight('process-default', 'actor-default', 600)).toBe(false);
    expect(store.getState().model.layout.processViews![0].subprocessColumns[0].height).toBe(400);
    expect(store.getState().model.artifacts).toEqual(beforeArtifacts);
    expect(store.getState().model.layout.processViews![0].artifactPlacements).toEqual(beforePlacements);
  });

  it('applies several layouts as one edit and stores node dimensions', () => {
    const store = createModelStore(fixtureModel());

    expect(
      store.getState().applyNodeLayouts([
        {
          id: 'artifact-1',
          x: 200,
          y: 220,
          width: 260,
          height: 140,
          parentId: 'process-1',
        },
        {
          id: 'artifact-2',
          x: 520,
          y: 220,
          width: 240,
          height: 130,
          parentId: 'process-1',
        },
      ]),
    ).toBe(true);

    expect(store.getState().past).toHaveLength(1);
    expect(
      store
        .getState()
        .model.layout.nodes.find(({ id }) => id === 'artifact-1'),
    ).toMatchObject({ x: 200, y: 220, width: 260, height: 140 });
  });

  it('stores viewport without noisy history or invalidating analysis results', () => {
    const store = createModelStore(fixtureModel());
    const validation = store.getState().validate();
    const trace = store.getState().traceAssurance('artifact-1');

    store.getState().setViewport({ x: -120, y: 60, zoom: 1.4 });

    expect(store.getState().model.layout.viewport).toEqual({
      x: -120,
      y: 60,
      zoom: 1.4,
    });
    expect(store.getState().past).toHaveLength(0);
    expect(store.getState().saveStatus).toBe('dirty');
    expect(store.getState().validationResult).toEqual(validation);
    expect(store.getState().assuranceTrace).toEqual(trace);
    expect(store.getState().viewMode).toBe('assurance');

    const currentModel = store.getState().model;
    store.getState().setViewport({ x: -120, y: 60, zoom: 1.4 });
    expect(store.getState().model).toBe(currentModel);
  });

  it('cascades process deletion to owned artifacts, relations and layout', () => {
    const store = createModelStore(fixtureModel());
    store.getState().setSelection([
      { type: 'process', id: 'process-1' },
      { type: 'artifact', id: 'artifact-1' },
      { type: 'relation', id: 'relation-1' },
    ]);

    expect(store.getState().deleteProcess('process-1')).toBe(true);

    expect(store.getState().model.processes).toHaveLength(0);
    expect(store.getState().model.artifacts).toHaveLength(0);
    expect(store.getState().model.relations).toHaveLength(0);
    expect(
      store
        .getState()
        .model.layout.nodes.map(({ id }) => id),
    ).toEqual(['external-1']);
    expect(store.getState().selection).toEqual([]);

    store.getState().undo();
    expect(store.getState().model.processes).toHaveLength(1);
    expect(store.getState().model.artifacts).toHaveLength(2);
    expect(store.getState().model.relations).toHaveLength(1);
  });

  it('manages current states and attributes without mutating sibling data', () => {
    const store = createModelStore(fixtureModel());

    expect(
      store.getState().addArtifactState('artifact-1', {
        id: 'state-2',
        name: '承認済み',
        isCurrent: false,
      }),
    ).toBe(true);
    expect(
      store
        .getState()
        .setCurrentArtifactState('artifact-1', 'state-2'),
    ).toBe(true);
    expect(
      store
        .getState()
        .model.artifacts[0].states.map(({ id, isCurrent }) => ({
          id,
          isCurrent,
        })),
    ).toEqual([
      { id: 'state-1', isCurrent: false },
      { id: 'state-2', isCurrent: true },
    ]);

    expect(
      store.getState().addArtifactAttribute('artifact-1', {
        id: 'attribute-1',
        key: '版',
        value: '1.0',
      }),
    ).toBe(true);
    expect(store.getState().model.artifacts[0].attributes).toEqual([
      { id: 'attribute-1', key: '版', value: '1.0' },
    ]);
    expect(store.getState().model.artifacts[1].attributes).toEqual([]);
  });

  it('reports relation constraints and rejects invalid additions', () => {
    const model = fixtureModel();
    const duplicate: PrepRelation = {
      ...clonePrepModel(model).relations[0],
      id: 'relation-2',
    };
    const duplicateWithAnotherSemanticType: PrepRelation = {
      ...duplicate,
      id: 'relation-4',
      semanticType: 'requires-revalidation-of',
    };
    const syncSelf: PrepRelation = {
      id: 'relation-3',
      sourceId: 'artifact-1',
      targetId: 'artifact-1',
      prepType: 'sync',
      risk: { level: 'none' },
    };

    expect(checkRelationConstraint(model, duplicate)).toEqual({
      canAdd: false,
      reason: 'duplicate-relation',
    });
    expect(
      checkRelationConstraint(model, duplicateWithAnotherSemanticType),
    ).toEqual({
      canAdd: false,
      reason: 'duplicate-relation',
    });
    expect(checkRelationConstraint(model, syncSelf)).toEqual({
      canAdd: false,
      reason: 'sync-self-connection',
    });

    const separateBranches = clonePrepModel(model);
    separateBranches.processes = [
      { id: 'root', name: '親', goal: '' },
      { id: 'branch-a', parentProcessId: 'root', name: '枝A', goal: '' },
      { id: 'leaf-a', parentProcessId: 'branch-a', name: '葉A', goal: '' },
      { id: 'branch-b', parentProcessId: 'root', name: '枝B', goal: '' },
      { id: 'leaf-b', parentProcessId: 'branch-b', name: '葉B', goal: '' },
    ];
    separateBranches.artifacts[0].processId = 'leaf-a';
    separateBranches.artifacts[1].processId = 'leaf-b';
    separateBranches.relations = [];
    expect(
      checkRelationConstraint(separateBranches, {
        ...duplicate,
        sourceId: separateBranches.artifacts[0].id,
        targetId: separateBranches.artifacts[1].id,
      }),
    ).toEqual({
      canAdd: false,
      reason: 'not-shared-detail-view',
    });

    const store = createModelStore(model);
    expect(store.getState().addRelation(duplicate)).toEqual({
      ok: false,
      reason: 'duplicate-relation',
    });
    expect(store.getState().addRelation(syncSelf)).toEqual({
      ok: false,
      reason: 'sync-self-connection',
    });
    expect(store.getState().model.relations).toHaveLength(1);
  });

  it('creates a process view for a newly added process at the default viewport', () => {
    const store = createModelStore(fixtureModel());
    expect(
      store.getState().addProcess({
        id: 'process-new',
        name: '新しいプロセス',
        goal: '',
      }),
    ).toBe(true);
    expect(
      store
        .getState()
        .model.layout.processViews?.some(
          (view) => view.processId === 'process-new',
        ),
    ).toBeFalsy();

    const defaultViewport = store.getState().model.layout.viewport;
    expect(
      store
        .getState()
        .setProcessViewport('process-new', defaultViewport),
    ).toBe(true);
    expect(
      store
        .getState()
        .model.layout.processViews?.find(
          (view) => view.processId === 'process-new',
        )?.viewport,
    ).toEqual(defaultViewport);
  });

  it('stores detail and overview viewports without moving model elements', () => {
    const store = createModelStore(makePrepModel());
    store.getState().setSelection([
      { type: 'artifact', id: 'artifact-source' },
    ]);
    const artifacts = structuredClone(store.getState().model.artifacts);
    const placements = structuredClone(
      store.getState().model.layout.processViews?.[0].artifactPlacements,
    );
    const overviewNodes = structuredClone(
      store.getState().model.layout.overview?.nodes,
    );
    const updatedAt = store.getState().model.metadata.updatedAt;

    expect(
      store.getState().setProcessViewport('process-default', {
        x: -180,
        y: 75,
        zoom: 1.3,
      }),
    ).toBe(true);
    expect(store.getState().model.layout.processViews?.[0].viewport).toEqual({
      x: -180,
      y: 75,
      zoom: 1.3,
    });
    expect(store.getState().model.layout.overview?.viewport).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });

    expect(
      store.getState().setOverviewViewport({
        x: 95,
        y: -140,
        zoom: 0.7,
      }),
    ).toBe(true);
    expect(store.getState().model.layout.overview?.viewport).toEqual({
      x: 95,
      y: -140,
      zoom: 0.7,
    });
    expect(store.getState().model.layout.processViews?.[0].viewport).toEqual({
      x: -180,
      y: 75,
      zoom: 1.3,
    });
    expect(store.getState().model.artifacts).toEqual(artifacts);
    expect(
      store.getState().model.layout.processViews?.[0].artifactPlacements,
    ).toEqual(placements);
    expect(store.getState().model.layout.overview?.nodes).toEqual(
      overviewNodes,
    );
    expect(store.getState().selection).toEqual([
      { type: 'artifact', id: 'artifact-source' },
    ]);
    expect(store.getState().model.metadata.updatedAt).toBe(updatedAt);
    expect(store.getState().past).toHaveLength(0);

    const currentModel = store.getState().model;
    expect(
      store.getState().setOverviewViewport({
        x: 95,
        y: -140,
        zoom: 0.7,
      }),
    ).toBe(false);
    expect(store.getState().model).toBe(currentModel);
  });

  it('runs validation and analyses, then invalidates stale results on edit', () => {
    const store = createModelStore(fixtureModel());

    expect(store.getState().validate().isValid).toBe(true);
    expect(store.getState().validationResult).not.toBeNull();

    const trace = store.getState().traceAssurance('artifact-1');
    expect(trace?.downstreamArtifactIds).toContain('artifact-2');
    expect(store.getState().viewMode).toBe('assurance');

    const impact = store.getState().analyzeImpact('artifact-1');
    expect(impact?.inferredArtifactIds).toContain('artifact-2');
    expect(store.getState().viewMode).toBe('impact');

    store.getState().updateSystem({ goal: '更新したゴール' });
    expect(store.getState().validationResult).toBeNull();
    expect(store.getState().assuranceTrace).toBeNull();
    expect(store.getState().impactAnalysis).toBeNull();
    expect(store.getState().viewMode).toBe('normal');
  });

  it('tracks focus and save state independently from edit history', () => {
    const store = createModelStore(fixtureModel());
    const request = store
      .getState()
      .requestFocus({ type: 'artifact', id: 'artifact-1' });
    store.getState().markSaving();
    store.getState().markSaved('2026-02-02T00:00:00.000Z');

    expect(store.getState().focusRequest).toEqual(request);
    expect(store.getState().saveStatus).toBe('saved');
    expect(store.getState().lastSavedAt).toBe(
      '2026-02-02T00:00:00.000Z',
    );
    expect(store.getState().past).toHaveLength(0);

    store.getState().clearFocusRequest(request.requestId);
    expect(store.getState().focusRequest).toBeNull();

    store.getState().markSaveError(new Error('容量不足'));
    expect(store.getState().saveStatus).toBe('error');
    expect(store.getState().saveError).toBe('容量不足');
  });
});
