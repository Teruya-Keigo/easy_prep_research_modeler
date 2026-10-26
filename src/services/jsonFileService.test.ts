import { describe, expect, it, vi } from 'vitest';
import type { PrepModelFile } from '../domain/model';
import { makePrepModel } from '../test/fixtures';
import {
  PrepModelJsonError,
  createPrepModelBlob,
  downloadPrepModelJson,
  parsePrepModelJson,
  prepModelFilename,
  readPrepModelFile,
  safeParsePrepModelJson,
  serializePrepModel,
} from './jsonFileService';

const modelFixture = (): PrepModelFile =>
  makePrepModel({
    metadata: {
      modelId: 'model-1',
      modelName: '研究モデル',
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:00:00.000Z',
    },
    system: {
      id: 'system-test',
      name: 'テスト設計システム',
      goal: '保証連鎖を確認する',
      phase: 'to-be',
    },
  });

describe('jsonFileService', () => {
  it('round-trips the canonical model with two-space indentation', () => {
    const model = modelFixture();
    const json = serializePrepModel(model);

    expect(json).toContain('\n  "schemaVersion": "1.3.0"');
    expect(parsePrepModelJson(json)).toEqual(model);
  });

  it('round-trips non-default detail and overview viewports without changing the schema', () => {
    const model = modelFixture();
    model.layout.processViews![0].viewport = {
      x: -180,
      y: 75,
      zoom: 1.3,
    };
    model.layout.overview!.viewport = {
      x: 95,
      y: -140,
      zoom: 0.7,
    };

    const restored = parsePrepModelJson(serializePrepModel(model));

    expect(restored.schemaVersion).toBe('1.3.0');
    expect(restored.layout.processViews?.[0].viewport).toEqual({
      x: -180,
      y: 75,
      zoom: 1.3,
    });
    expect(restored.layout.overview?.viewport).toEqual({
      x: 95,
      y: -140,
      zoom: 0.7,
    });
  });

  it('round-trips manual column height while keeping an auto-height column unspecified', () => {
    const model = modelFixture();
    model.processes.push(
      {
        id: 'process-manual',
        parentProcessId: 'process-default',
        name: '手動高さの工程',
        goal: '高さを固定する',
      },
      {
        id: 'process-auto',
        parentProcessId: 'process-default',
        name: '自動高さの工程',
        goal: 'レーンに追従する',
      },
    );
    model.layout.processViews![0].subprocessColumns = [
      {
        processId: 'process-manual',
        parentProcessId: 'process-default',
        order: 0,
        width: 420,
        height: 380,
      },
      {
        processId: 'process-auto',
        parentProcessId: 'process-default',
        order: 1,
        width: 360,
      },
    ];

    const serialized = serializePrepModel(model);
    const restored = parsePrepModelJson(serialized);
    const columns = restored.layout.processViews?.[0].subprocessColumns;

    expect(restored.schemaVersion).toBe('1.3.0');
    expect(columns).toEqual(model.layout.processViews![0].subprocessColumns);
    expect(columns?.[0].height).toBe(380);
    expect(columns?.[1].height).toBeUndefined();
  });

  it('throws a distinguishable syntax error for malformed JSON', () => {
    expect(() => parsePrepModelJson('{')).toThrowError(
      expect.objectContaining({
        code: 'INVALID_JSON',
      }),
    );
  });

  it('returns validation issues without throwing in the safe API', () => {
    const invalid = JSON.stringify({
      ...modelFixture(),
      schemaVersion: '9.9.9',
      system: { ...modelFixture().system, name: '' },
    });

    const result = safeParsePrepModelJson(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PrepModelJsonError);
      expect(result.error.code).toBe('INVALID_SCHEMA');
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('does not mutate an existing model when parsing fails', () => {
    const current = modelFixture();
    const before = structuredClone(current);

    safeParsePrepModelJson('{"schemaVersion":"broken"}');

    expect(current).toEqual(before);
  });

  it('reads and validates a browser File-like object', async () => {
    const file = {
      text: vi.fn().mockResolvedValue(serializePrepModel(modelFixture())),
    };

    await expect(readPrepModelFile(file)).resolves.toEqual(modelFixture());
    expect(file.text).toHaveBeenCalledOnce();
  });

  it('wraps file read failures', async () => {
    const file = {
      text: vi.fn().mockRejectedValue(new Error('read failed')),
    };

    await expect(readPrepModelFile(file)).rejects.toMatchObject({
      code: 'READ_FAILED',
    });
  });

  it('creates the required .prep.json filename and UTF-8 JSON blob', async () => {
    const blob = createPrepModelBlob(modelFixture());
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(String(reader.result)));
      reader.addEventListener('error', () => reject(reader.error));
      reader.readAsText(blob);
    });

    expect(prepModelFilename('設計:モデル.json')).toBe(
      '設計-モデル.prep.json',
    );
    expect(blob.type).toBe('application/json;charset=utf-8');
    expect(source).toBe(serializePrepModel(modelFixture()));
  });

  it('downloads through an object URL and cleans up the temporary URL', () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const createObjectURL = vi.fn(() => 'blob:model');
    const revokeObjectURL = vi.fn();

    const filename = downloadPrepModelJson(modelFixture(), {
      document,
      urlApi: { createObjectURL, revokeObjectURL },
    });

    expect(filename).toBe('研究モデル.prep.json');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:model');
    expect(document.querySelector('a[download]')).toBeNull();

    click.mockRestore();
  });
});
