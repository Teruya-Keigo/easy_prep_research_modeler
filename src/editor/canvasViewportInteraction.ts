import {
  PanOnScrollMode,
  type ReactFlowProps,
} from '@xyflow/react';

type CanvasViewportInteractionProps = Pick<
  ReactFlowProps,
  | 'panOnScroll'
  | 'panOnScrollMode'
  | 'panOnScrollSpeed'
  | 'zoomOnScroll'
  | 'zoomOnPinch'
  | 'preventScrolling'
>;

/** Shared trackpad behavior for the process-detail and overview canvases. */
export const CANVAS_VIEWPORT_INTERACTION_PROPS = {
  panOnScroll: true,
  panOnScrollMode: PanOnScrollMode.Free,
  panOnScrollSpeed: 0.5,
  zoomOnScroll: true,
  zoomOnPinch: true,
  preventScrolling: true,
} satisfies CanvasViewportInteractionProps;
