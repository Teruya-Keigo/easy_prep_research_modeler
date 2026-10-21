import { ArtifactNode } from './nodes/ArtifactNode';
import { ExternalProcessNode } from './nodes/ExternalProcessNode';
import { ProcessNode } from './nodes/ProcessNode';
import { OverviewProcessNode } from './nodes/OverviewProcessNode';
import { ProcessGridNode } from './nodes/ProcessGridNode';
import { ProcessGridResizeNode } from './nodes/ProcessGridResizeNode';

export const nodeTypes = {
  artifact: ArtifactNode,
  process: ProcessNode,
  externalProcess: ExternalProcessNode,
  overviewProcess: OverviewProcessNode,
  processGrid: ProcessGridNode,
  processGridResize: ProcessGridResizeNode,
};
