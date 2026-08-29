import {describe, expect, it} from 'vitest';
import {materializeSubtitleVisualPlan} from './planner.js';
import type {DiscoveredLocalImage} from './local-images.js';
import {
  outputManifestSchema,
  savedPlanSchema,
  subtitleSavedPlanV2Schema,
  type SubtitleAnimationSuggestion,
  type SubtitleCue,
} from './types.js';

const cues: SubtitleCue[] = [
  {cueIndex: 1, sourceIndex: '1', startMs: 1_000, endMs: 3_000, text: 'Jalapeño reached 85,448 tokens per second per kilowatt.'},
  {cueIndex: 2, sourceIndex: '2', startMs: 3_500, endMs: 5_500, text: 'Existing best reached 44,960 tokens per second per kilowatt.'},
];

const chartSuggestion = (sourceToken = '85,448'): SubtitleAnimationSuggestion => ({
  startCue: 1,
  endCue: 2,
  template: 'callout',
  title: 'Source-backed throughput',
  primaryItems: ['Jalapeño', 'Existing best'],
  secondaryItems: [],
  leftLabel: '',
  rightLabel: '',
  reason: 'Compares the two spoken throughput values.',
  primaryItemStartCues: [1, 2],
  secondaryItemStartCues: [],
  backgroundPrompt: 'Abstract analytical light fields with a quiet center.',
  icons: {focal: null, primary: [null, null], secondary: []},
  visual: {
    kind: 'data-visualization',
    motion: 'count-up',
    motif: 'analytics',
    chart: {
      type: 'grouped-bars',
      title: 'Throughput',
      data: [
        {id: 'jalapeno', label: 'Jalapeño', value: Number(sourceToken.replace(',', '')), unit: 'tokens/s/kW', precision: 0, sourceEvidence: `Jalapeño reached ${sourceToken} tokens per second per kilowatt.`, sourceToken},
        {id: 'existing', label: 'Existing best', value: 44_960, unit: 'tokens/s/kW', precision: 0, sourceEvidence: 'Existing best reached 44,960 tokens per second per kilowatt.', sourceToken: '44,960'},
      ],
      series: [{id: 'current', label: 'Jalapeño'}, {id: 'baseline', label: 'Existing best'}],
      categories: [{id: 'throughput', label: 'Throughput', values: [{seriesId: 'current', datumId: 'jalapeno'}, {seriesId: 'baseline', datumId: 'existing'}]}],
      cards: [],
      derivedAnnotations: [{id: 'ratio', label: 'Higher', operation: 'ratio', currentDatumId: 'jalapeno', baselineDatumId: 'existing', precision: 1}],
    },
  },
});

const imageSuggestion = ({
  cueIndex,
  imageId,
  source,
  text,
}: {
  cueIndex: number;
  imageId: string;
  source: 'generated' | 'local';
  text: string;
}): SubtitleAnimationSuggestion => ({
  startCue: cueIndex,
  endCue: cueIndex,
  template: 'callout',
  title: `Grounded image ${cueIndex}`,
  primaryItems: [`Visual ${cueIndex}`],
  secondaryItems: [],
  leftLabel: '',
  rightLabel: '',
  reason: 'Uses only the selected cue evidence.',
  primaryItemStartCues: [cueIndex],
  secondaryItemStartCues: [],
  backgroundPrompt: 'Abstract quiet light field with no text.',
  icons: {focal: null, primary: [null], secondary: []},
  visual: source === 'local' ? {
    kind: 'image-focus',
    motion: 'push-in',
    motif: 'data',
    source,
    localImageId: imageId,
    generatedDirection: null,
    fit: 'contain',
    focalPosition: 'center',
  } : {
    kind: 'image-focus',
    motion: 'drift',
    motif: 'automation',
    source,
    localImageId: null,
    generatedDirection: {
      sourceEvidence: text,
      sourceAnchors: text.split(/\s+/u).slice(0, 2),
      narrationBeat: text,
      subject: `${text.split(/\s+/u)[0]} machinery in a literal editorial scene`,
      action: 'moving through one clear technical process',
      environment: 'a restrained abstract technical workspace',
      framing: 'wide editorial composition with a quiet upper lane',
      exclusions: ['text', 'logos', 'interfaces'],
      depiction: 'literal',
      metaphorRelationship: null,
    },
    fit: 'cover',
    focalPosition: 'center',
  },
});

describe('subtitle visual parity plans', () => {
  it('normalizes version-1 plans without changing their default visual behavior', () => {
    const plan = savedPlanSchema.parse({
      version: 1,
      sourceSubtitle: '/tmp/legacy.srt',
      generatedAt: '2026-08-22T00:00:00.000Z',
      model: 'fixture',
      clips: [{
        id: 'animation-01', startCue: 1, endCue: 1, sourceStartMs: 0,
        sourceEndMs: 2_000, durationMs: 2_000, transcript: 'A queue.',
        template: 'callout', title: 'Queue', primaryItems: ['Queue'], secondaryItems: [],
        leftLabel: '', rightLabel: '', reason: 'Legacy fixture.',
      }],
    });
    expect(plan.version).toBe(2);
    expect(plan.palette).toBe('cyan');
    expect(plan.clips[0]?.visual).toEqual({kind: 'diagram', motion: 'reveal', motif: 'none', assetId: null});
    expect(plan.clips[0]?.captionCues).toEqual([]);
  });

  it('persists grounded charts, palette, icons, and exact cue-relative captions', async () => {
    const plan = await materializeSubtitleVisualPlan({
      cues,
      generatedVisuals: 'off',
      localImages: [],
      model: 'fixture',
      palette: 'emerald',
      sourceSubtitle: '/tmp/throughput.srt',
      suggestions: [chartSuggestion()],
      warnings: [],
    });
    expect(subtitleSavedPlanV2Schema.parse(plan)).toEqual(plan);
    expect(plan.palette).toBe('emerald');
    expect(plan.clips[0]?.visual.kind).toBe('data-visualization');
    expect(plan.clips[0]?.captionCues).toEqual([
      {cueIndex: 1, startMs: 0, durationMs: 2_000, text: cues[0]!.text},
      {cueIndex: 2, startMs: 2_500, durationMs: 2_000, text: cues[1]!.text},
    ]);
  });

  it('downgrades only an unsupported optional chart and records why', async () => {
    const plan = await materializeSubtitleVisualPlan({
      cues,
      generatedVisuals: 'off',
      localImages: [],
      model: 'fixture',
      palette: 'cyan',
      sourceSubtitle: '/tmp/throughput.srt',
      suggestions: [chartSuggestion('99,999')],
      warnings: [],
    });
    expect(plan.clips[0]?.visual.kind).toBe('diagram');
    expect(plan.planningWarnings?.join('\n')).toContain('could not be verified');
  });

  it('validates version-3 manifests with visual settings and credits', async () => {
    const plan = await materializeSubtitleVisualPlan({
      cues,
      generatedVisuals: 'off',
      localImages: [],
      model: 'fixture',
      palette: 'violet',
      sourceSubtitle: '/tmp/throughput.srt',
      suggestions: [chartSuggestion()],
      warnings: [],
    });
    expect(outputManifestSchema.parse({
      version: 3,
      sourceSubtitle: plan.sourceSubtitle,
      generatedAt: plan.generatedAt,
      format: 'h264',
      palette: plan.palette,
      captions: 'on',
      sceneBackground: 'ambient',
      assetAttributions: plan.assetAttributions,
      aspectRatio: '16:9',
      width: 1920,
      height: 1080,
      clips: plan.clips.map((clip) => ({...clip, file: 'clip.mp4'})),
    })).toBeTruthy();
  });

  it('uses each sibling local image at most once and downgrades only the duplicate treatment', async () => {
    const localImage: DiscoveredLocalImage = {
      id: 'local-pipeline-0123456789ab',
      originalName: 'pipeline.png',
      sourcePath: '/tmp/images/pipeline.png',
      mimeType: 'image/png',
      sha256: 'a'.repeat(64),
      file: 'throughput.media/pipeline-0123456789ab.png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    };
    const plan = await materializeSubtitleVisualPlan({
      cues,
      generatedVisuals: 'off',
      localImages: [localImage],
      model: 'fixture',
      palette: 'rose',
      sourceSubtitle: '/tmp/throughput.srt',
      suggestions: [
        imageSuggestion({cueIndex: 1, imageId: localImage.id, source: 'local', text: cues[0]!.text}),
        imageSuggestion({cueIndex: 2, imageId: localImage.id, source: 'local', text: cues[1]!.text}),
      ],
      warnings: [],
    });
    expect(plan.clips.map(({visual}) => visual.kind)).toEqual(['image-focus', 'diagram']);
    expect(plan.mediaAssets).toHaveLength(1);
    expect(plan.planningWarnings?.join('\n')).toContain('already selected by another clip');
  });

  it('enforces the two-generated-foreground limit with a scene-local fallback', async () => {
    const generatedCues: SubtitleCue[] = [
      {cueIndex: 1, sourceIndex: '1', startMs: 0, endMs: 1_000, text: 'Copper robot sorts parcels.'},
      {cueIndex: 2, sourceIndex: '2', startMs: 1_200, endMs: 2_200, text: 'Silver crane lifts crates.'},
      {cueIndex: 3, sourceIndex: '3', startMs: 2_400, endMs: 3_400, text: 'Blue cart carries boxes.'},
    ];
    const plan = await materializeSubtitleVisualPlan({
      cues: generatedCues,
      generatedVisuals: 'auto',
      localImages: [],
      model: 'fixture',
      palette: 'amber',
      sourceSubtitle: '/tmp/generated.srt',
      suggestions: generatedCues.map((cue) => imageSuggestion({
        cueIndex: cue.cueIndex,
        imageId: '',
        source: 'generated',
        text: cue.text,
      })),
      warnings: [],
    });
    expect(plan.clips.map(({visual}) => visual.kind)).toEqual([
      'image-focus',
      'image-focus',
      'diagram',
    ]);
    expect(plan.mediaAssets.filter(({source}) => source === 'generated')).toHaveLength(2);
    expect(plan.planningWarnings?.join('\n')).toContain('at most two generated foreground clips');
  });

  it('records when four selected clips cannot support the requested visual diversity', async () => {
    const diagramCues: SubtitleCue[] = Array.from({length: 4}, (_, index) => ({
      cueIndex: index + 1,
      sourceIndex: String(index + 1),
      startMs: index * 1_200,
      endMs: index * 1_200 + 1_000,
      text: `Step ${index + 1} moves through the pipeline.`,
    }));
    const suggestions: SubtitleAnimationSuggestion[] = diagramCues.map((cue) => ({
      startCue: cue.cueIndex,
      endCue: cue.cueIndex,
      template: 'callout',
      title: `Pipeline step ${cue.cueIndex}`,
      primaryItems: [`Step ${cue.cueIndex}`],
      secondaryItems: [],
      leftLabel: '',
      rightLabel: '',
      reason: 'Uses the smallest complete cue range.',
      primaryItemStartCues: [cue.cueIndex],
      secondaryItemStartCues: [],
      backgroundPrompt: 'Abstract quiet technical field with no text.',
      icons: {focal: null, primary: [null], secondary: []},
      visual: {kind: 'diagram', motion: 'reveal', motif: 'none'},
    }));
    const plan = await materializeSubtitleVisualPlan({
      cues: diagramCues,
      generatedVisuals: 'off',
      localImages: [],
      model: 'fixture',
      palette: 'cyan',
      sourceSubtitle: '/tmp/diagram.srt',
      suggestions,
      warnings: [],
    });
    expect(plan.planningWarnings?.join('\n')).toContain(
      'fewer than three truthful visual treatments',
    );
  });
});
