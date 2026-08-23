import {describe, expect, it} from 'vitest';
import {narrationScriptMarkdown} from './narration-planner.js';
import {draftNarratedPlanSchema, narratedPlanSchema} from './types.js';

const validPlan = {
  version: 2 as const,
  kind: 'narrated-video' as const,
  stage: 'draft' as const,
  sourceText: 'Queues let producers and consumers operate independently.',
  generatedAt: '2026-08-23T00:00:00.000Z',
  model: 'fixture',
  targetDurationSeconds: 60,
  language: 'en',
  title: 'Why queues help',
  scenes: [
    {
      id: 'queue-flow',
      backgroundPrompt: 'Abstract producer and consumer connected by a glowing queue.',
      template: 'process-flow' as const,
      title: 'A queue decouples work',
      primaryItems: ['Producer', 'Queue', 'Consumer'],
      secondaryItems: [],
      leftLabel: '',
      rightLabel: '',
      reason: 'Shows the source flow.',
      beats: [
        {
          id: 'producer',
          phrases: [
            {id: 'producer-submits', text: 'The producer submits work.'},
          ],
          primaryItemIndices: [0],
          secondaryItemIndices: [],
        },
        {
          id: 'queue-consumer',
          phrases: [
            {id: 'queue-holds', text: 'The queue lets the consumer'},
            {id: 'consumer-independent', text: 'process it independently.'},
          ],
          primaryItemIndices: [1, 2],
          secondaryItemIndices: [],
        },
      ],
    },
  ],
};

describe('draftNarratedPlanSchema', () => {
  it('accepts exactly-once semantic item anchors', () => {
    expect(draftNarratedPlanSchema.parse(validPlan).scenes).toHaveLength(1);
  });

  it('rejects duplicate, missing, and unordered anchors', () => {
    const duplicate = structuredClone(validPlan);
    duplicate.scenes[0]!.beats[1]!.primaryItemIndices = [0, 2];
    expect(() => draftNarratedPlanSchema.parse(duplicate)).toThrow(
      'anchored exactly once',
    );

    const unordered = structuredClone(validPlan);
    unordered.scenes[0]!.beats[0]!.primaryItemIndices = [1];
    unordered.scenes[0]!.beats[1]!.primaryItemIndices = [0, 2];
    expect(() => draftNarratedPlanSchema.parse(unordered)).toThrow(
      'anchored exactly once',
    );
  });

  it('requires comparison scenes to have a second side', () => {
    const invalid = structuredClone(validPlan);
    invalid.scenes[0]!.template = 'comparison';
    expect(() => draftNarratedPlanSchema.parse(invalid)).toThrow(
      'require secondary items',
    );
  });

  it('normalizes version-1 beats into one phrase and supplies a background prompt', () => {
    const legacy = {
      ...validPlan,
      version: 1 as const,
      scenes: validPlan.scenes.map((scene) => ({
        ...scene,
        backgroundPrompt: undefined,
        beats: scene.beats.map((beat) => ({
          id: beat.id,
          text: beat.phrases.map(({text}) => text).join(' '),
          primaryItemIndices: beat.primaryItemIndices,
          secondaryItemIndices: beat.secondaryItemIndices,
        })),
      })),
    };
    const raw = JSON.parse(JSON.stringify(legacy));
    const parsed = narratedPlanSchema.parse(raw);
    expect(parsed.version).toBe(2);
    expect(parsed.scenes[0]!.backgroundPrompt).toContain('A queue decouples work');
    expect(parsed.scenes[0]!.beats[0]!.phrases).toEqual([
      {id: 'producer-phrase-1', text: 'The producer submits work.'},
    ]);
  });

  it('normalizes version-1 timed beats without changing their sample timing', () => {
    const legacyTimed = {
      version: 1,
      kind: 'narrated-video',
      stage: 'timed',
      sourceText: validPlan.sourceText,
      generatedAt: validPlan.generatedAt,
      model: validPlan.model,
      targetDurationSeconds: 1,
      language: 'en',
      title: validPlan.title,
      sampleRate: 1_000,
      voice: 'M1',
      ttsSpeed: 1.05,
      ttsSteps: 8,
      voiceoverFile: 'audio/voiceover.wav',
      durationMs: 1_000,
      totalSamples: 1_000,
      scenes: [{
        ...validPlan.scenes[0],
        backgroundPrompt: undefined,
        startMs: 0,
        durationMs: 1_000,
        beats: [
          {
            id: 'producer',
            text: 'The producer submits work.',
            primaryItemIndices: [0],
            secondaryItemIndices: [],
            startMs: 100,
            durationMs: 300,
            audioFile: 'beats/producer.wav',
            sampleCount: 300,
          },
          {
            id: 'queue-consumer',
            text: 'The queue lets the consumer process it independently.',
            primaryItemIndices: [1, 2],
            secondaryItemIndices: [],
            startMs: 500,
            durationMs: 300,
            audioFile: 'beats/queue-consumer.wav',
            sampleCount: 300,
          },
        ],
        primaryItemTimings: [
          {beatId: 'producer', startMs: 100},
          {beatId: 'queue-consumer', startMs: 500},
          {beatId: 'queue-consumer', startMs: 500},
        ],
        secondaryItemTimings: [],
      }],
    };
    const parsed = narratedPlanSchema.parse(JSON.parse(JSON.stringify(legacyTimed)));
    expect(parsed.stage).toBe('timed');
    if (parsed.stage !== 'timed') throw new Error('Expected a timed plan.');
    expect(parsed.scenes[0]!.beats[1]!.phrases[0]).toEqual({
      id: 'queue-consumer-phrase-1',
      text: 'The queue lets the consumer process it independently.',
      startMs: 500,
      durationMs: 300,
      sampleCount: 300,
    });
    const invalidTiming = structuredClone(parsed);
    invalidTiming.scenes[0]!.beats[1]!.phrases[0]!.startMs = 900;
    expect(() => narratedPlanSchema.parse(invalidTiming)).toThrow(
      'Phrase timing must fall inside its narration beat',
    );
  });
});

describe('narrationScriptMarkdown', () => {
  it('writes the complete spoken script in scene order', () => {
    expect(narrationScriptMarkdown(draftNarratedPlanSchema.parse(validPlan))).toBe(
      '# Why queues help\n\n' +
        '## Scene 1: A queue decouples work\n\n' +
        'The producer submits work. The queue lets the consumer process it independently.\n',
    );
  });
});
