import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  LocateFixed,
} from 'lucide-react';
import type { PrepModelFile } from '../domain/model';
import type {
  ValidationIssue,
  ValidationResult,
} from '../domain/validation';

export interface ValidationPanelProps {
  result?: ValidationResult;
  onFocusIssue: (issue: ValidationIssue) => void;
}

export function ValidationPanel({
  result,
  onFocusIssue,
}: ValidationPanelProps) {
  if (!result) {
    return (
      <div className="result-empty">
        <span className="result-empty__icon" aria-hidden="true">
          <CheckCircle2 size={24} />
        </span>
        <strong>まだ検証していません</strong>
        <p>上部の「検証」を押すと、エラーと警告を確認できます。</p>
      </div>
    );
  }

  return (
    <div className="validation-panel" aria-live="polite">
      <div className="validation-summary">
        <div className="validation-count validation-count--error">
          <CircleAlert size={18} aria-hidden="true" />
          <span>
            <strong>{result.errors.length}</strong>
            エラー
          </span>
        </div>
        <div className="validation-count validation-count--warning">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>
            <strong>{result.warnings.length}</strong>
            警告
          </span>
        </div>
      </div>

      {result.issues.length === 0 ? (
        <div className="validation-success">
          <CheckCircle2 size={20} aria-hidden="true" />
          <span>
            <strong>検証に合格しました</strong>
            <small>エラーと警告はありません</small>
          </span>
        </div>
      ) : (
        <>
          <IssueGroup
            title="エラー"
            issues={result.errors}
            onFocusIssue={onFocusIssue}
          />
          <IssueGroup
            title="警告"
            issues={result.warnings}
            onFocusIssue={onFocusIssue}
          />
        </>
      )}
    </div>
  );
}

function IssueGroup({
  title,
  issues,
  onFocusIssue,
}: {
  title: string;
  issues: ValidationIssue[];
  onFocusIssue: (issue: ValidationIssue) => void;
}) {
  if (issues.length === 0) return null;

  return (
    <section className="issue-group">
      <h3>{title}</h3>
      <div className="issue-list">
        {issues.map((issue, index) => (
          <button
            key={`${issue.code}-${issue.elementId ?? 'model'}-${index}`}
            type="button"
            className={`issue-item issue-item--${issue.severity}`}
            onClick={() => onFocusIssue(issue)}
            data-testid={`validation-${issue.code}`}
          >
            <span className="issue-code">{issue.code}</span>
            <span className="issue-copy">
              <strong>{issue.message}</strong>
              <small>
                {issue.elementType === 'model'
                  ? 'モデル全体'
                  : 'クリックして対象へ移動'}
              </small>
            </span>
            {issue.elementType === 'model' ? (
              <LocateFixed size={15} aria-hidden="true" />
            ) : (
              <ChevronRight size={15} aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

export function elementName(model: PrepModelFile, id: string): string {
  const nodeName =
    model.artifacts.find((item) => item.id === id)?.name ??
    model.processes.find((item) => item.id === id)?.name ??
    model.externalProcesses.find((item) => item.id === id)?.name;
  if (nodeName) return nodeName;

  const relation = model.relations.find((item) => item.id === id);
  if (!relation) {
    const handoff = (model.processHandoffs ?? []).find((item) => item.id === id);
    if (!handoff) return id;
    const source =
      model.processes.find((item) => item.id === handoff.sourceProcessId)
        ?.name ?? handoff.sourceProcessId;
    const target =
      model.processes.find((item) => item.id === handoff.targetProcessId)
        ?.name ?? handoff.targetProcessId;
    return `${source} → ${target}（プロセス間引継ぎ）`;
  }
  const source =
    model.artifacts.find((item) => item.id === relation.sourceId)?.name ??
    model.externalProcesses.find((item) => item.id === relation.sourceId)
      ?.name ??
    relation.sourceId;
  const target =
    model.artifacts.find((item) => item.id === relation.targetId)?.name ??
    model.externalProcesses.find((item) => item.id === relation.targetId)
      ?.name ??
    relation.targetId;
  const relationName =
    relation.prepType === 'input' ? '入力関係' : '同期関係';
  return `${source} → ${target}（${relation.semanticType ?? relationName}）`;
}
