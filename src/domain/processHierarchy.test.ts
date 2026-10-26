import { describe, expect, it } from 'vitest';

import type { PrepProcess } from './model';
import {
  findProcessHierarchyCycles,
  getProcessAncestors,
  getProcessDescendants,
  wouldCreateProcessCycle,
} from './processHierarchy';

const processes: PrepProcess[] = [
  { id: 'a', name: 'A', goal: 'A' },
  { id: 'b', parentProcessId: 'a', name: 'B', goal: 'B' },
  { id: 'c', parentProcessId: 'b', name: 'C', goal: 'C' },
  { id: 'd', parentProcessId: 'a', name: 'D', goal: 'D' },
];

describe('process hierarchy', () => {
  it('finds ancestors and descendants without leaking siblings', () => {
    expect(getProcessAncestors(processes, 'c').map(({ id }) => id)).toEqual([
      'b',
      'a',
    ]);
    expect(getProcessDescendants(processes, 'a').map(({ id }) => id)).toEqual([
      'b',
      'c',
      'd',
    ]);
  });

  it('prevents assigning self or a descendant as parent', () => {
    expect(wouldCreateProcessCycle(processes, 'a', 'a')).toBe(true);
    expect(wouldCreateProcessCycle(processes, 'a', 'c')).toBe(true);
    expect(wouldCreateProcessCycle(processes, 'c', 'a')).toBe(false);
  });

  it('detects malformed imported cycles', () => {
    const cyclic: PrepProcess[] = [
      { id: 'a', parentProcessId: 'c', name: 'A', goal: 'A' },
      { id: 'b', parentProcessId: 'a', name: 'B', goal: 'B' },
      { id: 'c', parentProcessId: 'b', name: 'C', goal: 'C' },
    ];
    expect(new Set(findProcessHierarchyCycles(cyclic)[0])).toEqual(
      new Set(['a', 'b', 'c']),
    );
  });
});
