import {
  Box,
  CheckCircle2,
  CircleDot,
  Coffee,
  FileQuestion,
  Layers3,
  LayoutTemplate,
  Network,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
} from 'lucide-react';
import type { ArtifactType } from '../domain/model';

export const PREP_DRAG_MIME = 'application/x-prep-element';

export type PaletteElementKind =
  | { kind: 'process' }
  | { kind: 'subprocess' }
  | { kind: 'actor' }
  | { kind: 'artifact'; artifactType: ArtifactType }
  | { kind: 'externalProcess' }
  | { kind: 'processHandoff' };

export type TemplateKind = 'empty' | 'constrained-mlc' | 'coffee';
export type ViewMode = 'normal' | 'risk' | 'assurance' | 'impact';

export interface PaletteProps {
  editorMode?: 'process' | 'overview';
  viewMode: ViewMode;
  actorItems?: Array<{ id: string; name: string; role?: string }>;
  subprocessItems?: Array<{ id: string; name: string }>;
  processItems?: Array<{ id: string; name: string }>;
  onAddElement: (element: PaletteElementKind) => void;
  onLoadTemplate: (template: TemplateKind) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onSelectActor?: (actorId: string) => void;
  onSelectProcess?: (processId: string) => void;
}

type ElementCard = {
  payload: PaletteElementKind;
  label: string;
  description: string;
  icon: React.ReactNode;
  tone: string;
};

const processElements: ElementCard[] = [
  {
    payload: { kind: 'actor' },
    label: 'アクター',
    description: '横レーンと責任主体を追加',
    icon: <UserRoundPlus size={17} />,
    tone: 'slate',
  },
  {
    payload: { kind: 'subprocess' },
    label: 'サブプロセス',
    description: '詳細画面の縦列を追加',
    icon: <Layers3 size={17} />,
    tone: 'slate',
  },
  {
    payload: { kind: 'artifact', artifactType: 'intermediate' },
    label: '中間成果物',
    description: '内部で生成・利用',
    icon: <Box size={17} />,
    tone: 'white',
  },
  {
    payload: { kind: 'artifact', artifactType: 'final' },
    label: '最終成果物',
    description: '次工程へ出力',
    icon: <CheckCircle2 size={17} />,
    tone: 'gray',
  },
  {
    payload: { kind: 'artifact', artifactType: 'milestone' },
    label: 'マイルストーン',
    description: '確認・承認ゲート',
    icon: <ShieldCheck size={17} />,
    tone: 'blue',
  },
  {
    payload: { kind: 'artifact', artifactType: 'intangible' },
    label: '無実体成果物',
    description: '判断・知見',
    icon: <Sparkles size={17} />,
    tone: 'dashed',
  },
];

const overviewElements: ElementCard[] = [
  {
    payload: { kind: 'process' },
    label: 'トップレベルプロセス',
    description: '鳥瞰図に二重丸を追加',
    icon: <Layers3 size={17} />,
    tone: 'slate',
  },
  {
    payload: { kind: 'externalProcess' },
    label: '外部プロセス',
    description: '点線の二重丸を追加',
    icon: <CircleDot size={17} />,
    tone: 'external',
  },
  {
    payload: { kind: 'processHandoff' },
    label: 'プロセス間引継ぎ',
    description: '2つのプロセスを選択して追加',
    icon: <Network size={17} />,
    tone: 'blue',
  },
];

const viewModes: Array<{ value: ViewMode; label: string; hint: string }> = [
  { value: 'normal', label: '通常', hint: 'すべての要素を表示' },
  { value: 'risk', label: 'リスク', hint: '中・高リスクを強調' },
  { value: 'assurance', label: '保証連鎖', hint: '選択起点の経路' },
  { value: 'impact', label: '変更影響', hint: '明示・推定影響を区別' },
];

function encodePayload(payload: PaletteElementKind) {
  return JSON.stringify(payload);
}

export function Palette({
  editorMode = 'process',
  viewMode,
  actorItems = [],
  subprocessItems = [],
  processItems = [],
  onAddElement,
  onLoadTemplate,
  onViewModeChange,
  onSelectActor,
  onSelectProcess,
}: PaletteProps) {
  const elements = editorMode === 'overview' ? overviewElements : processElements;
  return (
    <aside className="palette" aria-label="モデル要素とテンプレート">
      <section className="sidebar-section">
        <div className="section-heading">
          <span>{editorMode === 'overview' ? '鳥瞰図要素' : 'プロセス詳細要素'}</span>
          <small>クリック / ドラッグ</small>
        </div>
        <div className="element-list">
          {elements.map((item) => (
            <button
              key={encodePayload(item.payload)}
              type="button"
              className={`element-card element-card--${item.tone}`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(
                  PREP_DRAG_MIME,
                  encodePayload(item.payload),
                );
                event.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onAddElement(item.payload)}
              data-testid={`add-${
                item.payload.kind === 'artifact'
                  ? item.payload.artifactType
                  : item.payload.kind
              }`}
            >
              <span className="element-card__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar-section palette-index" aria-label="モデル内要素一覧">
        {editorMode === 'process' ? (
          <>
            <div className="palette-index__group">
              <div className="section-heading"><span>アクター一覧</span><small>{actorItems.length}</small></div>
              {actorItems.length === 0 ? (
                <p>現在のプロセスにはアクターがいません</p>
              ) : actorItems.map((actor) => (
                <button key={actor.id} type="button" onClick={() => onSelectActor?.(actor.id)} data-testid={`actor-list-${actor.id}`}>
                  <strong>{actor.name || '名称未設定'}</strong>
                  <small>{actor.role || '役割未設定'}</small>
                </button>
              ))}
            </div>
            <div className="palette-index__group">
              <div className="section-heading"><span>サブプロセス一覧</span><small>{subprocessItems.length}</small></div>
              {subprocessItems.length === 0 ? (
                <p>直下のサブプロセスはありません</p>
              ) : subprocessItems.map((process) => (
                <button key={process.id} type="button" onClick={() => onSelectProcess?.(process.id)} data-testid={`subprocess-list-${process.id}`}>
                  <strong>{process.name || '名称未設定'}</strong>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="palette-index__group">
            <div className="section-heading"><span>プロセス一覧</span><small>{processItems.length}</small></div>
            {processItems.length === 0 ? (
              <p>トップレベルプロセスはありません</p>
            ) : processItems.map((process) => (
              <button key={process.id} type="button" onClick={() => onSelectProcess?.(process.id)} data-testid={`process-list-${process.id}`}>
                <strong>{process.name || '名称未設定'}</strong>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="sidebar-section">
        <div className="section-heading">
          <span>テンプレート</span>
        </div>
        <div className="template-list">
          <button
            type="button"
            onClick={() => onLoadTemplate('empty')}
            data-testid="template-empty"
          >
            <FileQuestion size={16} aria-hidden="true" />
            <span>
              <strong>空のモデル</strong>
              <small>プロセス1件から開始</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onLoadTemplate('constrained-mlc')}
            data-testid="template-constrained-mlc"
          >
            <LayoutTemplate size={16} aria-hidden="true" />
            <span>
              <strong>制約付き多ラベル分類</strong>
              <small>テスト設計・8成果物</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onLoadTemplate('coffee')}
            data-testid="template-coffee"
          >
            <Coffee size={16} aria-hidden="true" />
            <span>
              <strong>コーヒーを淹れる</strong>
              <small>小さな動作確認例</small>
            </span>
          </button>
        </div>
      </section>

      {editorMode === 'process' && <section className="sidebar-section">
        <div className="section-heading">
          <span>表示モード</span>
        </div>
        <div className="view-mode-list" role="radiogroup" aria-label="表示モード">
          {viewModes.map((mode) => (
            <label key={mode.value} className="view-mode-option">
              <input
                type="radio"
                name="view-mode"
                value={mode.value}
                checked={viewMode === mode.value}
                onChange={() => onViewModeChange(mode.value)}
              />
              <span>
                <strong>{mode.label}</strong>
                <small>{mode.hint}</small>
              </span>
            </label>
          ))}
        </div>
      </section>}
    </aside>
  );
}
