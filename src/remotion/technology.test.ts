import {describe, expect, it} from 'vitest';
import {technologyIconKindFor} from './technology.js';

describe('technologyIconKindFor', () => {
  it.each([
    ['Generate answer with LLM', 'ai'],
    ['Retrieve relevant information', 'search'],
    ['Deploy service to AWS', 'cloud'],
    ['Start the container service', 'server'],
    ['Open the frontend UI', 'web'],
  ] as const)('matches %s to the %s visual', (label, expected) => {
    expect(technologyIconKindFor(label)).toBe(expected);
  });

  it('uses a generic system glyph for unknown labels', () => {
    expect(technologyIconKindFor('Validate the result')).toBe('generic');
  });
});
