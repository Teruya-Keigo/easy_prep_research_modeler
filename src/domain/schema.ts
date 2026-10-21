import { z } from 'zod';

import {
  MIN_SUBPROCESS_COLUMN_HEIGHT,
  MIN_SUBPROCESS_COLUMN_WIDTH,
  PREP_SCHEMA_VERSION,
  type CanonicalPrepModelFile,
  type NodeLayout,
} from './model';
import { findProcessHierarchyCycles } from './processHierarchy';

export const modelPhaseSchema = z.enum(['as-is', 'to-be', 'unspecified']);

export const riskLevelSchema = z.enum(['none', 'low', 'medium', 'high']);

export const artifactTypeSchema = z.enum([
  'intermediate',
  'final',
  'milestone',
  'intangible',
]);

export const artifactScopeSchema = z.enum([
  'internal',
  'external-input',
  'external-output',
]);

export const prepRelationTypeSchema = z.enum(['input', 'sync']);

export const anchorPositionSchema = z.enum([
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
  'nw',
  'auto',
]);

export const semanticRelationTypeSchema = z.enum([
  'derives-from',
  'justifies',
  'mitigates',
  'approves',
  'monitors',
  'requires-revalidation-of',
]);

export const keyValueAttributeSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.string(),
});

export const artifactStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  isCurrent: z.boolean(),
});

export const riskInfoSchema = z.object({
  level: riskLevelSchema,
  description: z.string().optional(),
});

export const prepSystemSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  phase: modelPhaseSchema,
  author: z.string().optional(),
});

/** Canonical process. Legacy string responsibility is intentionally stripped. */
export const prepProcessSchema = z.object({
  id: z.string(),
  parentProcessId: z.string().optional(),
  name: z.string(),
  goal: z.string(),
  leadActorId: z.string().optional(),
  technology: z.string().optional(),
  resources: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const prepActorSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  isPlaceholder: z.boolean().optional(),
});

export const processActorLaneSchema = z.object({
  id: z.string(),
  processId: z.string(),
  actorId: z.string(),
  role: z.string().optional(),
  order: z.number().int().nonnegative(),
  height: z.number().finite().positive(),
});

/** Canonical artifact. Legacy nextProcessName is accepted only by migration. */
export const prepArtifactSchema = z.object({
  id: z.string(),
  processId: z.string().optional(),
  name: z.string(),
  type: artifactTypeSchema,
  scope: artifactScopeSchema,
  description: z.string().optional(),
  states: z.array(artifactStateSchema),
  attributes: z.array(keyValueAttributeSchema),
  responsibleActorId: z.string().optional(),
  legacyNextProcessName: z.string().optional(),
  risk: riskInfoSchema,
});

export const externalProcessSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

export const prepRelationSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  sourceAnchor: anchorPositionSchema,
  targetAnchor: anchorPositionSchema,
  prepType: prepRelationTypeSchema,
  semanticType: semanticRelationTypeSchema.optional(),
  description: z.string().optional(),
  risk: riskInfoSchema,
});

export const processHandoffSchema = z.object({
  id: z.string(),
  sourceProcessId: z.string(),
  targetProcessId: z.string(),
  sourceArtifactIds: z.array(z.string()),
  targetArtifactIds: z.array(z.string()),
  prepType: prepRelationTypeSchema,
  sourceAnchor: anchorPositionSchema,
  targetAnchor: anchorPositionSchema,
  description: z.string().optional(),
});

export const nodeLayoutSchema = z.object({
  id: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive().optional(),
  height: z.number().finite().positive().optional(),
  parentId: z.string().optional(),
  collapsed: z.boolean().optional(),
});

export const viewportStateSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().finite().positive(),
});

export const artifactPlacementSchema = z.object({
  artifactId: z.string(),
  offsetX: z.number().finite().nonnegative(),
  offsetY: z.number().finite().nonnegative(),
});

export const subprocessColumnLayoutSchema = z.object({
  processId: z.string(),
  parentProcessId: z.string(),
  order: z.number().int().nonnegative(),
  width: z.number().finite().min(MIN_SUBPROCESS_COLUMN_WIDTH),
  height: z.number().finite().min(MIN_SUBPROCESS_COLUMN_HEIGHT).optional(),
});

/** v1.2 stored only width, with no persisted manual height. */
const subprocessColumnLayoutV12Schema = subprocessColumnLayoutSchema
  .omit({ height: true })
  .extend({ width: z.number().finite().positive() });

export const processViewLayoutSchema = z.object({
  processId: z.string(),
  artifactPlacements: z.array(artifactPlacementSchema),
  subprocessColumns: z.array(subprocessColumnLayoutSchema),
  viewport: viewportStateSchema,
});

export const overviewNodeLayoutSchema = z.object({
  id: z.string(),
  kind: z.enum(['process', 'external-process']),
  x: z.number().finite(),
  y: z.number().finite(),
});

export const overviewLayoutSchema = z.object({
  nodes: z.array(overviewNodeLayoutSchema),
  viewport: viewportStateSchema,
});

export const editorViewStateSchema = z
  .object({
    mode: z.enum(['process', 'overview']),
    activeProcessId: z.string().optional(),
  })
  .superRefine((view, context) => {
    if (view.mode === 'process' && !view.activeProcessId) {
      context.addIssue({
        code: 'custom',
        path: ['activeProcessId'],
        message: 'プロセス詳細モードには activeProcessId が必要です',
      });
    }
  });

const metadataSchema = z.object({
  modelId: z.string(),
  modelName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

function addDuplicateIssue(
  context: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
) {
  context.addIssue({ code: 'custom', path, message });
}

function synthesizeCompatibilityNodes(
  model: {
    artifacts: Array<{ id: string; processId?: string }>;
    layout: {
      nodes?: NodeLayout[];
      processViews: Array<{
        processId: string;
        artifactPlacements: Array<{
          artifactId: string;
          offsetX: number;
          offsetY: number;
        }>;
      }>;
      overview: {
        nodes: Array<{ id: string; x: number; y: number }>;
      };
    };
  },
): NodeLayout[] {
  if (model.layout.nodes) return model.layout.nodes;
  const nodes: NodeLayout[] = model.layout.overview.nodes.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
  }));
  const artifactById = new Map(
    model.artifacts.map((artifact) => [artifact.id, artifact]),
  );
  const seen = new Set(nodes.map((node) => node.id));
  for (const view of model.layout.processViews) {
    for (const placement of view.artifactPlacements) {
      if (seen.has(placement.artifactId)) continue;
      seen.add(placement.artifactId);
      nodes.push({
        id: placement.artifactId,
        x: placement.offsetX,
        y: placement.offsetY,
        parentId: artifactById.get(placement.artifactId)?.processId,
      });
    }
  }
  return nodes;
}

const canonicalPrepModelObjectSchema = z.object({
  schemaVersion: z.literal(PREP_SCHEMA_VERSION),
  metadata: metadataSchema,
  system: prepSystemSchema,
  processes: z.array(prepProcessSchema),
  actors: z.array(prepActorSchema),
  processActorLanes: z.array(processActorLaneSchema),
  artifacts: z.array(prepArtifactSchema),
  externalProcesses: z.array(externalProcessSchema),
  relations: z.array(prepRelationSchema),
  processHandoffs: z.array(processHandoffSchema),
  layout: z.object({
    processViews: z.array(processViewLayoutSchema),
    overview: overviewLayoutSchema,
    lastView: editorViewStateSchema.optional(),
    // Transitional projections are retained when present, but never required
    // from a canonical JSON producer.
    nodes: z.array(nodeLayoutSchema).optional(),
    viewport: viewportStateSchema.optional(),
  }),
});

/**
 * Canonical v1.3 schema. Zod's default object behaviour strips unknown future
 * fields while superRefine enforces reference, hierarchy and layout integrity.
 */
export const prepModelFileSchema = canonicalPrepModelObjectSchema
  .superRefine((model, context) => {
    const elementIds = new Map<string, ReadonlyArray<string | number>>();
    const registerId = (
      id: string,
      path: ReadonlyArray<string | number>,
    ) => {
      if (elementIds.has(id)) {
        addDuplicateIssue(
          context,
          [...path],
          `要素ID「${id}」が重複しています`,
        );
      } else {
        elementIds.set(id, path);
      }
    };

    registerId(model.system.id, ['system', 'id']);
    for (const [collectionName, collection] of [
      ['processes', model.processes],
      ['actors', model.actors],
      ['processActorLanes', model.processActorLanes],
      ['artifacts', model.artifacts],
      ['externalProcesses', model.externalProcesses],
      ['relations', model.relations],
      ['processHandoffs', model.processHandoffs],
    ] as const) {
      collection.forEach((element, index) =>
        registerId(element.id, [collectionName, index, 'id']),
      );
    }

    model.artifacts.forEach((artifact, artifactIndex) => {
      for (const [field, values] of [
        ['states', artifact.states],
        ['attributes', artifact.attributes],
      ] as const) {
        const ids = new Set<string>();
        values.forEach((value, valueIndex) => {
          if (ids.has(value.id)) {
            addDuplicateIssue(
              context,
              ['artifacts', artifactIndex, field, valueIndex, 'id'],
              `成果物内のID「${value.id}」が重複しています`,
            );
          }
          ids.add(value.id);
        });
      }
    });

    const processById = new Map(
      model.processes.map((process) => [process.id, process]),
    );
    const actorIds = new Set(model.actors.map((actor) => actor.id));
    const artifactById = new Map(
      model.artifacts.map((artifact) => [artifact.id, artifact]),
    );
    const externalProcessIds = new Set(
      model.externalProcesses.map((process) => process.id),
    );

    model.processes.forEach((process, index) => {
      if (
        process.parentProcessId &&
        !processById.has(process.parentProcessId)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['processes', index, 'parentProcessId'],
          message: `親プロセス「${process.parentProcessId}」が存在しません`,
        });
      }
      if (process.leadActorId && !actorIds.has(process.leadActorId)) {
        context.addIssue({
          code: 'custom',
          path: ['processes', index, 'leadActorId'],
          message: `主担当アクター「${process.leadActorId}」が存在しません`,
        });
      }
    });
    for (const cycle of findProcessHierarchyCycles(model.processes)) {
      context.addIssue({
        code: 'custom',
        path: ['processes'],
        message: `プロセス階層が循環しています: ${cycle.join(' -> ')}`,
      });
    }

    const lanePairs = new Set<string>();
    const laneOrders = new Map<string, Set<number>>();
    model.processActorLanes.forEach((lane, index) => {
      if (!processById.has(lane.processId)) {
        context.addIssue({
          code: 'custom',
          path: ['processActorLanes', index, 'processId'],
          message: `レーンのプロセス「${lane.processId}」が存在しません`,
        });
      }
      if (!actorIds.has(lane.actorId)) {
        context.addIssue({
          code: 'custom',
          path: ['processActorLanes', index, 'actorId'],
          message: `レーンのアクター「${lane.actorId}」が存在しません`,
        });
      }
      const pair = `${lane.processId}\u0000${lane.actorId}`;
      if (lanePairs.has(pair)) {
        addDuplicateIssue(
          context,
          ['processActorLanes', index],
          '同じプロセスとアクターのレーンが重複しています',
        );
      }
      lanePairs.add(pair);
      const orders = laneOrders.get(lane.processId) ?? new Set<number>();
      if (orders.has(lane.order)) {
        addDuplicateIssue(
          context,
          ['processActorLanes', index, 'order'],
          `プロセス内のレーン順序 ${lane.order} が重複しています`,
        );
      }
      orders.add(lane.order);
      laneOrders.set(lane.processId, orders);
    });

    model.artifacts.forEach((artifact, index) => {
      if (artifact.processId && !processById.has(artifact.processId)) {
        context.addIssue({
          code: 'custom',
          path: ['artifacts', index, 'processId'],
          message: `成果物の所属プロセス「${artifact.processId}」が存在しません`,
        });
      }
      if (
        artifact.responsibleActorId &&
        !actorIds.has(artifact.responsibleActorId)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['artifacts', index, 'responsibleActorId'],
          message: `責任アクター「${artifact.responsibleActorId}」が存在しません`,
        });
      }
    });

    model.relations.forEach((relation, index) => {
      const source = artifactById.get(relation.sourceId);
      const target = artifactById.get(relation.targetId);
      if (!source) {
        context.addIssue({
          code: 'custom',
          path: ['relations', index, 'sourceId'],
          message: `始点成果物「${relation.sourceId}」が存在しません`,
        });
      }
      if (!target) {
        context.addIssue({
          code: 'custom',
          path: ['relations', index, 'targetId'],
          message: `終点成果物「${relation.targetId}」が存在しません`,
        });
      }
    });

    const topLevelId = (processId: string | undefined) => {
      if (!processId) return undefined;
      const visited = new Set<string>();
      let current = processById.get(processId);
      while (current?.parentProcessId && !visited.has(current.id)) {
        visited.add(current.id);
        current = processById.get(current.parentProcessId);
      }
      return current?.id;
    };
    model.processHandoffs.forEach((handoff, index) => {
      const sourceProcess = processById.get(handoff.sourceProcessId);
      const targetProcess = processById.get(handoff.targetProcessId);
      if (!sourceProcess || sourceProcess.parentProcessId) {
        context.addIssue({
          code: 'custom',
          path: ['processHandoffs', index, 'sourceProcessId'],
          message: '引継ぎ元はトップレベルプロセスでなければなりません',
        });
      }
      if (!targetProcess || targetProcess.parentProcessId) {
        context.addIssue({
          code: 'custom',
          path: ['processHandoffs', index, 'targetProcessId'],
          message: '引継ぎ先はトップレベルプロセスでなければなりません',
        });
      }
      if (handoff.sourceProcessId === handoff.targetProcessId) {
        context.addIssue({
          code: 'custom',
          path: ['processHandoffs', index, 'targetProcessId'],
          message: '引継ぎ元と引継ぎ先は異なるプロセスでなければなりません',
        });
      }
      handoff.sourceArtifactIds.forEach((artifactId, artifactIndex) => {
        const artifact = artifactById.get(artifactId);
        if (
          !artifact ||
          artifact.type !== 'final' ||
          topLevelId(artifact.processId) !== handoff.sourceProcessId
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'processHandoffs',
              index,
              'sourceArtifactIds',
              artifactIndex,
            ],
            message:
              '引継ぎ元成果物は引継ぎ元プロセス配下の最終成果物でなければなりません',
          });
        }
      });
      handoff.targetArtifactIds.forEach((artifactId, artifactIndex) => {
        const artifact = artifactById.get(artifactId);
        if (
          !artifact ||
          artifact.scope !== 'external-input' ||
          topLevelId(artifact.processId) !== handoff.targetProcessId
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'processHandoffs',
              index,
              'targetArtifactIds',
              artifactIndex,
            ],
            message:
              '引継ぎ先成果物は引継ぎ先プロセス配下の外部入力成果物でなければなりません',
          });
        }
      });
    });

    const viewIds = new Set<string>();
    const placedArtifactIds = new Set<string>();
    model.layout.processViews.forEach((view, viewIndex) => {
      if (!processById.has(view.processId)) {
        context.addIssue({
          code: 'custom',
          path: ['layout', 'processViews', viewIndex, 'processId'],
          message: `表示プロセス「${view.processId}」が存在しません`,
        });
      }
      if (viewIds.has(view.processId)) {
        addDuplicateIssue(
          context,
          ['layout', 'processViews', viewIndex, 'processId'],
          `プロセス表示「${view.processId}」が重複しています`,
        );
      }
      viewIds.add(view.processId);
      view.artifactPlacements.forEach((placement, placementIndex) => {
        const artifact = artifactById.get(placement.artifactId);
        if (!artifact) {
          context.addIssue({
            code: 'custom',
            path: [
              'layout',
              'processViews',
              viewIndex,
              'artifactPlacements',
              placementIndex,
              'artifactId',
            ],
            message: `配置成果物「${placement.artifactId}」が存在しません`,
          });
        } else {
          const owner = processById.get(artifact.processId ?? '');
          if (
            artifact.processId !== view.processId &&
            owner?.parentProcessId !== view.processId
          ) {
            context.addIssue({
              code: 'custom',
              path: [
                'layout',
                'processViews',
                viewIndex,
                'artifactPlacements',
                placementIndex,
              ],
              message:
                '成果物はこのプロセス詳細画面に配置できません',
            });
          }
        }
        const placementKey = `${view.processId}\u0000${placement.artifactId}`;
        if (placedArtifactIds.has(placementKey)) {
          addDuplicateIssue(
            context,
            [
              'layout',
              'processViews',
              viewIndex,
              'artifactPlacements',
              placementIndex,
              'artifactId',
            ],
            `成果物配置「${placement.artifactId}」が重複しています`,
          );
        }
        placedArtifactIds.add(placementKey);
      });

      const columnProcessIds = new Set<string>();
      const columnOrders = new Set<number>();
      view.subprocessColumns.forEach((column, columnIndex) => {
        const child = processById.get(column.processId);
        if (
          column.parentProcessId !== view.processId ||
          child?.parentProcessId !== view.processId
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'layout',
              'processViews',
              viewIndex,
              'subprocessColumns',
              columnIndex,
            ],
            message:
              '列は表示プロセス直下のサブプロセスを参照する必要があります',
          });
        }
        if (columnProcessIds.has(column.processId)) {
          addDuplicateIssue(
            context,
            [
              'layout',
              'processViews',
              viewIndex,
              'subprocessColumns',
              columnIndex,
              'processId',
            ],
            `サブプロセス列「${column.processId}」が重複しています`,
          );
        }
        columnProcessIds.add(column.processId);
        if (columnOrders.has(column.order)) {
          addDuplicateIssue(
            context,
            [
              'layout',
              'processViews',
              viewIndex,
              'subprocessColumns',
              columnIndex,
              'order',
            ],
            `サブプロセス列順序 ${column.order} が重複しています`,
          );
        }
        columnOrders.add(column.order);
      });
    });

    const overviewIds = new Set<string>();
    model.layout.overview.nodes.forEach((node, index) => {
      if (overviewIds.has(node.id)) {
        addDuplicateIssue(
          context,
          ['layout', 'overview', 'nodes', index, 'id'],
          `鳥瞰図ノード「${node.id}」が重複しています`,
        );
      }
      overviewIds.add(node.id);
      const valid =
        node.kind === 'process'
          ? Boolean(
              processById.has(node.id) &&
                !processById.get(node.id)?.parentProcessId,
            )
          : externalProcessIds.has(node.id);
      if (!valid) {
        context.addIssue({
          code: 'custom',
          path: ['layout', 'overview', 'nodes', index],
          message: '鳥瞰図ノードの参照または種別が正しくありません',
        });
      }
    });

    if (
      model.layout.lastView?.activeProcessId &&
      !processById.has(model.layout.lastView.activeProcessId)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['layout', 'lastView', 'activeProcessId'],
        message: '最後に表示したプロセスが存在しません',
      });
    }

    const legacyLayoutIds = new Set<string>();
    model.layout.nodes?.forEach((layout, index) => {
      if (legacyLayoutIds.has(layout.id)) {
        addDuplicateIssue(
          context,
          ['layout', 'nodes', index, 'id'],
          `レイアウトID「${layout.id}」が重複しています`,
        );
      }
      legacyLayoutIds.add(layout.id);
    });
  })
  .transform((model): CanonicalPrepModelFile => ({
    ...model,
    layout: {
      ...model.layout,
      nodes: synthesizeCompatibilityNodes(model),
      viewport: model.layout.viewport ?? { ...model.layout.overview.viewport },
    },
  }));

/** Explicit alias used by migration/file-service code. */
export const canonicalPrepModelFileSchema = prepModelFileSchema;

/** Compatibility alias for callers that use the shorter schema name. */
export const prepModelSchema = prepModelFileSchema;

/** Structural v1.2 parser used only at the migration boundary. */
export const legacyPrepModelV12Schema = canonicalPrepModelObjectSchema.extend({
  schemaVersion: z.literal('1.2.0'),
  layout: canonicalPrepModelObjectSchema.shape.layout.extend({
    processViews: z.array(
      processViewLayoutSchema.extend({
        subprocessColumns: z.array(subprocessColumnLayoutV12Schema),
      }),
    ),
  }),
});

export function parsePrepModel(input: unknown): CanonicalPrepModelFile {
  return prepModelFileSchema.parse(input);
}

export function safeParsePrepModel(input: unknown) {
  return prepModelFileSchema.safeParse(input);
}

// ---------------------------------------------------------------------------
// Legacy import schemas. These are deliberately separate from the canonical
// parser so a malformed 1.2 file can never be silently repaired as old data.
// ---------------------------------------------------------------------------

export const legacyPrepProcessV10Schema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  responsibleActor: z.string().optional(),
  technology: z.string().optional(),
  resources: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const legacyPrepProcessV11Schema = legacyPrepProcessV10Schema.extend({
  parentProcessId: z.string().optional(),
});

export const legacyPrepArtifactSchema = z.object({
  id: z.string(),
  processId: z.string().optional(),
  name: z.string(),
  type: artifactTypeSchema,
  scope: artifactScopeSchema,
  description: z.string().optional(),
  states: z.array(artifactStateSchema),
  attributes: z.array(keyValueAttributeSchema),
  responsibleActor: z.string().optional(),
  nextProcessName: z.string().optional(),
  risk: riskInfoSchema,
});

export const legacyPrepRelationSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  prepType: prepRelationTypeSchema,
  semanticType: semanticRelationTypeSchema.optional(),
  description: z.string().optional(),
  risk: riskInfoSchema,
  sourceAnchor: anchorPositionSchema.optional(),
  targetAnchor: anchorPositionSchema.optional(),
});

function legacyPrepModelSchema(
  version: '1.0.0' | '1.1.0',
  processSchema:
    | typeof legacyPrepProcessV10Schema
    | typeof legacyPrepProcessV11Schema,
) {
  return z.object({
    schemaVersion: z.literal(version),
    metadata: metadataSchema,
    system: prepSystemSchema,
    processes: z.array(processSchema),
    artifacts: z.array(legacyPrepArtifactSchema),
    externalProcesses: z.array(externalProcessSchema),
    relations: z.array(legacyPrepRelationSchema),
    layout: z.object({
      nodes: z.array(nodeLayoutSchema),
      viewport: viewportStateSchema,
    }),
  });
}

export const legacyPrepModelV10Schema = legacyPrepModelSchema(
  '1.0.0',
  legacyPrepProcessV10Schema,
);

export const legacyPrepModelV11Schema = legacyPrepModelSchema(
  '1.1.0',
  legacyPrepProcessV11Schema,
);

export type LegacyPrepModelV10 = z.infer<typeof legacyPrepModelV10Schema>;
export type LegacyPrepModelV11 = z.infer<typeof legacyPrepModelV11Schema>;
export type LegacyPrepModel = LegacyPrepModelV10 | LegacyPrepModelV11;
