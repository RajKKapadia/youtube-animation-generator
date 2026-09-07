import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  allocateNarrationPhraseSamples,
  joinNarrationPhrases,
} from '../narration-text.js';
import {synthesizeJob} from './synthesis.js';
import {trimSynthesizedWaveform} from './wav.js';
import {supertonicJobSchema} from './protocol.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true}),
    ),
  );
});

describe('trimSynthesizedWaveform', () => {
  it('uses the duration-derived PCM sample count', () => {
    expect(trimSynthesizedWaveform([0, 0.5, 0.25, 0], 0.003, 1_000)).toEqual(
      new Float32Array([0, 0.5, 0.25]),
    );
  });

  it('rejects impossible duration metadata', () => {
    expect(() => trimSynthesizedWaveform([0], 1, 1_000)).toThrow(
      'reported 1000 samples',
    );
  });
});

describe('beat utterance timing', () => {
  it('joins caption phrases without turning them into speech boundaries', () => {
    const phrases = [
      {text: 'Engineering decisions are moving'},
      {text: 'out of the IDE'},
      {text: 'and into team conversations.'},
    ];

    expect(joinNarrationPhrases(phrases, 'en')).toBe(
      'Engineering decisions are moving out of the IDE and into team conversations.',
    );
    expect(joinNarrationPhrases([{text: '前半'}, {text: '後半。'}], 'ja')).toBe(
      '前半後半。',
    );
  });

  it('partitions every beat sample into positive text-weighted caption windows', () => {
    const allocations = allocateNarrationPhraseSamples([
      {text: 'Engineering decisions are moving'},
      {text: 'out of the IDE'},
      {text: 'and into team conversations.'},
    ], 10_000);

    expect(allocations.reduce((sum, samples) => sum + samples, 0)).toBe(10_000);
    expect(allocations.every((samples) => samples > 0)).toBe(true);
    expect(allocations[0]).toBeGreaterThan(allocations[1]!);
    expect(allocations[2]).toBeGreaterThan(allocations[1]!);
  });
});

describe('Supertonic worker JSON jobs', () => {
  it('validates voice, language, inference settings, and beat structure', () => {
    expect(supertonicJobSchema.parse({
      assetsDirectory: '/models',
      outputDirectory: '/tmp/output',
      voice: 'F5',
      language: 'hi',
      speed: 1.05,
      steps: 8,
      scenes: [{
        id: 'scene',
        beats: [{
          id: 'beat',
          expression: 'none',
          phrases: [{id: 'greeting', text: 'नमस्ते'}],
        }],
      }],
    })).toMatchObject({voice: 'F5', language: 'hi'});
    expect(() => supertonicJobSchema.parse({
      assetsDirectory: '/models',
      outputDirectory: '/tmp/output',
      voice: 'custom',
      language: 'xx',
      speed: 4,
      steps: 0,
      scenes: [],
    })).toThrow();
  });
});

describe('synthesizeJob', () => {
  it('speaks exact amounts, saves the actual script and weights captions by expanded speech', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'supertonic-numbers-'));
    temporaryDirectories.push(directory);
    const phrases = [
      {id: 'intro', text: 'Combined net buying was'},
      {id: 'amount', text: '₹5,818.18 crore.'},
    ];
    const original = structuredClone(phrases);
    const calls: string[] = [];
    const result = await synthesizeJob({
      assetsDirectory: '/unused', outputDirectory: directory, voice: 'M3', language: 'en', speed: 1.05, steps: 20,
      scenes: [{id: 'cash', beats: [{id: 'total', expression: 'none', phrases}]}],
    }, {
      sampleRate: 1_000,
      synthesize: async (text) => {
        calls.push(text);
        return {audio: new Float32Array(10_000), durationSeconds: 10};
      },
    });
    expect(calls).toEqual(['Combined net buying was five thousand eight hundred and eighteen point one eight crore rupees.']);
    expect(phrases).toEqual(original);
    const timed = result.scenes[0]!.beats[0]!.phrases;
    expect(timed.map(({id}) => id)).toEqual(['intro', 'amount']);
    expect(timed.reduce((total, phrase) => total + phrase.sampleCount, 0)).toBe(10_000);
    expect(timed[1]!.sampleCount).toBeGreaterThan(timed[0]!.sampleCount * 2);
    expect(timed[1]!.startSample).toBe(timed[0]!.startSample + timed[0]!.sampleCount);
    expect(result.totalSamples).toBe(10_600);
    const script = JSON.parse(await readFile(resolve(directory, 'spoken-script.json'), 'utf8'));
    expect(script).toMatchObject({version: 1, language: 'en', voice: 'M3', speed: 1.05, steps: 20,
      scenes: [{id: 'cash', beats: [{id: 'total', text: calls[0]}]}]});
  });

  it('runs inference sequentially and writes an exact combined PCM timeline', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'supertonic-test-'));
    temporaryDirectories.push(directory);
    let active = 0;
    let maxActive = 0;
    const calls: string[] = [];
    const result = await synthesizeJob(
      {
        assetsDirectory: '/unused',
        outputDirectory: directory,
        voice: 'M1',
        language: 'en',
        speed: 1.05,
        steps: 8,
        scenes: [
          {
            id: 'scene',
            beats: [
              {
                id: 'one',
                expression: 'breath',
                phrases: [
                  {id: 'one-a', text: 'One'},
                  {id: 'one-b', text: 'again'},
                ],
              },
              {
                id: 'two',
                expression: 'none',
                phrases: [{id: 'two-a', text: 'Two'}],
              },
            ],
          },
        ],
      },
      {
        sampleRate: 1_000,
        synthesize: async (text) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          calls.push(text);
          await Promise.resolve();
          active -= 1;
          return {audio: [0.25, 0.5, 0.75], durationSeconds: 0.003};
        },
      },
    );

    expect(calls).toEqual(['<breath> One again', 'Two']);
    expect(maxActive).toBe(1);
    expect(result.scenes[0]).toMatchObject({
      startSample: 0,
      sampleCount: 756,
      beats: [
        {
          startSample: 300,
          sampleCount: 3,
          phrases: [
            {id: 'one-a', startSample: 300, sampleCount: 1},
            {id: 'one-b', startSample: 301, sampleCount: 2},
          ],
        },
        {
          startSample: 453,
          sampleCount: 3,
          phrases: [{id: 'two-a', startSample: 453, sampleCount: 3}],
        },
      ],
    });
    expect(result.totalSamples).toBe(756);
    const voiceover = await readFile(resolve(directory, 'voiceover.wav'));
    expect(voiceover.readUInt32LE(40)).toBe(result.totalSamples * 2);
  });

  it('does not write a combined voiceover after a failed beat', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'supertonic-test-'));
    temporaryDirectories.push(directory);
    let call = 0;
    await expect(
      synthesizeJob(
        {
          assetsDirectory: '/unused',
          outputDirectory: directory,
          voice: 'M1',
          language: 'en',
          speed: 1.05,
          steps: 8,
          scenes: [{
            id: 'scene',
            beats: [
              {
                id: 'one',
                expression: 'none',
                phrases: [{id: 'one-a', text: 'One'}],
              },
              {
                id: 'two',
                expression: 'none',
                phrases: [{id: 'two-a', text: 'Two'}],
              },
            ],
          }],
        },
        {
          sampleRate: 1_000,
          synthesize: async () => {
            call += 1;
            if (call === 2) throw new Error('inference failed');
            return {audio: [0.25], durationSeconds: 0.001};
          },
        },
      ),
    ).rejects.toThrow('inference failed');
    await expect(readFile(resolve(directory, 'voiceover.wav'))).rejects.toThrow();
  });
});
