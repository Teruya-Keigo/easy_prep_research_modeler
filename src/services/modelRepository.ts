import type { PrepModelFile } from '../domain/model';

/**
 * Autosave is intentionally configured outside of a repository. Repositories
 * only persist complete PrepModelFile snapshots, which keeps them usable from
 * both debounced browser stores and future non-browser adapters.
 */
export const AUTOSAVE_DELAY_MS = 1_200;

export interface ModelRepository {
  load(): PrepModelFile | null;
  save(model: PrepModelFile): void;
  clear(): void;
}

export type AutosaveStatus =
  | 'idle'
  | 'scheduled'
  | 'saving'
  | 'saved'
  | 'error';

export interface DebouncedModelSaverOptions {
  delayMs?: number;
  onStatusChange?: (status: AutosaveStatus, error?: unknown) => void;
}

export interface DebouncedModelSaver {
  schedule(model: PrepModelFile): void;
  /**
   * Immediately persists a pending snapshot. Errors are reported and rethrown
   * so an explicit save action can react to them.
   */
  flush(): void;
  cancel(): void;
  dispose(): void;
  isPending(): boolean;
}

export type ModelRepositoryOperation = 'load' | 'save' | 'clear';

export class ModelRepositoryError extends Error {
  readonly operation: ModelRepositoryOperation;

  constructor(
    operation: ModelRepositoryOperation,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ModelRepositoryError';
    this.operation = operation;
  }
}

function cloneModel(model: PrepModelFile): PrepModelFile {
  if (typeof structuredClone === 'function') {
    return structuredClone(model);
  }

  return JSON.parse(JSON.stringify(model)) as PrepModelFile;
}

/**
 * Coalesces rapid edits and saves only the newest complete PrepModelFile.
 * Timer-triggered failures are delivered through onStatusChange instead of
 * becoming uncaught asynchronous errors. `flush()` still rethrows failures.
 */
export function createDebouncedModelSaver(
  repository: ModelRepository,
  options: DebouncedModelSaverOptions = {},
): DebouncedModelSaver {
  const delayMs = options.delayMs ?? AUTOSAVE_DELAY_MS;
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new RangeError('delayMs must be a non-negative finite number');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingModel: PrepModelFile | undefined;
  let disposed = false;

  const emit = (status: AutosaveStatus, error?: unknown) => {
    options.onStatusChange?.(status, error);
  };

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const persist = (rethrow: boolean) => {
    clearTimer();
    const model = pendingModel;
    pendingModel = undefined;

    if (!model) {
      return;
    }

    emit('saving');
    try {
      repository.save(model);
      emit('saved');
    } catch (error) {
      emit('error', error);
      if (rethrow) {
        throw error;
      }
    }
  };

  return {
    schedule(model) {
      if (disposed) {
        throw new Error('The debounced model saver has been disposed');
      }

      clearTimer();
      pendingModel = cloneModel(model);
      emit('scheduled');
      timer = setTimeout(() => persist(false), delayMs);
    },

    flush() {
      if (disposed) {
        return;
      }

      persist(true);
    },

    cancel() {
      clearTimer();
      pendingModel = undefined;
      if (!disposed) {
        emit('idle');
      }
    },

    dispose() {
      if (disposed) {
        return;
      }

      clearTimer();
      pendingModel = undefined;
      disposed = true;
      emit('idle');
    },

    isPending() {
      return pendingModel !== undefined;
    },
  };
}
