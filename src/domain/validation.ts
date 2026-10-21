import type {
  AnchorPosition,
  EditorViewState,
  PrepArtifact,
  PrepModelFile,
  PrepProcess,
  PrepRelation,
  ProcessHandoff,
} from './model';
import {
  MIN_SUBPROCESS_COLUMN_HEIGHT,
  MIN_SUBPROCESS_COLUMN_WIDTH,
} from './model';
import {
  findProcessHierarchyCycles,
  getDirectChildProcesses,
  getTopLevelAncestor,
  getVisibleProcessIds,
} from './processHierarchy';

export type ValidationSeverity = 'error' | 'warning';

export type ValidationErrorCode =
  | 'E001'
  | 'E002'
  | 'E003'
  | 'E004'
  | 'E005'
  | 'E006'
  | 'E007'
  | 'E008'
  | 'E009'
  | 'E010'
  | 'E011'
  | 'E012'
  | 'E013'
  | 'E014'
  | 'E015'
  | 'E016'
  | 'E017'
  | 'E018'
  | 'E019'
  | 'E020'
  | 'E021'
  | 'E022'
  | 'E023';

export type ValidationWarningCode =
  | 'W001'
  | 'W002'
  | 'W003'
  | 'W004'
  | 'W005'
  | 'W006'
  | 'W007'
  | 'W008'
  | 'W009'
  | 'W010'
  | 'W011'
  | 'W012'
  | 'W013'
  | 'W014'
  | 'W015'
  | 'W016'
  | 'W017'
  | 'W018';

export type ValidationCode = ValidationErrorCode | ValidationWarningCode;

export type ValidationElementType =
  | 'model'
  | 'system'
  | 'process'
  | 'actor'
  | 'lane'
  | 'artifact'
  | 'relation'
  | 'processHandoff';

export interface ValidationIssue {
  code: ValidationCode;
  severity: ValidationSeverity;
  message: string;
  elementId?: string;
  elementType?: ValidationElementType;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  isValid: boolean;
}

/**
 * Optional UI context for rules which only make sense for the process detail
 * currently on screen. When visibleArtifactIds is omitted, the placements in
 * the active ProcessViewLayout are treated as the displayed artifacts.
 */
export interface ValidationContext {
  activeProcessId?: string;
  mode?: EditorViewState['mode'];
  visibleArtifactIds?: Iterable<string>;
  /** Alias useful to canvas callers. */
  displayedArtifactIds?: Iterable<string>;
}

export type ValidationContextInput = string | ValidationContext;

export const ERROR_MESSAGES: Readonly<Record<ValidationErrorCode, string>> = {
  E001: 'システム名を入力してください',
  E002: 'システムゴールを入力してください',
  E003: '1つ以上のプロセスが必要です',
  E004: 'プロセス名を入力してください',
  E005: 'プロセスゴールを入力してください',
  E006: '1つ以上の成果物が必要です',
  E007: '1つ以上の最終成果物が必要です',
  E008: '関係が存在しない要素を参照しています',
  E009: '同一成果物には同期関係を作成できません',
  E010: '現在状態は1つだけ指定できます',
  E011: '読み込んだモデル形式が正しくありません',
  E012: '親プロセスが存在しません',
  E013: 'プロセスを自分自身または子孫の中には配置できません',
  E014: '成果物の所属プロセスが存在しません',
  E015: '成果物の責任アクターを指定してください',
  E016: 'アクターレーンの参照先が存在しません',
  E017: '同一プロセスに同じアクターのレーンを重複して作成できません',
  E018: '接続点は上下左右または四隅から選択してください',
  E019: '同じトップレベルプロセス内では成果物間関係を使用してください',
  E020: '引継ぎ元には始点プロセスの最終成果物を指定してください',
  E021: '引継ぎ先には終点プロセスの外部入力成果物を指定してください',
  E022: '現在のプロセスと直下サブプロセスだけを表示してください',
  E023: 'サブプロセスの幅・高さを最小値以上の有限数にしてください',
};

export const WARNING_MESSAGES: Readonly<
  Record<ValidationWarningCode, string>
> = {
  W001: '最終成果物の引継ぎ先プロセスを確認してください',
  W002: 'この成果物には入力元がありません',
  W003: 'この成果物は後続成果物に利用されていません',
  W004: '管理されていない知見に伴うリスクを確認してください',
  W005: '同期不整合のリスクを確認してください',
  W006: '品質ゲートの確認対象がありません',
  W007:
    '高リスク要素から `mitigates` または再検証関係を確認してください',
  W008: '他の成果物との関係がありません',
  W009: '入力関係に循環があります。意図した構造か確認してください',
  W010: 'このサブプロセスには成果物もサブプロセスもありません',
  W011: '意図した詳細度になっているか確認してください',
  W012: 'サブプロセスを1つ以上作成してください',
  W013: 'このアクターが責任を持つ成果物がありません',
  W014: '成果物をサブプロセスへ配置してください',
  W015: '引継ぎ対象の最終成果物を指定してください',
  W016: '必要に応じて受け側の外部入力成果物を指定してください',
  W017: '旧データの次工程名を鳥瞰図の引継ぎ先へ対応付けてください',
  W018: '線の接続位置を8方向のいずれかに確定してください',
};

const FIXED_ANCHORS = [
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
  'nw',
] as const;
const VALID_ANCHORS = new Set<AnchorPosition>([
  ...FIXED_ANCHORS,
  'auto',
]);

const isBlank = (value: string | undefined): boolean =>
  value === undefined || value.trim().length === 0;

const makeIssue = (
  code: ValidationCode,
  severity: ValidationSeverity,
  elementType: ValidationElementType,
  elementId?: string,
): ValidationIssue => ({
  code,
  severity,
  message:
    severity === 'error'
      ? ERROR_MESSAGES[code as ValidationErrorCode]
      : WARNING_MESSAGES[code as ValidationWarningCode],
  elementId,
  elementType,
});

const error = (
  code: ValidationErrorCode,
  elementType: ValidationElementType,
  elementId?: string,
): ValidationIssue => makeIssue(code, 'error', elementType, elementId);

const warning = (
  code: ValidationWarningCode,
  elementType: ValidationElementType,
  elementId?: string,
): ValidationIssue => makeIssue(code, 'warning', elementType, elementId);

const toResult = (issues: ValidationIssue[]): ValidationResult => {
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  return {
    issues,
    errors,
    warnings,
    isValid: errors.length === 0,
  };
};

/**
 * `validateModel` normally receives schema-checked data. This small boundary
 * guard still turns wholly malformed runtime input into the specified E011
 * instead of throwing while the importer prepares its richer Zod diagnostics.
 */
function isValidationModel(input: unknown): input is PrepModelFile {
  if (typeof input !== 'object' || input === null) return false;
  const candidate = input as Partial<PrepModelFile>;
  return (
    typeof candidate.metadata === 'object' &&
    candidate.metadata !== null &&
    typeof candidate.system === 'object' &&
    candidate.system !== null &&
    Array.isArray(candidate.processes) &&
    Array.isArray(candidate.artifacts) &&
    Array.isArray(candidate.externalProcesses) &&
    Array.isArray(candidate.relations) &&
    typeof candidate.layout === 'object' &&
    candidate.layout !== null
  );
}

export function createSchemaValidationResult(
  elementId = 'model',
): ValidationResult {
  return toResult([error('E011', 'model', elementId)]);
}

const hasIncomingInput = (
  artifactId: string,
  relations: readonly PrepRelation[],
): boolean =>
  relations.some(
    (relation) =>
      relation.prepType === 'input' && relation.targetId === artifactId,
  );

const hasOutgoingInput = (
  artifactId: string,
  relations: readonly PrepRelation[],
): boolean =>
  relations.some(
    (relation) =>
      relation.prepType === 'input' && relation.sourceId === artifactId,
  );

const hasAnyRelation = (
  artifactId: string,
  relations: readonly PrepRelation[],
): boolean =>
  relations.some(
    (relation) =>
      relation.sourceId === artifactId || relation.targetId === artifactId,
  );

const isMitigationRelation = (relation: PrepRelation): boolean =>
  relation.semanticType === 'mitigates' ||
  relation.semanticType === 'requires-revalidation-of';

const hasRiskFollowUp = (
  artifactId: string,
  relations: readonly PrepRelation[],
): boolean =>
  relations.some(
    (relation) =>
      relation.sourceId === artifactId && isMitigationRelation(relation),
  );

const isValidAnchor = (anchor: unknown): anchor is AnchorPosition =>
  typeof anchor === 'string' && VALID_ANCHORS.has(anchor as AnchorPosition);

const hasAutoAnchor = (edge: {
  sourceAnchor?: AnchorPosition;
  targetAnchor?: AnchorPosition;
}): boolean =>
  edge.sourceAnchor === 'auto' || edge.targetAnchor === 'auto';

const hasInvalidAnchor = (
  edge: {
    sourceAnchor?: AnchorPosition;
    targetAnchor?: AnchorPosition;
  },
  anchorsRequired: boolean,
): boolean => {
  const bothMissing =
    edge.sourceAnchor === undefined && edge.targetAnchor === undefined;
  if (bothMissing && !anchorsRequired) return false;
  return (
    !isValidAnchor(edge.sourceAnchor) || !isValidAnchor(edge.targetAnchor)
  );
};

function usesCanonicalCollections(model: PrepModelFile): boolean {
  return (
    model.actors !== undefined &&
    model.processActorLanes !== undefined &&
    model.processHandoffs !== undefined &&
    model.layout.processViews !== undefined &&
    model.layout.overview !== undefined
  );
}

/**
 * Finds the input edges that close a directed cycle. Returning the closing
 * edges gives the UI a concrete relation to focus without emitting duplicate
 * warnings for every node in the same cycle.
 */
export function findInputCycleRelations(
  model: Pick<PrepModelFile, 'artifacts' | 'relations'>,
): PrepRelation[] {
  const artifactIds = new Set(model.artifacts.map((artifact) => artifact.id));
  const outgoing = new Map<string, PrepRelation[]>();

  for (const artifact of model.artifacts) {
    outgoing.set(artifact.id, []);
  }

  for (const relation of model.relations) {
    if (
      relation.prepType === 'input' &&
      artifactIds.has(relation.sourceId) &&
      artifactIds.has(relation.targetId)
    ) {
      outgoing.get(relation.sourceId)?.push(relation);
    }
  }

  const status = new Map<string, 'visiting' | 'visited'>();
  const cycleRelations: PrepRelation[] = [];
  const cycleRelationIds = new Set<string>();

  const visit = (artifactId: string): void => {
    status.set(artifactId, 'visiting');

    for (const relation of outgoing.get(artifactId) ?? []) {
      const targetStatus = status.get(relation.targetId);

      if (targetStatus === 'visiting') {
        if (!cycleRelationIds.has(relation.id)) {
          cycleRelationIds.add(relation.id);
          cycleRelations.push(relation);
        }
        continue;
      }

      if (targetStatus !== 'visited') {
        visit(relation.targetId);
      }
    }

    status.set(artifactId, 'visited');
  };

  for (const artifact of model.artifacts) {
    if (status.get(artifact.id) === undefined) {
      visit(artifact.id);
    }
  }

  return cycleRelations;
}

function resolveContext(
  model: PrepModelFile,
  input?: ValidationContextInput,
): {
  activeProcessId?: string;
  visibleArtifactIds?: Set<string>;
} {
  if (typeof input === 'string') {
    return {
      activeProcessId: input,
      visibleArtifactIds: visibleIdsFromLayout(model, input),
    };
  }

  if (input?.mode === 'overview') return {};

  const savedView = model.layout.lastView;
  const activeProcessId =
    input?.activeProcessId ??
    (savedView?.mode === 'process' ? savedView.activeProcessId : undefined);
  const explicitIds =
    input?.visibleArtifactIds ?? input?.displayedArtifactIds;

  return {
    activeProcessId,
    visibleArtifactIds:
      explicitIds !== undefined
        ? new Set(explicitIds)
        : activeProcessId
          ? visibleIdsFromLayout(model, activeProcessId)
          : undefined,
  };
}

function visibleIdsFromLayout(
  model: PrepModelFile,
  activeProcessId: string,
): Set<string> | undefined {
  const views = model.layout.processViews?.filter(
    (view) => view.processId === activeProcessId,
  );
  if (!views || views.length === 0) return undefined;
  return new Set(
    views.flatMap((view) =>
      view.artifactPlacements.map((placement) => placement.artifactId),
    ),
  );
}

function artifactBelongsToTopLevel(
  model: PrepModelFile,
  artifact: PrepArtifact,
  topLevelProcess: PrepProcess | undefined,
): boolean {
  if (!topLevelProcess || topLevelProcess.parentProcessId) return false;
  if (!artifact.processId) return false;
  return (
    getTopLevelAncestor(model, artifact.processId)?.id === topLevelProcess.id
  );
}

function validateArtifactWarnings(
  artifact: PrepArtifact,
  model: PrepModelFile,
  activeProcessId: string | undefined,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const handoffs = model.processHandoffs;
  const hasRegisteredHandoff =
    handoffs === undefined
      ? !isBlank(artifact.nextProcessName)
      : handoffs.some((handoff) =>
          handoff.sourceArtifactIds.includes(artifact.id),
        );

  if (artifact.type === 'final' && !hasRegisteredHandoff) {
    issues.push(warning('W001', 'artifact', artifact.id));
  }

  if (
    artifact.scope === 'internal' &&
    !hasIncomingInput(artifact.id, model.relations)
  ) {
    issues.push(warning('W002', 'artifact', artifact.id));
  }

  if (
    artifact.type === 'intermediate' &&
    !hasOutgoingInput(artifact.id, model.relations)
  ) {
    issues.push(warning('W003', 'artifact', artifact.id));
  }

  if (
    artifact.type === 'intangible' &&
    isBlank(artifact.risk.description)
  ) {
    issues.push(warning('W004', 'artifact', artifact.id));
  }

  if (
    artifact.type === 'milestone' &&
    !hasIncomingInput(artifact.id, model.relations)
  ) {
    issues.push(warning('W006', 'artifact', artifact.id));
  }

  if (
    artifact.risk.level === 'high' &&
    !hasRiskFollowUp(artifact.id, model.relations)
  ) {
    issues.push(warning('W007', 'artifact', artifact.id));
  }

  if (!hasAnyRelation(artifact.id, model.relations)) {
    issues.push(warning('W008', 'artifact', artifact.id));
  }

  if (
    activeProcessId !== undefined &&
    artifact.processId === activeProcessId
  ) {
    issues.push(warning('W014', 'artifact', artifact.id));
  }

  if (!isBlank(artifact.legacyNextProcessName)) {
    issues.push(warning('W017', 'artifact', artifact.id));
  }

  return issues;
}

function validateHandoff(
  handoff: ProcessHandoff,
  model: PrepModelFile,
  processById: ReadonlyMap<string, PrepProcess>,
  artifactById: ReadonlyMap<string, PrepArtifact>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sourceProcess = processById.get(handoff.sourceProcessId);
  const targetProcess = processById.get(handoff.targetProcessId);
  const missingArtifactReference = [
    ...handoff.sourceArtifactIds,
    ...handoff.targetArtifactIds,
  ].some((artifactId) => !artifactById.has(artifactId));

  if (!sourceProcess || !targetProcess || missingArtifactReference) {
    issues.push(error('E008', 'processHandoff', handoff.id));
  }

  if (
    sourceProcess &&
    targetProcess &&
    (sourceProcess.parentProcessId !== undefined ||
      targetProcess.parentProcessId !== undefined ||
      sourceProcess.id === targetProcess.id)
  ) {
    issues.push(error('E019', 'processHandoff', handoff.id));
  }

  for (const artifactId of handoff.sourceArtifactIds) {
    const artifact = artifactById.get(artifactId);
    if (
      artifact &&
      (artifact.type !== 'final' ||
        !artifactBelongsToTopLevel(model, artifact, sourceProcess))
    ) {
      issues.push(error('E020', 'artifact', artifact.id));
    }
  }

  for (const artifactId of handoff.targetArtifactIds) {
    const artifact = artifactById.get(artifactId);
    if (
      artifact &&
      (artifact.scope !== 'external-input' ||
        !artifactBelongsToTopLevel(model, artifact, targetProcess))
    ) {
      issues.push(error('E021', 'artifact', artifact.id));
    }
  }

  if (hasInvalidAnchor(handoff, true)) {
    issues.push(error('E018', 'processHandoff', handoff.id));
  } else if (hasAutoAnchor(handoff)) {
    issues.push(warning('W018', 'processHandoff', handoff.id));
  }

  if (handoff.sourceArtifactIds.length === 0) {
    issues.push(warning('W015', 'processHandoff', handoff.id));
  }
  if (handoff.targetArtifactIds.length === 0) {
    issues.push(warning('W016', 'processHandoff', handoff.id));
  }

  return issues;
}

export function validateModel(
  model: PrepModelFile,
  context?: ValidationContextInput,
): ValidationResult;
export function validateModel(
  model: unknown,
  context?: ValidationContextInput,
): ValidationResult;
export function validateModel(
  input: unknown,
  context?: ValidationContextInput,
): ValidationResult {
  if (!isValidationModel(input)) {
    return createSchemaValidationResult();
  }

  const model = input;
  const issues: ValidationIssue[] = [];
  const modelId = model.metadata.modelId;
  const processById = new Map(
    model.processes.map((process) => [process.id, process]),
  );
  const artifactById = new Map(
    model.artifacts.map((artifact) => [artifact.id, artifact]),
  );
  const actors = model.actors ?? [];
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const lanes = model.processActorLanes ?? [];
  const handoffs = model.processHandoffs ?? [];
  const anchorsRequired = usesCanonicalCollections(model);
  const activeView = resolveContext(model, context);

  for (const view of model.layout.processViews ?? []) {
    for (const column of view.subprocessColumns) {
      if (
        !Number.isFinite(column.width) ||
        column.width < MIN_SUBPROCESS_COLUMN_WIDTH ||
        (column.height !== undefined &&
          (!Number.isFinite(column.height) ||
            column.height < MIN_SUBPROCESS_COLUMN_HEIGHT))
      ) {
        issues.push(error('E023', 'process', column.processId));
      }
    }
  }

  if (isBlank(model.system.name)) {
    issues.push(error('E001', 'system', model.system.id));
  }

  if (isBlank(model.system.goal)) {
    issues.push(error('E002', 'system', model.system.id));
  }

  if (model.processes.length === 0) {
    issues.push(error('E003', 'model', modelId));
  }

  for (const process of model.processes) {
    if (isBlank(process.name)) {
      issues.push(error('E004', 'process', process.id));
    }
    if (isBlank(process.goal)) {
      issues.push(error('E005', 'process', process.id));
    }
    if (
      process.parentProcessId !== undefined &&
      !processById.has(process.parentProcessId)
    ) {
      issues.push(error('E012', 'process', process.id));
    }
  }

  const cyclicProcessIds = new Set(
    findProcessHierarchyCycles(model).flat(),
  );
  for (const processId of cyclicProcessIds) {
    issues.push(error('E013', 'process', processId));
  }

  if (model.artifacts.length === 0) {
    issues.push(error('E006', 'model', modelId));
  }

  if (!model.artifacts.some((artifact) => artifact.type === 'final')) {
    issues.push(error('E007', 'model', modelId));
  }

  const shouldValidateActors =
    model.actors !== undefined ||
    model.processActorLanes !== undefined ||
    model.artifacts.some(
      (artifact) => artifact.responsibleActorId !== undefined,
    );

  for (const artifact of model.artifacts) {
    if (
      artifact.processId !== undefined &&
      !processById.has(artifact.processId)
    ) {
      issues.push(error('E014', 'artifact', artifact.id));
    }

    if (shouldValidateActors) {
      const responsibleActor = artifact.responsibleActorId
        ? actorById.get(artifact.responsibleActorId)
        : undefined;
      if (!responsibleActor || responsibleActor.isPlaceholder) {
        issues.push(error('E015', 'artifact', artifact.id));
      }
    }

    if (artifact.states.filter((state) => state.isCurrent).length > 1) {
      issues.push(error('E010', 'artifact', artifact.id));
    }
  }

  const lanePairs = new Set<string>();
  for (const lane of lanes) {
    if (!processById.has(lane.processId) || !actorById.has(lane.actorId)) {
      issues.push(error('E016', 'lane', lane.id));
    }
    const key = `${lane.processId}\u0000${lane.actorId}`;
    if (lanePairs.has(key)) {
      issues.push(error('E017', 'lane', lane.id));
    } else {
      lanePairs.add(key);
    }
  }

  const validRelationEndpointIds = new Set(
    anchorsRequired
      ? model.artifacts.map((artifact) => artifact.id)
      : [
          ...model.artifacts.map((artifact) => artifact.id),
          ...model.externalProcesses.map((process) => process.id),
        ],
  );

  for (const relation of model.relations) {
    if (
      !validRelationEndpointIds.has(relation.sourceId) ||
      !validRelationEndpointIds.has(relation.targetId)
    ) {
      issues.push(error('E008', 'relation', relation.id));
    }

    if (
      relation.prepType === 'sync' &&
      relation.sourceId === relation.targetId
    ) {
      issues.push(error('E009', 'relation', relation.id));
    }

    if (hasInvalidAnchor(relation, anchorsRequired)) {
      issues.push(error('E018', 'relation', relation.id));
    } else if (hasAutoAnchor(relation)) {
      issues.push(warning('W018', 'relation', relation.id));
    }

    if (
      relation.prepType === 'sync' &&
      isBlank(relation.risk.description)
    ) {
      issues.push(warning('W005', 'relation', relation.id));
    }

    if (
      relation.risk.level === 'high' &&
      !isMitigationRelation(relation) &&
      !hasRiskFollowUp(relation.targetId, model.relations)
    ) {
      issues.push(warning('W007', 'relation', relation.id));
    }
  }

  for (const handoff of handoffs) {
    issues.push(
      ...validateHandoff(handoff, model, processById, artifactById),
    );
  }

  for (const artifact of model.artifacts) {
    issues.push(
      ...validateArtifactWarnings(
        artifact,
        model,
        activeView.activeProcessId,
      ),
    );
  }

  for (const relation of findInputCycleRelations(model)) {
    issues.push(warning('W009', 'relation', relation.id));
  }

  for (const process of model.processes) {
    const childProcesses = getDirectChildProcesses(model, process.id);
    if (process.parentProcessId !== undefined) {
      const hasArtifacts = model.artifacts.some(
        (artifact) => artifact.processId === process.id,
      );
      if (!hasArtifacts && childProcesses.length === 0) {
        issues.push(warning('W010', 'process', process.id));
      }
    }

    const hasDirectArtifacts = model.artifacts.some(
      (artifact) => artifact.processId === process.id,
    );
    const childIds = new Set(childProcesses.map((child) => child.id));
    const hasChildArtifacts = model.artifacts.some(
      (artifact) =>
        artifact.processId !== undefined &&
        childIds.has(artifact.processId),
    );
    if (hasDirectArtifacts && hasChildArtifacts) {
      issues.push(warning('W011', 'process', process.id));
    }
  }

  if (activeView.activeProcessId !== undefined) {
    if (
      processById.has(activeView.activeProcessId) &&
      getDirectChildProcesses(model, activeView.activeProcessId).length === 0
    ) {
      issues.push(
        warning('W012', 'process', activeView.activeProcessId),
      );
    }

    if (activeView.visibleArtifactIds !== undefined) {
      const allowedProcessIds = getVisibleProcessIds(
        model,
        activeView.activeProcessId,
      );
      for (const artifactId of activeView.visibleArtifactIds) {
        const artifact = artifactById.get(artifactId);
        if (
          artifact &&
          (artifact.processId === undefined ||
            !allowedProcessIds.has(artifact.processId))
        ) {
          issues.push(error('E022', 'artifact', artifact.id));
        }
      }
    }
  }

  if (model.actors !== undefined) {
    for (const actor of actors) {
      if (
        !model.artifacts.some(
          (artifact) => artifact.responsibleActorId === actor.id,
        )
      ) {
        issues.push(warning('W013', 'actor', actor.id));
      }
    }
  }

  return toResult(issues);
}

/** Compatibility alias for code that treats validation as a verb. */
export const validatePrepModel = validateModel;
