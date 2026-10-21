import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePrepModel } from '../test/fixtures';
import { useModelStore } from '../store/modelStore';
import { OverviewCanvas } from './OverviewCanvas';
import { ProcessCanvas } from './ProcessCanvas';
import { CANVAS_VIEWPORT_INTERACTION_PROPS } from './canvasViewportInteraction';

const mocks = vi.hoisted(() => ({
  reactFlowProps: [] as Array<Record<string, unknown>>,
  flow: {
    viewportInitialized: false,
    fitView: vi.fn(),
    getNode: vi.fn(),
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    screenToFlowPosition: vi.fn((position: { x: number; y: number }) => position),
    setViewport: vi.fn(),
  },
}));

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlow: (props: Record<string, unknown>) => {
      mocks.reactFlowProps.push(props);
      return null;
    },
    useReactFlow: () => mocks.flow,
  };
});

const callbacks = {
  onConnectionRequest: vi.fn(),
  onDropElement: vi.fn(),
  onOpenProcess: vi.fn(),
};

function interactionProps(props: Record<string, unknown> | undefined) {
  return {
    panOnScroll: props?.panOnScroll,
    panOnScrollMode: props?.panOnScrollMode,
    panOnScrollSpeed: props?.panOnScrollSpeed,
    zoomOnScroll: props?.zoomOnScroll,
    zoomOnPinch: props?.zoomOnPinch,
    preventScrolling: props?.preventScrolling,
  };
}

describe('canvas viewport interaction props', () => {
  beforeEach(() => {
    mocks.reactFlowProps.length = 0;
    useModelStore.getState().newModel(makePrepModel());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('passes free-direction trackpad panning to ProcessCanvas', () => {
    const model = makePrepModel();

    render(
      <ProcessCanvas
        model={model}
        activeProcessId="process-default"
        selection={[]}
        viewMode="normal"
        {...callbacks}
      />,
    );

    expect(interactionProps(mocks.reactFlowProps.at(-1))).toEqual(
      CANVAS_VIEWPORT_INTERACTION_PROPS,
    );
  });

  it('passes free-direction trackpad panning to OverviewCanvas', () => {
    render(
      <OverviewCanvas
        model={makePrepModel()}
        selection={[]}
        {...callbacks}
      />,
    );

    expect(interactionProps(mocks.reactFlowProps.at(-1))).toEqual(
      CANVAS_VIEWPORT_INTERACTION_PROPS,
    );
  });
});
