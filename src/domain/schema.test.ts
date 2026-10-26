import { describe, expect, it } from 'vitest';

import { makePrepModel } from '../test/fixtures';
import {
  parsePrepModel,
  prepModelFileSchema,
  safeParsePrepModel,
} from './schema';

describe('prepModelFileSchema', () => {
  it('accepts a valid model and strips unknown future fields', () => {
    const input = {
      ...makePrepModel(),
      futureField: 'ignored',
      system: {
        ...makePrepModel().system,
        futureSystemField: true,
      },
    };

    const parsed = parsePrepModel(input);

    expect(parsed).toEqual(makePrepModel());
    expect('futureField' in parsed).toBe(false);
    expect('futureSystemField' in parsed.system).toBe(false);
  });

  it('rejects a model with a required field missing', () => {
    const input = structuredClone(makePrepModel()) as unknown as {
      system: Record<string, unknown>;
    };
    delete input.system.goal;

    const result = safeParsePrepModel(input);

    expect(result.success).toBe(false);
  });

  it('rejects unsupported schema versions and enum values', () => {
    expect(
      prepModelFileSchema.safeParse({
        ...makePrepModel(),
        schemaVersion: '2.0.0',
      }).success,
    ).toBe(false);

    expect(
      prepModelFileSchema.safeParse({
        ...makePrepModel(),
        system: { ...makePrepModel().system, phase: 'future' },
      }).success,
    ).toBe(false);
  });

  it('rejects invalid layout numbers', () => {
    const model = makePrepModel();
    model.layout.viewport.zoom = 0;

    expect(safeParsePrepModel(model).success).toBe(false);
  });

  it('rejects duplicate element and nested IDs', () => {
    const duplicateElement = makePrepModel();
    duplicateElement.artifacts[1].id = duplicateElement.artifacts[0].id;
    expect(safeParsePrepModel(duplicateElement).success).toBe(false);

    const duplicateState = makePrepModel();
    duplicateState.artifacts[0].states.push({
      ...duplicateState.artifacts[0].states[0],
    });
    expect(safeParsePrepModel(duplicateState).success).toBe(false);
  });
});
