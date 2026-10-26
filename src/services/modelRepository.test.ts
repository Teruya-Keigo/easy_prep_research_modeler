import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrepModelFile } from '../domain/model';
import {
  AUTOSAVE_DELAY_MS,
  ModelRepositoryError,
  createDebouncedModelSaver,
  type ModelRepository,
} from './modelRepository';

const modelFixture = (modelName: string): PrepModelFile => ({
  schemaVersion: '1.0.0',
  metadata: {
    modelId: 'model-1',
    modelName,
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
  },
  system: {
    id: 'system-1',
    name: 'システム',
    goal: 'ゴール',
    phase: 'unspecified',
  },
  processes: [],
  artifacts: [],
  externalProcesses: [],
  relations: [],
  layout: {
    nodes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
});

describe('ModelRepository contract', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the specified 1.2 second autosave delay', () => {
    expect(AUTOSAVE_DELAY_MS).toBe(1_200);
  });

  it('supports complete model snapshot operations', () => {
    const methodNames: Array<keyof ModelRepository> = ['load', 'save', 'clear'];

    expect(methodNames).toEqual(['load', 'save', 'clear']);
  });

  it('retains the failed operation and cause in repository errors', () => {
    const cause = new Error('quota exceeded');
    const error = new ModelRepositoryError('save', '保存できませんでした', {
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ModelRepositoryError');
    expect(error.operation).toBe('save');
    expect(error.cause).toBe(cause);
  });

  it('debounces rapid edits for 1.2 seconds and saves only the latest snapshot', () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const repository: ModelRepository = {
      load: () => null,
      save,
      clear: vi.fn(),
    };
    const statuses: string[] = [];
    const saver = createDebouncedModelSaver(repository, {
      onStatusChange: (status) => statuses.push(status),
    });

    saver.schedule(modelFixture('first'));
    vi.advanceTimersByTime(1_000);
    saver.schedule(modelFixture('latest'));
    vi.advanceTimersByTime(1_199);

    expect(save).not.toHaveBeenCalled();
    expect(saver.isPending()).toBe(true);

    vi.advanceTimersByTime(1);

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ modelName: 'latest' }),
      }),
    );
    expect(statuses).toEqual([
      'scheduled',
      'scheduled',
      'saving',
      'saved',
    ]);
    expect(saver.isPending()).toBe(false);
  });

  it('captures the model at schedule time instead of retaining a mutable reference', () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const repository: ModelRepository = {
      load: () => null,
      save,
      clear: vi.fn(),
    };
    const model = modelFixture('scheduled');
    const saver = createDebouncedModelSaver(repository);

    saver.schedule(model);
    model.metadata.modelName = 'mutated later';
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);

    expect(save.mock.calls[0]?.[0].metadata.modelName).toBe('scheduled');
  });

  it('can flush, cancel, and dispose pending saves', () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const repository: ModelRepository = {
      load: () => null,
      save,
      clear: vi.fn(),
    };
    const saver = createDebouncedModelSaver(repository);

    saver.schedule(modelFixture('flush'));
    saver.flush();
    expect(save).toHaveBeenCalledOnce();

    saver.schedule(modelFixture('cancel'));
    saver.cancel();
    vi.runAllTimers();
    expect(save).toHaveBeenCalledOnce();

    saver.schedule(modelFixture('dispose'));
    saver.dispose();
    vi.runAllTimers();
    expect(save).toHaveBeenCalledOnce();
    expect(() => saver.schedule(modelFixture('too late'))).toThrow(
      /disposed/,
    );
  });

  it('reports timer failures and rethrows explicit flush failures', () => {
    vi.useFakeTimers();
    const failure = new Error('quota');
    const repository: ModelRepository = {
      load: () => null,
      save: vi.fn(() => {
        throw failure;
      }),
      clear: vi.fn(),
    };
    const onStatusChange = vi.fn();
    const saver = createDebouncedModelSaver(repository, {
      onStatusChange,
    });

    saver.schedule(modelFixture('timer'));
    expect(() => vi.runAllTimers()).not.toThrow();
    expect(onStatusChange).toHaveBeenLastCalledWith('error', failure);

    saver.schedule(modelFixture('flush'));
    expect(() => saver.flush()).toThrow(failure);
  });
});
