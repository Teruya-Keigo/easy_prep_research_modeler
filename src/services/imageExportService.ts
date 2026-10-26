import { toPng, toSvg } from 'html-to-image';

export type ImageExportFormat = 'png' | 'svg';

export interface ImageExportOptions {
  filename?: string;
  backgroundColor?: string;
  width?: number;
  height?: number;
  pixelRatio?: number;
  cacheBust?: boolean;
  filter?: (domNode: HTMLElement) => boolean;
  style?: Partial<CSSStyleDeclaration>;
  document?: Document;
}

export interface ImageExportResult {
  format: ImageExportFormat;
  filename: string;
  dataUrl: string;
  width?: number;
  height?: number;
}

export type ImageExportErrorCode =
  | 'INVALID_SIZE'
  | 'RENDER_FAILED'
  | 'DOWNLOAD_UNAVAILABLE';

export class ImageExportError extends Error {
  readonly code: ImageExportErrorCode;
  readonly format: ImageExportFormat;

  constructor(
    code: ImageExportErrorCode,
    format: ImageExportFormat,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ImageExportError';
    this.code = code;
    this.format = format;
  }
}

function explicitDimension(
  value: number | undefined,
  name: 'width' | 'height',
  format: ImageExportFormat,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new ImageExportError(
      'INVALID_SIZE',
      format,
      `${name}には正の有限値を指定してください`,
    );
  }

  return Math.ceil(value);
}

function measuredDimension(values: number[]): number | undefined {
  const maximum = Math.max(
    0,
    ...values.filter((value) => Number.isFinite(value) && value > 0),
  );
  return maximum > 0 ? Math.ceil(maximum) : undefined;
}

function exportDimensions(
  element: HTMLElement,
  format: ImageExportFormat,
  options: ImageExportOptions,
): { width?: number; height?: number } {
  const rectangle = element.getBoundingClientRect();
  return {
    width:
      explicitDimension(options.width, 'width', format) ??
      measuredDimension([
        element.scrollWidth,
        element.offsetWidth,
        rectangle.width,
      ]),
    height:
      explicitDimension(options.height, 'height', format) ??
      measuredDimension([
        element.scrollHeight,
        element.offsetHeight,
        rectangle.height,
      ]),
  };
}

function imageFilename(
  name: string | undefined,
  format: ImageExportFormat,
): string {
  const sanitized = (name ?? 'prep-model')
    .trim()
    .replace(/\.(?:png|svg)$/i, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\p{Cc}/gu, '')
    .trim();

  return `${sanitized || 'prep-model'}.${format}`;
}

function rendererOptions(
  dimensions: { width?: number; height?: number },
  options: ImageExportOptions,
) {
  const sizeStyle: Partial<CSSStyleDeclaration> = {};
  if (dimensions.width !== undefined) {
    sizeStyle.width = `${dimensions.width}px`;
  }
  if (dimensions.height !== undefined) {
    sizeStyle.height = `${dimensions.height}px`;
  }

  return {
    backgroundColor: options.backgroundColor ?? '#ffffff',
    cacheBust: options.cacheBust ?? true,
    filter: options.filter,
    pixelRatio: options.pixelRatio ?? 2,
    width: dimensions.width,
    height: dimensions.height,
    canvasWidth: dimensions.width,
    canvasHeight: dimensions.height,
    style: {
      ...sizeStyle,
      ...options.style,
    },
  };
}

export async function renderElementAsImage(
  element: HTMLElement,
  format: ImageExportFormat,
  options: ImageExportOptions = {},
): Promise<ImageExportResult> {
  const dimensions = exportDimensions(element, format, options);

  let dataUrl: string;
  try {
    const render = format === 'png' ? toPng : toSvg;
    dataUrl = await render(
      element,
      rendererOptions(dimensions, options),
    );
  } catch (cause) {
    if (cause instanceof ImageExportError) {
      throw cause;
    }

    throw new ImageExportError(
      'RENDER_FAILED',
      format,
      `${format.toUpperCase()}画像を生成できませんでした`,
      { cause },
    );
  }

  return {
    format,
    filename: imageFilename(options.filename, format),
    dataUrl,
    ...dimensions,
  };
}

export function downloadRenderedImage(
  result: ImageExportResult,
  documentRef: Document | null | undefined =
    typeof document === 'undefined' ? undefined : document,
): void {
  if (!documentRef) {
    throw new ImageExportError(
      'DOWNLOAD_UNAVAILABLE',
      result.format,
      'この環境では画像をダウンロードできません',
    );
  }

  const anchor = documentRef.createElement('a');
  anchor.href = result.dataUrl;
  anchor.download = result.filename;
  anchor.style.display = 'none';
  documentRef.body.append(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
}

export async function exportElementAsImage(
  element: HTMLElement,
  format: ImageExportFormat,
  options: ImageExportOptions = {},
): Promise<ImageExportResult> {
  const result = await renderElementAsImage(element, format, options);
  downloadRenderedImage(
    result,
    options.document ??
      (typeof document === 'undefined' ? undefined : document),
  );
  return result;
}

export function exportElementAsPng(
  element: HTMLElement,
  options: ImageExportOptions = {},
): Promise<ImageExportResult> {
  return exportElementAsImage(element, 'png', options);
}

export function exportElementAsSvg(
  element: HTMLElement,
  options: ImageExportOptions = {},
): Promise<ImageExportResult> {
  return exportElementAsImage(element, 'svg', options);
}
