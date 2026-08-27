import {existsSync} from 'node:fs';
import {copyFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {assetFilePath, loadAssetRegistry} from './asset-registry.js';
import {RENDER_PROFILES} from './render-profile.js';
import {
  timedNarratedPlanSchema,
  type NarratedSceneVisual,
  type SelectedMotionAsset,
} from './types.js';
import {writePcm16Wav} from './supertonic/wav.js';
import {exactTechnologyBrandIconFor} from './technology-catalog.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(
  process.argv[2] ?? '/tmp/youtube-animation-narrated-layout-fixtures',
);
const entryPoint = existsSync(resolve(currentDirectory, 'remotion/index.js'))
  ? resolve(currentDirectory, 'remotion/index.js')
  : resolve(currentDirectory, 'remotion/index.tsx');

const TREATMENTS: Array<{
  items: string[];
  title: string;
  visual: NarratedSceneVisual;
}> = [
  {
    title: 'An AI agent coordinates tools while keeping each action understandable',
    items: ['Search', 'API', 'Database', 'Document', 'Message', 'Security'],
    visual: {kind: 'agent-workflow', motion: 'orbit', motif: 'ai-agent', assetId: 'ai-agent-pulse'},
  },
  {
    title: 'Exact company and product marks remain recognizable and undistorted',
    items: ['OpenAI', 'React', 'PostgreSQL', 'Docker', 'Kubernetes', 'Next.js'],
    visual: {kind: 'brand-showcase', motion: 'drift', motif: 'automation', assetId: null},
  },
  {
    title: 'One central platform connects every part of a distributed workflow',
    items: ['Cloud Hub', 'API', 'Queue', 'Worker', 'Database', 'Analytics'],
    visual: {kind: 'network-map', motion: 'flow', motif: 'cloud', assetId: null},
  },
  {
    title: 'The source-backed result stays exact while supporting context appears',
    items: ['73.5% faster retrieval', 'Six-week measurement', 'Same workload', 'Audited result', 'Stable baseline', 'No extrapolation'],
    visual: {kind: 'metric-focus', motion: 'count-up', motif: 'analytics', assetId: null},
  },
  {
    title: 'A single visual idea gets the focus before the supporting details arrive',
    items: ['Document automation', 'Extract', 'Validate', 'Approve', 'Deliver', 'Archive'],
    visual: {kind: 'icon-spotlight', motion: 'scan', motif: 'automation', assetId: 'ai-agent-pulse'},
  },
];

const makePlan = (treatment: typeof TREATMENTS[number]) => timedNarratedPlanSchema.parse({
  version: 5,
  kind: 'narrated-video',
  stage: 'timed',
  sourceText: `OpenAI React PostgreSQL Docker Kubernetes Next.js ${treatment.items.join(' ')}`,
  generatedAt: '2026-08-27T00:00:00.000Z',
  model: 'layout-fixture',
  targetDurationSeconds: 3,
  language: 'en',
  title: treatment.title,
  palette: 'violet',
  sampleRate: 44_100,
  voice: 'M1',
  ttsSpeed: 1,
  ttsSteps: 8,
  voiceoverFile: 'fixture.wav',
  durationMs: 3_000,
  totalSamples: 132_300,
  scenes: [{
    id: treatment.visual.kind,
    backgroundPrompt: 'Abstract low-detail technical atmosphere.',
    startMs: 0,
    durationMs: 3_000,
    template: 'callout',
    title: treatment.title,
    primaryItems: treatment.items,
    secondaryItems: [],
    leftLabel: '',
    rightLabel: '',
    reason: 'Worst-case narrated visual layout fixture.',
    visual: treatment.visual,
    beats: [{
      id: 'fixture-beat',
      expression: 'none',
      phrases: [{
        id: 'fixture-caption',
        text: 'A deliberately long caption checks the protected narration lane.',
        startMs: 150,
        durationMs: 2_600,
        sampleCount: 114_660,
      }],
      primaryItemIndices: treatment.items.map((_, index) => index),
      secondaryItemIndices: [],
      startMs: 150,
      durationMs: 2_600,
      audioFile: 'fixture.wav',
      sampleCount: 114_660,
    }],
    primaryItemTimings: treatment.items.map(() => ({beatId: 'fixture-beat', startMs: 150})),
    secondaryItemTimings: [],
  }],
});

const main = async () => {
  await mkdir(outputDirectory, {recursive: true});
  const publicDirectory = await mkdtemp(resolve(tmpdir(), 'narrated-layout-public-'));
  try {
    await writePcm16Wav(
      resolve(publicDirectory, 'fixture.wav'),
      new Float32Array(132_300),
      44_100,
    );
    const registry = await loadAssetRegistry();
    const motion = registry.motionAssets.find(({id}) => id === 'ai-agent-pulse');
    if (!motion) throw new Error('The narrated fixture requires ai-agent-pulse.');
    const publicMotionFile = `motion-${motion.id}.json`;
    await copyFile(
      assetFilePath(registry, motion.file),
      resolve(publicDirectory, publicMotionFile),
    );
    const motionAssets: Record<string, SelectedMotionAsset> = {
      [motion.id]: {
        id: motion.id,
        file: publicMotionFile,
        loop: motion.loop,
        playbackRate: motion.playbackRate,
        colorMap: motion.colorMap,
      },
    };
    const serveUrl = await bundle({
      entryPoint,
      publicDir: publicDirectory,
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          extensionAlias: {
            ...config.resolve?.extensionAlias,
            '.js': ['.js', '.ts', '.tsx'],
          },
        },
      }),
    });
    const browserExecutable = [
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
    ].find(existsSync);
    let rendered = 0;
    for (const profile of [RENDER_PROFILES['16:9'], RENDER_PROFILES['9:16']]) {
      for (const treatment of TREATMENTS) {
        const plan = makePlan(treatment);
        const inputProps = {
          audioFile: 'fixture.wav',
          backgroundAssets: {},
          captions: 'on' as const,
          fps: 30,
          localBrandAssets: {},
          motionAssets,
          plan,
          profile,
          sceneBackground: 'ambient' as const,
          technologyIcons: Object.fromEntries(
            treatment.items.flatMap((label) => {
              const icon = exactTechnologyBrandIconFor(label);
              return icon ? [[label, icon] as const] : [];
            }),
          ),
        };
        const composition = await selectComposition({
          serveUrl,
          id: 'NarratedVideo',
          inputProps,
          logLevel: 'warn',
          ...(browserExecutable ? {browserExecutable} : {}),
        });
        for (const [phase, frame] of [
          ['early', 8],
          ['middle', Math.floor(composition.durationInFrames / 2)],
          ['complete', composition.durationInFrames - 8],
        ] as const) {
          const output = resolve(
            outputDirectory,
            `${treatment.visual.kind}-${profile.aspectRatio.replace(':', 'x')}-${phase}.png`,
          );
          await renderStill({
            serveUrl,
            composition,
            inputProps,
            output,
            frame,
            imageFormat: 'png',
            logLevel: 'warn',
            ...(browserExecutable ? {browserExecutable} : {}),
          });
          rendered += 1;
        }
      }
    }
    console.log(`Rendered ${rendered} narrated layout stills to ${outputDirectory}`);
    console.log(`Local motion asset: ${basename(assetFilePath(registry, motion.file))}`);
  } finally {
    await rm(publicDirectory, {recursive: true, force: true});
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
