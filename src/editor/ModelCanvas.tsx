import { forwardRef } from 'react';
import type { EditorViewState, PrepModelFile } from '../domain/model';
import type { ElementSelection, ViewMode } from '../store/modelStore';
import type { PaletteElementKind } from '../components/Palette';
import {
  OverviewCanvas,
  type OverviewConnectionRequest,
} from './OverviewCanvas';
import {
  ProcessCanvas,
  type ProcessConnectionRequest,
} from './ProcessCanvas';

export interface ModelCanvasProps {
  model: PrepModelFile;
  editorView: EditorViewState;
  selection: ElementSelection[];
  viewMode: ViewMode;
  exporting?: boolean;
  onOpenProcess: (processId: string) => void;
  onRelationConnectionRequest: (connection: ProcessConnectionRequest) => void;
  onHandoffConnectionRequest: (connection: OverviewConnectionRequest) => void;
  onDropElement: (
    element: PaletteElementKind,
    position: { x: number; y: number },
  ) => void;
}

/** Keeps the overview and process-detail canvases deliberately separate. */
export const ModelCanvas = forwardRef<HTMLDivElement, ModelCanvasProps>(
  function ModelCanvas(props, ref) {
    if (props.editorView.mode === 'overview') {
      return (
        <OverviewCanvas
          ref={ref}
          model={props.model}
          selection={props.selection}
          exporting={props.exporting}
          onOpenProcess={props.onOpenProcess}
          onConnectionRequest={props.onHandoffConnectionRequest}
          onDropElement={props.onDropElement}
        />
      );
    }

    const activeProcessId = props.editorView.activeProcessId;
    if (!activeProcessId) {
      return (
        <div ref={ref} className="model-canvas process-canvas">
          <div className="process-grid-empty" role="alert">
            <strong>編集するプロセスを選択してください</strong>
          </div>
        </div>
      );
    }

    return (
      <ProcessCanvas
        ref={ref}
        model={props.model}
        activeProcessId={activeProcessId}
        selection={props.selection}
        viewMode={props.viewMode}
        exporting={props.exporting}
        onOpenProcess={props.onOpenProcess}
        onConnectionRequest={props.onRelationConnectionRequest}
        onDropElement={props.onDropElement}
      />
    );
  },
);
