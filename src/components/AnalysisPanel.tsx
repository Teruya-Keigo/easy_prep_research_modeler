import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleDashed,
  GitBranch,
  LocateFixed,
  Route,
} from 'lucide-react';
import type { AssuranceTraceResult } from '../domain/assuranceTrace';
import type { ImpactAnalysisResult } from '../domain/impactAnalysis';
import type { PrepModelFile } from '../domain/model';
import { elementName } from './ValidationPanel';

export interface AnalysisPanelProps {
  model: PrepModelFile;
  assuranceTrace?: AssuranceTraceResult;
  impactAnalysis?: ImpactAnalysisResult;
  activeAnalysis: 'assurance' | 'impact' | null;
  onFocus: (id: string) => void;
}

export function AnalysisPanel({
  model,
  assuranceTrace,
  impactAnalysis,
  activeAnalysis,
  onFocus,
}: AnalysisPanelProps) {
  if (activeAnalysis === 'assurance' && assuranceTrace) {
    return (
      <AssuranceResults
        model={model}
        result={assuranceTrace}
        onFocus={onFocus}
      />
    );
  }

  if (activeAnalysis === 'impact' && impactAnalysis) {
    return (
      <ImpactResults model={model} result={impactAnalysis} onFocus={onFocus} />
    );
  }

  return (
    <div className="result-empty">
      <span className="result-empty__icon" aria-hidden="true">
        <Route size={24} />
      </span>
      <strong>成果物を起点に分析</strong>
      <p>
        キャンバスで成果物を選び、上部の「保証連鎖」または「変更影響」を押してください。
      </p>
    </div>
  );
}

function AssuranceResults({
  model,
  result,
  onFocus,
}: {
  model: PrepModelFile;
  result: AssuranceTraceResult;
  onFocus: (id: string) => void;
}) {
  const startProcessId = model.artifacts.find(
    (artifact) => artifact.id === result.startArtifactId,
  )?.processId;
  const rootProcessId = (processId: string | undefined) => {
    let current = model.processes.find((process) => process.id === processId);
    const visited = new Set<string>();
    while (current?.parentProcessId && !visited.has(current.id)) {
      visited.add(current.id);
      current = model.processes.find(
        (process) => process.id === current?.parentProcessId,
      );
    }
    return current?.id;
  };
  const startRootProcessId = rootProcessId(startProcessId);
  const handoffDirections = new Map(
    result.traversalOrder.flatMap((step) =>
      step.viaHandoffId
        ? [[step.viaHandoffId, step.direction] as const]
        : [],
    ),
  );
  const continuationProcessIds = Array.from(
    new Set(
      result.traversedHandoffIds.flatMap((handoffId) => {
        const handoff = (model.processHandoffs ?? []).find(
          (item) => item.id === handoffId,
        );
        if (!handoff) return [];
        const direction = handoffDirections.get(handoffId);
        if (direction === 'upstream') return [handoff.sourceProcessId];
        if (direction === 'downstream') return [handoff.targetProcessId];
        return [
          startRootProcessId === handoff.targetProcessId
            ? handoff.sourceProcessId
            : handoff.targetProcessId,
        ];
      }),
    ),
  );

  return (
    <div className="analysis-results" aria-live="polite">
      <div className="analysis-hero analysis-hero--assurance">
        <Route size={20} aria-hidden="true" />
        <span>
          <small>保証連鎖の起点</small>
          <strong>{elementName(model, result.startArtifactId)}</strong>
        </span>
      </div>
      <div className="analysis-stat-grid">
        <span>
          <strong>{result.upstreamArtifactIds.length}</strong>上流
        </span>
        <span>
          <strong>{result.downstreamArtifactIds.length}</strong>下流
        </span>
        <span>
          <strong>
            {result.traversedRelationIds.length + result.traversedHandoffIds.length}
          </strong>
          関係
        </span>
      </div>
      <div
        className={`final-reach ${
          result.reachesFinalArtifact ? 'is-reached' : ''
        }`}
      >
        {result.reachesFinalArtifact ? (
          <CheckCircle2 size={17} aria-hidden="true" />
        ) : (
          <CircleDashed size={17} aria-hidden="true" />
        )}
        最終成果物まで
        {result.reachesFinalArtifact ? '到達できます' : '到達できません'}
      </div>
      <AnalysisList
        title="上流成果物"
        icon={<ArrowUp size={15} />}
        ids={result.upstreamArtifactIds}
        model={model}
        onFocus={onFocus}
      />
      <AnalysisList
        title="下流成果物"
        icon={<ArrowDown size={15} />}
        ids={result.downstreamArtifactIds}
        model={model}
        onFocus={onFocus}
      />
      <AnalysisList
        title="通過した関係"
        icon={<GitBranch size={15} />}
        ids={result.traversedRelationIds}
        model={model}
        onFocus={onFocus}
      />
      <AnalysisList
        title="別プロセスへ続く引継ぎ先"
        icon={<GitBranch size={15} />}
        ids={continuationProcessIds}
        model={model}
        onFocus={onFocus}
        tone="process"
        emptyLabel="別プロセスへ続く引継ぎはありません"
      />
      {result.highRiskElementIds.length > 0 && (
        <AnalysisList
          title="経路上の高リスク"
          icon={<AlertTriangle size={15} />}
          ids={result.highRiskElementIds}
          model={model}
          onFocus={onFocus}
          tone="danger"
        />
      )}
    </div>
  );
}

function ImpactResults({
  model,
  result,
  onFocus,
}: {
  model: PrepModelFile;
  result: ImpactAnalysisResult;
  onFocus: (id: string) => void;
}) {
  return (
    <div className="analysis-results" aria-live="polite">
      <div className="analysis-hero analysis-hero--impact">
        <Route size={20} aria-hidden="true" />
        <span>
          <small>変更元</small>
          <strong>{elementName(model, result.startArtifactId)}</strong>
        </span>
      </div>
      <div className="impact-legend" aria-label="変更影響の凡例">
        <span>
          <i className="legend-explicit" /> 明示的影響
        </span>
        <span>
          <i className="legend-inferred" /> 推定影響
        </span>
        <span>
          <i className="legend-process" /> プロセス間影響
        </span>
      </div>
      <AnalysisList
        title="明示的影響"
        icon={<AlertTriangle size={15} />}
        ids={result.explicitArtifactIds}
        model={model}
        onFocus={onFocus}
        tone="danger"
        emptyLabel="明示的な再検証関係はありません"
      />
      <AnalysisList
        title="推定影響"
        icon={<CircleDashed size={15} />}
        ids={result.inferredArtifactIds}
        model={model}
        onFocus={onFocus}
        tone="warning"
        emptyLabel="入力関係による推定影響はありません"
      />
      <AnalysisList
        title="プロセス間影響"
        icon={<GitBranch size={15} />}
        ids={result.interProcessProcessIds}
        model={model}
        onFocus={onFocus}
        tone="process"
        emptyLabel="プロセス間への影響はありません"
      />
    </div>
  );
}

function AnalysisList({
  title,
  icon,
  ids,
  model,
  onFocus,
  tone = 'default',
  emptyLabel = '該当する成果物はありません',
}: {
  title: string;
  icon: React.ReactNode;
  ids: string[];
  model: PrepModelFile;
  onFocus: (id: string) => void;
  tone?: 'default' | 'danger' | 'warning' | 'process';
  emptyLabel?: string;
}) {
  return (
    <section className={`analysis-list analysis-list--${tone}`}>
      <h3>
        {icon}
        {title}
        <span>{ids.length}</span>
      </h3>
      {ids.length === 0 ? (
        <p className="analysis-list__empty">{emptyLabel}</p>
      ) : (
        ids.map((id, index) => (
          <button type="button" key={id} onClick={() => onFocus(id)}>
            <span className="analysis-order">{index + 1}</span>
            <strong>{elementName(model, id)}</strong>
            <LocateFixed size={14} aria-hidden="true" />
          </button>
        ))
      )}
    </section>
  );
}
