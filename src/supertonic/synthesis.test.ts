import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
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

describe('Supertonic worker JSON jobs', () => {
  it('validates voice, language, inference settings, and beat structure', () => {
    expect(supertonicJobSchema.parse({
      assetsDirectory: '/models',
      outputDirectory: '/tmp/output',
      voice: 'F5',
      language: 'hi',
      speed: 1.05,
      steps: 8,
      scenes: [{id: 'scene', beats: [{id: 'beat', text: 'नमस्ते'}]}],
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
              {id: 'one', text: 'One'},
              {id: 'two', text: 'Two'},
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

    expect(calls).toEqual(['One', 'Two']);
    expect(maxActive).toBe(1);
    expect(result.scenes[0]).toMatchObject({
      startSample: 0,
      sampleCount: 756,
      beats: [
        {startSample: 300, sampleCount: 3},
        {startSample: 453, sampleCount: 3},
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
          scenes: [{id: 'scene', beats: [{id: 'one', text: 'One'}, {id: 'two', text: 'Two'}]}],
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
