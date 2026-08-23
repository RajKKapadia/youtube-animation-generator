import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {renderNarratedVideo} from './narrated-render.js';
import type {SceneBackgroundAssets} from './scene-backgrounds.js';
import {timedNarratedPlanSchema} from './types.js';
import {writePcm16Wav} from './supertonic/wav.js';

const outputDirectory = resolve(
  process.argv[2] ?? '/tmp/youtube-animation-narrated-fixture',
);
const sceneBackground = process.argv[3] === 'generated' ? 'generated' : 'ambient';

const writeGeneratedBackgroundFixtures = async (): Promise<SceneBackgroundAssets> => {
  const assets: SceneBackgroundAssets = {'16:9': {}, '9:16': {}};
  for (const aspectRatio of ['16:9', '9:16'] as const) {
    const [width, height] = aspectRatio === '16:9' ? [2048, 1152] : [1152, 2048];
    for (const [sceneIndex, sceneId] of ['flow', 'takeaway'].entries()) {
      const path = resolve(
        outputDirectory,
        `fixture-${sceneId}-${aspectRatio.replace(':', 'x')}.svg`,
      );
      const accent = sceneIndex === 0 ? '#0891B2' : '#7C3AED';
      await writeFile(path, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="38%" r="72%">
      <stop offset="0" stop-color="${accent}" stop-opacity=".68"/>
      <stop offset=".46" stop-color="#172554" stop-opacity=".58"/>
      <stop offset="1" stop-color="#020617"/>
    </radialGradient>
    <pattern id="grid" width="96" height="96" patternUnits="userSpaceOnUse">
      <path d="M 96 0 L 0 0 0 96" fill="none" stroke="#94A3B8" stroke-opacity=".12" stroke-width="2"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="#020617"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <circle cx="${Math.round(width * 0.22)}" cy="${Math.round(height * 0.3)}" r="${Math.round(Math.min(width, height) * 0.2)}" fill="#22D3EE" opacity=".13"/>
  <circle cx="${Math.round(width * 0.78)}" cy="${Math.round(height * 0.56)}" r="${Math.round(Math.min(width, height) * 0.24)}" fill="#A78BFA" opacity=".13"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>
</svg>`);
      assets[aspectRatio][sceneId] = path;
    }
  }
  return assets;
};

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
    version: 3,
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
        backgroundPrompt: 'Abstract glowing data stream moving through a durable queue.',
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
            expression: 'breath',
            phrases: [
              {
                id: 'flow-producer',
                text: 'Work leaves the producer',
                startMs: 300,
                durationMs: 1_150,
                sampleCount: 50_715,
              },
              {
                id: 'flow-consumer',
                text: 'and reaches the consumer.',
                startMs: 1_500,
                durationMs: 1_200,
                sampleCount: 52_920,
              },
            ],
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
        backgroundPrompt: 'Abstract resilient system continuing independently in soft violet light.',
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
            expression: 'none',
            phrases: [
              {
                id: 'takeaway-independent',
                text: 'Processing stays independent',
                startMs: 300,
                durationMs: 1_150,
                sampleCount: 50_715,
              },
              {
                id: 'takeaway-durable',
                text: 'while pending work remains durable.',
                startMs: 1_500,
                durationMs: 1_200,
                sampleCount: 52_920,
              },
            ],
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
  const backgroundAssets = sceneBackground === 'generated'
    ? await writeGeneratedBackgroundFixtures()
    : undefined;

  await renderNarratedVideo({
    aspectRatio: 'both',
    backgroundAssets,
    captions: 'on',
    force: true,
    fps: 30,
    outputDirectory,
    plan,
    sceneBackground,
    stem: `narrated-fixture-${sceneBackground}`,
  });
  console.log(`Rendered narrated fixture to ${outputDirectory}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
