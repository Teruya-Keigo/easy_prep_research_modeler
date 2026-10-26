import { describe, expect, it } from 'vitest';

import type { PrepModelFile } from './model';
import {
  getActorLaneMaximumHeight,
  getActorLaneMinimumHeight,
  getProcessGridGeometry,
  getSubprocessColumnMinimumSize,
  moveArtifactToCell,
  moveArtifactToGridPoint,
} from './processGrid';

function modelFixture(): PrepModelFile {
  return {
    schemaVersion: '1.3.0',
    metadata: {
      modelId: 'm',
      modelName: 'M',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    system: { id: 's', name: 'S', goal: 'S', phase: 'unspecified' },
    processes: [
      { id: 'p', name: 'P', goal: 'P' },
      { id: 'c1', parentProcessId: 'p', name: 'C1', goal: 'C1' },
      { id: 'c2', parentProcessId: 'p', name: 'C2', goal: 'C2' },
    ],
    actors: [
      { id: 'a1', name: 'A1' },
      { id: 'a2', name: 'A2' },
    ],
    processActorLanes: [
      {
        id: 'l2',
        processId: 'p',
        actorId: 'a2',
        order: 1,
        height: 240,
      },
      {
        id: 'l1',
        processId: 'p',
        actorId: 'a1',
        order: 0,
        height: 200,
      },
    ],
    artifacts: [
      {
        id: 'x',
        processId: 'c1',
        responsibleActorId: 'a1',
        name: 'X',
        type: 'intermediate',
        scope: 'internal',
        states: [],
        attributes: [],
        risk: { level: 'none' },
      },
    ],
    externalProcesses: [],
    relations: [],
    processHandoffs: [],
    layout: {
      nodes: [{ id: 'x', x: 10, y: 20, parentId: 'c1' }],
      viewport: { x: 0, y: 0, zoom: 1 },
      processViews: [
        {
          processId: 'p',
          artifactPlacements: [
            { artifactId: 'x', offsetX: 10, offsetY: 20 },
          ],
          subprocessColumns: [
            { processId: 'c2', parentProcessId: 'p', order: 1, width: 400 },
            { processId: 'c1', parentProcessId: 'p', order: 0, width: 300 },
          ],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      ],
      overview: { nodes: [], viewport: { x: 0, y: 0, zoom: 1 } },
    },
  };
}

describe('process grid', () => {
  it('calculates deterministic lane x column rectangles', () => {
    const geometry = getProcessGridGeometry(modelFixture(), 'p');
    expect(geometry.lanes.map((lane) => lane.actorId)).toEqual(['a1', 'a2']);
    expect(geometry.columns.map((column) => column.processId)).toEqual([
      'c1',
      'c2',
    ]);
    expect(geometry.cells[0].rect).toEqual({
      x: 200,
      y: 80,
      width: 300,
      height: 200,
    });
    expect(geometry.totalWidth).toBe(900);
    expect(geometry.totalHeight).toBe(520);
  });

  it('updates actor, process and relative placement together', () => {
    const model = modelFixture();
    const target = getProcessGridGeometry(model, 'p').cells.find(
      (cell) => cell.actorId === 'a2' && cell.processId === 'c2',
    );
    expect(target).toBeDefined();
    const moved = moveArtifactToCell(model, 'x', target!, {
      offsetX: 25,
      offsetY: 30,
    });
    expect(moved.artifacts[0]).toMatchObject({
      processId: 'c2',
      responsibleActorId: 'a2',
    });
    expect(moved.layout.processViews?.[0].artifactPlacements[0]).toEqual({
      artifactId: 'x',
      offsetX: 25,
      offsetY: 30,
    });
  });

  it('rejects a drop outside every cell', () => {
    const model = modelFixture();
    expect(moveArtifactToGridPoint(model, 'p', 'x', { x: 10, y: 10 })).toBe(
      model,
    );
  });

  it('resolves auto and manual box heights independently and clips placement cells', () => {
    const model = modelFixture();
    model.layout.processViews![0].subprocessColumns[0].height = 520;
    model.layout.processViews![0].subprocessColumns[1].height = 210;
    model.layout.processViews![0].subprocessColumns[1].width = 500;

    const geometry = getProcessGridGeometry(model, 'p');
    expect(geometry.columns.map(({ processId, x, width, height, autoHeight, rect }) => ({
      processId, x, width, height, autoHeight, rect,
    }))).toEqual([
      {
        processId: 'c1', x: 200, width: 500, height: 210,
        autoHeight: false, rect: { x: 200, y: 80, width: 500, height: 210 },
      },
      {
        processId: 'c2', x: 700, width: 400, height: 520,
        autoHeight: false, rect: { x: 700, y: 80, width: 400, height: 520 },
      },
    ]);
    expect(geometry.cells.find((cell) => cell.actorId === 'a2' && cell.processId === 'c1')?.height).toBe(10);
    expect(geometry.totalHeight).toBe(600);

    delete model.layout.processViews![0].subprocessColumns[1].height;
    expect(getProcessGridGeometry(model, 'p').columns[0]).toMatchObject({
      height: 440,
      autoHeight: true,
    });
    model.processActorLanes![0].height = 300;
    expect(getProcessGridGeometry(model, 'p').columns[0].height).toBe(500);
  });

  it('calculates shrink limits from artifact outer edges plus 24px', () => {
    const model = modelFixture();
    model.layout.processViews![0].artifactPlacements[0] = {
      artifactId: 'x', offsetX: 340, offsetY: 100,
    };
    model.artifacts[0].responsibleActorId = 'a2';
    model.layout.nodes[0].width = 210;
    model.layout.nodes[0].height = 120;

    expect(getSubprocessColumnMinimumSize(model, 'p', 'c1')).toEqual({
      width: 574,
      height: 444,
    });
    expect(getSubprocessColumnMinimumSize(model, 'p', 'c2')).toEqual({
      width: 260,
      height: 160,
    });
  });

  it('calculates each actor lane shrink limit from its own artifact edges', () => {
    const model = modelFixture();
    model.layout.processViews![0].artifactPlacements[0].offsetY = 130;
    model.layout.nodes[0].height = 120;

    expect(getActorLaneMinimumHeight(model, 'p', 'a1')).toBe(274);
    expect(getActorLaneMinimumHeight(model, 'p', 'a2')).toBe(160);
    expect(getActorLaneMinimumHeight(model, 'p', 'missing')).toBe(160);
  });

  it('caps an earlier lane so later artifacts remain inside manual-height boxes', () => {
    const model = modelFixture();
    model.artifacts[0].responsibleActorId = 'a2';
    model.layout.processViews![0].artifactPlacements[0].offsetY = 100;
    model.layout.nodes[0].height = 120;
    model.layout.processViews![0].subprocessColumns[1].height = 500;

    expect(getActorLaneMaximumHeight(model, 'p', 'a1')).toBe(256);
    expect(getActorLaneMaximumHeight(model, 'p', 'a2')).toBe(Number.POSITIVE_INFINITY);

    delete model.layout.processViews![0].subprocessColumns[1].height;
    expect(getActorLaneMaximumHeight(model, 'p', 'a1')).toBe(Number.POSITIVE_INFINITY);
  });
});
