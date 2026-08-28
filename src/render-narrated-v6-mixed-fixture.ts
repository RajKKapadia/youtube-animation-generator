import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {renderNarratedVideo} from './narrated-render.js';
import {
  timedNarratedPlanSchema,
  type NarratedSceneVisual,
  type TimedNarrationScene,
} from './types.js';
import {writePcm16Wav} from './supertonic/wav.js';

const outputDirectory = resolve(
  process.argv[2] ?? '/tmp/youtube-animation-v6-mixed-fixture',
);
const stem = 'mixed-v6';
const sceneDurationMs = 3_000;
const sampleRate = 44_100;

const screenshotSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" rx="36" fill="#f8fafc"/><rect width="1280" height="92" rx="36" fill="#0f172a"/>
  <circle cx="55" cy="46" r="14" fill="#fb7185"/><circle cx="96" cy="46" r="14" fill="#fbbf24"/><circle cx="137" cy="46" r="14" fill="#34d399"/>
  <rect x="80" y="160" width="280" height="450" rx="26" fill="#e2e8f0"/>
  <rect x="430" y="190" width="230" height="150" rx="24" fill="#dbeafe" stroke="#2563eb" stroke-width="7"/>
  <rect x="770" y="190" width="230" height="150" rx="24" fill="#dcfce7" stroke="#16a34a" stroke-width="7"/>
  <path d="M660 265H770" stroke="#334155" stroke-width="14" stroke-linecap="round"/>
  <rect x="430" y="405" width="620" height="150" rx="28" fill="#0f172a"/><rect x="470" y="450" width="480" height="20" rx="10" fill="#475569"/>
</svg>`;

const generatedLandscapeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#261409"/><stop offset="1" stop-color="#78350f"/></linearGradient></defs>
  <rect width="1280" height="720" fill="url(#g)"/><path d="M0 565L1280 390V720H0Z" fill="#1e293b"/><path d="M0 655L1280 480" stroke="#f59e0b" stroke-width="18" opacity=".72"/>
  <g transform="translate(285 270)"><rect width="225" height="175" rx="32" fill="#94a3b8"/><circle cx="58" cy="190" r="36" fill="#0f172a"/><circle cx="172" cy="190" r="36" fill="#0f172a"/><rect x="60" y="-74" width="110" height="94" rx="22" fill="#cbd5e1"/></g>
  <g transform="translate(770 230)"><rect width="265" height="195" rx="20" fill="#b45309"/><path d="M0 45H265M132 0V195" stroke="#fde68a" stroke-width="8" opacity=".55"/></g>
</svg>`;

const generatedPortraitSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <rect width="720" height="1280" fill="#51230d"/><circle cx="590" cy="220" r="270" fill="#f59e0b" opacity=".16"/>
  <path d="M0 905L720 765V1280H0Z" fill="#1e293b"/><path d="M0 1080L720 940" stroke="#f59e0b" stroke-width="16" opacity=".72"/>
  <g transform="translate(115 520)"><rect width="245" height="210" rx="36" fill="#94a3b8"/><circle cx="65" cy="230" r="38" fill="#0f172a"/><circle cx="185" cy="230" r="38" fill="#0f172a"/><rect x="62" y="-82" width="120" height="102" rx="24" fill="#cbd5e1"/></g>
  <g transform="translate(375 700)"><rect width="260" height="205" rx="20" fill="#b45309"/><path d="M0 48H260M130 0V205" stroke="#fde68a" stroke-width="8" opacity=".55"/></g>
</svg>`;

const makeScene = ({
  id,
  items,
  sceneIndex,
  text,
  title,
  visual,
}: {
  id: string;
  items: string[];
  sceneIndex: number;
  text: string;
  title: string;
  visual: NarratedSceneVisual;
}): TimedNarrationScene => ({
  id,
  backgroundPrompt: `Abstract atmosphere for ${title}.`,
  template: visual.kind === 'diagram' ? 'process-flow' : 'callout',
  title,
  primaryItems: items,
  secondaryItems: [],
  leftLabel: '',
  rightLabel: '',
  reason: 'Narrated v6 mixed fixture.',
  visual,
  startMs: sceneIndex * sceneDurationMs,
  durationMs: sceneDurationMs,
  beats: [{
    id: `${id}-beat`,
    expression: 'none',
    phrases: [{id: `${id}-phrase`, text, startMs: 150, durationMs: 2_650, sampleCount: 116_865}],
    primaryItemIndices: items.map((_, index) => index),
    secondaryItemIndices: [],
    startMs: 150,
    durationMs: 2_650,
    audioFile: `${stem}.audio/${id}.wav`,
    sampleCount: 116_865,
  }],
  primaryItemTimings: items.map(() => ({beatId: `${id}-beat`, startMs: 150})),
  secondaryItemTimings: [],
});

const main = async () => {
  await mkdir(resolve(outputDirectory, `${stem}.audio`), {recursive: true});
  await mkdir(resolve(outputDirectory, `${stem}.media`), {recursive: true});
  await mkdir(resolve(outputDirectory, `${stem}.generated-visuals`), {recursive: true});
  const localFile = `${stem}.media/local-screenshot.svg`;
  const localPath = resolve(outputDirectory, localFile);
  const generatedLandscapePath = resolve(outputDirectory, `${stem}.generated-visuals/editorial-16x9.svg`);
  const generatedPortraitPath = resolve(outputDirectory, `${stem}.generated-visuals/editorial-9x16.svg`);
  await writeFile(localPath, screenshotSvg, 'utf8');
  await writeFile(generatedLandscapePath, generatedLandscapeSvg, 'utf8');
  await writeFile(generatedPortraitPath, generatedPortraitSvg, 'utf8');
  const localHash = createHash('sha256').update(screenshotSvg).digest('hex');
  const voiceoverFile = `${stem}.audio/voiceover.wav`;
  const verificationTone = Float32Array.from(
    {length: sampleRate * 12},
    (_, index) => Math.sin((index / sampleRate) * Math.PI * 2 * 220) * 0.02,
  );
  await writePcm16Wav(
    resolve(outputDirectory, voiceoverFile),
    verificationTone,
    sampleRate,
  );
  const sourceText = [
    'The Queue Diagram connects a Producer to a Consumer.',
    'Warehouse robots move sealed packages through a sorting hall.',
    'Jalapeño reached 85,448 tokens/s/kW. Existing best reached 44,960 tokens/s/kW.',
    'A Producer sends work through a Queue to a Consumer.',
  ].join(' ');
  const generatedDirection = {
    sourceEvidence: 'Warehouse robots move sealed packages through a sorting hall.',
    sourceAnchors: ['Warehouse robots', 'sorting hall'],
    narrationBeat: 'Warehouse robots move sealed packages.',
    subject: 'warehouse robots and sealed packages',
    action: 'moving packages',
    environment: 'a sorting hall',
    framing: 'orientation-aware editorial view',
    exclusions: ['text', 'logos', 'interfaces'],
    depiction: 'literal' as const,
    metaphorRelationship: null,
  };
  const plan = timedNarratedPlanSchema.parse({
    version: 6,
    kind: 'narrated-video',
    stage: 'timed',
    sourceText,
    generatedAt: '2026-08-27T00:00:00.000Z',
    model: 'fixture',
    targetDurationSeconds: 12,
    language: 'en',
    title: 'Narrated v6 mixed fixture',
    palette: 'amber',
    mediaAssets: [
      {id: 'local-queue-diagram', source: 'local', file: localFile, sha256: localHash, mimeType: 'image/png', originalName: 'local-screenshot.png'},
      {id: 'generated-warehouse', source: 'generated', direction: generatedDirection},
    ],
    sampleRate,
    voice: 'M1',
    ttsSpeed: 1,
    ttsSteps: 8,
    voiceoverPlaybackRate: 1,
    voiceoverFile,
    durationMs: 12_000,
    totalSamples: sampleRate * 12,
    scenes: [
      makeScene({id: 'local-image', items: ['Queue Diagram', 'Producer', 'Consumer'], sceneIndex: 0, text: 'The Queue Diagram connects a Producer to a Consumer.', title: 'Selected local image', visual: {kind: 'image-focus', motion: 'push-in', motif: 'data', assetId: null, source: 'local', mediaId: 'local-queue-diagram', fit: 'contain', focalPosition: 'center'}}),
      makeScene({id: 'generated-image', items: ['Warehouse robots', 'Sealed packages'], sceneIndex: 1, text: generatedDirection.narrationBeat, title: 'Grounded generated illustration', visual: {kind: 'image-focus', motion: 'pan', motif: 'automation', assetId: null, source: 'generated', mediaId: 'generated-warehouse', fit: 'cover', focalPosition: 'center'}}),
      makeScene({id: 'chart', items: ['Jalapeño', 'Existing best'], sceneIndex: 2, text: 'Jalapeño leads the existing best in source-backed throughput.', title: 'Source-backed comparison', visual: {kind: 'data-visualization', motion: 'count-up', motif: 'analytics', assetId: null, chart: {type: 'grouped-bars', title: 'Peak mixed-token throughput', data: [{id: 'jalapeno', label: 'Jalapeño', value: 85_448, unit: 'tokens/s/kW', precision: 0, sourceEvidence: 'Jalapeño reached 85,448 tokens/s/kW.', sourceToken: '85,448'}, {id: 'existing', label: 'Existing best', value: 44_960, unit: 'tokens/s/kW', precision: 0, sourceEvidence: 'Existing best reached 44,960 tokens/s/kW.', sourceToken: '44,960'}], series: [{id: 'new', label: 'Jalapeño'}, {id: 'old', label: 'Existing best'}], categories: [{id: 'gpt-oss', label: 'GPT-OSS', values: [{seriesId: 'new', datumId: 'jalapeno'}, {seriesId: 'old', datumId: 'existing'}]}], cards: [], derivedAnnotations: [{id: 'ratio', label: 'Higher', operation: 'ratio', currentDatumId: 'jalapeno', baselineDatumId: 'existing', precision: 1}]}}}),
      makeScene({id: 'diagram', items: ['Producer', 'Queue', 'Consumer'], sceneIndex: 3, text: 'A Producer sends work through a Queue to a Consumer.', title: 'Code-native flow', visual: {kind: 'diagram', motion: 'flow', motif: 'none', assetId: null}}),
    ],
  });
  await writeFile(resolve(outputDirectory, `${stem}.narration-timed.json`), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  const outputs = await renderNarratedVideo({
    aspectRatio: 'both',
    captions: 'on',
    force: true,
    foregroundAssets: {
      '16:9': {'generated-warehouse': generatedLandscapePath},
      '9:16': {'generated-warehouse': generatedPortraitPath},
    },
    fps: 30,
    outputDirectory,
    plan,
    sceneBackground: 'ambient',
    stem,
    voiceoverBaseDirectory: outputDirectory,
  });
  for (const output of outputs) console.log(`Rendered ${output.profile.aspectRatio}: ${output.outputPath}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
