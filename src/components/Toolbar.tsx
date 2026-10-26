import {
  AlignHorizontalDistributeCenter,
  ArrowLeft,
  Braces,
  CheckCircle2,
  Download,
  FilePlus2,
  Image,
  LayoutDashboard,
  Network,
  Redo2,
  RotateCcw,
  Save,
  ScanSearch,
  Undo2,
} from 'lucide-react';

export interface ToolbarProps {
  modelName: string;
  saveStatus: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  canUndo: boolean;
  canRedo: boolean;
  canAnalyze: boolean;
  editorMode?: 'process' | 'overview';
  activeProcessId?: string;
  processOptions?: Array<{ id: string; name: string }>;
  onOpenOverview?: () => void;
  onOpenProcess?: (processId: string) => void;
  onNew: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAutoLayout: () => void;
  onValidate: () => void;
  onAssurance: () => void;
  onImpact: () => void;
  onImport: () => void;
  onSaveJson: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onFitView: () => void;
}

const saveStatusLabels: Record<ToolbarProps['saveStatus'], string> = {
  idle: '未保存',
  dirty: '変更あり',
  saving: '保存中…',
  saved: '自動保存済み',
  error: '保存エラー',
};

interface ToolButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  testId?: string;
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
  testId,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      className="toolbar-button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      data-testid={testId}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="toolbar" aria-label="モデル操作">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">
          <Network size={21} />
        </span>
        <span className="brand-copy">
          <strong>PReP Research Modeler</strong>
          <small>成果物中心モデルエディタ</small>
        </span>
      </div>

      <nav className="toolbar-actions" aria-label="編集と出力">
        <div className="toolbar-group toolbar-group--view">
          <ToolButton
            label="鳥瞰図"
            onClick={props.onOpenOverview ?? (() => undefined)}
            disabled={!props.onOpenOverview || props.editorMode === 'overview'}
          >
            {props.editorMode === 'process' ? <ArrowLeft size={16} /> : <LayoutDashboard size={16} />}
          </ToolButton>
          {props.processOptions && props.processOptions.length > 0 && (
            <label className="toolbar-process-select">
              <span className="visually-hidden">プロセスを開く</span>
              <select
                value={props.activeProcessId ?? ''}
                onChange={(event) => {
                  if (event.target.value) props.onOpenProcess?.(event.target.value);
                }}
                aria-label="プロセスを開く"
              >
                <option value="">プロセス選択</option>
                {props.processOptions.map((process) => (
                  <option key={process.id} value={process.id}>{process.name || '名称未設定'}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="toolbar-group">
          <ToolButton label="新規" onClick={props.onNew} testId="new-model">
            <FilePlus2 size={16} />
          </ToolButton>
          <ToolButton
            label="元に戻す"
            onClick={props.onUndo}
            disabled={!props.canUndo}
          >
            <Undo2 size={16} />
          </ToolButton>
          <ToolButton
            label="やり直す"
            onClick={props.onRedo}
            disabled={!props.canRedo}
          >
            <Redo2 size={16} />
          </ToolButton>
        </div>
        <div className="toolbar-group">
          <ToolButton label="自動整列" onClick={props.onAutoLayout}>
            <AlignHorizontalDistributeCenter size={16} />
          </ToolButton>
          <ToolButton label="全体表示" onClick={props.onFitView}>
            <ScanSearch size={16} />
          </ToolButton>
          <ToolButton
            label="検証"
            onClick={props.onValidate}
            testId="validate-model"
          >
            <CheckCircle2 size={16} />
          </ToolButton>
          <ToolButton
            label="保証連鎖"
            onClick={props.onAssurance}
            disabled={!props.canAnalyze}
          >
            <Network size={16} />
          </ToolButton>
          <ToolButton
            label="変更影響"
            onClick={props.onImpact}
            disabled={!props.canAnalyze}
          >
            <RotateCcw size={16} />
          </ToolButton>
        </div>
        <div className="toolbar-group">
          <ToolButton label="JSON読込" onClick={props.onImport}>
            <Download size={16} />
          </ToolButton>
          <ToolButton
            label="JSON保存"
            onClick={props.onSaveJson}
            testId="save-json"
          >
            <Save size={16} />
          </ToolButton>
          <ToolButton label="PNG出力" onClick={props.onExportPng}>
            <Image size={16} />
          </ToolButton>
          <ToolButton label="SVG出力" onClick={props.onExportSvg}>
            <Braces size={16} />
          </ToolButton>
        </div>
      </nav>

      <div className="model-status" aria-live="polite">
        <strong title={props.modelName}>{props.modelName || '名称未設定'}</strong>
        <span className={`save-status save-status--${props.saveStatus}`}>
          <span aria-hidden="true" />
          {saveStatusLabels[props.saveStatus]}
        </span>
      </div>
    </header>
  );
}
