import {
  PREP_SCHEMA_VERSION,
  type PrepActor,
  type PrepArtifact,
  type PrepModelFile,
  type PrepRelation,
} from '../domain/model';
import { noRisk, toIsoTimestamp } from './templateUtils';

const PROCESS_ID = 'process-mlc-test-design';
const GENERATION_PROCESS_ID = 'process-mlc-test-case-generation';
const EVALUATION_PROCESS_ID = 'process-mlc-evaluation-handover';

const RESEARCH_LEAD_ID = 'actor-mlc-research-lead';
const TEST_DESIGNER_ID = 'actor-mlc-test-designer';
const EVALUATOR_ID = 'actor-mlc-evaluator';

const actors = (): PrepActor[] => [
  {
    id: RESEARCH_LEAD_ID,
    name: '研究責任者',
    description: '要求、リスク、および引継ぎ判断に責任を持つ。',
  },
  {
    id: TEST_DESIGNER_ID,
    name: 'テスト設計者',
    description: '制約とテストケースの設計に責任を持つ。',
  },
  {
    id: EVALUATOR_ID,
    name: '評価担当者',
    description: '評価基準と評価結果に責任を持つ。',
  },
];

const artifacts = (): PrepArtifact[] => [
  {
    id: 'artifact-reliability-requirements',
    processId: GENERATION_PROCESS_ID,
    name: '信頼性要求',
    type: 'intermediate',
    scope: 'external-input',
    description: '対象システムに求める信頼性と許容できる失敗を定義する。',
    states: [
      {
        id: 'state-reliability-defined',
        name: '定義済み',
        isCurrent: true,
      },
    ],
    attributes: [],
    responsibleActorId: RESEARCH_LEAD_ID,
    risk: noRisk(),
  },
  {
    id: 'artifact-constraint-definition',
    processId: GENERATION_PROCESS_ID,
    name: '制約定義',
    type: 'intermediate',
    scope: 'internal',
    description: 'ラベル間の依存、排他、包含などの制約を定義する。',
    states: [
      {
        id: 'state-constraint-defined',
        name: '定義済み',
        isCurrent: true,
      },
    ],
    attributes: [],
    responsibleActorId: TEST_DESIGNER_ID,
    risk: noRisk(),
  },
  {
    id: 'artifact-risk-scenarios',
    processId: GENERATION_PROCESS_ID,
    name: 'リスクシナリオ',
    type: 'intangible',
    scope: 'internal',
    description: '制約違反や誤分類によって生じうる利用上の失敗を整理する。',
    states: [
      {
        id: 'state-risk-scenarios-identified',
        name: '識別済み',
        isCurrent: true,
      },
    ],
    attributes: [],
    responsibleActorId: RESEARCH_LEAD_ID,
    risk: {
      level: 'medium',
      description: '見落としたシナリオがテスト設計から漏れる可能性がある。',
    },
  },
  {
    id: 'artifact-test-cases',
    processId: GENERATION_PROCESS_ID,
    name: 'テストケース集合',
    type: 'intermediate',
    scope: 'internal',
    description: '要求、制約、リスクを確認するためのテストケースをまとめる。',
    states: [
      {
        id: 'state-test-cases-designed',
        name: '設計済み',
        isCurrent: true,
      },
    ],
    attributes: [],
    responsibleActorId: TEST_DESIGNER_ID,
    risk: noRisk(),
  },
  {
    id: 'artifact-evaluation-criteria',
    processId: EVALUATION_PROCESS_ID,
    name: '評価基準',
    type: 'milestone',
    scope: 'internal',
    description: 'テスト結果を合否および信頼性の観点で判定する基準を定める。',
    states: [
      {
        id: 'state-evaluation-criteria-approved',
        name: '確認可能',
        isCurrent: true,
      },
    ],
    attributes: [],
    responsibleActorId: EVALUATOR_ID,
    risk: noRisk(),
  },
  {
    id: 'artifact-evaluation-results',
    processId: EVALUATION_PROCESS_ID,
    name: '評価結果',
    type: 'intermediate',
    scope: 'internal',
    description: '評価基準に照らしたテスト結果と根拠を記録する。',
    states: [
      {
        id: 'state-evaluation-results-recorded',
        name: '記録済み',
        isCurrent: true,
      },
    ],
    attributes: [],
    responsibleActorId: EVALUATOR_ID,
    risk: noRisk(),
  },
  {
    id: 'artifact-residual-risk-assessment',
    processId: EVALUATION_PROCESS_ID,
    name: '残余リスク評価',
    type: 'milestone',
    scope: 'internal',
    description: '評価後に残るリスクと受容可否を確認する。',
    states: [
      {
        id: 'state-residual-risk-assessed',
        name: '評価済み',
        isCurrent: true,
      },
    ],
    attributes: [],
    responsibleActorId: RESEARCH_LEAD_ID,
    risk: noRisk(),
  },
  {
    id: 'artifact-handover-conditions',
    processId: EVALUATION_PROCESS_ID,
    name: '引継ぎ条件',
    type: 'final',
    scope: 'external-output',
    description: '後続工程へ引き継ぐ際に満たす条件と残課題をまとめる。',
    states: [
      {
        id: 'state-handover-conditions-ready',
        name: '引継ぎ可能',
        isCurrent: true,
      },
    ],
    attributes: [],
    responsibleActorId: RESEARCH_LEAD_ID,
    risk: noRisk(),
  },
];

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

/** The eight v1.1 guarantee-chain relations are intentionally unchanged. */
const relations = (): PrepRelation[] => [
  relation(
    'relation-requirements-constraints',
    'artifact-reliability-requirements',
    'artifact-constraint-definition',
  ),
  relation(
    'relation-constraints-test-cases',
    'artifact-constraint-definition',
    'artifact-test-cases',
  ),
  relation(
    'relation-test-cases-criteria',
    'artifact-test-cases',
    'artifact-evaluation-criteria',
  ),
  relation(
    'relation-criteria-results',
    'artifact-evaluation-criteria',
    'artifact-evaluation-results',
  ),
  relation(
    'relation-results-residual-risk',
    'artifact-evaluation-results',
    'artifact-residual-risk-assessment',
  ),
  relation(
    'relation-residual-risk-handover',
    'artifact-residual-risk-assessment',
    'artifact-handover-conditions',
  ),
  relation(
    'relation-risk-test-cases',
    'artifact-risk-scenarios',
    'artifact-test-cases',
  ),
  relation(
    'relation-risk-criteria',
    'artifact-risk-scenarios',
    'artifact-evaluation-criteria',
  ),
];

const parentPlacements = [
  { artifactId: 'artifact-reliability-requirements', offsetX: 24, offsetY: 24 },
  { artifactId: 'artifact-constraint-definition', offsetX: 24, offsetY: 24 },
  { artifactId: 'artifact-risk-scenarios', offsetX: 240, offsetY: 24 },
  { artifactId: 'artifact-test-cases', offsetX: 240, offsetY: 24 },
  { artifactId: 'artifact-evaluation-criteria', offsetX: 24, offsetY: 24 },
  { artifactId: 'artifact-evaluation-results', offsetX: 240, offsetY: 24 },
  { artifactId: 'artifact-residual-risk-assessment', offsetX: 24, offsetY: 24 },
  { artifactId: 'artifact-handover-conditions', offsetX: 240, offsetY: 24 },
];

const generationArtifactIds = [
  'artifact-reliability-requirements',
  'artifact-constraint-definition',
  'artifact-risk-scenarios',
  'artifact-test-cases',
];

const evaluationArtifactIds = [
  'artifact-evaluation-criteria',
  'artifact-evaluation-results',
  'artifact-residual-risk-assessment',
  'artifact-handover-conditions',
];

export function createConstrainedMlcTestingModel(
  now?: string | Date,
): PrepModelFile {
  const timestamp = toIsoTimestamp(now);

  return {
    schemaVersion: PREP_SCHEMA_VERSION,
    metadata: {
      modelId: 'model-constrained-mlc-testing',
      modelName: '制約付き多ラベル分類システムのテスト設計',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    system: {
      id: 'system-constrained-mlc',
      name: '制約付き多ラベル分類システム',
      goal: 'ラベル制約を考慮した分類結果の信頼性を説明可能にする',
      phase: 'to-be',
    },
    processes: [
      {
        id: PROCESS_ID,
        name: 'テスト設計プロセス',
        goal: '要求から引継ぎ条件まで追跡可能なテスト設計を作成する',
        leadActorId: RESEARCH_LEAD_ID,
        description: '成果物の保証連鎖を用いてテスト設計の根拠を管理する。',
      },
      {
        id: GENERATION_PROCESS_ID,
        parentProcessId: PROCESS_ID,
        name: 'テストケース生成',
        goal: '要求、制約、リスクからテストケースを生成する',
        leadActorId: TEST_DESIGNER_ID,
      },
      {
        id: EVALUATION_PROCESS_ID,
        parentProcessId: PROCESS_ID,
        name: '評価・引継ぎ',
        goal: '結果を評価し、残余リスクと引継ぎ条件を確定する',
        leadActorId: EVALUATOR_ID,
      },
    ],
    actors: actors(),
    processActorLanes: [
      {
        id: 'lane-mlc-research-lead',
        processId: PROCESS_ID,
        actorId: RESEARCH_LEAD_ID,
        role: '要求・リスク・引継ぎ責任',
        order: 0,
        height: 220,
      },
      {
        id: 'lane-mlc-test-designer',
        processId: PROCESS_ID,
        actorId: TEST_DESIGNER_ID,
        role: 'テスト設計責任',
        order: 1,
        height: 220,
      },
      {
        id: 'lane-mlc-evaluator',
        processId: PROCESS_ID,
        actorId: EVALUATOR_ID,
        role: '評価責任',
        order: 2,
        height: 220,
      },
    ],
    artifacts: artifacts(),
    externalProcesses: [],
    relations: relations(),
    processHandoffs: [],
    layout: {
      nodes: [
        { id: PROCESS_ID, x: 40, y: 40, width: 1120, height: 760 },
        {
          id: GENERATION_PROCESS_ID,
          parentId: PROCESS_ID,
          x: 60,
          y: 100,
          width: 490,
          height: 620,
        },
        {
          id: EVALUATION_PROCESS_ID,
          parentId: PROCESS_ID,
          x: 570,
          y: 100,
          width: 490,
          height: 620,
        },
        ...generationArtifactIds.map((id, index) => ({
          id,
          parentId: GENERATION_PROCESS_ID,
          x: index % 2 === 0 ? 24 : 250,
          y: index < 2 ? 100 : 360,
        })),
        ...evaluationArtifactIds.map((id, index) => ({
          id,
          parentId: EVALUATION_PROCESS_ID,
          x: index % 2 === 0 ? 24 : 250,
          y: index < 2 ? 100 : 360,
        })),
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
      processViews: [
        {
          processId: PROCESS_ID,
          artifactPlacements: parentPlacements.map((placement) => ({
            ...placement,
          })),
          subprocessColumns: [
            {
              processId: GENERATION_PROCESS_ID,
              parentProcessId: PROCESS_ID,
              order: 0,
              width: 500,
            },
            {
              processId: EVALUATION_PROCESS_ID,
              parentProcessId: PROCESS_ID,
              order: 1,
              width: 500,
            },
          ],
          viewport: { x: 0, y: 0, zoom: 0.85 },
        },
        {
          processId: GENERATION_PROCESS_ID,
          artifactPlacements: generationArtifactIds.map((artifactId, index) => ({
            artifactId,
            offsetX: 24 + (index % 2) * 230,
            offsetY: 24 + Math.floor(index / 2) * 180,
          })),
          subprocessColumns: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        {
          processId: EVALUATION_PROCESS_ID,
          artifactPlacements: evaluationArtifactIds.map((artifactId, index) => ({
            artifactId,
            offsetX: 24 + (index % 2) * 230,
            offsetY: 24 + Math.floor(index / 2) * 180,
          })),
          subprocessColumns: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      ],
      overview: {
        nodes: [
          {
            id: PROCESS_ID,
            kind: 'process',
            x: 120,
            y: 140,
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      lastView: {
        mode: 'process',
        activeProcessId: PROCESS_ID,
      },
    },
  };
}

export const createConstrainedMlcTestingTemplate =
  createConstrainedMlcTestingModel;
