import {
  Box,
  CircleDot,
  GitBranch,
  Layers3,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AnchorPosition,
  ArtifactScope,
  ArtifactType,
  ExternalProcess,
  PrepArtifact,
  PrepActor,
  PrepModelFile,
  PrepProcess,
  PrepRelation,
  PrepRelationType,
  ProcessActorLane,
  ProcessHandoff,
  PrepSystem,
  RiskLevel,
  SemanticRelationType,
} from '../domain/model';
import {
  getProcessDescendants,
  getTopLevelAncestor,
} from '../domain/processHierarchy';
import { getProcessGridGeometry } from '../domain/processGrid';

export type EditorSelection =
  | { kind: 'model' }
  | { kind: 'process'; id: string }
  | { kind: 'actor'; id: string }
  | { kind: 'artifact'; id: string }
  | { kind: 'externalProcess'; id: string }
  | { kind: 'relation'; id: string }
  | { kind: 'processHandoff'; id: string };

export interface PropertyPanelProps {
  model: PrepModelFile;
  selection: EditorSelection;
  activeProcessId?: string;
  onSelectModel: () => void;
  onUpdateMetadata: (patch: Partial<PrepModelFile['metadata']>) => void;
  onUpdateSystem: (patch: Partial<PrepSystem>) => void;
  onUpdateProcess: (id: string, patch: Partial<PrepProcess>) => void;
  onUpdateActor?: (id: string, patch: Partial<PrepActor>) => void;
  onUpdateProcessActorLane?: (
    id: string,
    patch: Partial<ProcessActorLane>,
  ) => void;
  onUpdateActorLaneHeight?: (
    processId: string,
    actorId: string,
    height: number,
  ) => void;
  onUpdateSubprocessColumnLayout?: (
    parentProcessId: string,
    processId: string,
    patch: { order?: number; width?: number; height?: number | null },
  ) => void;
  onUpdateArtifact: (id: string, patch: Partial<PrepArtifact>) => void;
  onUpdateExternalProcess: (
    id: string,
    patch: Partial<ExternalProcess>,
  ) => void;
  onUpdateRelation: (id: string, patch: Partial<PrepRelation>) => void;
  onUpdateProcessHandoff?: (
    id: string,
    patch: Partial<ProcessHandoff>,
  ) => void;
  onOpenProcess?: (processId: string) => void;
  onAddSubprocess?: (parentProcessId: string) => void;
  onCreateRelation: (sourceId: string, targetId: string) => void;
  onDeleteSelection: () => void;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  help?: string;
  readOnly?: boolean;
  testId?: string;
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  help,
  readOnly,
  testId,
}: FieldProps) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        data-testid={testId}
      />
      {help && <small>{help}</small>}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  help,
  testId,
}: FieldProps) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <textarea
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        data-testid={testId}
      />
      {help && <small>{help}</small>}
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="property-section-title">
      <strong>{children}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function RiskFields({
  level,
  description,
  onChange,
}: {
  level: RiskLevel;
  description?: string;
  onChange: (risk: { level: RiskLevel; description?: string }) => void;
}) {
  return (
    <>
      <SelectField
        label="リスクレベル"
        value={level}
        onChange={(nextLevel) =>
          onChange({ level: nextLevel, description })
        }
        options={[
          { value: 'none', label: 'なし' },
          { value: 'low', label: '低' },
          { value: 'medium', label: '中' },
          { value: 'high', label: '高' },
        ]}
      />
      <TextAreaField
        label="リスク説明"
        value={description ?? ''}
        onChange={(nextDescription) =>
          onChange({
            level,
            description: nextDescription || undefined,
          })
        }
        placeholder="潜在的な問題と確認事項"
      />
    </>
  );
}

function PanelHeader({
  icon,
  eyebrow,
  title,
  onSelectModel,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  onSelectModel: () => void;
}) {
  return (
    <header className="property-panel__header">
      <span className="property-panel__icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <small>{eyebrow}</small>
        <strong title={title}>{title}</strong>
      </span>
      <button
        type="button"
        className="icon-button"
        onClick={onSelectModel}
        aria-label="選択を解除してモデル情報を表示"
        title="選択を解除"
      >
        <X size={16} />
      </button>
    </header>
  );
}

export function PropertyPanel(props: PropertyPanelProps) {
  const { model, selection } = props;

  if (selection.kind === 'process') {
    const process = model.processes.find((item) => item.id === selection.id);
    if (process) return <ProcessProperties process={process} {...props} />;
  }

  if (selection.kind === 'artifact') {
    const artifact = model.artifacts.find((item) => item.id === selection.id);
    if (artifact) return <ArtifactProperties artifact={artifact} {...props} />;
  }

  if (selection.kind === 'actor') {
    const actor = (model.actors ?? []).find((item) => item.id === selection.id);
    if (actor) return <ActorProperties actor={actor} {...props} />;
  }

  if (selection.kind === 'externalProcess') {
    const externalProcess = model.externalProcesses.find(
      (item) => item.id === selection.id,
    );
    if (externalProcess) {
      return (
        <ExternalProcessProperties
          externalProcess={externalProcess}
          {...props}
        />
      );
    }
  }

  if (selection.kind === 'relation') {
    const relation = model.relations.find((item) => item.id === selection.id);
    if (relation) return <RelationProperties relation={relation} {...props} />;
  }


  if (selection.kind === 'processHandoff') {
    const handoff = (model.processHandoffs ?? []).find(
      (item) => item.id === selection.id,
    );
    if (handoff) return <ProcessHandoffProperties handoff={handoff} {...props} />;
  }

  return <ModelProperties {...props} />;
}

function ModelProperties(props: PropertyPanelProps) {
  const { model } = props;
  return (
    <div className="property-panel__content" data-testid="model-properties">
      <PanelHeader
        icon={<Settings2 size={18} />}
        eyebrow="MODEL"
        title={model.metadata.modelName || '名称未設定'}
        onSelectModel={props.onSelectModel}
      />
      <div className="property-scroll">
        <SectionTitle hint="保存ファイルと研究対象の基本情報">
          モデル情報
        </SectionTitle>
        <TextField
          label="モデル名"
          value={model.metadata.modelName}
          onChange={(modelName) => props.onUpdateMetadata({ modelName })}
          placeholder="例：テスト設計モデル"
          testId="model-name-input"
        />
        <TextField
          label="システム名"
          value={model.system.name}
          onChange={(name) => props.onUpdateSystem({ name })}
          placeholder="対象システム"
          testId="system-name-input"
        />
        <TextAreaField
          label="システムゴール"
          value={model.system.goal}
          onChange={(goal) => props.onUpdateSystem({ goal })}
          placeholder="このシステムが達成すること"
          testId="system-goal-input"
        />
        <SelectField
          label="フェーズ"
          value={model.system.phase}
          onChange={(phase) => props.onUpdateSystem({ phase })}
          options={[
            { value: 'unspecified', label: '未指定' },
            { value: 'as-is', label: 'As-is' },
            { value: 'to-be', label: 'To-be' },
          ]}
        />
        <TextField
          label="作成者"
          value={model.system.author ?? ''}
          onChange={(author) =>
            props.onUpdateSystem({ author: author || undefined })
          }
          placeholder="任意"
        />
        <TextField
          label="更新日時"
          value={new Date(model.metadata.updatedAt).toLocaleString('ja-JP')}
          onChange={() => {}}
          readOnly
        />
      </div>
    </div>
  );
}

function ProcessProperties({
  process,
  ...props
}: PropertyPanelProps & { process: PrepProcess }) {
  const excludedParentIds = new Set([
    process.id,
    ...getProcessDescendants(props.model, process.id).map((item) => item.id),
  ]);
  const actors = props.model.actors ?? [];
  const column = process.parentProcessId
    ? props.model.layout.processViews
        ?.find((view) => view.processId === process.parentProcessId)
        ?.subprocessColumns.find((item) => item.processId === process.id)
    : undefined;
  const autoHeight = process.parentProcessId
    ? getProcessGridGeometry(props.model, process.parentProcessId).columns.find(
        (item) => item.processId === process.id,
      )?.height
    : undefined;
  return (
    <div className="property-panel__content" data-testid="process-properties">
      <PanelHeader
        icon={<Layers3 size={18} />}
        eyebrow="PROCESS"
        title={process.name || '名称未設定'}
        onSelectModel={props.onSelectModel}
      />
      <div className="property-scroll">
        <SectionTitle>プロセス</SectionTitle>
        <TextField
          label="名称"
          value={process.name}
          onChange={(name) => props.onUpdateProcess(process.id, { name })}
          testId="process-name-input"
        />
        <TextAreaField
          label="ゴール"
          value={process.goal}
          onChange={(goal) => props.onUpdateProcess(process.id, { goal })}
          testId="process-goal-input"
        />
        <label className="form-field">
          <span>親プロセス</span>
          <select
            value={process.parentProcessId ?? ''}
            onChange={(event) =>
              props.onUpdateProcess(process.id, {
                parentProcessId: event.target.value || undefined,
              })
            }
          >
            <option value="">システム直下（トップレベル）</option>
            {props.model.processes
              .filter((item) => !excludedParentIds.has(item.id))
              .map((item) => (
                <option key={item.id} value={item.id}>{item.name || '名称未設定'}</option>
              ))}
          </select>
          <small>自分自身と子孫は候補に表示されません</small>
        </label>
        {process.parentProcessId && (
          <>
            <label className="form-field">
              <span>列順序</span>
              <input
                type="number"
                min={0}
                value={column?.order ?? 0}
                onChange={(event) =>
                  props.onUpdateSubprocessColumnLayout?.(
                    process.parentProcessId!,
                    process.id,
                    { order: Math.max(0, Number(event.target.value)) },
                  )
                }
              />
            </label>
            <label className="form-field">
              <span>範囲ボックスの幅</span>
              <input
                type="number"
                min={260}
                value={column?.width ?? 360}
                data-testid="subprocess-width-input"
                onChange={(event) =>
                  props.onUpdateSubprocessColumnLayout?.(
                    process.parentProcessId!,
                    process.id,
                    { width: Math.max(260, Number(event.target.value)) },
                  )
                }
              />
              <small>最小260px</small>
            </label>
            <label className="form-field">
              <span>範囲ボックスの高さ</span>
              <input
                type="number"
                min={160}
                value={column?.height ?? ''}
                placeholder={`自動（${autoHeight ?? 0}px）`}
                data-testid="subprocess-height-input"
                onChange={(event) => {
                  const height = event.target.value === ''
                    ? null
                    : Number(event.target.value);
                  props.onUpdateSubprocessColumnLayout?.(
                    process.parentProcessId!,
                    process.id,
                    { height },
                  );
                }}
              />
              <small>未入力は全アクターレーンに追従。手動高さは最小160px</small>
            </label>
            <button
              type="button"
              className="property-panel__inline-action"
              data-testid="subprocess-height-auto"
              disabled={column?.height === undefined}
              onClick={() =>
                props.onUpdateSubprocessColumnLayout?.(
                  process.parentProcessId!,
                  process.id,
                  { height: null },
                )
              }
            >
              高さを自動に戻す
            </button>
          </>
        )}
        <label className="form-field">
          <span>主担当アクター</span>
          <select
            value={process.leadActorId ?? ''}
            onChange={(event) =>
              props.onUpdateProcess(process.id, {
                leadActorId: event.target.value || undefined,
              })
            }
          >
            <option value="">未指定</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>{actor.name}</option>
            ))}
          </select>
        </label>
        <TextField
          label="技術"
          value={process.technology ?? ''}
          onChange={(technology) =>
            props.onUpdateProcess(process.id, {
              technology: technology || undefined,
            })
          }
        />
        <TextField
          label="リソース"
          value={(process.resources ?? []).join(', ')}
          onChange={(resources) =>
            props.onUpdateProcess(process.id, {
              resources: resources
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
          help="複数ある場合はカンマで区切ります"
        />
        <TextAreaField
          label="説明"
          value={process.description ?? ''}
          onChange={(description) =>
            props.onUpdateProcess(process.id, {
              description: description || undefined,
            })
          }
        />
        <div className="property-action-row">
          <button
            type="button"
            className="add-row-button"
            onClick={() => props.onOpenProcess?.(process.id)}
          >
            このプロセスを開く
          </button>
          <button
            type="button"
            className="add-row-button"
            onClick={() => props.onAddSubprocess?.(process.id)}
          >
            <Plus size={14} /> この中にサブプロセスを追加
          </button>
        </div>
        <DeleteElementButton
          label="プロセスを削除"
          onClick={props.onDeleteSelection}
        />
      </div>
    </div>
  );
}

function ArtifactProperties({
  artifact,
  ...props
}: PropertyPanelProps & { artifact: PrepArtifact }) {
  const update = (patch: Partial<PrepArtifact>) =>
    props.onUpdateArtifact(artifact.id, patch);
  const activeLaneActorIds = new Set(
    props.activeProcessId
      ? getProcessGridGeometry(props.model, props.activeProcessId).lanes.map(
          (lane) => lane.actorId,
        )
      : [],
  );
  const responsibleActors = (props.model.actors ?? []).filter(
    (actor) =>
      !props.activeProcessId ||
      activeLaneActorIds.has(actor.id) ||
      actor.id === artifact.responsibleActorId,
  );

  return (
    <div className="property-panel__content" data-testid="artifact-properties">
      <PanelHeader
        icon={<Box size={18} />}
        eyebrow="ARTIFACT"
        title={artifact.name || '名称未設定'}
        onSelectModel={props.onSelectModel}
      />
      <div className="property-scroll">
        <SectionTitle>成果物</SectionTitle>
        <TextField
          label="名称"
          value={artifact.name}
          onChange={(name) => update({ name })}
          testId="artifact-name-input"
        />
        <SelectField<ArtifactType>
          label="種類"
          value={artifact.type}
          onChange={(type) => update({ type })}
          options={[
            { value: 'intermediate', label: '中間成果物' },
            { value: 'final', label: '最終成果物' },
            { value: 'milestone', label: 'マイルストーン成果物' },
            { value: 'intangible', label: '無実体成果物' },
          ]}
        />
        <SelectField<ArtifactScope>
          label="内外区分"
          value={artifact.scope}
          onChange={(scope) => update({ scope })}
          options={[
            { value: 'internal', label: '内部' },
            { value: 'external-input', label: '外部入力' },
            { value: 'external-output', label: '外部出力' },
          ]}
        />
        <TextAreaField
          label="説明"
          value={artifact.description ?? ''}
          onChange={(description) =>
            update({ description: description || undefined })
          }
        />
        <label className="form-field">
          <span>責任アクター</span>
          <select
            value={artifact.responsibleActorId ?? ''}
            onChange={(event) =>
              update({ responsibleActorId: event.target.value || undefined })
            }
          >
            <option value="">未指定</option>
            {responsibleActors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
                {actor.isPlaceholder
                  ? '（未割当）'
                  : props.activeProcessId && !activeLaneActorIds.has(actor.id)
                    ? '（レーン未登録）'
                    : ''}
              </option>
            ))}
          </select>
          <small>現在のプロセスに登録されたアクターレーンから選択します</small>
        </label>
        <label className="form-field">
          <span>所属サブプロセス</span>
          <select
            value={artifact.processId ?? ''}
            onChange={(event) => update({ processId: event.target.value || undefined })}
          >
            <option value="">未指定</option>
            {props.activeProcessId && (
              <option value={props.activeProcessId}>未分類（現在のプロセス直下）</option>
            )}
            {props.model.processes
              .filter((process) =>
                props.activeProcessId
                  ? process.parentProcessId === props.activeProcessId
                  : true,
              )
              .map((process) => (
                <option key={process.id} value={process.id}>{process.name || '名称未設定'}</option>
              ))}
          </select>
        </label>
        {artifact.legacyNextProcessName && (
          <TextField
            label="旧データの次工程名"
            value={artifact.legacyNextProcessName}
            onChange={(legacyNextProcessName) =>
              update({ legacyNextProcessName: legacyNextProcessName || undefined })
            }
            help="鳥瞰図のプロセス間引継ぎに対応付けてください"
          />
        )}

        <SectionTitle hint="情報の質的変化を記録">状態</SectionTitle>
        <div className="repeatable-list">
          {artifact.states.map((state) => (
            <div className="repeatable-card" key={state.id}>
              <div className="repeatable-card__row">
                <label className="current-state-control">
                  <input
                    type="radio"
                    name={`current-state-${artifact.id}`}
                    checked={state.isCurrent}
                    onChange={() =>
                      update({
                        states: artifact.states.map((item) => ({
                          ...item,
                          isCurrent: item.id === state.id,
                        })),
                      })
                    }
                  />
                  現在
                </label>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`${state.name || '状態'}を削除`}
                  onClick={() =>
                    update({
                      states: artifact.states.filter(
                        (item) => item.id !== state.id,
                      ),
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                aria-label="状態名"
                value={state.name}
                placeholder="状態名"
                onChange={(event) =>
                  update({
                    states: artifact.states.map((item) =>
                      item.id === state.id
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  })
                }
              />
              <textarea
                aria-label="状態の説明"
                rows={2}
                value={state.description ?? ''}
                placeholder="説明（任意）"
                onChange={(event) =>
                  update({
                    states: artifact.states.map((item) =>
                      item.id === state.id
                        ? {
                            ...item,
                            description: event.target.value || undefined,
                          }
                        : item,
                    ),
                  })
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="add-row-button"
            onClick={() =>
              update({
                states: [
                  ...artifact.states,
                  {
                    id: createId('state'),
                    name: '新しい状態',
                    isCurrent: artifact.states.length === 0,
                  },
                ],
              })
            }
          >
            <Plus size={14} /> 状態を追加
          </button>
        </div>

        <SectionTitle hint="任意のキーと値">属性</SectionTitle>
        <div className="repeatable-list">
          {artifact.attributes.map((attribute) => (
            <div className="attribute-row" key={attribute.id}>
              <input
                aria-label="属性名"
                value={attribute.key}
                placeholder="属性名"
                onChange={(event) =>
                  update({
                    attributes: artifact.attributes.map((item) =>
                      item.id === attribute.id
                        ? { ...item, key: event.target.value }
                        : item,
                    ),
                  })
                }
              />
              <input
                aria-label="属性値"
                value={attribute.value}
                placeholder="値"
                onChange={(event) =>
                  update({
                    attributes: artifact.attributes.map((item) =>
                      item.id === attribute.id
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="icon-button danger"
                aria-label={`${attribute.key || '属性'}を削除`}
                onClick={() =>
                  update({
                    attributes: artifact.attributes.filter(
                      (item) => item.id !== attribute.id,
                    ),
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="add-row-button"
            onClick={() =>
              update({
                attributes: [
                  ...artifact.attributes,
                  { id: createId('attribute'), key: '', value: '' },
                ],
              })
            }
          >
            <Plus size={14} /> 属性を追加
          </button>
        </div>

        <SectionTitle>リスク</SectionTitle>
        <RiskFields
          level={artifact.risk.level}
          description={artifact.risk.description}
          onChange={(risk) => update({ risk })}
        />
        <RelationQuickCreate
          model={props.model}
          sourceId={artifact.id}
          activeProcessId={props.activeProcessId}
          onCreate={props.onCreateRelation}
        />
        <DeleteElementButton
          label="成果物を削除"
          onClick={props.onDeleteSelection}
        />
      </div>
    </div>
  );
}

function ActorProperties({
  actor,
  ...props
}: PropertyPanelProps & { actor: PrepActor }) {
  const lane = (props.model.processActorLanes ?? []).find(
    (item) =>
      item.actorId === actor.id &&
      item.processId === props.activeProcessId,
  );
  const visibleLane = props.activeProcessId
    ? getProcessGridGeometry(props.model, props.activeProcessId).lanes.find(
        (item) => item.actorId === actor.id,
      )
    : undefined;
  const owned = props.model.artifacts.filter(
    (artifact) => artifact.responsibleActorId === actor.id,
  );

  return (
    <div className="property-panel__content" data-testid="actor-properties">
      <PanelHeader
        icon={<CircleDot size={18} />}
        eyebrow="ACTOR"
        title={actor.name || '名称未設定'}
        onSelectModel={props.onSelectModel}
      />
      <div className="property-scroll">
        <SectionTitle>アクター</SectionTitle>
        <TextField
          label="名称"
          value={actor.name}
          onChange={(name) => props.onUpdateActor?.(actor.id, { name })}
        />
        <TextAreaField
          label="説明"
          value={actor.description ?? ''}
          onChange={(description) =>
            props.onUpdateActor?.(actor.id, {
              description: description || undefined,
            })
          }
        />
        {visibleLane && (
          <>
            <SectionTitle>現在のプロセスでのレーン</SectionTitle>
            {lane && (
              <>
                <TextField
                  label="役割"
                  value={lane.role ?? ''}
                  onChange={(role) =>
                    props.onUpdateProcessActorLane?.(lane.id, {
                      role: role || undefined,
                    })
                  }
                />
                <label className="form-field">
                  <span>レーン順序</span>
                  <input
                    type="number"
                    min={0}
                    value={lane.order}
                    onChange={(event) =>
                      props.onUpdateProcessActorLane?.(lane.id, {
                        order: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </>
            )}
            <label className="form-field">
              <span>レーン高さ</span>
              <input
                type="number"
                min={160}
                value={visibleLane.height}
                data-testid="actor-lane-height-input"
                onChange={(event) => {
                  if (!props.activeProcessId) return;
                  props.onUpdateActorLaneHeight?.(
                    props.activeProcessId,
                    actor.id,
                    Number(event.target.value),
                  );
                }}
              />
              <small>最小160px。成果物がある場合は外周＋24pxまで縮小できます。</small>
            </label>
          </>
        )}
        <SectionTitle hint={`${owned.length}件`}>責任を持つ成果物</SectionTitle>
        <ul className="property-reference-list">
          {owned.map((artifact) => <li key={artifact.id}>{artifact.name || '名称未設定'}</li>)}
          {owned.length === 0 && <li>該当する成果物はありません</li>}
        </ul>
        <DeleteElementButton
          label="アクターを削除（責任成果物は移管が必要）"
          onClick={props.onDeleteSelection}
        />
      </div>
    </div>
  );
}

function ExternalProcessProperties({
  externalProcess,
  ...props
}: PropertyPanelProps & { externalProcess: ExternalProcess }) {
  return (
    <div
      className="property-panel__content"
      data-testid="external-process-properties"
    >
      <PanelHeader
        icon={<CircleDot size={18} />}
        eyebrow="EXTERNAL PROCESS"
        title={externalProcess.name || '名称未設定'}
        onSelectModel={props.onSelectModel}
      />
      <div className="property-scroll">
        <SectionTitle>外部プロセス</SectionTitle>
        <TextField
          label="名称"
          value={externalProcess.name}
          onChange={(name) =>
            props.onUpdateExternalProcess(externalProcess.id, { name })
          }
        />
        <TextAreaField
          label="説明"
          value={externalProcess.description ?? ''}
          onChange={(description) =>
            props.onUpdateExternalProcess(externalProcess.id, {
              description: description || undefined,
            })
          }
        />
        <DeleteElementButton
          label="外部プロセスを削除"
          onClick={props.onDeleteSelection}
        />
      </div>
    </div>
  );
}

function RelationProperties({
  relation,
  ...props
}: PropertyPanelProps & { relation: PrepRelation }) {
  const update = (patch: Partial<PrepRelation>) =>
    props.onUpdateRelation(relation.id, patch);
  const anchorOptions: Array<{ value: AnchorPosition; label: string }> = [
    { value: 'n', label: '上 (n)' },
    { value: 'ne', label: '右上 (ne)' },
    { value: 'e', label: '右 (e)' },
    { value: 'se', label: '右下 (se)' },
    { value: 's', label: '下 (s)' },
    { value: 'sw', label: '左下 (sw)' },
    { value: 'w', label: '左 (w)' },
    { value: 'nw', label: '左上 (nw)' },
    { value: 'auto', label: '自動（旧データ）' },
  ];

  return (
    <div className="property-panel__content" data-testid="relation-properties">
      <PanelHeader
        icon={<GitBranch size={18} />}
        eyebrow="RELATION"
        title={relation.semanticType || (relation.prepType === 'input' ? '入力関係' : '同期関係')}
        onSelectModel={props.onSelectModel}
      />
      <div className="property-scroll">
        <SectionTitle>関係</SectionTitle>
        <SelectField<PrepRelationType>
          label="PReP標準関係"
          value={relation.prepType}
          onChange={(prepType) => update({ prepType })}
          options={[
            { value: 'input', label: '入力関係' },
            { value: 'sync', label: '同期関係' },
          ]}
        />
        <label className="form-field">
          <span>研究用意味ラベル</span>
          <select
            value={relation.semanticType ?? ''}
            onChange={(event) =>
              update({
                semanticType:
                  (event.target.value as SemanticRelationType) || undefined,
              })
            }
          >
            <option value="">なし</option>
            <option value="derives-from">derives-from</option>
            <option value="justifies">justifies</option>
            <option value="mitigates">mitigates</option>
            <option value="approves">approves</option>
            <option value="monitors">monitors</option>
            <option value="requires-revalidation-of">
              requires-revalidation-of
            </option>
          </select>
          <small>PReP標準関係とは別フィールドです</small>
        </label>
        <SelectField<AnchorPosition>
          label="始点接続点"
          value={relation.sourceAnchor ?? 'auto'}
          onChange={(sourceAnchor) => update({ sourceAnchor })}
          options={anchorOptions}
        />
        <SelectField<AnchorPosition>
          label="終点接続点"
          value={relation.targetAnchor ?? 'auto'}
          onChange={(targetAnchor) => update({ targetAnchor })}
          options={anchorOptions}
        />
        <TextAreaField
          label="説明"
          value={relation.description ?? ''}
          onChange={(description) =>
            update({ description: description || undefined })
          }
        />
        <SectionTitle>リスク</SectionTitle>
        <RiskFields
          level={relation.risk.level}
          description={relation.risk.description}
          onChange={(risk) => update({ risk })}
        />
        <DeleteElementButton
          label="関係を削除"
          onClick={props.onDeleteSelection}
        />
      </div>
    </div>
  );
}

function RelationQuickCreate({
  model,
  sourceId,
  activeProcessId,
  onCreate,
}: {
  model: PrepModelFile;
  sourceId: string;
  activeProcessId?: string;
  onCreate: (sourceId: string, targetId: string) => void;
}) {
  const targets = [
    ...model.artifacts
      .filter((artifact) => {
        if (!activeProcessId) return true;
        if (artifact.processId === activeProcessId) return true;
        return model.processes.some(
          (process) =>
            process.id === artifact.processId &&
            process.parentProcessId === activeProcessId,
        );
      })
      .map((artifact) => ({
        id: artifact.id,
        name: artifact.name || '名称未設定の成果物',
        group: '成果物',
      })),
  ].filter((target) => target.id !== sourceId);

  return (
    <>
      <SectionTitle hint="キーボードでも操作できます">
        関係を作成
      </SectionTitle>
      <form
        className="quick-relation-form"
        onSubmit={(event) => {
          event.preventDefault();
          const targetId = new FormData(event.currentTarget).get('targetId');
          if (typeof targetId === 'string' && targetId) {
            onCreate(sourceId, targetId);
          }
        }}
      >
        <label className="form-field">
          <span>接続先</span>
          <select name="targetId" disabled={targets.length === 0}>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.group}：{target.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="add-row-button"
          disabled={targets.length === 0}
        >
          <GitBranch size={14} aria-hidden="true" />
          選択した接続先との関係を設定
        </button>
      </form>
    </>
  );
}

function ProcessHandoffProperties({
  handoff,
  ...props
}: PropertyPanelProps & { handoff: ProcessHandoff }) {
  const update = (patch: Partial<ProcessHandoff>) =>
    props.onUpdateProcessHandoff?.(handoff.id, patch);
  const topLevel = props.model.processes.filter((process) => !process.parentProcessId);
  const sourceArtifacts = props.model.artifacts.filter((artifact) => {
    const root = artifact.processId
      ? getTopLevelAncestor(props.model, artifact.processId)
      : undefined;
    return root?.id === handoff.sourceProcessId && artifact.type === 'final';
  });
  const targetArtifacts = props.model.artifacts.filter((artifact) => {
    const root = artifact.processId
      ? getTopLevelAncestor(props.model, artifact.processId)
      : undefined;
    return root?.id === handoff.targetProcessId && artifact.scope === 'external-input';
  });
  const toggle = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
  const anchorOptions: Array<{ value: AnchorPosition; label: string }> = [
    { value: 'n', label: '上 (n)' },
    { value: 'ne', label: '右上 (ne)' },
    { value: 'e', label: '右 (e)' },
    { value: 'se', label: '右下 (se)' },
    { value: 's', label: '下 (s)' },
    { value: 'sw', label: '左下 (sw)' },
    { value: 'w', label: '左 (w)' },
    { value: 'nw', label: '左上 (nw)' },
    { value: 'auto', label: '自動（旧データ）' },
  ];

  return (
    <div className="property-panel__content" data-testid="process-handoff-properties">
      <PanelHeader
        icon={<GitBranch size={18} />}
        eyebrow="PROCESS HANDOFF"
        title="プロセス間引継ぎ"
        onSelectModel={props.onSelectModel}
      />
      <div className="property-scroll">
        <SectionTitle>引継ぎ</SectionTitle>
        <label className="form-field">
          <span>引継ぎ元プロセス</span>
          <select value={handoff.sourceProcessId} onChange={(event) => update({ sourceProcessId: event.target.value })}>
            {topLevel.map((process) => <option key={process.id} value={process.id}>{process.name}</option>)}
          </select>
        </label>
        <label className="form-field">
          <span>引継ぎ先プロセス</span>
          <select value={handoff.targetProcessId} onChange={(event) => update({ targetProcessId: event.target.value })}>
            {topLevel.map((process) => <option key={process.id} value={process.id}>{process.name}</option>)}
          </select>
        </label>
        <SelectField<PrepRelationType>
          label="関係種別"
          value={handoff.prepType}
          onChange={(prepType) => update({ prepType })}
          options={[
            { value: 'input', label: '入力関係' },
            { value: 'sync', label: '同期関係' },
          ]}
        />
        <SectionTitle>引継ぎ成果物</SectionTitle>
        <div className="property-checkbox-list">
          <strong>引継ぎ元（最終成果物）</strong>
          {sourceArtifacts.map((artifact) => (
            <label key={artifact.id}>
              <input
                type="checkbox"
                checked={handoff.sourceArtifactIds.includes(artifact.id)}
                onChange={() => update({ sourceArtifactIds: toggle(handoff.sourceArtifactIds, artifact.id) })}
              />
              {artifact.name}
            </label>
          ))}
          <strong>受け側（外部入力成果物）</strong>
          {targetArtifacts.map((artifact) => (
            <label key={artifact.id}>
              <input
                type="checkbox"
                checked={handoff.targetArtifactIds.includes(artifact.id)}
                onChange={() => update({ targetArtifactIds: toggle(handoff.targetArtifactIds, artifact.id) })}
              />
              {artifact.name}
            </label>
          ))}
        </div>
        <SelectField<AnchorPosition>
          label="始点接続点"
          value={handoff.sourceAnchor}
          onChange={(sourceAnchor) => update({ sourceAnchor })}
          options={anchorOptions}
        />
        <SelectField<AnchorPosition>
          label="終点接続点"
          value={handoff.targetAnchor}
          onChange={(targetAnchor) => update({ targetAnchor })}
          options={anchorOptions}
        />
        <TextAreaField
          label="説明"
          value={handoff.description ?? ''}
          onChange={(description) => update({ description: description || undefined })}
        />
        <DeleteElementButton label="プロセス間引継ぎを削除" onClick={props.onDeleteSelection} />
      </div>
    </div>
  );
}

function DeleteElementButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="delete-element-button" onClick={onClick}>
      <Trash2 size={15} aria-hidden="true" />
      {label}
    </button>
  );
}
