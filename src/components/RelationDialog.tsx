import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeftRight, ArrowRight, X } from 'lucide-react';
import type {
  AnchorPosition,
  PrepRelationType,
  SemanticRelationType,
} from '../domain/model';

export interface RelationDraft {
  prepType: PrepRelationType;
  semanticType?: SemanticRelationType;
  sourceAnchor?: AnchorPosition;
  targetAnchor?: AnchorPosition;
  description?: string;
}

export interface RelationDialogProps {
  open: boolean;
  sourceName: string;
  targetName: string;
  sourceId: string;
  targetId: string;
  sourceAnchor?: AnchorPosition;
  targetAnchor?: AnchorPosition;
  onCancel: () => void;
  onConfirm: (draft: RelationDraft) => void;
}

const semanticOptions: Array<{
  value: SemanticRelationType;
  label: string;
}> = [
  { value: 'derives-from', label: 'derives-from — 導出元' },
  { value: 'justifies', label: 'justifies — 根拠づけ' },
  { value: 'mitigates', label: 'mitigates — リスク対策' },
  { value: 'approves', label: 'approves — 承認' },
  { value: 'monitors', label: 'monitors — 監視' },
  {
    value: 'requires-revalidation-of',
    label: 'requires-revalidation-of — 再検証要求',
  },
];

const anchorOptions: Array<{ value: AnchorPosition; label: string }> = [
  { value: 'n', label: '上' },
  { value: 'ne', label: '右上' },
  { value: 'e', label: '右' },
  { value: 'se', label: '右下' },
  { value: 's', label: '下' },
  { value: 'sw', label: '左下' },
  { value: 'w', label: '左' },
  { value: 'nw', label: '左上' },
];

export function RelationDialog({
  open,
  sourceName,
  targetName,
  sourceId,
  targetId,
  sourceAnchor,
  targetAnchor,
  onCancel,
  onConfirm,
}: RelationDialogProps) {
  const showAnchorControls =
    sourceAnchor !== undefined || targetAnchor !== undefined;
  const titleId = useId();
  const firstControl = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const [prepType, setPrepType] = useState<PrepRelationType>('input');
  const [semanticType, setSemanticType] = useState<
    SemanticRelationType | ''
  >('');
  const [description, setDescription] = useState('');
  const [draftSourceAnchor, setDraftSourceAnchor] =
    useState<AnchorPosition>(sourceAnchor ?? 'e');
  const [draftTargetAnchor, setDraftTargetAnchor] =
    useState<AnchorPosition>(targetAnchor ?? 'w');

  useEffect(() => {
    if (!open) return;
    setPrepType('input');
    setSemanticType('');
    setDescription('');
    setDraftSourceAnchor(sourceAnchor ?? 'e');
    setDraftTargetAnchor(targetAnchor ?? 'w');
    previousActiveElement.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() => firstControl.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previousActiveElement.current?.focus();
      previousActiveElement.current = null;
    };
  }, [open, sourceAnchor, sourceId, targetAnchor, targetId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1)!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onCancel]);

  if (!open) return null;

  const syncSelfError = prepType === 'sync' && sourceId === targetId;

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <section
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__header">
          <div>
            <span className="eyebrow">RELATION</span>
            <h2 id={titleId}>関係を作成</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onCancel}
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </header>

        <div className="relation-route" aria-label="接続する要素">
          <strong>{sourceName || '名称未設定'}</strong>
          <ArrowRight size={18} aria-hidden="true" />
          <strong>{targetName || '名称未設定'}</strong>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (syncSelfError) return;
            onConfirm({
              prepType,
              semanticType: semanticType || undefined,
              ...(showAnchorControls
                ? {
                    sourceAnchor: draftSourceAnchor,
                    targetAnchor: draftTargetAnchor,
                  }
                : {}),
              description: description.trim() || undefined,
            });
          }}
        >
          <fieldset className="relation-type-options">
            <legend>PReP標準関係</legend>
            <label>
              <input
                ref={firstControl}
                type="radio"
                name="prep-type"
                value="input"
                checked={prepType === 'input'}
                onChange={() => setPrepType('input')}
              />
              <span className="relation-type-card">
                <ArrowRight size={18} aria-hidden="true" />
                <strong>入力関係</strong>
                <small>実線・入力先への矢印</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="prep-type"
                value="sync"
                checked={prepType === 'sync'}
                onChange={() => setPrepType('sync')}
              />
              <span className="relation-type-card">
                <ArrowLeftRight size={18} aria-hidden="true" />
                <strong>同期関係</strong>
                <small>点線・双方向の矢印</small>
              </span>
            </label>
          </fieldset>

          <label className="form-field">
            <span>研究用意味ラベル</span>
            <select
              value={semanticType}
              onChange={(event) =>
                setSemanticType(
                  event.target.value as SemanticRelationType | '',
                )
              }
            >
              <option value="">なし</option>
              {semanticOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <small>PReP標準の線種とは別に保存されます</small>
          </label>

          {showAnchorControls && <div className="form-field-row">
            <label className="form-field">
              <span>始点接続点</span>
              <select
                value={draftSourceAnchor}
                onChange={(event) =>
                  setDraftSourceAnchor(event.target.value as AnchorPosition)
                }
              >
                {anchorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.value})
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>終点接続点</span>
              <select
                value={draftTargetAnchor}
                onChange={(event) =>
                  setDraftTargetAnchor(event.target.value as AnchorPosition)
                }
              >
                {anchorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.value})
                  </option>
                ))}
              </select>
            </label>
          </div>}

          <label className="form-field">
            <span>説明</span>
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="この関係が表す内容を記録"
            />
          </label>

          {syncSelfError && (
            <p className="form-error" role="alert">
              同一要素には同期関係を作成できません。
            </p>
          )}

          <footer className="dialog__actions">
            <button type="button" className="button secondary" onClick={onCancel}>
              キャンセル
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={syncSelfError}
              data-testid="confirm-relation"
            >
              関係を作成
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
