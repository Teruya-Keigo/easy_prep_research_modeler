import { describe, expect, it } from 'vitest';

import { createCoffeeProcessModel } from '../templates/coffeeProcess';
import { createConstrainedMlcTestingModel } from '../templates/constrainedMlcTesting';
import { createEmptyModel } from '../templates/emptyModel';
import { parsePrepModel, safeParsePrepModel } from './schema';

describe('canonical v1.3 schema', () => {
  it.each([
    ['empty', createEmptyModel],
    ['constrained MLC', createConstrainedMlcTestingModel],
    ['coffee', createCoffeeProcessModel],
  ])('accepts the %s canonical template', (_name, createModel) => {
    expect(() => parsePrepModel(createModel('2026-01-01'))).not.toThrow();
  });

  it('requires anchors and collections', () => {
    const model = createConstrainedMlcTestingModel('2026-01-01');
    const missingActors = structuredClone(model) as unknown as Record<
      string,
      unknown
    >;
    delete missingActors.actors;
    expect(safeParsePrepModel(missingActors).success).toBe(false);

    const missingAnchor = structuredClone(model);
    delete missingAnchor.relations[0].sourceAnchor;
    expect(safeParsePrepModel(missingAnchor).success).toBe(false);
  });

  it('rejects hierarchy cycles and invalid handoff references', () => {
    const cyclic = createConstrainedMlcTestingModel('2026-01-01');
    cyclic.processes[0].parentProcessId = cyclic.processes[1].id;
    expect(safeParsePrepModel(cyclic).success).toBe(false);

    const invalidHandoff = createCoffeeProcessModel('2026-01-01');
    invalidHandoff.processHandoffs![0].sourceArtifactIds = [
      'artifact-coffee-request',
    ];
    expect(safeParsePrepModel(invalidHandoff).success).toBe(false);
  });

  it('accepts auto or manual subprocess heights and rejects undersized boxes', () => {
    const model = createConstrainedMlcTestingModel('2026-01-01');
    const column = model.layout.processViews![0].subprocessColumns[0];
    expect(column.height).toBeUndefined();
    expect(safeParsePrepModel(model).success).toBe(true);

    column.height = 240;
    expect(safeParsePrepModel(model).success).toBe(true);

    column.height = 159;
    expect(safeParsePrepModel(model).success).toBe(false);
    column.height = undefined;
    column.width = 259;
    expect(safeParsePrepModel(model).success).toBe(false);
  });
});
