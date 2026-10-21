import { describe, expect, it } from 'vitest';
import type { PrepModelFile } from '../domain/model';
import {
  DEFAULT_AUTO_LAYOUT_OPTIONS,
  autoLayoutModel,
  layoutPrepModel,
} from './autoLayoutService';

const artifact = (
  id: string,
  processId?: string,
): PrepModelFile['artifacts'][number] => ({
  id,
  ...(processId ? { processId } : {}),
  name: id,
  type: 'intermediate',
  scope: 'internal',
  states: [],
  attributes: [],
  risk: { level: 'none' },
});

const modelFixture = (): PrepModelFile => ({
  schemaVersion: '1.0.0',
  metadata: {
    modelId: 'model-1',
    modelName: '整列テスト',
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
  },
  system: {
    id: 'system-1',
    name: 'システム',
    goal: 'ゴール',
    phase: 'unspecified',
  },
  processes: [
    {
      id: 'process-1',
      name: 'プロセス',
      goal: '成果物を作る',
    },
  ],
  artifacts: [
    artifact('a', 'process-1'),
    artifact('b', 'process-1'),
    artifact('root'),
  ],
  externalProcesses: [{ id: 'external', name: '外部プロセス' }],
  relations: [
    {
      id: 'r-internal',
      sourceId: 'a',
      targetId: 'b',
      prepType: 'input',
      risk: { level: 'none' },
    },
    {
      id: 'r-cross',
      sourceId: 'b',
      targetId: 'external',
      prepType: 'input',
      risk: { level: 'none' },
    },
  ],
  layout: {
    nodes: [
      { id: 'process-1', x: 900, y: 700 },
      { id: 'a', x: 800, y: 600, parentId: 'process-1' },
      { id: 'b', x: 700, y: 500, parentId: 'process-1' },
      { id: 'root', x: 600, y: 400, width: 300, height: 120 },
      { id: 'future-node', x: 11, y: 12 },
    ],
    viewport: { x: 33, y: 44, zoom: 0.75 },
  },
});

const node = (model: PrepModelFile, id: string) => {
  const result = model.layout.nodes.find((layout) => layout.id === id);
  if (!result) {
    throw new Error(`Missing layout for ${id}`);
  }
  return result;
};

describe('autoLayoutService', () => {
  it('uses Dagre direction to order connected child artifacts', () => {
    const original = modelFixture();
    const before = structuredClone(original);

    const laidOut = layoutPrepModel(original, { direction: 'LR' });

    expect(node(laidOut, 'a').x).toBeLessThan(node(laidOut, 'b').x);
    expect(node(laidOut, 'a').parentId).toBe('process-1');
    expect(node(laidOut, 'b').parentId).toBe('process-1');
    expect(original).toEqual(before);
  });

  it('keeps child nodes inside the dynamically sized process container', () => {
    const laidOut = layoutPrepModel(modelFixture());
    const process = node(laidOut, 'process-1');

    for (const childId of ['a', 'b']) {
      const child = node(laidOut, childId);
      expect(child.x).toBeGreaterThanOrEqual(0);
      expect(child.y).toBeGreaterThanOrEqual(
        DEFAULT_AUTO_LAYOUT_OPTIONS.processHeaderHeight,
      );
      expect(child.x + (child.width ?? 0)).toBeLessThan(process.width ?? 0);
      expect(child.y + (child.height ?? 0)).toBeLessThan(
        process.height ?? 0,
      );
    }
  });

  it('lays out top-level containers along cross-process relations', () => {
    const laidOut = layoutPrepModel(modelFixture(), { direction: 'LR' });

    expect(node(laidOut, 'process-1').x).toBeLessThan(
      node(laidOut, 'external').x,
    );
    expect(node(laidOut, 'root').parentId).toBeUndefined();
  });

  it('supports top-to-bottom layout and creates missing layout entries', () => {
    const model = modelFixture();
    model.layout.nodes = model.layout.nodes.filter(
      (layout) => layout.id !== 'external',
    );

    const laidOut = autoLayoutModel(model, { direction: 'TB' });

    expect(node(laidOut, 'process-1').y).toBeLessThan(
      node(laidOut, 'external').y,
    );
    expect(node(laidOut, 'external').width).toBe(
      DEFAULT_AUTO_LAYOUT_OPTIONS.externalProcessWidth,
    );
  });

  it('honors existing node dimensions and preserves viewport/unknown nodes', () => {
    const model = modelFixture();

    const laidOut = layoutPrepModel(model);

    expect(node(laidOut, 'root')).toMatchObject({
      width: 300,
      height: 120,
    });
    expect(node(laidOut, 'future-node')).toEqual({
      id: 'future-node',
      x: 11,
      y: 12,
    });
    expect(laidOut.layout.viewport).toEqual(model.layout.viewport);
    expect(laidOut.layout.viewport).not.toBe(model.layout.viewport);
  });
});
