import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toPng, toSvg } from 'html-to-image';
import {
  ImageExportError,
  downloadRenderedImage,
  exportElementAsPng,
  exportElementAsSvg,
  renderElementAsImage,
} from './imageExportService';

vi.mock('html-to-image', () => ({
  toPng: vi.fn(),
  toSvg: vi.fn(),
}));

function sizedElement(width = 800, height = 600): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperties(element, {
    scrollWidth: { configurable: true, value: width },
    scrollHeight: { configurable: true, value: height },
    offsetWidth: { configurable: true, value: width - 100 },
    offsetHeight: { configurable: true, value: height - 100 },
  });
  element.getBoundingClientRect = vi.fn(
    () =>
      ({
        width: width - 200,
        height: height - 200,
      }) as DOMRect,
  );
  return element;
}

describe('imageExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports the full measured element as a high-resolution PNG', async () => {
    vi.mocked(toPng).mockResolvedValue('data:image/png;base64,png');
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    const result = await exportElementAsPng(sizedElement(), {
      filename: '研究:モデル',
      document,
    });

    expect(toPng).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        width: 800,
        height: 600,
        canvasWidth: 800,
        canvasHeight: 600,
        backgroundColor: '#ffffff',
        cacheBust: true,
        pixelRatio: 2,
        style: expect.objectContaining({
          width: '800px',
          height: '600px',
        }),
      }),
    );
    expect(result).toEqual({
      format: 'png',
      filename: '研究-モデル.png',
      dataUrl: 'data:image/png;base64,png',
      width: 800,
      height: 600,
    });
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download]')).toBeNull();

    click.mockRestore();
  });

  it('uses the SVG renderer and honors explicit capture dimensions/style', async () => {
    vi.mocked(toSvg).mockResolvedValue(
      'data:image/svg+xml;charset=utf-8,svg',
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    const result = await exportElementAsSvg(sizedElement(), {
      filename: 'diagram.svg',
      width: 1200.2,
      height: 900.1,
      backgroundColor: 'transparent',
      pixelRatio: 1,
      style: { transform: 'translate(20px, 30px) scale(0.8)' },
      document,
    });

    expect(toSvg).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        width: 1201,
        height: 901,
        backgroundColor: 'transparent',
        pixelRatio: 1,
        style: expect.objectContaining({
          transform: 'translate(20px, 30px) scale(0.8)',
        }),
      }),
    );
    expect(result.filename).toBe('diagram.svg');

    click.mockRestore();
  });

  it('can render without immediately downloading', async () => {
    vi.mocked(toPng).mockResolvedValue('data:image/png;base64,png');

    const result = await renderElementAsImage(
      sizedElement(300, 200),
      'png',
    );

    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('rejects invalid explicit dimensions before rendering', async () => {
    await expect(
      renderElementAsImage(sizedElement(), 'png', { width: 0 }),
    ).rejects.toMatchObject({
      code: 'INVALID_SIZE',
      format: 'png',
    });
    expect(toPng).not.toHaveBeenCalled();
  });

  it('wraps image library failures with the selected format', async () => {
    const cause = new Error('font fetch failed');
    vi.mocked(toSvg).mockRejectedValue(cause);

    await expect(
      renderElementAsImage(sizedElement(), 'svg'),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'RENDER_FAILED',
        format: 'svg',
        cause,
      }),
    );
  });

  it('reports download unavailability separately from rendering', () => {
    expect(() =>
      downloadRenderedImage(
        {
          format: 'png',
          filename: 'model.png',
          dataUrl: 'data:image/png;base64,png',
        },
        null,
      ),
    ).toThrowError(ImageExportError);
  });
});
