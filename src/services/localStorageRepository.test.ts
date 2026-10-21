import { describe, expect, it, vi } from 'vitest';
import type { PrepModelFile } from '../domain/model';
import { makePrepModel } from '../test/fixtures';
import { PrepModelJsonError } from './jsonFileService';
import {
  DEFAULT_MODEL_STORAGE_KEY,
  LEGACY_MODEL_STORAGE_KEYS,
  LocalStorageModelRepository,
  LocalStorageRepository,
} from './localStorageRepository';
import { ModelRepositoryError } from './modelRepository';

const modelFixture = (): PrepModelFile =>
  makePrepModel({
    metadata: {
      modelId: 'model-1',
      modelName: '自動保存モデル',
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:01:00.000Z',
    },
  });

function storageDouble(
  initial: Record<string, string> = {},
): Storage {
  const values = new Map(Object.entries(initial));

  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn(
      (index: number) => [...values.keys()][index] ?? null,
    ),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

describe('LocalStorageModelRepository', () => {
  it('saves and restores a complete PrepModelFile snapshot', () => {
    const storage = storageDouble();
    const repository = new LocalStorageModelRepository(storage);
    const model = modelFixture();

    repository.save(model);

    expect(storage.setItem).toHaveBeenCalledWith(
      DEFAULT_MODEL_STORAGE_KEY,
      expect.stringContaining('"schemaVersion": "1.3.0"'),
    );
    expect(repository.load()).toEqual(model);
  });

  it('loads a v1.2 autosave and writes it under the v1.3 key', () => {
    const previous = { ...modelFixture(), schemaVersion: '1.2.0' as const };
    const storage = storageDouble({
      [LEGACY_MODEL_STORAGE_KEYS[0]]: JSON.stringify(previous),
    });
    const repository = new LocalStorageModelRepository(storage);

    const restored = repository.load();

    expect(restored?.schemaVersion).toBe('1.3.0');
    expect(storage.getItem(DEFAULT_MODEL_STORAGE_KEY)).toContain(
      '"schemaVersion": "1.3.0"',
    );
    expect(storage.getItem(LEGACY_MODEL_STORAGE_KEYS[0])).not.toBeNull();
  });

  it('returns null when no autosave exists', () => {
    const repository = new LocalStorageModelRepository(storageDouble());

    expect(repository.load()).toBeNull();
  });

  it('removes only its configured key', () => {
    const storage = storageDouble({
      model: 'saved',
      unrelated: 'keep',
    });
    const repository = new LocalStorageModelRepository(storage, 'model');

    repository.clear();

    expect(storage.getItem('model')).toBeNull();
    expect(storage.getItem('unrelated')).toBe('keep');
  });

  it('wraps corrupt persisted JSON without replacing or clearing it', () => {
    const storage = storageDouble({ model: '{' });
    const repository = new LocalStorageModelRepository(storage, 'model');

    let received: unknown;
    try {
      repository.load();
    } catch (error) {
      received = error;
    }

    expect(received).toBeInstanceOf(ModelRepositoryError);
    expect(received).toMatchObject({ operation: 'load' });
    expect((received as ModelRepositoryError).cause).toBeInstanceOf(
      PrepModelJsonError,
    );
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('wraps browser quota/security failures with the operation', () => {
    const cause = new DOMException('quota', 'QuotaExceededError');
    const storage = storageDouble();
    vi.mocked(storage.setItem).mockImplementation(() => {
      throw cause;
    });
    const repository = new LocalStorageModelRepository(storage);

    expect(() => repository.save(modelFixture())).toThrowError(
      expect.objectContaining({
        operation: 'save',
        cause,
      }),
    );
  });

  it('exports the convenient LocalStorageRepository class alias', () => {
    const repository = new LocalStorageRepository(storageDouble());

    expect(repository).toBeInstanceOf(LocalStorageModelRepository);
  });
});
