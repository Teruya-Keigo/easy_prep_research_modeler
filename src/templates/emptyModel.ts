import {
  PREP_SCHEMA_VERSION,
  type PrepModelFile,
} from '../domain/model';
import { toIsoTimestamp } from './templateUtils';

/**
 * Starts with the required system fields and one intentionally blank process.
 * Missing content remains visible to domain validation rather than being
 * silently invented.
 */
export function createEmptyModel(now?: string | Date): PrepModelFile {
  const timestamp = toIsoTimestamp(now);
  const processId = 'process-empty';

  return {
    schemaVersion: PREP_SCHEMA_VERSION,
    metadata: {
      modelId: 'model-empty',
      modelName: '名称未設定のモデル',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    system: {
      id: 'system-empty',
      name: '',
      goal: '',
      phase: 'unspecified',
    },
    processes: [
      {
        id: processId,
        name: '',
        goal: '',
      },
    ],
    actors: [],
    processActorLanes: [],
    artifacts: [],
    externalProcesses: [],
    relations: [],
    processHandoffs: [],
    layout: {
      nodes: [
        {
          id: processId,
          x: 80,
          y: 80,
          width: 720,
          height: 480,
        },
      ],
      viewport: {
        x: 0,
        y: 0,
        zoom: 1,
      },
      processViews: [
        {
          processId,
          artifactPlacements: [],
          subprocessColumns: [],
          viewport: {
            x: 0,
            y: 0,
            zoom: 1,
          },
        },
      ],
      overview: {
        nodes: [
          {
            id: processId,
            kind: 'process',
            x: 80,
            y: 80,
          },
        ],
        viewport: {
          x: 0,
          y: 0,
          zoom: 1,
        },
      },
      lastView: {
        mode: 'process',
        activeProcessId: processId,
      },
    },
  };
}

export const createEmptyModelTemplate = createEmptyModel;
