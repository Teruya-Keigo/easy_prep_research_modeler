import {
  PREP_SCHEMA_VERSION,
  type PrepModelFile,
  type PrepRelation,
} from '../domain/model';
import { noRisk, toIsoTimestamp } from './templateUtils';

const BREW_PROCESS_ID = 'process-brew-coffee';
const RECEIVE_PROCESS_ID = 'process-receive-coffee';
const PREPARATION_PROCESS_ID = 'process-coffee-preparation';
const EXTRACTION_PROCESS_ID = 'process-coffee-extraction';
const SERVING_PROCESS_ID = 'process-coffee-serving';

const BARISTA_ID = 'actor-coffee-barista';
const SERVER_ID = 'actor-coffee-server';

const relation = (
  id: string,
  sourceId: string,
  targetId: string,
): PrepRelation => ({
  id,
  sourceId,
  targetId,
  sourceAnchor: 'e',
  targetAnchor: 'w',
  prepType: 'input',
  risk: noRisk(),
});

export function createCoffeeProcessModel(
  now?: string | Date,
): PrepModelFile {
  const timestamp = toIsoTimestamp(now);

  return {
    schemaVersion: PREP_SCHEMA_VERSION,
    metadata: {
      modelId: 'model-coffee-process',
      modelName: 'コーヒー提供モデル',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    system: {
      id: 'system-coffee-service',
      name: 'コーヒー提供システム',
      goal: '要求品質を満たすコーヒーを提供する',
      phase: 'unspecified',
    },
    processes: [
      {
        id: BREW_PROCESS_ID,
        name: 'コーヒーを淹れる',
        goal: 'コーヒーの要求に合わせて提供用コーヒーを作る',
        leadActorId: BARISTA_ID,
      },
      {
        id: RECEIVE_PROCESS_ID,
        name: 'コーヒーを受け取る',
        goal: '提供用コーヒーを受け取り、利用者へ届ける',
        leadActorId: SERVER_ID,
      },
      {
        id: PREPARATION_PROCESS_ID,
        parentProcessId: BREW_PROCESS_ID,
        name: '準備',
        goal: '要求を確認し、抽出に必要な豆を準備する',
        leadActorId: BARISTA_ID,
      },
      {
        id: EXTRACTION_PROCESS_ID,
        parentProcessId: BREW_PROCESS_ID,
        name: '抽出',
        goal: '要求品質を満たすようコーヒーを抽出する',
        leadActorId: BARISTA_ID,
      },
      {
        id: SERVING_PROCESS_ID,
        parentProcessId: BREW_PROCESS_ID,
        name: '提供',
        goal: '抽出済みコーヒーを提供可能な状態にする',
        leadActorId: SERVER_ID,
      },
    ],
    actors: [
      {
        id: BARISTA_ID,
        name: 'バリスタ',
        description: '要求確認、豆の準備、抽出に責任を持つ。',
      },
      {
        id: SERVER_ID,
        name: '提供担当',
        description: '提供用コーヒーと受け渡しに責任を持つ。',
      },
    ],
    processActorLanes: [
      {
        id: 'lane-coffee-barista',
        processId: BREW_PROCESS_ID,
        actorId: BARISTA_ID,
        role: '調製担当',
        order: 0,
        height: 240,
      },
      {
        id: 'lane-coffee-server',
        processId: BREW_PROCESS_ID,
        actorId: SERVER_ID,
        role: '提供担当',
        order: 1,
        height: 240,
      },
    ],
    artifacts: [
      {
        id: 'artifact-coffee-request',
        processId: PREPARATION_PROCESS_ID,
        name: 'コーヒーの要求',
        type: 'intermediate',
        scope: 'external-input',
        description: '量、濃さ、温度などの要求。',
        states: [
          {
            id: 'state-coffee-request-received',
            name: '受付済み',
            isCurrent: true,
          },
        ],
        attributes: [],
        responsibleActorId: BARISTA_ID,
        risk: noRisk(),
      },
      {
        id: 'artifact-measured-beans',
        processId: PREPARATION_PROCESS_ID,
        name: '計量済みコーヒー豆',
        type: 'intermediate',
        scope: 'internal',
        states: [
          {
            id: 'state-beans-measured',
            name: '計量済み',
            isCurrent: true,
          },
        ],
        attributes: [],
        responsibleActorId: BARISTA_ID,
        risk: noRisk(),
      },
      {
        id: 'artifact-brewed-coffee',
        processId: EXTRACTION_PROCESS_ID,
        name: '抽出済みコーヒー',
        type: 'intermediate',
        scope: 'internal',
        states: [
          {
            id: 'state-coffee-brewed',
            name: '抽出済み',
            isCurrent: true,
          },
        ],
        attributes: [],
        responsibleActorId: BARISTA_ID,
        risk: noRisk(),
      },
      {
        id: 'artifact-serving-coffee',
        processId: SERVING_PROCESS_ID,
        name: '提供用コーヒー',
        type: 'final',
        scope: 'external-output',
        states: [
          {
            id: 'state-coffee-ready',
            name: '提供可能',
            isCurrent: true,
          },
        ],
        attributes: [],
        responsibleActorId: SERVER_ID,
        risk: noRisk(),
      },
    ],
    externalProcesses: [],
    relations: [
      relation(
        'relation-request-beans',
        'artifact-coffee-request',
        'artifact-measured-beans',
      ),
      relation(
        'relation-beans-brewed',
        'artifact-measured-beans',
        'artifact-brewed-coffee',
      ),
      relation(
        'relation-brewed-serving',
        'artifact-brewed-coffee',
        'artifact-serving-coffee',
      ),
    ],
    processHandoffs: [
      {
        id: 'handoff-coffee-to-receiver',
        sourceProcessId: BREW_PROCESS_ID,
        targetProcessId: RECEIVE_PROCESS_ID,
        sourceArtifactIds: ['artifact-serving-coffee'],
        targetArtifactIds: [],
        prepType: 'input',
        sourceAnchor: 'e',
        targetAnchor: 'w',
        description: '提供用コーヒーを受け取り側へ引き渡す。',
      },
    ],
    layout: {
      nodes: [
        {
          id: BREW_PROCESS_ID,
          x: 60,
          y: 60,
          width: 1040,
          height: 620,
        },
        {
          id: RECEIVE_PROCESS_ID,
          x: 1240,
          y: 260,
          width: 260,
          height: 180,
        },
        {
          id: PREPARATION_PROCESS_ID,
          parentId: BREW_PROCESS_ID,
          x: 40,
          y: 100,
          width: 300,
          height: 440,
        },
        {
          id: EXTRACTION_PROCESS_ID,
          parentId: BREW_PROCESS_ID,
          x: 370,
          y: 100,
          width: 300,
          height: 440,
        },
        {
          id: SERVING_PROCESS_ID,
          parentId: BREW_PROCESS_ID,
          x: 700,
          y: 100,
          width: 300,
          height: 440,
        },
        {
          id: 'artifact-coffee-request',
          parentId: PREPARATION_PROCESS_ID,
          x: 24,
          y: 100,
        },
        {
          id: 'artifact-measured-beans',
          parentId: PREPARATION_PROCESS_ID,
          x: 24,
          y: 290,
        },
        {
          id: 'artifact-brewed-coffee',
          parentId: EXTRACTION_PROCESS_ID,
          x: 24,
          y: 100,
        },
        {
          id: 'artifact-serving-coffee',
          parentId: SERVING_PROCESS_ID,
          x: 24,
          y: 290,
        },
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
      processViews: [
        {
          processId: BREW_PROCESS_ID,
          artifactPlacements: [
            {
              artifactId: 'artifact-coffee-request',
              offsetX: 24,
              offsetY: 24,
            },
            {
              artifactId: 'artifact-measured-beans',
              offsetX: 24,
              offsetY: 180,
            },
            {
              artifactId: 'artifact-brewed-coffee',
              offsetX: 24,
              offsetY: 24,
            },
            {
              artifactId: 'artifact-serving-coffee',
              offsetX: 24,
              offsetY: 24,
            },
          ],
          subprocessColumns: [
            {
              processId: PREPARATION_PROCESS_ID,
              parentProcessId: BREW_PROCESS_ID,
              order: 0,
              width: 320,
            },
            {
              processId: EXTRACTION_PROCESS_ID,
              parentProcessId: BREW_PROCESS_ID,
              order: 1,
              width: 320,
            },
            {
              processId: SERVING_PROCESS_ID,
              parentProcessId: BREW_PROCESS_ID,
              order: 2,
              width: 320,
            },
          ],
          viewport: { x: 0, y: 0, zoom: 0.9 },
        },
        {
          processId: RECEIVE_PROCESS_ID,
          artifactPlacements: [],
          subprocessColumns: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        {
          processId: PREPARATION_PROCESS_ID,
          artifactPlacements: [
            {
              artifactId: 'artifact-coffee-request',
              offsetX: 24,
              offsetY: 24,
            },
            {
              artifactId: 'artifact-measured-beans',
              offsetX: 250,
              offsetY: 24,
            },
          ],
          subprocessColumns: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        {
          processId: EXTRACTION_PROCESS_ID,
          artifactPlacements: [
            {
              artifactId: 'artifact-brewed-coffee',
              offsetX: 24,
              offsetY: 24,
            },
          ],
          subprocessColumns: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        {
          processId: SERVING_PROCESS_ID,
          artifactPlacements: [
            {
              artifactId: 'artifact-serving-coffee',
              offsetX: 24,
              offsetY: 24,
            },
          ],
          subprocessColumns: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      ],
      overview: {
        nodes: [
          {
            id: BREW_PROCESS_ID,
            kind: 'process',
            x: 120,
            y: 180,
          },
          {
            id: RECEIVE_PROCESS_ID,
            kind: 'process',
            x: 520,
            y: 180,
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      lastView: { mode: 'overview' },
    },
  };
}

export const createCoffeeProcessTemplate = createCoffeeProcessModel;
