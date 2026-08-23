import {describe, expect, it} from 'vitest';
import {
  materializeSuggestions,
  resolveOverlappingSuggestions,
} from './planner.js';
import {
  savedPlanSchema,
  type AnimationSuggestion,
  type SubtitleCue,
} from './types.js';

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
  primaryItemStartCues: [1, 2, 2, 3, 3],
  secondaryItems: [],
  secondaryItemStartCues: [],
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
        primaryItemTimings: [
          {cueIndex: 1, startMs: 0},
          {cueIndex: 2, startMs: 2_000},
          {cueIndex: 2, startMs: 2_000},
          {cueIndex: 3, startMs: 4_000},
          {cueIndex: 3, startMs: 4_000},
        ],
        secondaryItemTimings: [],
      }),
    ]);
  });

  it('rejects missing, out-of-range, and unordered item anchors', () => {
    expect(() =>
      materializeSuggestions(
        [{...suggestion, primaryItemStartCues: [1]}],
        cues,
      ),
    ).toThrow('one speech cue per item');

    expect(() =>
      materializeSuggestions(
        [
          {
            ...suggestion,
            endCue: 2,
            primaryItemStartCues: [1, 1, 2, 2, 3],
          },
        ],
        cues,
      ),
    ).toThrow('outside its animation range');

    expect(() =>
      materializeSuggestions(
        [{...suggestion, primaryItemStartCues: [1, 2, 1, 3, 3]}],
        cues,
      ),
    ).toThrow('out of chronological order');
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
          {
            ...suggestion,
            startCue: 1,
            endCue: 2,
            primaryItemStartCues: [1, 1, 2, 2, 2],
          },
          {
            ...suggestion,
            startCue: 2,
            endCue: 3,
            primaryItemStartCues: [2, 2, 2, 3, 3],
          },
        ],
        cues,
      ),
    ).toThrow('overlapping animations');
  });

  it('keeps version 1 plans without item timing renderable', () => {
    const clip = materializeSuggestions([suggestion], cues)[0]!;
    const {primaryItemTimings, secondaryItemTimings, ...legacyClip} = clip;

    expect(
      savedPlanSchema.parse({
        version: 1,
        sourceSubtitle: '/tmp/legacy.srt',
        generatedAt: '2026-08-23T00:00:00.000Z',
        model: 'fixture',
        clips: [legacyClip],
      }).clips[0],
    ).not.toHaveProperty('primaryItemTimings');
  });

  it('rejects hand-edited plans with timing that no longer matches the items', () => {
    const clip = materializeSuggestions([suggestion], cues)[0]!;

    expect(() =>
      savedPlanSchema.parse({
        version: 1,
        sourceSubtitle: '/tmp/invalid.srt',
        generatedAt: '2026-08-23T00:00:00.000Z',
        model: 'fixture',
        clips: [{...clip, primaryItemTimings: clip.primaryItemTimings?.slice(1)}],
      }),
    ).toThrow('one entry for each matching item');
  });
});

describe('resolveOverlappingSuggestions', () => {
  const suggestionForRange = (
    startCue: number,
    endCue: number,
    title: string,
  ): AnimationSuggestion => ({
    ...suggestion,
    startCue,
    endCue,
    title,
    primaryItemStartCues: Array.from(
      {length: suggestion.primaryItems.length},
      () => startCue,
    ),
  });

  it('keeps the largest deterministic non-overlapping set', () => {
    const resolution = resolveOverlappingSuggestions(
      [
        suggestionForRange(1, 3, 'Broad overview'),
        suggestionForRange(1, 1, 'First detail'),
        suggestionForRange(2, 2, 'Second detail'),
        suggestionForRange(3, 3, 'Third detail'),
      ],
      cues,
    );

    expect(resolution.suggestions.map(({title}) => title)).toEqual([
      'First detail',
      'Second detail',
      'Third detail',
    ]);
    expect(resolution.warnings).toEqual([
      expect.stringContaining(
        'Dropped overlapping suggestion "Broad overview" (cues 1-3)',
      ),
    ]);
  });

  it('preserves adjacent cue ranges without warnings', () => {
    const first = suggestionForRange(1, 1, 'First');
    const second = suggestionForRange(2, 3, 'Second');

    expect(resolveOverlappingSuggestions([second, first], cues)).toEqual({
      suggestions: [first, second],
      warnings: [],
    });
  });
});
