import type { PrepModelFile } from '../domain/model';
import { migratePrepModel, safeMigratePrepModel } from '../domain/migration';

export type PrepModelJsonErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_SCHEMA'
  | 'READ_FAILED'
  | 'DOWNLOAD_UNAVAILABLE';

export interface PrepModelValidationIssue {
  path: ReadonlyArray<string | number>;
  message: string;
}

export class PrepModelJsonError extends Error {
  readonly code: PrepModelJsonErrorCode;
  readonly issues: ReadonlyArray<PrepModelValidationIssue>;

  constructor(
    code: PrepModelJsonErrorCode,
    message: string,
    options?: ErrorOptions & {
      issues?: ReadonlyArray<PrepModelValidationIssue>;
    },
  ) {
    super(message, options);
    this.name = 'PrepModelJsonError';
    this.code = code;
    this.issues = options?.issues ?? [];
  }
}

export type PrepModelJsonParseResult =
  | { success: true; data: PrepModelFile }
  | { success: false; error: PrepModelJsonError };

export interface DownloadPrepModelOptions {
  /**
   * A `.prep.json` suffix is appended when it is not already present.
   * When omitted, the model name is used.
   */
  filename?: string;
  document?: Document;
  urlApi?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
}

function validationIssues(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): PrepModelValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path.map((part) =>
      typeof part === 'number' ? part : String(part),
    ),
    message: issue.message,
  }));
}

function validationMessage(
  issues: ReadonlyArray<PrepModelValidationIssue>,
): string {
  const details = issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
      return `${path}: ${issue.message}`;
    })
    .join(' / ');

  return details
    ? `読み込んだモデル形式が正しくありません（${details}）`
    : '読み込んだモデル形式が正しくありません';
}

/**
 * Parses JSON and validates it as the canonical PrepModelFile format.
 *
 * This function never applies data to application state. Callers can parse
 * first, then replace their current model only after this function succeeds.
 */
export function parsePrepModelJson(source: string): PrepModelFile {
  let value: unknown;

  try {
    value = JSON.parse(source) as unknown;
  } catch (cause) {
    throw new PrepModelJsonError(
      'INVALID_JSON',
      'JSONの構文が正しくありません',
      { cause },
    );
  }

  const result = safeMigratePrepModel(value);
  if (!result.success) {
    const issues = validationIssues(result.error.issues);
    throw new PrepModelJsonError(
      'INVALID_SCHEMA',
      validationMessage(issues),
      { cause: result.error, issues },
    );
  }

  return result.data;
}

export function safeParsePrepModelJson(
  source: string,
): PrepModelJsonParseResult {
  try {
    return { success: true, data: parsePrepModelJson(source) };
  } catch (error) {
    if (error instanceof PrepModelJsonError) {
      return { success: false, error };
    }

    return {
      success: false,
      error: new PrepModelJsonError(
        'INVALID_SCHEMA',
        '読み込んだモデル形式が正しくありません',
        { cause: error },
      ),
    };
  }
}

/**
 * Produces UTF-8 compatible, two-space-indented JSON. Runtime validation is
 * also performed so an accidentally malformed in-memory value is not exported.
 */
export function serializePrepModel(model: PrepModelFile): string {
  const canonical = migratePrepModel(model);
  const {
    nodes: _legacyNodes,
    viewport: _legacyViewport,
    ...layout
  } = canonical.layout;
  return JSON.stringify({ ...canonical, layout }, null, 2);
}

export async function readPrepModelFile(
  file: Pick<Blob, 'text'>,
): Promise<PrepModelFile> {
  let source: string;

  try {
    source = await file.text();
  } catch (cause) {
    throw new PrepModelJsonError(
      'READ_FAILED',
      'モデルファイルを読み込めませんでした',
      { cause },
    );
  }

  return parsePrepModelJson(source);
}

export function createPrepModelBlob(model: PrepModelFile): Blob {
  return new Blob([serializePrepModel(model)], {
    type: 'application/json;charset=utf-8',
  });
}

export function prepModelFilename(name: string): string {
  const withoutJsonSuffix = name
    .trim()
    .replace(/(?:\.prep)?\.json$/i, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\p{Cc}/gu, '')
    .trim();

  return `${withoutJsonSuffix || 'prep-model'}.prep.json`;
}

/**
 * Starts a browser download and returns the actual filename used.
 */
export function downloadPrepModelJson(
  model: PrepModelFile,
  options: DownloadPrepModelOptions = {},
): string {
  const documentRef =
    options.document ??
    (typeof document === 'undefined' ? undefined : document);
  const urlApi =
    options.urlApi ??
    (typeof URL === 'undefined' ? undefined : URL);

  if (
    !documentRef ||
    !urlApi ||
    typeof urlApi.createObjectURL !== 'function' ||
    typeof urlApi.revokeObjectURL !== 'function'
  ) {
    throw new PrepModelJsonError(
      'DOWNLOAD_UNAVAILABLE',
      'この環境ではモデルをダウンロードできません',
    );
  }

  const filename = prepModelFilename(
    options.filename ?? model.metadata.modelName,
  );
  const objectUrl = urlApi.createObjectURL(createPrepModelBlob(model));
  const anchor = documentRef.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  documentRef.body.append(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    urlApi.revokeObjectURL(objectUrl);
  }

  return filename;
}
