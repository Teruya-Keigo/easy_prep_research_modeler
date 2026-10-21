import {
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
} from '@xyflow/react';
import {
  AlertCircle,
  CheckCircle2,
  GitBranch,
  Layers3,
  MousePointer2,
  PackageOpen,
  PanelRight,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { AnalysisPanel } from './components/AnalysisPanel';
import {
  Palette,
  type PaletteElementKind,
  type TemplateKind,
  type ViewMode as PaletteViewMode,
} from './components/Palette';
import {
  ProcessHandoffDialog,
  type ProcessHandoffDraft,
} from './components/ProcessHandoffDialog';
import {
  PropertyPanel,
  type EditorSelection,
} from './components/PropertyPanel';
import {
  RelationDialog,
  type RelationDraft,
} from './components/RelationDialog';
import { Toolbar } from './components/Toolbar';
import { ValidationPanel } from './components/ValidationPanel';
import type {
  AnchorPosition,
  ArtifactType,
  ExternalProcess,
  PrepActor,
  PrepArtifact,
  PrepProcess,
  PrepRelation,
  ProcessActorLane,
  ProcessHandoff,
} from './domain/model';
import {
  getProcessBreadcrumbs,
  getTopLevelProcesses,
} from './domain/processHierarchy';
import {
  findProcessGridCellAtPoint,
  getProcessGridGeometry,
} from './domain/processGrid';
import type { ValidationIssue } from './domain/validation';
import { ModelCanvas } from './editor/ModelCanvas';
import type { PrepFlowEdge, PrepFlowNode } from './editor/flowTypes';
import {
  exportElementAsPng,
  exportElementAsSvg,
} from './services/imageExportService';
import {
  downloadPrepModelJson,
  PrepModelJsonError,
  readPrepModelFile,
  type PrepModelValidationIssue,
} from './services/jsonFileService';
import { LocalStorageModelRepository } from './services/localStorageRepository';
import {
  createDebouncedModelSaver,
  type AutosaveStatus,
} from './services/modelRepository';
import { layoutOverview } from './services/autoLayoutService';
import {
  selectCanRedo,
  selectCanUndo,
  selectPrimarySelection,
  useModelStore,
  type ElementSelection,
  type FocusTarget,
} from './store/modelStore';
import { createModelFromTemplate } from './templates';

type RightTab = 'properties' | 'validation' | 'analysis';
type ToastTone = 'success' | 'error' | 'info';

interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

interface PendingRelation {
  sourceId: string;
  targetId: string;
  sourceAnchor: AnchorPosition;
  targetAnchor: AnchorPosition;
}

interface PendingHandoff {
  sourceId: string;
  targetId: string;
  sourceAnchor: AnchorPosition;
  targetAnchor: AnchorPosition;
}

interface ImportErrorState {
  message: string;
  issues: ReadonlyArray<PrepModelValidationIssue>;
}

const rightTabOrder: RightTab[] = ['properties', 'validation', 'analysis'];
const repository = new LocalStorageModelRepository();

function applyAutosaveStatus(status: AutosaveStatus, error?: unknown) {
  const store = useModelStore.getState();
  if (status === 'scheduled') store.setSaveStatus('dirty');
  else if (status === 'saving') store.markSaving();
  else if (status === 'saved') store.markSaved();
  else if (status === 'error') store.markSaveError(error);
}

const autosave = createDebouncedModelSaver(repository, {
  onStatusChange: applyAutosaveStatus,
});

const artifactTypeNames: Record<ArtifactType, string> = {
  intermediate: '中間成果物',
  final: '最終成果物',
  milestone: 'マイルストーン成果物',
  intangible: '無実体成果物',
};

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function editorSelectionFrom(selection: ElementSelection | null): EditorSelection {
  if (!selection) return { kind: 'model' };
  switch (selection.type) {
    case 'process':
      return { kind: 'process', id: selection.id };
    case 'actor':
      return { kind: 'actor', id: selection.id };
    case 'artifact':
      return { kind: 'artifact', id: selection.id };
    case 'externalProcess':
      return { kind: 'externalProcess', id: selection.id };
    case 'relation':
      return { kind: 'relation', id: selection.id };
    case 'processHandoff':
      return { kind: 'processHandoff', id: selection.id };
  }
}

function targetForIssue(issue: ValidationIssue): FocusTarget {
  switch (issue.elementType) {
    case 'process':
    case 'actor':
    case 'artifact':
    case 'relation':
    case 'processHandoff':
      return { type: issue.elementType, id: issue.elementId ?? '' };
    case 'system':
      return { type: 'system' };
    default:
      return { type: 'model' };
  }
}

function relationFailureMessage(reason: string): string {
  const messages: Record<string, string> = {
    'duplicate-id': '同じIDの関係がすでに存在します。',
    'duplicate-relation': '同じ関係がすでに存在します。',
    'missing-source': '接続元が見つかりません。',
    'missing-target': '接続先が見つかりません。',
    'non-artifact-source': '成果物から接続してください。',
    'non-artifact-target': '成果物へ接続してください。',
    'cross-top-level-process': '別のトップレベルプロセスへは鳥瞰図の引継ぎを使います。',
    'not-shared-detail-view': '同じプロセス詳細に表示できる成果物同士を接続してください。',
    'sync-self-connection': '同一成果物には同期関係を作成できません。',
  };
  return messages[reason] ?? '関係を作成できませんでした。';
}

export default function App() {
  const store = useModelStore();
  const flow = useReactFlow<PrepFlowNode, PrepFlowEdge>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const hydratedOnce = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('properties');
  const [pendingRelation, setPendingRelation] = useState<PendingRelation | null>(null);
  const [pendingHandoff, setPendingHandoff] = useState<PendingHandoff | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [importError, setImportError] = useState<ImportErrorState | null>(null);

  const primarySelection = selectPrimarySelection(store);
  const canUndo = selectCanUndo(store);
  const canRedo = selectCanRedo(store);
  const editorSelection = editorSelectionFrom(primarySelection);
  const activeProcessId =
    store.editorView.mode === 'process'
      ? store.editorView.activeProcessId
      : undefined;
  const canAnalyze =
    store.editorView.mode === 'process' &&
    primarySelection?.type === 'artifact';
  const activeProcess = store.model.processes.find(
    (process) => process.id === activeProcessId,
  );
  const breadcrumbs = activeProcessId
    ? getProcessBreadcrumbs(store.model, activeProcessId)
    : [];

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (hydratedOnce.current) return;
    hydratedOnce.current = true;
    try {
      const restored = repository.load();
      if (restored) {
        store.loadModel(restored);
        notify('自動保存されたモデルを復元しました。', 'success');
      } else {
        store.newModel(createModelFromTemplate('empty'));
      }
    } catch (error) {
      store.newModel(createModelFromTemplate('empty'));
      store.markSaveError(error);
      notify(error instanceof Error ? error.message : '自動保存データを復元できませんでした。', 'error');
    } finally {
      setHydrated(true);
    }
  }, [notify, store]);

  useEffect(() => {
    if (hydrated) autosave.schedule(store.model);
  }, [hydrated, store.model]);

  useEffect(() => {
    const flush = () => {
      try {
        autosave.flush();
      } catch {
        // Save state is already visible in the toolbar.
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store]);

  const loadTemplate = useCallback(
    (template: TemplateKind) => {
      const hasContent =
        store.model.artifacts.length > 0 ||
        store.model.relations.length > 0 ||
        store.model.processes.some((process) => process.name || process.goal);
      if (hasContent && !window.confirm('現在のモデルをテンプレートで置き換えます。続行しますか？')) return;
      store.newModel(createModelFromTemplate(template));
      setRightTab('properties');
      setImportError(null);
      notify(template === 'empty' ? '空のモデルを作成しました。' : 'テンプレートを読み込みました。', 'success');
    },
    [notify, store],
  );

  const addSubprocess = useCallback(
    (parentProcessId: string) => {
      const id = createId('process');
      const process: PrepProcess = {
        id,
        parentProcessId,
        name: '新しいサブプロセス',
        goal: '',
      };
      store.beginHistoryTransaction();
      if (!store.addProcess(process)) {
        store.endHistoryTransaction();
        return;
      }
      store.setProcessViewport(id, { x: 0, y: 0, zoom: 1 });
      const existing = store.model.layout.processViews
        ?.find((view) => view.processId === parentProcessId)
        ?.subprocessColumns.length ?? 0;
      store.updateSubprocessColumnLayout(parentProcessId, id, {
        order: existing,
        width: 360,
      });
      store.endHistoryTransaction();
      store.setSelection([{ type: 'process', id }]);
      setRightTab('properties');
    },
    [store],
  );

  const addElement = useCallback(
    (element: PaletteElementKind, position?: { x: number; y: number }) => {
      if (element.kind === 'process') {
        const id = createId('process');
        const process: PrepProcess = { id, name: '新しいプロセス', goal: '' };
        store.beginHistoryTransaction();
        if (!store.addProcess(process)) {
          store.endHistoryTransaction();
          return;
        }
        store.setProcessViewport(id, { x: 0, y: 0, zoom: 1 });
        store.updateOverviewNodeLayout(id, 'process', {
          x: position?.x ?? 100 + getTopLevelProcesses(store.model).length * 44,
          y: position?.y ?? 100 + getTopLevelProcesses(store.model).length * 36,
        });
        store.endHistoryTransaction();
        store.setSelection([{ type: 'process', id }]);
        return;
      }
      if (element.kind === 'subprocess') {
        if (!activeProcessId) {
          notify('先に編集するプロセスを開いてください。');
          return;
        }
        addSubprocess(activeProcessId);
        return;
      }
      if (element.kind === 'actor') {
        if (!activeProcessId) return;
        const actorId = createId('actor');
        const actor: PrepActor = { id: actorId, name: '新しいアクター' };
        const lane: ProcessActorLane = {
          id: createId('lane'),
          processId: activeProcessId,
          actorId,
          order: (store.model.processActorLanes ?? []).filter((item) => item.processId === activeProcessId).length,
          height: 220,
        };
        store.beginHistoryTransaction();
        const actorAdded = store.addActor(actor);
        if (actorAdded) store.addProcessActorLane(lane);
        store.endHistoryTransaction();
        if (!actorAdded) return;
        store.setSelection([{ type: 'actor', id: actorId }]);
        setRightTab('properties');
        return;
      }
      if (element.kind === 'externalProcess') {
        const id = createId('external-process');
        const item: ExternalProcess = { id, name: '新しい外部プロセス' };
        store.beginHistoryTransaction();
        if (!store.addExternalProcess(item)) {
          store.endHistoryTransaction();
          return;
        }
        store.updateOverviewNodeLayout(id, 'external-process', {
          x: position?.x ?? 900,
          y: position?.y ?? 120 + store.model.externalProcesses.length * 150,
        });
        store.endHistoryTransaction();
        store.setSelection([{ type: 'externalProcess', id }]);
        return;
      }
      if (element.kind === 'processHandoff') {
        const processes = store.selection.filter((item) => item.type === 'process');
        if (processes.length !== 2) {
          notify('引継ぎ元と引継ぎ先のトップレベルプロセスを2件選択してください。');
          return;
        }
        setPendingHandoff({ sourceId: processes[0].id, targetId: processes[1].id, sourceAnchor: 'e', targetAnchor: 'w' });
        return;
      }
      if (!activeProcessId) return;
      const geometry = getProcessGridGeometry(store.model, activeProcessId);
      const cell = position
        ? findProcessGridCellAtPoint(geometry, position)
        : geometry.cells.find((candidate) => !candidate.isUnclassified) ??
          geometry.cells[0];
      if (!cell) {
        notify('成果物はアクターレーンとサブプロセス列の交点へ配置してください。', 'error');
        return;
      }
      const id = createId('artifact');
      const artifact: PrepArtifact = {
        id,
        processId: cell.processId,
        responsibleActorId: cell.actorId,
        name: `新しい${artifactTypeNames[element.artifactType]}`,
        type: element.artifactType,
        scope: element.artifactType === 'final' ? 'external-output' : 'internal',
        states: [{ id: createId('state'), name: '初期状態', isCurrent: true }],
        attributes: [],
        risk: { level: 'none' },
      };
      store.beginHistoryTransaction();
      if (!store.addArtifact(artifact)) {
        store.endHistoryTransaction();
        return;
      }
      store.upsertArtifactPlacement(activeProcessId, {
        artifactId: id,
        offsetX: position ? Math.max(12, position.x - cell.x) : 28,
        offsetY: position ? Math.max(12, position.y - cell.y) : 34,
      });
      store.endHistoryTransaction();
      store.setSelection([{ type: 'artifact', id }]);
      setRightTab('properties');
    },
    [activeProcessId, addSubprocess, notify, store],
  );

  const endpointName = useCallback(
    (id: string) => store.model.artifacts.find((item) => item.id === id)?.name ?? id,
    [store.model.artifacts],
  );

  const confirmRelation = useCallback(
    (draft: RelationDraft) => {
      if (!pendingRelation) return;
      const relation: PrepRelation = {
        id: createId('relation'),
        sourceId: pendingRelation.sourceId,
        targetId: pendingRelation.targetId,
        sourceAnchor: draft.sourceAnchor ?? pendingRelation.sourceAnchor,
        targetAnchor: draft.targetAnchor ?? pendingRelation.targetAnchor,
        prepType: draft.prepType,
        semanticType: draft.semanticType,
        description: draft.description,
        risk: { level: 'none' },
      };
      const result = store.addRelation(relation);
      if (!result.ok) {
        notify(relationFailureMessage(result.reason), 'error');
        return;
      }
      setPendingRelation(null);
      store.setSelection([{ type: 'relation', id: relation.id }]);
      setRightTab('properties');
      notify('関係を作成しました。', 'success');
    },
    [notify, pendingRelation, store],
  );

  const confirmHandoff = useCallback(
    (draft: ProcessHandoffDraft) => {
      if (!pendingHandoff) return;
      const handoff: ProcessHandoff = {
        id: createId('handoff'),
        sourceProcessId: pendingHandoff.sourceId,
        targetProcessId: pendingHandoff.targetId,
        ...draft,
      };
      const result = store.addProcessHandoff(handoff);
      if (!result.ok) {
        notify('プロセス間引継ぎを作成できません。始点・終点と成果物を確認してください。', 'error');
        return;
      }
      setPendingHandoff(null);
      store.setSelection([{ type: 'processHandoff', id: handoff.id }]);
      notify('プロセス間引継ぎを作成しました。', 'success');
    },
    [notify, pendingHandoff, store],
  );

  const runValidation = useCallback(() => {
    const result = store.validate();
    setRightTab('validation');
    setImportError(null);
    notify(result.isValid ? '検証が完了しました。' : `${result.errors.length}件のエラーがあります。`, result.isValid ? 'success' : 'error');
  }, [notify, store]);

  const runAssurance = useCallback(() => {
    const result = store.traceAssurance();
    if (!result) {
      notify('保証連鎖の起点となる成果物を選択してください。');
      return;
    }
    setRightTab('analysis');
    notify(result.reachesFinalArtifact ? '最終成果物までの保証連鎖を確認できます。' : '保証連鎖を表示しました。', 'success');
  }, [notify, store]);

  const runImpact = useCallback(() => {
    const result = store.analyzeImpact();
    if (!result) {
      notify('変更元となる成果物を選択してください。');
      return;
    }
    setRightTab('analysis');
    notify(`明示 ${result.explicitArtifactIds.length}件、推定 ${result.inferredArtifactIds.length}件の影響を表示しました。`, 'success');
  }, [notify, store]);

  const changeViewMode = useCallback(
    (mode: PaletteViewMode) => {
      if (mode === 'assurance') runAssurance();
      else if (mode === 'impact') runImpact();
      else store.setViewMode(mode);
    },
    [runAssurance, runImpact, store],
  );

  const focusElement = useCallback(
    (id: string) => {
      const artifact = store.model.artifacts.find((item) => item.id === id);
      if (artifact) {
        const owner = store.model.processes.find((item) => item.id === artifact.processId);
        store.openProcess(owner?.parentProcessId ?? owner?.id ?? '');
        store.requestFocus({ type: 'artifact', id });
      } else if (store.model.relations.some((item) => item.id === id)) {
        const relation = store.model.relations.find((item) => item.id === id);
        const source = store.model.artifacts.find(
          (item) => item.id === relation?.sourceId,
        );
        const owner = store.model.processes.find(
          (item) => item.id === source?.processId,
        );
        if (owner) store.openProcess(owner.parentProcessId ?? owner.id);
        store.setSelection([{ type: 'relation', id }]);
        store.requestFocus({ type: 'relation', id });
      } else if ((store.model.processHandoffs ?? []).some((item) => item.id === id)) {
        store.openOverview();
        store.setSelection([{ type: 'processHandoff', id }]);
        store.requestFocus({ type: 'processHandoff', id });
      } else if ((store.model.actors ?? []).some((item) => item.id === id)) {
        const lane = (store.model.processActorLanes ?? []).find(
          (item) => item.actorId === id,
        );
        if (lane) store.openProcess(lane.processId);
        store.setSelection([{ type: 'actor', id }]);
        store.requestFocus(lane ? { type: 'process', id: lane.processId } : { type: 'model' });
      } else if (store.model.processes.some((item) => item.id === id)) {
        store.openProcess(id);
      } else {
        store.requestFocus({ type: 'model' });
      }
    },
    [store],
  );

  const autoLayout = useCallback(() => {
    if (store.editorView.mode === 'overview') {
      store.beginHistoryTransaction();
      try {
        layoutOverview(store.model).forEach((item) => {
          store.updateOverviewNodeLayout(item.id, item.kind, {
            x: item.x,
            y: item.y,
          });
        });
      } finally {
        store.endHistoryTransaction();
      }
      notify('鳥瞰図を自動整列しました。', 'success');
    } else {
      notify('プロセス詳細はレーンと列に従って自動配置されます。', 'success');
    }
    window.requestAnimationFrame(() => void flow.fitView({ padding: 0.08, duration: 240 }));
  }, [flow, notify, store]);

  const saveJson = useCallback(() => {
    try {
      autosave.flush();
      const filename = downloadPrepModelJson(store.model);
      notify(`${filename} を保存しました。`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'JSONを保存できませんでした。', 'error');
    }
  }, [notify, store.model]);

  const importJson = useCallback(
    async (file: File) => {
      try {
        const model = await readPrepModelFile(file);
        store.loadModel(model);
        setImportError(null);
        setRightTab('properties');
        notify('モデルをv1.3形式で読み込みました。', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : '読み込んだモデル形式が正しくありません。';
        setImportError({ message, issues: error instanceof PrepModelJsonError ? error.issues : [] });
        setRightTab('validation');
        notify(message, 'error');
      }
    },
    [notify, store],
  );

  const exportImage = useCallback(
    async (format: 'png' | 'svg') => {
      const viewportElement = canvasRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
      const visibleNodes = flow.getNodes().filter((node) => !node.hidden);
      if (!viewportElement || visibleNodes.length === 0) {
        notify('画像に出力できる要素がありません。', 'error');
        return;
      }
      setExporting(true);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      const bounds = getNodesBounds(visibleNodes);
      const width = Math.max(720, Math.ceil(bounds.width + 160));
      const height = Math.max(480, Math.ceil(bounds.height + 160));
      const target = getViewportForBounds(bounds, width, height, 0.2, 2, 0.08);
      const modeName = store.editorView.mode === 'overview' ? '鳥瞰図' : activeProcess?.name || 'プロセス詳細';
      const options = {
        filename: `${store.model.metadata.modelName}-${modeName}`,
        backgroundColor: '#f8fafc',
        width,
        height,
        pixelRatio: format === 'png' ? 2 : 1,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${target.x}px, ${target.y}px) scale(${target.zoom})`,
          transformOrigin: '0 0',
        },
        filter: (element: HTMLElement) => !element.classList?.contains('react-flow__resize-control') && !element.classList?.contains('react-flow__handle'),
      };
      try {
        if (format === 'png') await exportElementAsPng(viewportElement, options);
        else await exportElementAsSvg(viewportElement, options);
        notify(`${format.toUpperCase()}画像を出力しました。`, 'success');
      } catch (error) {
        notify(error instanceof Error ? error.message : `${format.toUpperCase()}画像を出力できませんでした。`, 'error');
      } finally {
        setExporting(false);
      }
    },
    [activeProcess?.name, flow, notify, store.editorView.mode, store.model.metadata.modelName],
  );

  const deleteSelection = useCallback(() => {
    if (primarySelection?.type === 'actor') {
      const owned = store.model.artifacts.filter((item) => item.responsibleActorId === primarySelection.id);
      let transferId: string | undefined;
      if (owned.length > 0) {
        const candidates = (store.model.actors ?? []).filter((actor) => actor.id !== primarySelection.id && !actor.isPlaceholder);
        if (candidates.length === 0) {
          notify('責任成果物の移管先アクターを先に追加してください。', 'error');
          return;
        }
        const answer = window.prompt(`責任成果物${owned.length}件の移管先アクター名を入力してください:\n${candidates.map((actor) => actor.name).join(' / ')}`, candidates[0].name);
        const target = candidates.find((actor) => actor.name === answer);
        if (!target) return;
        transferId = target.id;
      }
      if (!store.deleteActorWithTransfer(primarySelection.id, transferId)) return;
    } else {
      if (primarySelection?.type === 'process') {
        const selectedProcess = store.model.processes.find(
          (item) => item.id === primarySelection.id,
        );
        const hasChildren = store.model.processes.some((item) => item.parentProcessId === primarySelection.id);
        const hasArtifacts = store.model.artifacts.some(
          (item) => item.processId === primarySelection.id,
        );
        if (hasChildren || hasArtifacts) {
          const answer = window.prompt(
            '子要素があります。「移動」で親プロセスへ移すか、「削除」で配下を含めて削除します。',
            selectedProcess?.parentProcessId ? '移動' : '削除',
          );
          if (answer !== '移動' && answer !== '削除') return;
          if (answer === '移動') {
            if (!selectedProcess?.parentProcessId) {
              notify('トップレベルプロセスの親はシステムのため、成果物を移動できません。', 'error');
              return;
            }
            store.beginHistoryTransaction();
            let moved = true;
            for (const child of store.model.processes.filter(
              (item) => item.parentProcessId === primarySelection.id,
            )) {
              moved = store.updateProcess(child.id, {
                parentProcessId: selectedProcess.parentProcessId,
              }) && moved;
            }
            for (const artifact of store.model.artifacts.filter(
              (item) => item.processId === primarySelection.id,
            )) {
              moved = store.updateArtifact(artifact.id, {
                processId: selectedProcess.parentProcessId,
              }) && moved;
            }
            if (!moved) {
              store.endHistoryTransaction();
              store.undo();
              notify('関係または引継ぎの整合性を保てないため移動できません。', 'error');
              return;
            }
            store.deleteProcess(primarySelection.id);
            store.endHistoryTransaction();
            store.clearSelection();
            notify('子要素を親へ移してプロセスを削除しました。');
            return;
          }
        }
      }
      store.deleteElements(store.selection);
    }
    store.clearSelection();
    notify('選択した要素を削除しました。元に戻すことができます。');
  }, [notify, primarySelection, store]);

  const handleInspectorTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const index = rightTabOrder.indexOf(rightTab);
      let next: number | undefined;
      if (event.key === 'ArrowRight') next = (index + 1) % rightTabOrder.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + rightTabOrder.length) % rightTabOrder.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = rightTabOrder.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      setRightTab(rightTabOrder[next]);
    },
    [rightTab],
  );

  const activeAnalysis = store.viewMode === 'assurance' ? 'assurance' : store.viewMode === 'impact' ? 'impact' : null;

  if (!hydrated) {
    return (
      <div className="app-loading" role="status">
        <span className="loading-mark"><Layers3 size={24} /></span>
        <strong>PReP Research Modeler</strong>
        <span>モデルを準備しています…</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Toolbar
        modelName={store.model.metadata.modelName}
        saveStatus={store.saveStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        canAnalyze={canAnalyze}
        editorMode={store.editorView.mode}
        activeProcessId={activeProcessId}
        processOptions={store.model.processes.map((process) => ({ id: process.id, name: process.name }))}
        onOpenOverview={store.openOverview}
        onOpenProcess={store.openProcess}
        onNew={() => loadTemplate('empty')}
        onUndo={store.undo}
        onRedo={store.redo}
        onAutoLayout={autoLayout}
        onValidate={runValidation}
        onAssurance={runAssurance}
        onImpact={runImpact}
        onImport={() => fileInputRef.current?.click()}
        onSaveJson={saveJson}
        onExportPng={() => void exportImage('png')}
        onExportSvg={() => void exportImage('svg')}
        onFitView={() => void flow.fitView({ padding: 0.08, duration: 240 })}
      />

      <div className="workspace">
        <Palette
          editorMode={store.editorView.mode}
          viewMode={store.viewMode}
          actorItems={activeProcessId
            ? getProcessGridGeometry(store.model, activeProcessId).lanes.map(
                (lane) => ({
                  id: lane.actorId,
                  name: lane.actorName,
                  role: lane.role,
                }),
              )
            : []}
          subprocessItems={store.model.processes
            .filter((process) => process.parentProcessId === activeProcessId)
            .map((process) => ({ id: process.id, name: process.name }))}
          processItems={getTopLevelProcesses(store.model).map((process) => ({
            id: process.id,
            name: process.name,
          }))}
          onAddElement={(element) => addElement(element)}
          onLoadTemplate={loadTemplate}
          onViewModeChange={changeViewMode}
          onSelectActor={(id) => {
            store.setSelection([{ type: 'actor', id }]);
            setRightTab('properties');
          }}
          onSelectProcess={(id) => {
            store.setSelection([{ type: 'process', id }]);
            setRightTab('properties');
          }}
        />

        <main className="canvas-column" aria-label="モデル編集領域">
          <div className="canvas-contextbar">
            <div className="canvas-breadcrumb">
              <button type="button" onClick={store.openOverview}>{store.model.system.name || 'システム名未設定'}</button>
              <span aria-hidden="true">/</span>
              {store.editorView.mode === 'overview' ? (
                <strong>鳥瞰図</strong>
              ) : (
                breadcrumbs.map((process, index) => (
                  <span key={process.id} className="breadcrumb-segment">
                    {index > 0 && <span aria-hidden="true">/</span>}
                    <button type="button" onClick={() => store.openProcess(process.id)}>{process.name || '名称未設定'}</button>
                  </span>
                ))
              )}
            </div>
            <div className="canvas-metrics" aria-label="モデル要素数">
              <span><Layers3 size={13} />{store.model.processes.length} プロセス</span>
              <span><PackageOpen size={13} />{store.model.artifacts.length} 成果物</span>
              <span><GitBranch size={13} />{store.editorView.mode === 'overview' ? (store.model.processHandoffs ?? []).length : store.model.relations.length} 関係</span>
            </div>
            <div className="canvas-hint"><MousePointer2 size={13} />Shift+ドラッグで範囲選択</div>
          </div>
          <ModelCanvas
            ref={canvasRef}
            model={store.model}
            editorView={store.editorView}
            selection={store.selection}
            viewMode={store.viewMode}
            exporting={exporting}
            onOpenProcess={store.openProcess}
            onRelationConnectionRequest={setPendingRelation}
            onHandoffConnectionRequest={setPendingHandoff}
            onDropElement={addElement}
          />
          <div className={`mode-badge mode-badge--${store.viewMode}`}>
            {store.editorView.mode === 'overview' ? '鳥瞰図' : store.viewMode === 'normal' ? '通常表示' : store.viewMode === 'risk' ? 'リスク表示' : store.viewMode === 'assurance' ? '保証連鎖' : '変更影響'}
          </div>
        </main>

        <aside className="inspector" aria-label="プロパティと分析">
          <div className="inspector-tabs" role="tablist" aria-label="右パネル" onKeyDown={handleInspectorTabKeyDown}>
            <button type="button" role="tab" aria-selected={rightTab === 'properties'} className={rightTab === 'properties' ? 'is-active' : ''} onClick={() => setRightTab('properties')}><SlidersHorizontal size={15} />プロパティ</button>
            <button type="button" role="tab" aria-selected={rightTab === 'validation'} className={rightTab === 'validation' ? 'is-active' : ''} onClick={() => setRightTab('validation')}><ShieldCheck size={15} />検証{store.validationResult && store.validationResult.issues.length > 0 && <span>{store.validationResult.issues.length}</span>}</button>
            <button type="button" role="tab" aria-selected={rightTab === 'analysis'} className={rightTab === 'analysis' ? 'is-active' : ''} onClick={() => setRightTab('analysis')}><PanelRight size={15} />分析</button>
          </div>
          <div className="inspector-body">
            {rightTab === 'properties' && (
              <PropertyPanel
                model={store.model}
                selection={editorSelection}
                activeProcessId={activeProcessId}
                onSelectModel={store.clearSelection}
                onUpdateMetadata={store.updateMetadata}
                onUpdateSystem={store.updateSystem}
                onUpdateProcess={store.updateProcess}
                onUpdateActor={store.updateActor}
                onUpdateProcessActorLane={store.updateProcessActorLane}
                onUpdateActorLaneHeight={store.updateActorLaneHeight}
                onUpdateSubprocessColumnLayout={store.updateSubprocessColumnLayout}
                onUpdateArtifact={store.updateArtifact}
                onUpdateExternalProcess={store.updateExternalProcess}
                onUpdateRelation={(id, patch) => {
                  const result = store.updateRelation(id, patch);
                  if (!result.ok) notify(relationFailureMessage(result.reason), 'error');
                }}
                onUpdateProcessHandoff={(id, patch) => {
                  const result = store.updateProcessHandoff(id, patch);
                  if (!result.ok) notify('引継ぎの参照整合性を確認してください。', 'error');
                }}
                onOpenProcess={store.openProcess}
                onAddSubprocess={addSubprocess}
                onCreateRelation={(sourceId, targetId) => setPendingRelation({ sourceId, targetId, sourceAnchor: 'e', targetAnchor: 'w' })}
                onDeleteSelection={deleteSelection}
              />
            )}
            {rightTab === 'validation' && (
              <div className="result-panel-scroll">
                <header className="result-panel-heading"><small>MODEL CHECK</small><strong>検証結果</strong></header>
                {importError && (
                  <div className="import-error" role="alert">
                    <AlertCircle size={18} />
                    <span><strong>E011 JSONスキーマ不正</strong><small>{importError.message}</small>{importError.issues.length > 0 && <ul>{importError.issues.map((issue, index) => <li key={`${issue.path.join('.')}-${index}`}><code>{issue.path.join('.') || 'root'}</code>{issue.message}</li>)}</ul>}</span>
                  </div>
                )}
                <ValidationPanel
                  result={store.validationResult ?? undefined}
                  onFocusIssue={(issue) => {
                    if (issue.elementType === 'lane' && issue.elementId) {
                      const lane = (store.model.processActorLanes ?? []).find(
                        (item) => item.id === issue.elementId,
                      );
                      if (lane) {
                        focusElement(lane.actorId);
                        return;
                      }
                    }
                    const target = targetForIssue(issue);
                    if ((target.type === 'artifact' || target.type === 'relation' || target.type === 'actor') && target.id) focusElement(target.id);
                    else if (target.type === 'process' && target.id) store.openProcess(target.id);
                    else if (target.type === 'processHandoff') store.openOverview();
                    else if (target.type === 'model' || target.type === 'system') store.clearSelection();
                    store.requestFocus(target);
                    if (target.type !== 'model' && target.type !== 'system' && target.id) store.setSelection([target]);
                  }}
                />
              </div>
            )}
            {rightTab === 'analysis' && (
              <div className="result-panel-scroll">
                <header className="result-panel-heading"><small>TRACE & IMPACT</small><strong>分析結果</strong></header>
                <AnalysisPanel model={store.model} assuranceTrace={store.assuranceTrace ?? undefined} impactAnalysis={store.impactAnalysis ?? undefined} activeAnalysis={activeAnalysis} onFocus={focusElement} />
              </div>
            )}
          </div>
        </aside>
      </div>

      <input ref={fileInputRef} className="visually-hidden" type="file" accept=".json,.prep.json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importJson(file); event.currentTarget.value = ''; }} aria-label="PRePモデルJSONを読み込む" />

      <RelationDialog
        open={pendingRelation !== null}
        sourceId={pendingRelation?.sourceId ?? ''}
        targetId={pendingRelation?.targetId ?? ''}
        sourceName={pendingRelation ? endpointName(pendingRelation.sourceId) : ''}
        targetName={pendingRelation ? endpointName(pendingRelation.targetId) : ''}
        sourceAnchor={pendingRelation?.sourceAnchor}
        targetAnchor={pendingRelation?.targetAnchor}
        onCancel={() => setPendingRelation(null)}
        onConfirm={confirmRelation}
      />
      <ProcessHandoffDialog
        open={pendingHandoff !== null}
        model={store.model}
        sourceProcessId={pendingHandoff?.sourceId ?? ''}
        targetProcessId={pendingHandoff?.targetId ?? ''}
        sourceAnchor={pendingHandoff?.sourceAnchor ?? 'e'}
        targetAnchor={pendingHandoff?.targetAnchor ?? 'w'}
        onCancel={() => setPendingHandoff(null)}
        onConfirm={confirmHandoff}
      />

      {toast && (
        <div className={`toast toast--${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'} key={toast.id}>
          {toast.tone === 'success' ? <CheckCircle2 size={18} /> : toast.tone === 'error' ? <AlertCircle size={18} /> : <SlidersHorizontal size={18} />}
          <span>{toast.message}</span>
          <button type="button" className="icon-button" onClick={() => setToast(null)} aria-label="通知を閉じる"><X size={15} /></button>
        </div>
      )}
    </div>
  );
}
