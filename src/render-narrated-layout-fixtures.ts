import {existsSync} from 'node:fs';
import {copyFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
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
  type NarratedMediaAsset,
  type SceneIconSelection,
  type SelectedMotionAsset,
} from './types.js';
import {writePcm16Wav} from './supertonic/wav.js';
import {exactTechnologyBrandIconFor} from './technology-catalog.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const outputArgument = process.argv.slice(2).find((argument) => argument !== '--');
const outputDirectory = resolve(
  outputArgument ?? '/tmp/youtube-animation-narrated-layout-fixtures',
);
const entryPoint = existsSync(resolve(currentDirectory, 'remotion/index.js'))
  ? resolve(currentDirectory, 'remotion/index.js')
  : resolve(currentDirectory, 'remotion/index.tsx');

const TREATMENTS: Array<{
  fixtureId?: string;
  items: string[];
  icons?: SceneIconSelection;
  mediaAssets?: NarratedMediaAsset[];
  sourceText?: string;
  title: string;
  visual: NarratedSceneVisual;
}> = [
  {
    title: 'An AI agent coordinates tools while keeping each action understandable',
    items: ['Search', 'API', 'Database', 'Document', 'Message', 'Security'],
    visual: {kind: 'agent-workflow', motion: 'orbit', motif: 'ai-agent', assetId: 'ai-agent-pulse'},
  },
  {
    fixtureId: 'mixed-language-workflow',
    title: 'The Likely Future',
    items: [
      'AI-assisted migration',
      'Tests, benchmarks, and review',
      'Mixed-language product',
      'Rust performance core',
    ],
    sourceText: 'AI-assisted migration still needs tests, benchmarks, and review. The likely future is a mixed-language product with a Rust performance core.',
    visual: {kind: 'agent-workflow', motion: 'flow', motif: 'ai-agent', assetId: null},
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
    title: 'A common language for hardware',
    items: ['Model Hardware Standard', 'CPU', 'GPU accelerator', 'Memory', 'AI model'],
    sourceText: 'A Model Hardware Standard gives CPUs, GPU accelerators, memory, and AI models a common language.',
    icons: {
      focal: 'standard-protocol',
      primary: ['standard-protocol', 'hardware-cpu', 'hardware-accelerator', 'hardware-memory', 'ai-model'],
      secondary: [],
    },
    visual: {kind: 'icon-spotlight', motion: 'pulse', motif: 'automation', assetId: null},
  },
  {
    fixtureId: 'rust-benefits-spotlight',
    title: 'Why Teams Choose Rust',
    items: [
      'Memory safety',
      'Near-C / C++ performance',
      'Single native executable',
      'Concurrency and system work',
    ],
    sourceText: 'Teams choose Rust for memory safety, near-C and C++ performance, a single native executable, concurrency, and system work.',
    visual: {kind: 'icon-spotlight', motion: 'reveal', motif: 'security', assetId: null},
  },
  {
    fixtureId: 'local-image-focus',
    title: 'A supplied system screenshot remains readable inside the caption-safe frame',
    items: ['Queue Diagram', 'Producer', 'Consumer'],
    sourceText: 'The Queue Diagram connects a Producer to a Consumer.',
    mediaAssets: [{
      id: 'local-queue-diagram-fixture',
      source: 'local',
      file: 'fixture.media/local-screenshot.png',
      sha256: '0'.repeat(64),
      mimeType: 'image/png',
      originalName: 'local-screenshot.png',
    }],
    visual: {kind: 'image-focus', motion: 'push-in', motif: 'data', assetId: null, source: 'local', mediaId: 'local-queue-diagram-fixture', fit: 'contain', focalPosition: 'center'},
  },
  {
    fixtureId: 'generated-image-focus',
    title: 'A grounded editorial scene depicts the exact physical source action',
    items: ['Warehouse robots', 'Sealed packages', 'Sorting hall'],
    sourceText: 'Warehouse robots move sealed packages through a sorting hall.',
    mediaAssets: [{
      id: 'generated-warehouse-fixture',
      source: 'generated',
      direction: {
        sourceEvidence: 'Warehouse robots move sealed packages through a sorting hall.',
        sourceAnchors: ['Warehouse robots', 'sorting hall'],
        narrationBeat: 'A deliberately long caption checks the protected narration lane.',
        subject: 'warehouse robots and sealed packages',
        action: 'moving packages',
        environment: 'a sorting hall',
        framing: 'editorial wide view',
        exclusions: ['text', 'logos'],
        depiction: 'literal',
        metaphorRelationship: null,
      },
    }],
    visual: {kind: 'image-focus', motion: 'pan', motif: 'automation', assetId: null, source: 'generated', mediaId: 'generated-warehouse-fixture', fit: 'cover', focalPosition: 'right'},
  },
  {
    fixtureId: 'grouped-bars',
    title: 'Source-backed throughput values grow before their computed comparison badge',
    items: ['Jalapeño', 'Existing best'],
    sourceText: 'Jalapeño reached 85,448 tokens/s/kW. Existing best reached 44,960 tokens/s/kW.',
    visual: {
      kind: 'data-visualization',
      motion: 'count-up',
      motif: 'analytics',
      assetId: null,
      chart: {
        type: 'grouped-bars',
        title: 'Peak mixed-token throughput',
        data: [
          {id: 'jalapeno', label: 'Jalapeño', value: 85_448, unit: 'tokens/s/kW', precision: 0, sourceEvidence: 'Jalapeño reached 85,448 tokens/s/kW.', sourceToken: '85,448'},
          {id: 'existing', label: 'Existing best', value: 44_960, unit: 'tokens/s/kW', precision: 0, sourceEvidence: 'Existing best reached 44,960 tokens/s/kW.', sourceToken: '44,960'},
        ],
        series: [{id: 'new', label: 'Jalapeño'}, {id: 'old', label: 'Existing best'}],
        categories: [{id: 'platform', label: 'GPT-OSS', values: [{seriesId: 'new', datumId: 'jalapeno'}, {seriesId: 'old', datumId: 'existing'}]}],
        cards: [],
        derivedAnnotations: [{id: 'ratio', label: 'Higher', operation: 'ratio', currentDatumId: 'jalapeno', baselineDatumId: 'existing', precision: 1}],
      },
    },
  },
  {
    fixtureId: 'metric-cards',
    title: 'Four exact source metrics remain glanceable in landscape and portrait',
    items: ['Peak throughput', 'Latency', 'Time between tokens', 'Previous-point gain'],
    sourceText: 'Peak throughput was 1.9 ratio. Latency was 1.7 seconds. Time between tokens was 2.7 milliseconds. Previous-point gain was 53.7 ratio.',
    visual: {
      kind: 'data-visualization',
      motion: 'count-up',
      motif: 'analytics',
      assetId: null,
      chart: {
        type: 'metric-cards',
        title: 'Key source-backed results',
        data: [
          {id: 'throughput', label: 'Peak throughput', value: 1.9, unit: 'ratio', precision: 1, sourceEvidence: 'Peak throughput was 1.9 ratio.', sourceToken: '1.9'},
          {id: 'latency', label: 'Latency', value: 1.7, unit: 'seconds', precision: 1, sourceEvidence: 'Latency was 1.7 seconds.', sourceToken: '1.7'},
          {id: 'tbt', label: 'Time between tokens', value: 2.7, unit: 'milliseconds', precision: 1, sourceEvidence: 'Time between tokens was 2.7 milliseconds.', sourceToken: '2.7'},
          {id: 'gain', label: 'Previous-point gain', value: 53.7, unit: 'ratio', precision: 1, sourceEvidence: 'Previous-point gain was 53.7 ratio.', sourceToken: '53.7'},
        ],
        series: [],
        categories: [],
        cards: [
          {id: 'throughput-card', label: 'Peak throughput', datumId: 'throughput', annotationId: null},
          {id: 'latency-card', label: 'Latency', datumId: 'latency', annotationId: null},
          {id: 'tbt-card', label: 'Time between tokens', datumId: 'tbt', annotationId: null},
          {id: 'gain-card', label: 'Previous-point gain', datumId: 'gain', annotationId: null},
        ],
        derivedAnnotations: [],
      },
    },
  },
];

const makePlan = (treatment: typeof TREATMENTS[number]) => timedNarratedPlanSchema.parse({
  version: 6,
  kind: 'narrated-video',
  stage: 'timed',
  sourceText: treatment.sourceText ?? `OpenAI React PostgreSQL Docker Kubernetes Next.js ${treatment.items.join(' ')}`,
  generatedAt: '2026-08-27T00:00:00.000Z',
  model: 'layout-fixture',
  targetDurationSeconds: 3,
  language: 'en',
  title: treatment.title,
  palette: 'violet',
  mediaAssets: treatment.mediaAssets ?? [],
  sampleRate: 44_100,
  voice: 'M1',
  ttsSpeed: 1,
  ttsSteps: 8,
  voiceoverFile: 'fixture.wav',
  durationMs: 3_000,
  totalSamples: 132_300,
  scenes: [{
    id: treatment.fixtureId ?? treatment.visual.kind,
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
    icons: treatment.icons ?? {focal: null, primary: [], secondary: []},
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
    await writeFile(resolve(publicDirectory, 'local-screenshot.svg'), `
      <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <rect width="1280" height="720" rx="36" fill="#f8fafc"/>
        <rect width="1280" height="92" rx="36" fill="#0f172a"/>
        <circle cx="55" cy="46" r="14" fill="#fb7185"/><circle cx="96" cy="46" r="14" fill="#fbbf24"/><circle cx="137" cy="46" r="14" fill="#34d399"/>
        <rect x="70" y="158" width="270" height="430" rx="24" fill="#e2e8f0"/>
        <rect x="395" y="175" width="220" height="140" rx="24" fill="#dbeafe" stroke="#2563eb" stroke-width="6"/>
        <rect x="665" y="175" width="220" height="140" rx="24" fill="#cffafe" stroke="#0891b2" stroke-width="6"/>
        <rect x="935" y="175" width="220" height="140" rx="24" fill="#dcfce7" stroke="#16a34a" stroke-width="6"/>
        <path d="M615 245H665M885 245H935" stroke="#334155" stroke-width="12" stroke-linecap="round"/>
        <rect x="395" y="375" width="760" height="180" rx="28" fill="#0f172a"/>
        <rect x="438" y="422" width="500" height="20" rx="10" fill="#475569"/><rect x="438" y="470" width="620" height="20" rx="10" fill="#334155"/>
      </svg>`, 'utf8');
    await writeFile(resolve(publicDirectory, 'generated-editorial.svg'), `
      <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#261409"/><stop offset="1" stop-color="#78350f"/></linearGradient></defs>
        <rect width="1280" height="720" fill="url(#g)"/>
        <path d="M0 570L1280 380V720H0Z" fill="#1e293b"/><path d="M0 655L1280 465" stroke="#f59e0b" stroke-width="18" opacity=".7"/>
        <g transform="translate(280 270)"><rect width="220" height="170" rx="32" fill="#94a3b8"/><circle cx="55" cy="185" r="35" fill="#0f172a"/><circle cx="170" cy="185" r="35" fill="#0f172a"/><rect x="58" y="-70" width="105" height="88" rx="20" fill="#cbd5e1"/></g>
        <g transform="translate(760 210)"><rect width="260" height="190" rx="18" fill="#b45309"/><path d="M0 42H260M130 0V190" stroke="#fde68a" stroke-width="8" opacity=".55"/></g>
        <circle cx="1080" cy="135" r="190" fill="#f59e0b" opacity=".16"/>
      </svg>`, 'utf8');
    await writeFile(resolve(publicDirectory, 'generated-editorial-portrait.svg'), `
      <svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
        <defs><linearGradient id="gp" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3b1b0b"/><stop offset="1" stop-color="#78350f"/></linearGradient></defs>
        <rect width="720" height="1280" fill="url(#gp)"/><circle cx="590" cy="210" r="270" fill="#f59e0b" opacity=".15"/>
        <path d="M0 900L720 760V1280H0Z" fill="#1e293b"/><path d="M0 1080L720 940" stroke="#f59e0b" stroke-width="16" opacity=".72"/>
        <g transform="translate(120 510)"><rect width="245" height="210" rx="36" fill="#94a3b8"/><circle cx="65" cy="230" r="38" fill="#0f172a"/><circle cx="185" cy="230" r="38" fill="#0f172a"/><rect x="62" y="-82" width="120" height="102" rx="24" fill="#cbd5e1"/></g>
        <g transform="translate(370 680)"><rect width="260" height="205" rx="20" fill="#b45309"/><path d="M0 48H260M130 0V205" stroke="#fde68a" stroke-width="8" opacity=".55"/></g>
      </svg>`, 'utf8');
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
          foregroundAssets: Object.fromEntries((treatment.mediaAssets ?? []).map((asset) => [
            asset.id,
            asset.source === 'local'
              ? 'local-screenshot.svg'
              : profile.aspectRatio === '9:16'
                ? 'generated-editorial-portrait.svg'
                : 'generated-editorial.svg',
          ])),
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
            `${treatment.fixtureId ?? treatment.visual.kind}-${profile.aspectRatio.replace(':', 'x')}-${phase}.png`,
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
