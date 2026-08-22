import {describe, expect, it} from 'vitest';
import {materializeSuggestions} from './planner.js';
import type {AnimationSuggestion, SubtitleCue} from './types.js';

const cues: SubtitleCue[] = [
  {cueIndex: 1, sourceIndex: '1', startMs: 1_000, endMs: 3_000, text: 'Client calls API.'},
  {cueIndex: 2, sourceIndex: '2', startMs: 3_000, endMs: 5_000, text: 'API queues work.'},
  {cueIndex: 3, sourceIndex: '3', startMs: 5_000, endMs: 8_000, text: 'Worker stores result.'},
];

const suggestion: AnimationSuggestion = {
  startCue: 1,
  endCue: 3,
  template: 'process-flow',
  title: 'Request flow',
  primaryItems: ['Client', 'API', 'Queue', 'Worker', 'Database'],
  secondaryItems: [],
  leftLabel: '',
  rightLabel: '',
  reason: 'Shows the processing sequence.',
};

describe('materializeSuggestions', () => {
  it('derives exact source timing from subtitle cues', () => {
    expect(materializeSuggestions([suggestion], cues)).toEqual([
      expect.objectContaining({
        id: 'animation-01',
        sourceStartMs: 1_000,
        sourceEndMs: 8_000,
        durationMs: 7_000,
        transcript: 'Client calls API. API queues work. Worker stores result.',
      }),
    ]);
  });

  it('rejects out-of-range cue references', () => {
    expect(() =>
      materializeSuggestions([{...suggestion, endCue: 4}], cues),
    ).toThrow('outside the subtitle file');
  });

  it('rejects overlapping suggestions', () => {
    expect(() =>
      materializeSuggestions(
        [
          {...suggestion, startCue: 1, endCue: 2},
          {...suggestion, startCue: 2, endCue: 3},
        ],
        cues,
      ),
    ).toThrow('overlapping animations');
  });
});
