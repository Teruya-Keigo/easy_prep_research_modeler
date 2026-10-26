import { PanOnScrollMode } from '@xyflow/react';
import { CANVAS_VIEWPORT_INTERACTION_PROPS } from './canvasViewportInteraction';

describe('CANVAS_VIEWPORT_INTERACTION_PROPS', () => {
  it('uses free-direction scroll panning while preserving pinch zoom', () => {
    expect(CANVAS_VIEWPORT_INTERACTION_PROPS).toEqual({
      panOnScroll: true,
      panOnScrollMode: PanOnScrollMode.Free,
      panOnScrollSpeed: 0.5,
      zoomOnScroll: true,
      zoomOnPinch: true,
      preventScrolling: true,
    });
  });
});
