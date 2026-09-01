import {existsSync} from 'node:fs';
import {copyFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {assetFilePath, loadAssetRegistry} from './asset-registry.js';
import {RENDER_PROFILES} from './render-profile.js';
import {
  subtitleAnimationClipSchema,
  type NarratedSceneVisual,
  type SceneIconSelection,
  type SelectedMotionAsset,
} from './types.js';
import {resolveTechnologyBrandIcons} from './technology-catalog.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const outputArgument = process.argv.slice(2).find((argument) => argument !== '--');
const outputDirectory = resolve(
  outputArgument ?? '/tmp/youtube-animation-subtitle-visual-fixtures',
);
const entryPoint = existsSync(resolve(currentDirectory, 'remotion/index.js'))
  ? resolve(currentDirectory, 'remotion/index.js')
  : resolve(currentDirectory, 'remotion/index.tsx');

const TREATMENTS: Array<{
  id: string;
  icons?: SceneIconSelection;
  items: string[];
  title: string;
  visual: NarratedSceneVisual;
}> = [
  {id: 'diagram', title: 'A request moves through a durable processing pipeline', items: ['Client', 'API', 'Queue', 'Worker'], visual: {kind: 'diagram', motion: 'flow', motif: 'none', assetId: null}},
  {id: 'agent-workflow', title: 'An AI agent coordinates the tools needed for one verified result', items: ['Search', 'API', 'Database', 'Document'], visual: {kind: 'agent-workflow', motion: 'orbit', motif: 'ai-agent', assetId: 'ai-agent-pulse'}},
  {id: 'brand-showcase', title: 'Exact product marks remain recognizable', items: ['OpenAI', 'React', 'PostgreSQL', 'Docker'], visual: {kind: 'brand-showcase', motion: 'drift', motif: 'automation', assetId: null}},
  {id: 'network-map', title: 'One platform connects every distributed dependency', items: ['Cloud Hub', 'API', 'Queue', 'Database', 'Analytics'], visual: {kind: 'network-map', motion: 'flow', motif: 'cloud', assetId: null}},
  {id: 'metric-focus', title: 'The exact result remains the dominant visual', items: ['73.5% faster retrieval', 'Six-week measurement', 'Stable baseline'], visual: {kind: 'metric-focus', motion: 'count-up', motif: 'analytics', assetId: null}},
  {id: 'icon-spotlight', title: 'A common language connects hardware and AI models', items: ['Model Hardware Standard', 'CPU', 'GPU accelerator', 'Memory'], icons: {focal: 'standard-protocol', primary: ['standard-protocol', 'hardware-cpu', 'hardware-accelerator', 'hardware-memory'], secondary: []}, visual: {kind: 'icon-spotlight', motion: 'pulse', motif: 'automation', assetId: null}},
  {id: 'image-focus', title: 'A supplied system diagram stays readable', items: ['Queue diagram', 'Producer', 'Consumer'], visual: {kind: 'image-focus', motion: 'push-in', motif: 'data', assetId: null, source: 'local', mediaId: 'fixture-image', fit: 'contain', focalPosition: 'center'}},
  {id: 'data-visualization', title: 'Source-backed values animate without changing the evidence', items: ['Current system', 'Existing best'], visual: {kind: 'data-visualization', motion: 'count-up', motif: 'analytics', assetId: null, chart: {
    type: 'grouped-bars', title: 'Peak throughput',
    data: [
      {id: 'current', label: 'Current system', value: 85_448, unit: 'tokens/s/kW', precision: 0, sourceEvidence: 'Current system reached 85,448 tokens/s/kW.', sourceToken: '85,448'},
      {id: 'baseline', label: 'Existing best', value: 44_960, unit: 'tokens/s/kW', precision: 0, sourceEvidence: 'Existing best reached 44,960 tokens/s/kW.', sourceToken: '44,960'},
    ],
    series: [{id: 'new', label: 'Current'}, {id: 'old', label: 'Existing'}],
    categories: [{id: 'throughput', label: 'Throughput', values: [{seriesId: 'new', datumId: 'current'}, {seriesId: 'old', datumId: 'baseline'}]}],
    cards: [],
    derivedAnnotations: [{id: 'ratio', label: 'Higher', operation: 'ratio', currentDatumId: 'current', baselineDatumId: 'baseline', precision: 1}],
  }}},
];

const makeClip = (treatment: typeof TREATMENTS[number]) => subtitleAnimationClipSchema.parse({
  id: treatment.id,
  startCue: 1,
  endCue: 1,
  sourceStartMs: 0,
  sourceEndMs: 4_000,
  durationMs: 4_000,
  transcript: treatment.items.join(' '),
  template: treatment.id === 'diagram' ? 'process-flow' : 'callout',
  title: treatment.title,
  primaryItems: treatment.items,
  secondaryItems: [],
  leftLabel: '',
  rightLabel: '',
  reason: 'Responsive subtitle visual parity fixture.',
  backgroundPrompt: 'Abstract low-detail technical atmosphere.',
  visual: treatment.visual,
  icons: treatment.icons ?? {focal: null, primary: treatment.items.map(() => null), secondary: []},
  captionCues: [{cueIndex: 1, startMs: 120, durationMs: 3_600, text: 'Exact source subtitles can occupy the protected top lane.'}],
  primaryItemTimings: treatment.items.map((_, index) => ({cueIndex: 1, startMs: 250 + index * 520})),
  secondaryItemTimings: [],
});

const main = async () => {
  await mkdir(outputDirectory, {recursive: true});
  const publicDirectory = await mkdtemp(resolve(tmpdir(), 'subtitle-visual-fixture-public-'));
  try {
    await writeFile(resolve(publicDirectory, 'fixture-image.svg'), `
      <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <rect width="1280" height="720" rx="36" fill="#f8fafc"/>
        <rect x="120" y="250" width="260" height="160" rx="30" fill="#dbeafe" stroke="#2563eb" stroke-width="8"/>
        <rect x="510" y="250" width="260" height="160" rx="30" fill="#cffafe" stroke="#0891b2" stroke-width="8"/>
        <rect x="900" y="250" width="260" height="160" rx="30" fill="#dcfce7" stroke="#16a34a" stroke-width="8"/>
        <path d="M380 330H510M770 330H900" stroke="#0f172a" stroke-width="12" stroke-linecap="round"/>
      </svg>`, 'utf8');
    await writeFile(resolve(publicDirectory, 'fixture-background.svg'), `
      <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g"><stop stop-color="#111827"/><stop offset="1" stop-color="#312e81"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`, 'utf8');

    const registry = await loadAssetRegistry();
    const motion = registry.motionAssets.find(({id}) => id === 'ai-agent-pulse');
    const motionAssets: Record<string, SelectedMotionAsset> = {};
    if (motion) {
      await copyFile(assetFilePath(registry, motion.file), resolve(publicDirectory, 'motion-ai-agent-pulse.json'));
      motionAssets[motion.id] = {id: motion.id, file: 'motion-ai-agent-pulse.json', loop: motion.loop, playbackRate: motion.playbackRate, colorMap: motion.colorMap};
    }
    const clips = TREATMENTS.map(makeClip);
    const technologyIcons = resolveTechnologyBrandIcons(
      clips.flatMap((clip) => [...clip.primaryItems, ...clip.secondaryItems]),
    );
    const serveUrl = await bundle({
      entryPoint,
      publicDir: publicDirectory,
      webpackOverride: (config) => ({...config, resolve: {...config.resolve, extensionAlias: {...config.resolve?.extensionAlias, '.js': ['.js', '.ts', '.tsx']}}}),
    });
    const browserExecutable = '/usr/bin/google-chrome-stable';
    let rendered = 0;
    for (const profile of [RENDER_PROFILES['16:9'], RENDER_PROFILES['9:16']]) {
      for (const clip of clips) {
        const inputProps = {
          background: 'transparent' as const,
          captions: 'on' as const,
          clip,
          foregroundAssets: {'fixture-image': 'fixture-image.svg'},
          fps: 30,
          localBrandAssets: {},
          localIconAssets: {},
          motionAssets,
          palette: 'violet' as const,
          profile,
          sceneBackground: 'ambient' as const,
          technologyIcons,
        };
        const composition = await selectComposition({serveUrl, id: 'SubtitleClip', inputProps, browserExecutable, logLevel: 'warn'});
        for (const [phase, frame] of [
          ['early', Math.min(12, composition.durationInFrames - 1)],
          ['middle', Math.floor(composition.durationInFrames / 2)],
          ['complete', Math.max(0, composition.durationInFrames - 12)],
        ] as const) {
          await renderStill({serveUrl, composition, inputProps, output: resolve(outputDirectory, `${clip.visual.kind}-${profile.aspectRatio.replace(':', 'x')}-${phase}.png`), frame, imageFormat: 'png', browserExecutable, logLevel: 'warn'});
          rendered += 1;
        }
      }
      const sample = clips[0]!;
      for (const [mode, captions] of [['off', 'off'], ['generated', 'on']] as const) {
        const inputProps = {
          background: mode === 'off' ? 'green' as const : 'transparent' as const,
          ...(mode === 'generated' ? {backgroundAsset: 'fixture-background.svg'} : {}),
          captions,
          clip: sample,
          foregroundAssets: {}, fps: 30, localBrandAssets: {}, localIconAssets: {}, motionAssets,
          palette: 'emerald' as const, profile, sceneBackground: mode, technologyIcons,
        };
        const composition = await selectComposition({serveUrl, id: 'SubtitleClip', inputProps, browserExecutable, logLevel: 'warn'});
        await renderStill({serveUrl, composition, inputProps, output: resolve(outputDirectory, `background-${mode}-${profile.aspectRatio.replace(':', 'x')}.png`), frame: Math.floor(composition.durationInFrames / 2), imageFormat: 'png', browserExecutable, logLevel: 'warn'});
        rendered += 1;
      }
      for (const chromaKeySample of clips.filter(({visual}) =>
        visual.kind === 'agent-workflow' || visual.kind === 'network-map')) {
        const inputProps = {
          background: 'green' as const,
          captions: 'off' as const,
          clip: chromaKeySample,
          foregroundAssets: {}, fps: 30, localBrandAssets: {}, localIconAssets: {}, motionAssets,
          palette: 'emerald' as const, profile, sceneBackground: 'off' as const, technologyIcons,
        };
        const composition = await selectComposition({serveUrl, id: 'SubtitleClip', inputProps, browserExecutable, logLevel: 'warn'});
        await renderStill({serveUrl, composition, inputProps, output: resolve(outputDirectory, `background-green-${chromaKeySample.visual.kind}-${profile.aspectRatio.replace(':', 'x')}.png`), frame: Math.floor(composition.durationInFrames / 2), imageFormat: 'png', browserExecutable, logLevel: 'warn'});
        rendered += 1;
      }
    }
    console.log(`Rendered ${rendered} subtitle visual fixture stills to ${outputDirectory}`);
  } finally {
    await rm(publicDirectory, {recursive: true, force: true});
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
