import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {renderNarratedVideo} from './narrated-render.js';
import {timedNarratedPlanSchema} from './types.js';
import {writePcm16Wav} from './supertonic/wav.js';

const outputDirectory = resolve(
  process.argv[2] ?? '/tmp/youtube-animation-narrated-fixture',
);

const main = async () => {
  const sampleRate = 44_100;
  const totalSamples = sampleRate * 6;
  const audioDirectory = resolve(outputDirectory, 'narrated-fixture.audio');
  await mkdir(audioDirectory, {recursive: true});
  const audio = Float32Array.from(
    {length: totalSamples},
    (_, index) => Math.sin((index / sampleRate) * Math.PI * 2 * 220) * 0.025,
  );
  await writePcm16Wav(resolve(audioDirectory, 'voiceover.wav'), audio, sampleRate);
  const plan = timedNarratedPlanSchema.parse({
    version: 1,
    kind: 'narrated-video',
    stage: 'timed',
    sourceText: 'Fixture narration.',
    generatedAt: '2026-08-23T00:00:00.000Z',
    model: 'offline-fixture',
    targetDurationSeconds: 6,
    language: 'en',
    title: 'Narrated render fixture',
    sampleRate,
    voice: 'M1',
    ttsSpeed: 1.05,
    ttsSteps: 8,
    voiceoverFile: 'narrated-fixture.audio/voiceover.wav',
    durationMs: 6_000,
    totalSamples,
    scenes: [
      {
        id: 'flow',
        startMs: 0,
        durationMs: 3_000,
        template: 'process-flow',
        title: 'Work moves through a queue',
        primaryItems: ['Producer', 'Queue', 'Consumer'],
        secondaryItems: [],
        leftLabel: '',
        rightLabel: '',
        reason: 'Fixture',
        beats: [
          {
            id: 'flow-beat',
            text: 'Work moves from a producer through a queue to a consumer.',
            primaryItemIndices: [0, 1, 2],
            secondaryItemIndices: [],
            startMs: 300,
            durationMs: 2_400,
            audioFile: 'beats/flow.wav',
            sampleCount: 105_840,
          },
        ],
        primaryItemTimings: [
          {beatId: 'flow-beat', startMs: 300},
          {beatId: 'flow-beat', startMs: 300},
          {beatId: 'flow-beat', startMs: 300},
        ],
        secondaryItemTimings: [],
      },
      {
        id: 'takeaway',
        startMs: 3_000,
        durationMs: 3_000,
        template: 'callout',
        title: 'The result',
        primaryItems: ['Independent processing', 'Durable pending work'],
        secondaryItems: [],
        leftLabel: '',
        rightLabel: '',
        reason: 'Fixture',
        beats: [
          {
            id: 'takeaway-beat',
            text: 'Processing is independent and pending work remains durable.',
            primaryItemIndices: [0, 1],
            secondaryItemIndices: [],
            startMs: 300,
            durationMs: 2_400,
            audioFile: 'beats/takeaway.wav',
            sampleCount: 105_840,
          },
        ],
        primaryItemTimings: [
          {beatId: 'takeaway-beat', startMs: 300},
          {beatId: 'takeaway-beat', startMs: 300},
        ],
        secondaryItemTimings: [],
      },
    ],
  });

  await renderNarratedVideo({
    aspectRatio: 'both',
    force: true,
    fps: 30,
    outputDirectory,
    plan,
    stem: 'narrated-fixture',
  });
  console.log(`Rendered narrated fixture to ${outputDirectory}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
