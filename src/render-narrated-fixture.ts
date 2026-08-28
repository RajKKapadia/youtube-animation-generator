import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {renderNarratedVideo} from './narrated-render.js';
import type {SceneBackgroundAssets} from './scene-backgrounds.js';
import {
  timedNarratedPlanSchema,
  videoPaletteSchema,
  type NarratedSceneVisual,
} from './types.js';
import {writePcm16Wav} from './supertonic/wav.js';
import {videoPaletteFor} from './visual-palettes.js';

const outputDirectory = resolve(
  process.argv[2] ?? '/tmp/youtube-animation-narrated-fixture',
);
const sceneBackground = process.argv[3] === 'generated' ? 'generated' : 'ambient';
const palette = videoPaletteSchema.parse(process.argv[4] ?? 'violet');
const SCENE_IDS = ['diagram', 'agent', 'brands', 'network', 'metric', 'spotlight'];

const writeGeneratedBackgroundFixtures = async (): Promise<SceneBackgroundAssets> => {
  const assets: SceneBackgroundAssets = {'16:9': {}, '9:16': {}};
  const theme = videoPaletteFor(palette);
  for (const aspectRatio of ['16:9', '9:16'] as const) {
    const [width, height] = aspectRatio === '16:9' ? [2048, 1152] : [1152, 2048];
    for (const [sceneIndex, sceneId] of SCENE_IDS.entries()) {
      const path = resolve(
        outputDirectory,
        `fixture-${sceneId}-${aspectRatio.replace(':', 'x')}.svg`,
      );
      const accent = sceneIndex % 2 === 0
        ? theme.accents.primary
        : theme.accents.secondary;
      await writeFile(path, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="38%" r="72%">
      <stop offset="0" stop-color="${accent}" stop-opacity=".68"/>
      <stop offset=".46" stop-color="${theme.background.middle}" stop-opacity=".58"/>
      <stop offset="1" stop-color="${theme.background.start}"/>
    </radialGradient>
    <pattern id="grid" width="96" height="96" patternUnits="userSpaceOnUse">
      <path d="M 96 0 L 0 0 0 96" fill="none" stroke="#94A3B8" stroke-opacity=".12" stroke-width="2"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="${theme.background.start}"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <circle cx="${Math.round(width * 0.22)}" cy="${Math.round(height * 0.3)}" r="${Math.round(Math.min(width, height) * 0.2)}" fill="${theme.accents.primary}" opacity=".13"/>
  <circle cx="${Math.round(width * 0.78)}" cy="${Math.round(height * 0.56)}" r="${Math.round(Math.min(width, height) * 0.24)}" fill="${theme.accents.secondary}" opacity=".13"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>
</svg>`);
      assets[aspectRatio][sceneId] = path;
    }
  }
  return assets;
};

const makeScene = ({
  id,
  items,
  sceneIndex,
  title,
  visual,
}: {
  id: string;
  items: string[];
  sceneIndex: number;
  title: string;
  visual: NarratedSceneVisual;
}) => ({
  id,
  backgroundPrompt: `Abstract low-detail visual metaphor for ${title}.`,
  startMs: sceneIndex * 3_000,
  durationMs: 3_000,
  template: visual.kind === 'diagram' ? 'process-flow' as const : 'callout' as const,
  title,
  primaryItems: items,
  secondaryItems: [],
  leftLabel: '',
  rightLabel: '',
  reason: 'Varied narrated visual fixture.',
  visual,
  beats: [{
    id: `${id}-beat`,
    expression: sceneIndex === 0 ? 'breath' as const : 'none' as const,
    phrases: [
      {
        id: `${id}-phrase-one`,
        text: `This scene demonstrates ${title}`,
        startMs: 300,
        durationMs: 1_100,
        sampleCount: 48_510,
      },
      {
        id: `${id}-phrase-two`,
        text: 'with stable beat-aligned motion.',
        startMs: 1_500,
        durationMs: 1_100,
        sampleCount: 48_510,
      },
    ],
    primaryItemIndices: items.map((_, index) => index),
    secondaryItemIndices: [],
    startMs: 300,
    durationMs: 2_300,
    audioFile: `beats/${id}.wav`,
    sampleCount: 101_430,
  }],
  primaryItemTimings: items.map(() => ({beatId: `${id}-beat`, startMs: 300})),
  secondaryItemTimings: [],
});

const main = async () => {
  const sampleRate = 44_100;
  const totalSamples = sampleRate * 18;
  const audioDirectory = resolve(outputDirectory, 'narrated-fixture.audio');
  await mkdir(audioDirectory, {recursive: true});
  const audio = Float32Array.from(
    {length: totalSamples},
    (_, index) => Math.sin((index / sampleRate) * Math.PI * 2 * 220) * 0.025,
  );
  await writePcm16Wav(resolve(audioDirectory, 'voiceover.wav'), audio, sampleRate);
  const plan = timedNarratedPlanSchema.parse({
    version: 6,
    kind: 'narrated-video',
    stage: 'timed',
    sourceText:
      'A request passes through a queue. An AI agent uses Search, API, and Database tools. OpenAI, React, and PostgreSQL are named products. A Cloud Hub connects API, Queue, Worker, and Database. The source reports 73% faster retrieval. Document automation is the conclusion.',
    generatedAt: '2026-08-27T00:00:00.000Z',
    model: 'offline-fixture',
    targetDurationSeconds: 18,
    language: 'en',
    title: 'Varied narrated render fixture',
    palette,
    mediaAssets: [],
    sampleRate,
    voice: 'M1',
    ttsSpeed: 1.05,
    ttsSteps: 8,
    voiceoverFile: 'narrated-fixture.audio/voiceover.wav',
    durationMs: 18_000,
    totalSamples,
    scenes: [
      makeScene({
        id: 'diagram',
        items: ['Producer', 'Queue', 'Consumer'],
        sceneIndex: 0,
        title: 'Existing process diagram',
        visual: {kind: 'diagram', motion: 'reveal', motif: 'none', assetId: null},
      }),
      makeScene({
        id: 'agent',
        items: ['Search', 'API', 'Database'],
        sceneIndex: 1,
        title: 'AI agent coordinates tools',
        visual: {kind: 'agent-workflow', motion: 'orbit', motif: 'ai-agent', assetId: 'ai-agent-pulse'},
      }),
      makeScene({
        id: 'brands',
        items: ['OpenAI', 'React', 'PostgreSQL'],
        sceneIndex: 2,
        title: 'Exact product marks',
        visual: {kind: 'brand-showcase', motion: 'drift', motif: 'automation', assetId: null},
      }),
      makeScene({
        id: 'network',
        items: ['Cloud Hub', 'API', 'Queue', 'Worker', 'Database'],
        sceneIndex: 3,
        title: 'One hub connects the system',
        visual: {kind: 'network-map', motion: 'flow', motif: 'cloud', assetId: null},
      }),
      makeScene({
        id: 'metric',
        items: ['73% faster retrieval', 'Source-backed benchmark', 'Measured result'],
        sceneIndex: 4,
        title: 'The exact claim stays visible',
        visual: {kind: 'metric-focus', motion: 'count-up', motif: 'analytics', assetId: null},
      }),
      makeScene({
        id: 'spotlight',
        items: ['Document automation', 'Extract', 'Validate', 'Deliver'],
        sceneIndex: 5,
        title: 'One concept closes the story',
        visual: {kind: 'icon-spotlight', motion: 'scan', motif: 'automation', assetId: 'ai-agent-pulse'},
      }),
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
    stem: `narrated-fixture-${sceneBackground}-${palette}`,
  });
  console.log(`Rendered narrated fixture to ${outputDirectory}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
