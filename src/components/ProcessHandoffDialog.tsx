import { ArrowLeftRight, ArrowRight, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import type {
  AnchorPosition,
  PrepModelFile,
  PrepRelationType,
} from '../domain/model';
import { getProcessDescendants } from '../domain/processHierarchy';

export interface ProcessHandoffDraft {
  sourceArtifactIds: string[];
  targetArtifactIds: string[];
  prepType: PrepRelationType;
  sourceAnchor: AnchorPosition;
  targetAnchor: AnchorPosition;
  description?: string;
}

export interface ProcessHandoffDialogProps {
  open: boolean;
  model: PrepModelFile;
  sourceProcessId: string;
  targetProcessId: string;
  sourceAnchor: AnchorPosition;
  targetAnchor: AnchorPosition;
  onCancel: () => void;
  onConfirm: (draft: ProcessHandoffDraft) => void;
}

const anchors: Array<{ id: AnchorPosition; name: string }> = [
  { id: 'n', name: '上' },
  { id: 'ne', name: '右上' },
  { id: 'e', name: '右' },
  { id: 'se', name: '右下' },
  { id: 's', name: '下' },
  { id: 'sw', name: '左下' },
  { id: 'w', name: '左' },
  { id: 'nw', name: '左上' },
];

export function ProcessHandoffDialog({
  open,
  model,
  sourceProcessId,
  targetProcessId,
  sourceAnchor,
  targetAnchor,
  onCancel,
  onConfirm,
}: ProcessHandoffDialogProps) {
  const titleId = useId();
  const [sourceArtifactIds, setSourceArtifactIds] = useState<string[]>([]);
  const [targetArtifactIds, setTargetArtifactIds] = useState<string[]>([]);
  const [prepType, setPrepType] = useState<PrepRelationType>('input');
  const [draftSourceAnchor, setDraftSourceAnchor] = useState(sourceAnchor);
  const [draftTargetAnchor, setDraftTargetAnchor] = useState(targetAnchor);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open) return;
    setSourceArtifactIds([]);
    setTargetArtifactIds([]);
    setPrepType('input');
    setDraftSourceAnchor(sourceAnchor);
    setDraftTargetAnchor(targetAnchor);
    setDescription('');
  }, [open, sourceAnchor, sourceProcessId, targetAnchor, targetProcessId]);

  const sourceScope = useMemo(
    () =>
      new Set([
        sourceProcessId,
        ...getProcessDescendants(model.processes, sourceProcessId).map(
          (process) => process.id,
        ),
      ]),
    [model.processes, sourceProcessId],
  );
  const targetScope = useMemo(
    () =>
      new Set([
        targetProcessId,
        ...getProcessDescendants(model.processes, targetProcessId).map(
          (process) => process.id,
        ),
      ]),
    [model.processes, targetProcessId],
  );
  const sourceArtifacts = model.artifacts.filter(
    (artifact) =>
      artifact.type === 'final' &&
      artifact.processId !== undefined &&
      sourceScope.has(artifact.processId),
  );
  const targetArtifacts = model.artifacts.filter(
    (artifact) =>
      artifact.scope === 'external-input' &&
      artifact.processId !== undefined &&
      targetScope.has(artifact.processId),
  );
  const sourceName =
    model.processes.find((process) => process.id === sourceProcessId)?.name ??
    '引継ぎ元';
  const targetName =
    model.processes.find((process) => process.id === targetProcessId)?.name ??
    '引継ぎ先';

  if (!open) return null;

  const toggle = (
    values: string[],
    setValues: (value: string[]) => void,
    id: string,
  ) => {
    setValues(
      values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    );
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <section
        className="dialog handoff-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        data-testid="process-handoff-dialog"
      >
        <header className="dialog__header">
          <div>
            <span className="eyebrow">PROCESS HANDOFF</span>
            <h2 id={titleId}>プロセス間引継ぎ</h2>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="閉じる">
            <X size={18} />
          </button>
        </header>

        <div className="relation-route">
          <strong>{sourceName}</strong>
          <ArrowRight size={18} />
          <strong>{targetName}</strong>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm({
              sourceArtifactIds,
              targetArtifactIds,
              prepType,
              sourceAnchor: draftSourceAnchor,
              targetAnchor: draftTargetAnchor,
              description: description.trim() || undefined,
            });
          }}
        >
          <fieldset className="relation-type-options">
            <legend>関係種別</legend>
            <label>
              <input type="radio" checked={prepType === 'input'} onChange={() => setPrepType('input')} />
              <span className="relation-type-card">
                <ArrowRight size={18} />
                <strong>入力関係</strong>
                <small>有向の引継ぎ</small>
              </span>
            </label>
            <label>
              <input type="radio" checked={prepType === 'sync'} onChange={() => setPrepType('sync')} />
              <span className="relation-type-card">
                <ArrowLeftRight size={18} />
                <strong>同期関係</strong>
                <small>双方向の連携</small>
              </span>
            </label>
          </fieldset>

          <div className="handoff-artifact-columns">
            <fieldset>
              <legend>引継ぎ元の最終成果物</legend>
              {sourceArtifacts.length === 0 && <p>候補はありません（未指定で作成可）</p>}
              {sourceArtifacts.map((artifact) => (
                <label key={artifact.id}>
                  <input
                    type="checkbox"
                    checked={sourceArtifactIds.includes(artifact.id)}
                    onChange={() => toggle(sourceArtifactIds, setSourceArtifactIds, artifact.id)}
                  />
                  {artifact.name}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>受け側の外部入力成果物</legend>
              {targetArtifacts.length === 0 && <p>候補はありません（未指定で作成可）</p>}
              {targetArtifacts.map((artifact) => (
                <label key={artifact.id}>
                  <input
                    type="checkbox"
                    checked={targetArtifactIds.includes(artifact.id)}
                    onChange={() => toggle(targetArtifactIds, setTargetArtifactIds, artifact.id)}
                  />
                  {artifact.name}
                </label>
              ))}
            </fieldset>
          </div>

          <div className="form-field-row">
            <label className="form-field">
              <span>始点接続点</span>
              <select value={draftSourceAnchor} onChange={(event) => setDraftSourceAnchor(event.target.value as AnchorPosition)}>
                {anchors.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>終点接続点</span>
              <select value={draftTargetAnchor} onChange={(event) => setDraftTargetAnchor(event.target.value as AnchorPosition)}>
                {anchors.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}
              </select>
            </label>
          </div>

          <label className="form-field">
            <span>説明</span>
            <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <footer className="dialog__actions">
            <button type="button" className="button secondary" onClick={onCancel}>キャンセル</button>
            <button type="submit" className="button primary" data-testid="confirm-handoff">引継ぎを作成</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
