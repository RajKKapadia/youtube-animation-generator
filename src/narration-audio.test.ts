import {access, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {materializeTimedNarration, synthesizeNarration} from './narration-audio.js';
import {draftNarratedPlanSchema, timedNarratedPlanSchema} from './types.js';

const draft = draftNarratedPlanSchema.parse({
  version: 2,
  kind: 'narrated-video',
  stage: 'draft',
  sourceText: 'A then B.',
  generatedAt: '2026-08-23T00:00:00.000Z',
  model: 'fixture',
  targetDurationSeconds: 5,
  language: 'en',
  title: 'Flow',
  scenes: [{
    id: 'flow',
    backgroundPrompt: 'Abstract A to B flow.',
    template: 'process-flow',
    title: 'A to B',
    primaryItems: ['A', 'B'],
    secondaryItems: [],
    leftLabel: '',
    rightLabel: '',
    reason: 'Flow',
    beats: [
      {
        id: 'a',
        phrases: [{id: 'a-starts', text: 'A starts.'}],
        primaryItemIndices: [0],
        secondaryItemIndices: [],
      },
      {
        id: 'b',
        phrases: [
          {id: 'then', text: 'Then'},
          {id: 'b-finishes', text: 'B finishes.'},
        ],
        primaryItemIndices: [1],
        secondaryItemIndices: [],
      },
    ],
  }],
});

const temporaryDirectories: string[] = [];

const createFakeAssets = async (root: string) => {
  await mkdir(resolve(root, 'onnx'), {recursive: true});
  await mkdir(resolve(root, 'voice_styles'), {recursive: true});
  for (const file of [
    'duration_predictor.onnx',
    'text_encoder.onnx',
    'vector_estimator.onnx',
    'vocoder.onnx',
  ]) {
    await writeFile(resolve(root, 'onnx', file), Buffer.alloc(1_024));
  }
  await writeFile(resolve(root, 'onnx/tts.json'), '{}');
  await writeFile(resolve(root, 'onnx/unicode_indexer.json'), '{}');
  await writeFile(resolve(root, 'voice_styles/M1.json'), '{}');
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true}),
    ),
  );
});

describe('materializeTimedNarration', () => {
  it('derives scene and reveal timestamps only from sample offsets', () => {
    const timed = materializeTimedNarration({
      audioDirectoryName: 'flow.audio',
      draft,
      result: {
        sampleRate: 1_000,
        totalSamples: 1_500,
        voiceoverFile: 'voiceover.wav',
        scenes: [{
          id: 'flow',
          startSample: 0,
          sampleCount: 1_500,
          beats: [
            {
              id: 'a',
              file: 'beats/a.wav',
              startSample: 300,
              sampleCount: 400,
              phrases: [{id: 'a-starts', startSample: 300, sampleCount: 400}],
            },
            {
              id: 'b',
              file: 'beats/b.wav',
              startSample: 850,
              sampleCount: 350,
              phrases: [
                {id: 'then', startSample: 850, sampleCount: 150},
                {id: 'b-finishes', startSample: 1_050, sampleCount: 150},
              ],
            },
          ],
        }],
      },
      speed: 1.05,
      steps: 8,
      voice: 'M1',
    });

    expect(timed.durationMs).toBe(1_500);
    expect(timed.scenes[0]!.primaryItemTimings).toEqual([
      {beatId: 'a', startMs: 300},
      {beatId: 'b', startMs: 850},
    ]);
    expect(timed.scenes[0]!.beats[1]!.phrases).toEqual([
      {id: 'then', text: 'Then', startMs: 850, durationMs: 150, sampleCount: 150},
      {
        id: 'b-finishes',
        text: 'B finishes.',
        startMs: 1_050,
        durationMs: 150,
        sampleCount: 150,
      },
    ]);
    expect(timed.voiceoverFile).toBe('flow.audio/voiceover.wav');
    expect(() =>
      timedNarratedPlanSchema.parse({
        ...timed,
        scenes: [{
          ...timed.scenes[0]!,
          primaryItemTimings: timed.scenes[0]!.primaryItemTimings.slice(1),
        }],
      }),
    ).toThrow('one entry for every matching visual item');
  });
});

describe('synthesizeNarration promotion', () => {
  it('promotes the staged audio directory only after a complete worker result', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'narration-audio-'));
    temporaryDirectories.push(root);
    const assets = resolve(root, 'assets');
    const output = resolve(root, 'output');
    await createFakeAssets(assets);
    const timed = await synthesizeNarration(
      {
        assetsDirectory: assets,
        audioDirectoryName: 'flow.audio',
        draft,
        force: false,
        outputDirectory: output,
        speed: 1.05,
        steps: 8,
        voice: 'M1',
      },
      async (job) => {
        await mkdir(resolve(job.outputDirectory, 'beats'), {recursive: true});
        await writeFile(resolve(job.outputDirectory, 'voiceover.wav'), 'fixture');
        await writeFile(resolve(job.outputDirectory, 'beats/a.wav'), 'fixture');
        await writeFile(resolve(job.outputDirectory, 'beats/b.wav'), 'fixture');
        return {
          sampleRate: 1_000,
          totalSamples: 1_500,
          voiceoverFile: 'voiceover.wav',
          scenes: [{
            id: 'flow',
            startSample: 0,
            sampleCount: 1_500,
            beats: [
              {
                id: 'a',
                file: 'beats/a.wav',
                startSample: 300,
                sampleCount: 400,
                phrases: [{id: 'a-starts', startSample: 300, sampleCount: 400}],
              },
              {
                id: 'b',
                file: 'beats/b.wav',
                startSample: 850,
                sampleCount: 350,
                phrases: [
                  {id: 'then', startSample: 850, sampleCount: 150},
                  {id: 'b-finishes', startSample: 1_050, sampleCount: 150},
                ],
              },
            ],
          }],
        };
      },
    );
    expect(timed.voiceoverFile).toBe('flow.audio/voiceover.wav');
    await expect(access(resolve(output, 'flow.audio/voiceover.wav'))).resolves.toBeUndefined();
  });

  it('cleans staging and leaves the final target absent when the worker fails', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'narration-audio-'));
    temporaryDirectories.push(root);
    const assets = resolve(root, 'assets');
    const output = resolve(root, 'output');
    await createFakeAssets(assets);
    await expect(
      synthesizeNarration(
        {
          assetsDirectory: assets,
          audioDirectoryName: 'flow.audio',
          draft,
          force: false,
          outputDirectory: output,
          speed: 1.05,
          steps: 8,
          voice: 'M1',
        },
        async () => {
          throw new Error('worker failed');
        },
      ),
    ).rejects.toThrow('worker failed');
    await expect(access(resolve(output, 'flow.audio'))).rejects.toThrow();
  });
});
