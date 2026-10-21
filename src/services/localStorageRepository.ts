import type { PrepModelFile } from '../domain/model';
import {
  parsePrepModelJson,
  serializePrepModel,
} from './jsonFileService';
import {
  ModelRepositoryError,
  type ModelRepository,
  type ModelRepositoryOperation,
} from './modelRepository';

export const DEFAULT_MODEL_STORAGE_KEY =
  'prep-research-modeler:model:1.3.0';

export const LEGACY_MODEL_STORAGE_KEYS = [
  'prep-research-modeler:model:1.2.0',
  'prep-research-modeler:model:1.1.0',
  'prep-research-modeler:model:1.0.0',
] as const;

function browserStorage(operation: ModelRepositoryOperation): Storage {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('localStorage is unavailable');
    }

    return window.localStorage;
  } catch (cause) {
    throw new ModelRepositoryError(
      operation,
      'ブラウザの保存領域を利用できません',
      { cause },
    );
  }
}

export class LocalStorageModelRepository implements ModelRepository {
  readonly storageKey: string;
  private readonly providedStorage?: Storage;

  constructor(
    storage?: Storage,
    storageKey: string = DEFAULT_MODEL_STORAGE_KEY,
  ) {
    if (!storageKey.trim()) {
      throw new TypeError('storageKey must not be empty');
    }

    this.providedStorage = storage;
    this.storageKey = storageKey;
  }

  private storage(operation: ModelRepositoryOperation): Storage {
    return this.providedStorage ?? browserStorage(operation);
  }

  load(): PrepModelFile | null {
    let source: string | null;
    let loadedFromLegacyKey = false;

    try {
      const storage = this.storage('load');
      source = storage.getItem(this.storageKey);
      if (source === null && this.storageKey === DEFAULT_MODEL_STORAGE_KEY) {
        for (const key of LEGACY_MODEL_STORAGE_KEYS) {
          source = storage.getItem(key);
          if (source !== null) {
            loadedFromLegacyKey = true;
            break;
          }
        }
      }
    } catch (cause) {
      if (
        cause instanceof ModelRepositoryError &&
        cause.operation === 'load'
      ) {
        throw cause;
      }

      throw new ModelRepositoryError(
        'load',
        '自動保存されたモデルを読み込めませんでした',
        { cause },
      );
    }

    if (source === null) {
      return null;
    }

    try {
      const model = parsePrepModelJson(source);
      if (loadedFromLegacyKey) {
        this.save(model);
      }
      return model;
    } catch (cause) {
      throw new ModelRepositoryError(
        'load',
        '自動保存されたモデルの形式が正しくありません',
        { cause },
      );
    }
  }

  save(model: PrepModelFile): void {
    try {
      this.storage('save').setItem(
        this.storageKey,
        serializePrepModel(model),
      );
    } catch (cause) {
      if (
        cause instanceof ModelRepositoryError &&
        cause.operation === 'save'
      ) {
        throw cause;
      }

      throw new ModelRepositoryError(
        'save',
        'モデルをブラウザへ自動保存できませんでした',
        { cause },
      );
    }
  }

  clear(): void {
    try {
      this.storage('clear').removeItem(this.storageKey);
    } catch (cause) {
      if (
        cause instanceof ModelRepositoryError &&
        cause.operation === 'clear'
      ) {
        throw cause;
      }

      throw new ModelRepositoryError(
        'clear',
        '自動保存されたモデルを削除できませんでした',
        { cause },
      );
    }
  }
}

// Shorter name retained as a convenient adapter name for callers.
export { LocalStorageModelRepository as LocalStorageRepository };
