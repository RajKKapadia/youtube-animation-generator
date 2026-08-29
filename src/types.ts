import {z} from 'zod';
import {
  narrationExpressionSchema,
  type NarrationExpression,
} from './supertonic/expressions.js';
import {
  videoPaletteSchema,
  type VideoPalette,
} from './visual-palettes.js';
import {chartDatumGroundingIssue} from './source-grounding.js';

export {narrationExpressionSchema, videoPaletteSchema};
export type {NarrationExpression, VideoPalette};

export const animationTemplateSchema = z.enum([
  'process-flow',
  'comparison',
  'timeline',
  'callout',
]);

export type AnimationTemplate = z.infer<typeof animationTemplateSchema>;

export const renderAspectRatioSchema = z.enum(['16:9', '9:16']);
export type RenderAspectRatio = z.infer<typeof renderAspectRatioSchema>;

export const aspectRatioSelectionSchema = z.enum(['16:9', '9:16', 'both']);
export type AspectRatioSelection = z.infer<typeof aspectRatioSelectionSchema>;

export const iconIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const sceneIconSelectionSchema = z.object({
  focal: iconIdSchema.nullable(),
  primary: z.array(iconIdSchema.nullable()).max(6),
  secondary: z.array(iconIdSchema.nullable()).max(6),
});

export type SceneIconSelection = z.infer<typeof sceneIconSelectionSchema>;

export const EMPTY_SCENE_ICON_SELECTION: SceneIconSelection = {
  focal: null,
  primary: [],
  secondary: [],
};

export const assetAttributionSchema = z.object({
  assetId: iconIdSchema,
  attribution: z.string().min(1).max(180),
  sourceUrl: z.url(),
});

export type AssetAttribution = z.infer<typeof assetAttributionSchema>;

export const webResearchModeSchema = z.enum(['off', 'auto', 'required']);
export type WebResearchMode = z.infer<typeof webResearchModeSchema>;

export const webResearchClaimStatusSchema = z.enum([
  'supported',
  'contested',
  'context',
]);

const webResearchUrlSchema = z.string().max(2_048).url().refine(
  (value) => value.startsWith('https://') || value.startsWith('http://'),
  'Research sources must use HTTP or HTTPS URLs.',
);

export const webResearchSourceSchema = z.object({
  url: webResearchUrlSchema,
  title: z.string().min(1).max(300),
});

export const webResearchClaimSchema = z.object({
  claim: z.string().min(1).max(800),
  status: webResearchClaimStatusSchema,
  sourceUrls: z.array(webResearchUrlSchema).min(1).max(6),
});

export const webResearchBundleSchema = z.object({
  version: z.literal(1),
  kind: z.literal('web-research'),
  sourceHash: z.string().regex(/^[\da-f]{64}$/u),
  researchedAt: z.string().min(1),
  model: z.string().min(1),
  mode: webResearchModeSchema.exclude(['off']),
  searchContextSize: z.literal('medium'),
  maxToolCalls: z.literal(4),
  queries: z.array(z.string().min(1).max(500)).max(20),
  summary: z.string().min(1).max(3_000),
  claims: z.array(webResearchClaimSchema).max(16),
  sources: z.array(webResearchSourceSchema).max(100),
}).superRefine((bundle, context) => {
  const sourceUrls = new Set(bundle.sources.map(({url}) => url));
  if (sourceUrls.size !== bundle.sources.length) {
    context.addIssue({
      code: 'custom',
      message: 'Research sources must be unique.',
      path: ['sources'],
    });
  }
  for (const [claimIndex, claim] of bundle.claims.entries()) {
    for (const [urlIndex, url] of claim.sourceUrls.entries()) {
      if (!sourceUrls.has(url)) {
        context.addIssue({
          code: 'custom',
          message: 'Every research claim URL must reference a saved source.',
          path: ['claims', claimIndex, 'sourceUrls', urlIndex],
        });
      }
    }
  }
});

export type WebResearchClaim = z.infer<typeof webResearchClaimSchema>;
export type WebResearchBundle = z.infer<typeof webResearchBundleSchema>;

export const renderProfileSchema = z.object({
  aspectRatio: renderAspectRatioSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  safeArea: z.object({
    top: z.number().int().nonnegative(),
    right: z.number().int().nonnegative(),
    bottom: z.number().int().nonnegative(),
    left: z.number().int().nonnegative(),
  }),
});

export type RenderProfile = z.infer<typeof renderProfileSchema>;

export const subtitleCueSchema = z.object({
  cueIndex: z.number().int().positive(),
  sourceIndex: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  text: z.string().min(1),
});

export type SubtitleCue = z.infer<typeof subtitleCueSchema>;

export const visualContentSchema = z.object({
  template: animationTemplateSchema,
  title: z.string().min(1).max(80),
  primaryItems: z.array(z.string().min(1).max(80)).min(1).max(6),
  secondaryItems: z.array(z.string().min(1).max(80)).max(6),
  leftLabel: z.string().max(40),
  rightLabel: z.string().max(40),
  reason: z.string().min(1).max(180),
});

export type VisualContent = z.infer<typeof visualContentSchema>;

const animationContentSchema = visualContentSchema.extend({
  startCue: z.number().int().positive(),
  endCue: z.number().int().positive(),
});

export const animationSuggestionSchema = animationContentSchema.extend({
  primaryItemStartCues: z.array(z.number().int().positive()).max(6),
  secondaryItemStartCues: z.array(z.number().int().positive()).max(6),
});

export const animationPlanResponseSchema = z.object({
  animations: z.array(animationSuggestionSchema).max(12),
});

export type AnimationSuggestion = z.infer<typeof animationSuggestionSchema>;

export const visualItemTimingSchema = z.object({
  startMs: z.number().int().nonnegative(),
});

export type VisualItemTiming = z.infer<typeof visualItemTimingSchema>;

export const speechItemTimingSchema = visualItemTimingSchema.extend({
  cueIndex: z.number().int().positive(),
});

export type SpeechItemTiming = z.infer<typeof speechItemTimingSchema>;

const addSpeechTimingIssues = (
  timings: SpeechItemTiming[] | undefined,
  items: string[],
  clip: {durationMs: number; endCue: number; startCue: number},
  path: string,
  context: z.core.$RefinementCtx,
): void => {
  if (timings === undefined) {
    return;
  }

  if (timings.length !== items.length) {
    context.addIssue({
      code: 'custom',
      message: `${path} must contain one entry for each matching item.`,
      path: [path],
    });
  }

  let previousStartMs = -1;
  for (const [index, timing] of timings.entries()) {
    if (timing.cueIndex < clip.startCue || timing.cueIndex > clip.endCue) {
      context.addIssue({
        code: 'custom',
        message: 'Speech timing cue must be inside the clip cue range.',
        path: [path, index, 'cueIndex'],
      });
    }
    if (timing.startMs >= clip.durationMs) {
      context.addIssue({
        code: 'custom',
        message: 'Speech timing must start before the clip ends.',
        path: [path, index, 'startMs'],
      });
    }
    if (timing.startMs < previousStartMs) {
      context.addIssue({
        code: 'custom',
        message: 'Speech timings must be in chronological order.',
        path: [path, index, 'startMs'],
      });
    }
    previousStartMs = timing.startMs;
  }
};

export const animationClipSchema = animationContentSchema.extend({
  id: z.string().min(1),
  sourceStartMs: z.number().int().nonnegative(),
  sourceEndMs: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  transcript: z.string().min(1),
  primaryItemTimings: z.array(speechItemTimingSchema).max(6).optional(),
  secondaryItemTimings: z.array(speechItemTimingSchema).max(6).optional(),
}).superRefine((clip, context) => {
  addSpeechTimingIssues(
    clip.primaryItemTimings,
    clip.primaryItems,
    clip,
    'primaryItemTimings',
    context,
  );
  addSpeechTimingIssues(
    clip.secondaryItemTimings,
    clip.secondaryItems,
    clip,
    'secondaryItemTimings',
    context,
  );
});

export type AnimationClip = z.infer<typeof animationClipSchema>;

export const visualClipSchema = visualContentSchema.extend({
  id: z.string().min(1),
  durationMs: z.number().int().positive(),
  icons: sceneIconSelectionSchema.default(EMPTY_SCENE_ICON_SELECTION),
  primaryItemTimings: z.array(visualItemTimingSchema).max(6).optional(),
  secondaryItemTimings: z.array(visualItemTimingSchema).max(6).optional(),
});

export type VisualClip = z.infer<typeof visualClipSchema>;

export const savedPlanSchema = z.object({
  version: z.literal(1),
  sourceSubtitle: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  planningWarnings: z.array(z.string().min(1)).optional(),
  clips: z.array(animationClipSchema),
});

export type SavedPlan = z.infer<typeof savedPlanSchema>;

const narrationTextSchema = z.string().min(1).max(120).refine(
  (text) => !/<(?:laugh|breath|sigh)>/i.test(text),
  'Store Supertonic expressions in the expression field, not narration text.',
);

export const narrationPhraseSchema = z.object({
  id: z.string().min(1).max(100),
  text: narrationTextSchema,
});

export type NarrationPhrase = z.infer<typeof narrationPhraseSchema>;

export const narrationBeatSchema = z.object({
  id: z.string().min(1).max(80),
  phrases: z.array(narrationPhraseSchema).min(1).max(12),
  expression: narrationExpressionSchema,
  primaryItemIndices: z.array(z.number().int().nonnegative()).max(6),
  secondaryItemIndices: z.array(z.number().int().nonnegative()).max(6),
});

export type NarrationBeat = z.infer<typeof narrationBeatSchema>;

export const narratedVisualKindSchema = z.enum([
  'diagram',
  'agent-workflow',
  'brand-showcase',
  'network-map',
  'metric-focus',
  'icon-spotlight',
  'image-focus',
  'data-visualization',
]);

export type NarratedVisualKind = z.infer<typeof narratedVisualKindSchema>;

export const narratedMotionSchema = z.enum([
  'reveal',
  'flow',
  'orbit',
  'pulse',
  'scan',
  'count-up',
  'drift',
  'push-in',
  'pan',
]);

export type NarratedMotion = z.infer<typeof narratedMotionSchema>;

export const narratedVisualMotifSchema = z.enum([
  'none',
  'ai-agent',
  'automation',
  'data',
  'search',
  'document',
  'message',
  'analytics',
  'cloud',
  'security',
]);

export type NarratedVisualMotif = z.infer<typeof narratedVisualMotifSchema>;

const ALLOWED_NARRATED_MOTIONS: Record<NarratedVisualKind, NarratedMotion[]> = {
  diagram: ['reveal', 'flow', 'pulse', 'scan'],
  'agent-workflow': ['flow', 'orbit', 'pulse'],
  'brand-showcase': ['reveal', 'drift'],
  'network-map': ['flow', 'orbit', 'pulse'],
  'metric-focus': ['reveal', 'count-up', 'pulse'],
  'icon-spotlight': ['reveal', 'pulse', 'scan', 'drift'],
  'image-focus': ['push-in', 'pan', 'drift'],
  'data-visualization': ['reveal', 'count-up'],
};

const addNarratedVisualIssues = (
  visual: {
    assetId?: string | null;
    kind: NarratedVisualKind;
    motif: NarratedVisualMotif;
    motion: NarratedMotion;
  },
  context: z.core.$RefinementCtx,
): void => {
  if (!ALLOWED_NARRATED_MOTIONS[visual.kind].includes(visual.motion)) {
    context.addIssue({
      code: 'custom',
      message: `${visual.motion} is not supported by ${visual.kind}.`,
      path: ['motion'],
    });
  }
  if (visual.assetId && visual.motif === 'none') {
    context.addIssue({
      code: 'custom',
      message: 'A motion asset requires a non-neutral visual motif.',
      path: ['assetId'],
    });
  }
};

const assetIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

const legacyNarratedVisualKindSchema = z.enum([
  'diagram',
  'agent-workflow',
  'brand-showcase',
  'network-map',
  'metric-focus',
  'icon-spotlight',
]);

const legacyNarratedVisualSuggestionSchema = z.object({
  kind: legacyNarratedVisualKindSchema,
  motion: narratedMotionSchema,
  motif: narratedVisualMotifSchema,
}).superRefine(addNarratedVisualIssues);

const chartDatumSchema = z.object({
  id: assetIdSchema,
  label: z.string().min(1).max(80),
  value: z.number().finite(),
  unit: z.string().min(1).max(24),
  precision: z.number().int().min(0).max(4),
  sourceEvidence: z.string().min(1).max(400),
  sourceToken: z.string().min(1).max(40),
});

export type ChartDatum = z.infer<typeof chartDatumSchema>;

export const chartDerivedOperationSchema = z.enum([
  'ratio',
  'difference',
  'percent-change',
]);

export const chartDerivedAnnotationSchema = z.object({
  id: assetIdSchema,
  label: z.string().min(1).max(64),
  operation: chartDerivedOperationSchema,
  currentDatumId: assetIdSchema,
  baselineDatumId: assetIdSchema,
  precision: z.number().int().min(0).max(2),
});

export type ChartDerivedAnnotation = z.infer<
  typeof chartDerivedAnnotationSchema
>;

const chartSeriesSchema = z.object({
  id: assetIdSchema,
  label: z.string().min(1).max(48),
});

const chartCategorySchema = z.object({
  id: assetIdSchema,
  label: z.string().min(1).max(72),
  values: z.array(z.object({
    seriesId: assetIdSchema,
    datumId: assetIdSchema,
  })).min(1).max(3),
});

const metricCardSchema = z.object({
  id: assetIdSchema,
  label: z.string().min(1).max(72),
  datumId: assetIdSchema,
  annotationId: assetIdSchema.nullable(),
});

export const dataVisualizationSchema = z.object({
  type: z.enum(['grouped-bars', 'metric-cards']),
  title: z.string().min(1).max(100),
  data: z.array(chartDatumSchema).min(2).max(12),
  series: z.array(chartSeriesSchema).max(3),
  categories: z.array(chartCategorySchema).max(4),
  cards: z.array(metricCardSchema).max(4),
  derivedAnnotations: z.array(chartDerivedAnnotationSchema).max(4),
}).superRefine((chart, context) => {
  const datumById = new Map(chart.data.map((datum) => [datum.id, datum]));
  if (datumById.size !== chart.data.length) {
    context.addIssue({code: 'custom', message: 'Chart datum ids must be unique.', path: ['data']});
  }
  const annotationIds = new Set(chart.derivedAnnotations.map(({id}) => id));
  if (annotationIds.size !== chart.derivedAnnotations.length) {
    context.addIssue({code: 'custom', message: 'Chart annotation ids must be unique.', path: ['derivedAnnotations']});
  }
  for (const [index, annotation] of chart.derivedAnnotations.entries()) {
    const current = datumById.get(annotation.currentDatumId);
    const baseline = datumById.get(annotation.baselineDatumId);
    if (!current || !baseline) {
      context.addIssue({code: 'custom', message: 'Derived chart operands must reference source data.', path: ['derivedAnnotations', index]});
      continue;
    }
    if (current.unit !== baseline.unit) {
      context.addIssue({code: 'custom', message: 'Derived chart operands must use compatible units.', path: ['derivedAnnotations', index]});
    }
    if (baseline.value === 0) {
      context.addIssue({code: 'custom', message: 'Derived chart baselines cannot be zero.', path: ['derivedAnnotations', index, 'baselineDatumId']});
    }
  }
  if (chart.type === 'grouped-bars') {
    if (chart.series.length < 1 || chart.categories.length < 1 || chart.cards.length !== 0) {
      context.addIssue({code: 'custom', message: 'Grouped bars require 1-3 series, 1-4 categories, and no metric cards.', path: []});
    }
    const seriesIds = new Set(chart.series.map(({id}) => id));
    for (const [categoryIndex, category] of chart.categories.entries()) {
      if (category.values.length !== chart.series.length) {
        context.addIssue({code: 'custom', message: 'Every grouped-bar category must supply one value per series.', path: ['categories', categoryIndex, 'values']});
      }
      for (const [valueIndex, value] of category.values.entries()) {
        if (!seriesIds.has(value.seriesId) || !datumById.has(value.datumId)) {
          context.addIssue({code: 'custom', message: 'Grouped-bar values must reference declared series and data.', path: ['categories', categoryIndex, 'values', valueIndex]});
        }
      }
    }
  } else if (chart.cards.length < 2 || chart.series.length !== 0 || chart.categories.length !== 0) {
    context.addIssue({code: 'custom', message: 'Metric cards require 2-4 cards and no grouped-bar series or categories.', path: []});
  }
  for (const [index, card] of chart.cards.entries()) {
    if (!datumById.has(card.datumId) || (card.annotationId && !annotationIds.has(card.annotationId))) {
      context.addIssue({code: 'custom', message: 'Metric cards must reference declared data and annotations.', path: ['cards', index]});
    }
  }
});

export type DataVisualization = z.infer<typeof dataVisualizationSchema>;

export const generatedVisualDirectionSchema = z.object({
  sourceEvidence: z.string().min(1).max(600),
  sourceAnchors: z.array(z.string().min(1).max(120)).min(2).max(5),
  narrationBeat: z.string().min(1).max(500),
  subject: z.string().min(1).max(180),
  action: z.string().min(1).max(180),
  environment: z.string().min(1).max(180),
  framing: z.string().min(1).max(180),
  exclusions: z.array(z.string().min(1).max(120)).min(1).max(10),
  depiction: z.enum(['literal', 'metaphor']),
  metaphorRelationship: z.string().max(240).nullable(),
}).superRefine((direction, context) => {
  if (direction.depiction === 'metaphor' && !direction.metaphorRelationship) {
    context.addIssue({code: 'custom', message: 'A visual metaphor must state its source relationship.', path: ['metaphorRelationship']});
  }
  if (direction.depiction === 'literal' && direction.metaphorRelationship) {
    context.addIssue({code: 'custom', message: 'Literal depictions cannot declare a metaphor relationship.', path: ['metaphorRelationship']});
  }
});

export type GeneratedVisualDirection = z.infer<
  typeof generatedVisualDirectionSchema
>;

export const localNarratedMediaAssetSchema = z.object({
  id: assetIdSchema,
  source: z.literal('local'),
  file: z.string().min(1).refine((value) =>
    !value.startsWith('/') && !value.split(/[\\/]/u).includes('..'),
  'Local media paths must be plan-relative and cannot traverse directories.'),
  sha256: z.string().regex(/^[\da-f]{64}$/u),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  originalName: z.string().min(1).max(255),
});

export const generatedNarratedMediaAssetSchema = z.object({
  id: assetIdSchema,
  source: z.literal('generated'),
  direction: generatedVisualDirectionSchema,
});

export const narratedMediaAssetSchema = z.discriminatedUnion('source', [
  localNarratedMediaAssetSchema,
  generatedNarratedMediaAssetSchema,
]);

export type NarratedMediaAsset = z.infer<typeof narratedMediaAssetSchema>;

const imageFocusSuggestionSchema = z.object({
  kind: z.literal('image-focus'),
  motion: z.enum(['push-in', 'pan', 'drift']),
  motif: narratedVisualMotifSchema,
  source: z.enum(['local', 'generated']),
  localImageId: assetIdSchema.nullable(),
  generatedDirection: generatedVisualDirectionSchema.nullable(),
  fit: z.enum(['contain', 'cover']),
  focalPosition: z.enum(['center', 'top', 'right', 'bottom', 'left']),
}).superRefine((visual, context) => {
  if (visual.source === 'local' && (!visual.localImageId || visual.generatedDirection)) {
    context.addIssue({code: 'custom', message: 'Local image scenes require only a local image id.', path: ['localImageId']});
  }
  if (visual.source === 'generated' && (visual.localImageId || !visual.generatedDirection)) {
    context.addIssue({code: 'custom', message: 'Generated image scenes require only a grounded prompt direction.', path: ['generatedDirection']});
  }
});

const dataVisualizationSuggestionSchema = z.object({
  kind: z.literal('data-visualization'),
  motion: z.enum(['reveal', 'count-up']),
  motif: z.enum(['analytics', 'data']),
  chart: dataVisualizationSchema,
});

export const narratedVisualSuggestionSchema = z.union([
  legacyNarratedVisualSuggestionSchema,
  imageFocusSuggestionSchema,
  dataVisualizationSuggestionSchema,
]);

export type NarratedVisualSuggestion = z.infer<
  typeof narratedVisualSuggestionSchema
>;

const legacyNarratedSceneVisualSchema = z.object({
  kind: legacyNarratedVisualKindSchema,
  motion: narratedMotionSchema,
  motif: narratedVisualMotifSchema,
  assetId: assetIdSchema.nullable(),
}).superRefine(addNarratedVisualIssues);

const imageFocusSceneVisualSchema = z.object({
  kind: z.literal('image-focus'),
  motion: z.enum(['push-in', 'pan', 'drift']),
  motif: narratedVisualMotifSchema,
  assetId: z.null(),
  source: z.enum(['local', 'generated']),
  mediaId: assetIdSchema,
  fit: z.enum(['contain', 'cover']),
  focalPosition: z.enum(['center', 'top', 'right', 'bottom', 'left']),
});

const dataVisualizationSceneVisualSchema = z.object({
  kind: z.literal('data-visualization'),
  motion: z.enum(['reveal', 'count-up']),
  motif: z.enum(['analytics', 'data']),
  assetId: z.null(),
  chart: dataVisualizationSchema,
});

export const narratedSceneVisualSchema = z.union([
  legacyNarratedSceneVisualSchema,
  imageFocusSceneVisualSchema,
  dataVisualizationSceneVisualSchema,
]);

export type NarratedSceneVisual = z.infer<typeof narratedSceneVisualSchema>;

export const DEFAULT_NARRATED_SCENE_VISUAL: NarratedSceneVisual = {
  kind: 'diagram',
  motion: 'reveal',
  motif: 'none',
  assetId: null,
};

const addNarrationSceneIssues = (
  scene: VisualContent & {beats: NarrationBeat[]; icons?: SceneIconSelection},
  context: z.core.$RefinementCtx,
): void => {
  if (scene.template === 'comparison' && scene.secondaryItems.length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'Comparison scenes require secondary items.',
      path: ['secondaryItems'],
    });
  }

  const phraseIds = scene.beats.flatMap((beat) =>
    beat.phrases.map((phrase) => phrase.id),
  );
  if (new Set(phraseIds).size !== phraseIds.length) {
    context.addIssue({
      code: 'custom',
      message: 'Narration phrase ids must be unique inside a scene.',
      path: ['beats'],
    });
  }

  for (const [field, itemCount] of [
    ['primaryItemIndices', scene.primaryItems.length],
    ['secondaryItemIndices', scene.secondaryItems.length],
  ] as const) {
    const references = scene.beats.flatMap((beat) => beat[field]);
    const expected = Array.from({length: itemCount}, (_, index) => index);
    if (
      references.length !== expected.length ||
      references.some((reference, index) => reference !== expected[index])
    ) {
      context.addIssue({
        code: 'custom',
        message: `Every ${field === 'primaryItemIndices' ? 'primary' : 'secondary'} item must be anchored exactly once, in visual order.`,
        path: ['beats'],
      });
    }
  }

  if (scene.icons) {
    for (const [field, itemCount] of [
      ['primary', scene.primaryItems.length],
      ['secondary', scene.secondaryItems.length],
    ] as const) {
      const selections = scene.icons[field];
      if (selections.length !== 0 && selections.length !== itemCount) {
        context.addIssue({
          code: 'custom',
          message: `${field} icon selections must be empty for legacy fallback or contain one entry for every matching visual item.`,
          path: ['icons', field],
        });
      }
    }
  }
};

const addSuggestedIconIssues = (
  scene: VisualContent & {
    icons: SceneIconSelection;
    visual: NarratedVisualSuggestion;
  },
  context: z.core.$RefinementCtx,
): void => {
  for (const [field, itemCount] of [
    ['primary', scene.primaryItems.length],
    ['secondary', scene.secondaryItems.length],
  ] as const) {
    if (scene.icons[field].length !== itemCount) {
      context.addIssue({
        code: 'custom',
        message: `${field} icon selections must contain one entry for every matching visual item.`,
        path: ['icons', field],
      });
    }
  }
  if (scene.visual.kind === 'icon-spotlight' && !scene.icons.focal) {
    context.addIssue({
      code: 'custom',
      message: 'Icon spotlight scenes require a focal icon selection.',
      path: ['icons', 'focal'],
    });
  }
};

export const draftNarrationSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  backgroundPrompt: z.string().min(1).max(600),
  visual: narratedSceneVisualSchema,
  icons: sceneIconSelectionSchema.default(EMPTY_SCENE_ICON_SELECTION),
  beats: z.array(narrationBeatSchema).min(1).max(12),
}).superRefine(addNarrationSceneIssues);

export const draftNarrationSceneSuggestionSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  backgroundPrompt: z.string().min(1).max(600),
  visual: narratedVisualSuggestionSchema,
  icons: sceneIconSelectionSchema,
  beats: z.array(narrationBeatSchema).min(1).max(12),
}).superRefine((scene, context) => {
  addNarrationSceneIssues(scene, context);
  addSuggestedIconIssues(scene, context);
});

export type DraftNarrationSceneSuggestion = z.infer<
  typeof draftNarrationSceneSuggestionSchema
>;

export type DraftNarrationScene = z.infer<typeof draftNarrationSceneSchema>;

export const maxNarrationExpressionsForDuration = (
  targetDurationSeconds: number,
): number => Math.min(
  3,
  Math.max(1, Math.round(targetDurationSeconds / 30)),
);

const addNarratedPlanIssues = (
  plan: {
    mediaAssets: NarratedMediaAsset[];
    scenes: Array<{beats: NarrationBeat[]; visual: NarratedSceneVisual}>;
    sourceText: string;
    targetDurationSeconds: number;
  },
  context: z.core.$RefinementCtx,
): void => {
  const beats = plan.scenes.flatMap((scene) => scene.beats);
  if (beats.length > 64) {
    context.addIssue({
      code: 'custom',
      message: 'Narrated plans cannot exceed 64 semantic beats.',
      path: ['scenes'],
    });
  }

  const expressionLimit = maxNarrationExpressionsForDuration(
    plan.targetDurationSeconds,
  );
  const expressionCount = beats.filter(
    ({expression}) => expression !== 'none',
  ).length;
  if (expressionCount > expressionLimit) {
    context.addIssue({
      code: 'custom',
      message:
        `Narrated plans can use at most ${expressionLimit} voice ` +
        `expression${expressionLimit === 1 ? '' : 's'} for this target duration.`,
      path: ['scenes'],
    });
  }

  for (let beatIndex = 1; beatIndex < beats.length; beatIndex += 1) {
    if (
      beats[beatIndex - 1]?.expression !== 'none' &&
      beats[beatIndex]?.expression !== 'none'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Voice expressions cannot be used on consecutive narration beats.',
        path: ['scenes'],
      });
      break;
    }
  }

  const mediaById = new Map(plan.mediaAssets.map((asset) => [asset.id, asset]));
  if (mediaById.size !== plan.mediaAssets.length) {
    context.addIssue({code: 'custom', message: 'Narrated media asset ids must be unique.', path: ['mediaAssets']});
  }
  const usedMediaIds = new Set<string>();
  let generatedSceneCount = 0;
  for (const [sceneIndex, scene] of plan.scenes.entries()) {
    if (scene.visual.kind === 'image-focus') {
      const asset = mediaById.get(scene.visual.mediaId);
      if (!asset || asset.source !== scene.visual.source) {
        context.addIssue({code: 'custom', message: 'Image-focus scenes must reference media with matching provenance.', path: ['scenes', sceneIndex, 'visual', 'mediaId']});
      }
      if (usedMediaIds.has(scene.visual.mediaId)) {
        context.addIssue({code: 'custom', message: 'Each foreground image may be used by at most one scene.', path: ['scenes', sceneIndex, 'visual', 'mediaId']});
      }
      usedMediaIds.add(scene.visual.mediaId);
      if (asset?.source === 'generated') {
        generatedSceneCount += 1;
        const direction = asset.direction;
        if (!plan.sourceText.includes(direction.sourceEvidence)) {
          context.addIssue({code: 'custom', message: 'Generated visual evidence must be an exact source excerpt.', path: ['mediaAssets', plan.mediaAssets.indexOf(asset), 'direction', 'sourceEvidence']});
        }
        for (const [anchorIndex, anchor] of direction.sourceAnchors.entries()) {
          if (!plan.sourceText.includes(anchor)) {
            context.addIssue({code: 'custom', message: 'Generated visual anchors must occur exactly in the source.', path: ['mediaAssets', plan.mediaAssets.indexOf(asset), 'direction', 'sourceAnchors', anchorIndex]});
          }
        }
        const sceneBeatText = scene.beats
          .map((beat) => beat.phrases.map(({text}) => text).join(' '))
          .join(' ');
        if (!sceneBeatText.includes(direction.narrationBeat)) {
          context.addIssue({code: 'custom', message: 'Generated visual narrationBeat must exactly match narration in its scene.', path: ['mediaAssets', plan.mediaAssets.indexOf(asset), 'direction', 'narrationBeat']});
        }
      }
    }
    if (scene.visual.kind === 'data-visualization') {
      for (const [datumIndex, datum] of scene.visual.chart.data.entries()) {
        const parsedToken = Number(datum.sourceToken.replaceAll(',', '').replace(/%$/u, ''));
        if (
          chartDatumGroundingIssue(plan.sourceText, datum) ||
          !Number.isFinite(parsedToken) ||
          parsedToken !== datum.value
        ) {
          context.addIssue({code: 'custom', message: 'Chart data must preserve an exact source label, numeric token, value, and evidence excerpt.', path: ['scenes', sceneIndex, 'visual', 'chart', 'data', datumIndex]});
        }
      }
    }
  }
  if (generatedSceneCount > 2) {
    context.addIssue({code: 'custom', message: 'Narrated videos can contain at most two generated foreground scenes.', path: ['scenes']});
  }
};

export const draftNarratedPlanSchema = z.object({
  version: z.literal(6),
  kind: z.literal('narrated-video'),
  stage: z.literal('draft'),
  sourceText: z.string().min(1),
  originalSourceText: z.string().min(1).optional(),
  research: webResearchBundleSchema.optional(),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  targetDurationSeconds: z.number().positive(),
  language: z.string().min(1),
  title: z.string().min(1).max(100),
  palette: videoPaletteSchema,
  planningWarnings: z.array(z.string().min(1)).optional(),
  assetAttributions: z.array(assetAttributionSchema).max(12).default([]),
  mediaAssets: z.array(narratedMediaAssetSchema).max(8),
  scenes: z.array(draftNarrationSceneSchema).min(1).max(6),
}).superRefine((plan, context) => {
  addNarratedPlanIssues(plan, context);
  if (Boolean(plan.originalSourceText) !== Boolean(plan.research)) {
    context.addIssue({
      code: 'custom',
      message: 'Research-enriched plans must preserve both originalSourceText and research metadata.',
      path: ['research'],
    });
  }
});

export type DraftNarratedPlan = z.infer<typeof draftNarratedPlanSchema>;

export const timedNarrationPhraseSchema = narrationPhraseSchema.extend({
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  sampleCount: z.number().int().positive(),
});

export type TimedNarrationPhrase = z.infer<typeof timedNarrationPhraseSchema>;

export const timedNarrationBeatSchema = narrationBeatSchema.extend({
  phrases: z.array(timedNarrationPhraseSchema).min(1).max(12),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  audioFile: z.string().min(1),
  sampleCount: z.number().int().positive(),
}).superRefine((beat, context) => {
  let previousPhraseEnd = beat.startMs;
  for (const [phraseIndex, phrase] of beat.phrases.entries()) {
    if (
      phrase.startMs < beat.startMs ||
      phrase.startMs + phrase.durationMs > beat.startMs + beat.durationMs
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Phrase timing must fall inside its narration beat.',
        path: ['phrases', phraseIndex],
      });
    }
    if (phrase.startMs < previousPhraseEnd) {
      context.addIssue({
        code: 'custom',
        message: 'Phrase timings must be chronological and non-overlapping.',
        path: ['phrases', phraseIndex, 'startMs'],
      });
    }
    previousPhraseEnd = phrase.startMs + phrase.durationMs;
  }
});

export const anchoredItemTimingSchema = visualItemTimingSchema.extend({
  beatId: z.string().min(1),
});

export const timedNarrationSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  backgroundPrompt: z.string().min(1).max(600),
  visual: narratedSceneVisualSchema,
  icons: sceneIconSelectionSchema.default(EMPTY_SCENE_ICON_SELECTION),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  beats: z.array(timedNarrationBeatSchema).min(1).max(12),
  primaryItemTimings: z.array(anchoredItemTimingSchema).max(6),
  secondaryItemTimings: z.array(anchoredItemTimingSchema).max(6),
}).superRefine((scene, context) => {
  addNarrationSceneIssues(scene, context);
  for (const [field, items, beatField] of [
    ['primaryItemTimings', scene.primaryItems, 'primaryItemIndices'],
    ['secondaryItemTimings', scene.secondaryItems, 'secondaryItemIndices'],
  ] as const) {
    const timings = scene[field];
    if (timings.length !== items.length) {
      context.addIssue({
        code: 'custom',
        message: `${field} must contain one entry for every matching visual item.`,
        path: [field],
      });
    }
    let previousStartMs = -1;
    for (const [itemIndex, timing] of timings.entries()) {
      const beat = scene.beats.find((candidate) =>
        candidate[beatField].includes(itemIndex),
      );
      if (
        !beat ||
        timing.beatId !== beat.id ||
        timing.startMs !== beat.startMs
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Item timing must match its semantic beat anchor.',
          path: [field, itemIndex],
        });
      }
      if (timing.startMs < previousStartMs || timing.startMs >= scene.durationMs) {
        context.addIssue({
          code: 'custom',
          message: 'Item timings must be chronological and inside the scene.',
          path: [field, itemIndex, 'startMs'],
        });
      }
      previousStartMs = timing.startMs;
    }
  }
});

export type TimedNarrationScene = z.infer<typeof timedNarrationSceneSchema>;

export const timedNarratedPlanSchema = z.object({
  version: z.literal(6),
  kind: z.literal('narrated-video'),
  stage: z.literal('timed'),
  sourceText: z.string().min(1),
  originalSourceText: z.string().min(1).optional(),
  research: webResearchBundleSchema.optional(),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  targetDurationSeconds: z.number().positive(),
  language: z.string().min(1),
  title: z.string().min(1).max(100),
  palette: videoPaletteSchema,
  planningWarnings: z.array(z.string().min(1)).optional(),
  assetAttributions: z.array(assetAttributionSchema).max(12).default([]),
  mediaAssets: z.array(narratedMediaAssetSchema).max(8),
  sampleRate: z.number().int().positive(),
  voice: z.string().min(1),
  ttsSpeed: z.number().positive(),
  ttsSteps: z.number().int().positive(),
  voiceoverPlaybackRate: z.number().positive().default(1),
  voiceoverFile: z.string().min(1),
  durationMs: z.number().int().positive(),
  totalSamples: z.number().int().positive(),
  scenes: z.array(timedNarrationSceneSchema).min(1).max(6),
}).superRefine((plan, context) => {
  addNarratedPlanIssues(plan, context);
  if (Boolean(plan.originalSourceText) !== Boolean(plan.research)) {
    context.addIssue({
      code: 'custom',
      message: 'Research-enriched plans must preserve both originalSourceText and research metadata.',
      path: ['research'],
    });
  }
  let previousSceneEnd = 0;
  for (const [sceneIndex, scene] of plan.scenes.entries()) {
    if (scene.startMs < previousSceneEnd) {
      context.addIssue({
        code: 'custom',
        message: 'Timed scenes must be chronological and non-overlapping.',
        path: ['scenes', sceneIndex, 'startMs'],
      });
    }
    previousSceneEnd = scene.startMs + scene.durationMs;
    const beatIds = new Set(scene.beats.map((beat) => beat.id));
    for (const field of ['primaryItemTimings', 'secondaryItemTimings'] as const) {
      for (const [timingIndex, timing] of scene[field].entries()) {
        if (!beatIds.has(timing.beatId) || timing.startMs >= scene.durationMs) {
          context.addIssue({
            code: 'custom',
            message: 'Item timing must reference a beat and fall inside its scene.',
            path: ['scenes', sceneIndex, field, timingIndex],
          });
        }
      }
    }
  }
});

export type TimedNarratedPlan = z.infer<typeof timedNarratedPlanSchema>;

const legacyNarrationBeatSchema = z.object({
  id: z.string().min(1).max(80),
  text: z.string().min(1).max(600),
  primaryItemIndices: z.array(z.number().int().nonnegative()).max(6),
  secondaryItemIndices: z.array(z.number().int().nonnegative()).max(6),
});

const legacyDraftNarrationSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  beats: z.array(legacyNarrationBeatSchema).min(1).max(12),
});

const legacyDraftNarratedPlanSchema = z.object({
  version: z.literal(1),
  kind: z.literal('narrated-video'),
  stage: z.literal('draft'),
  sourceText: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  targetDurationSeconds: z.number().positive(),
  language: z.string().min(1),
  title: z.string().min(1).max(100),
  scenes: z.array(legacyDraftNarrationSceneSchema).min(1).max(6),
});

const legacyTimedNarrationBeatSchema = legacyNarrationBeatSchema.extend({
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  audioFile: z.string().min(1),
  sampleCount: z.number().int().positive(),
});

const legacyTimedNarrationSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  beats: z.array(legacyTimedNarrationBeatSchema).min(1).max(12),
  primaryItemTimings: z.array(anchoredItemTimingSchema).max(6),
  secondaryItemTimings: z.array(anchoredItemTimingSchema).max(6),
});

const legacyTimedNarratedPlanSchema = z.object({
  version: z.literal(1),
  kind: z.literal('narrated-video'),
  stage: z.literal('timed'),
  sourceText: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  targetDurationSeconds: z.number().positive(),
  language: z.string().min(1),
  title: z.string().min(1).max(100),
  sampleRate: z.number().int().positive(),
  voice: z.string().min(1),
  ttsSpeed: z.number().positive(),
  ttsSteps: z.number().int().positive(),
  voiceoverFile: z.string().min(1),
  durationMs: z.number().int().positive(),
  totalSamples: z.number().int().positive(),
  scenes: z.array(legacyTimedNarrationSceneSchema).min(1).max(6),
});

const legacyV2NarrationBeatSchema = z.object({
  id: z.string().min(1).max(80),
  phrases: z.array(narrationPhraseSchema).min(1).max(12),
  primaryItemIndices: z.array(z.number().int().nonnegative()).max(6),
  secondaryItemIndices: z.array(z.number().int().nonnegative()).max(6),
});

const legacyV2DraftNarrationSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  backgroundPrompt: z.string().min(1).max(600),
  beats: z.array(legacyV2NarrationBeatSchema).min(1).max(12),
});

const legacyV2DraftNarratedPlanSchema = z.object({
  version: z.literal(2),
  kind: z.literal('narrated-video'),
  stage: z.literal('draft'),
  sourceText: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  targetDurationSeconds: z.number().positive(),
  language: z.string().min(1),
  title: z.string().min(1).max(100),
  scenes: z.array(legacyV2DraftNarrationSceneSchema).min(1).max(6),
});

const legacyV2TimedNarrationBeatSchema = legacyV2NarrationBeatSchema.extend({
  phrases: z.array(timedNarrationPhraseSchema).min(1).max(12),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  audioFile: z.string().min(1),
  sampleCount: z.number().int().positive(),
});

const legacyV2TimedNarrationSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  backgroundPrompt: z.string().min(1).max(600),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  beats: z.array(legacyV2TimedNarrationBeatSchema).min(1).max(12),
  primaryItemTimings: z.array(anchoredItemTimingSchema).max(6),
  secondaryItemTimings: z.array(anchoredItemTimingSchema).max(6),
});

const legacyV2TimedNarratedPlanSchema = z.object({
  version: z.literal(2),
  kind: z.literal('narrated-video'),
  stage: z.literal('timed'),
  sourceText: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  targetDurationSeconds: z.number().positive(),
  language: z.string().min(1),
  title: z.string().min(1).max(100),
  sampleRate: z.number().int().positive(),
  voice: z.string().min(1),
  ttsSpeed: z.number().positive(),
  ttsSteps: z.number().int().positive(),
  voiceoverFile: z.string().min(1),
  durationMs: z.number().int().positive(),
  totalSamples: z.number().int().positive(),
  scenes: z.array(legacyV2TimedNarrationSceneSchema).min(1).max(6),
});

const legacyV3DraftNarrationSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  backgroundPrompt: z.string().min(1).max(600),
  beats: z.array(narrationBeatSchema).min(1).max(12),
});

const legacyV3TimedNarrationSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  backgroundPrompt: z.string().min(1).max(600),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  beats: z.array(timedNarrationBeatSchema).min(1).max(12),
  primaryItemTimings: z.array(anchoredItemTimingSchema).max(6),
  secondaryItemTimings: z.array(anchoredItemTimingSchema).max(6),
});

const legacyV3DraftNarratedPlanSchema = z.object({
  version: z.literal(3),
  kind: z.literal('narrated-video'),
  stage: z.literal('draft'),
  sourceText: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  targetDurationSeconds: z.number().positive(),
  language: z.string().min(1),
  title: z.string().min(1).max(100),
  scenes: z.array(legacyV3DraftNarrationSceneSchema).min(1).max(6),
});

const legacyV3TimedNarratedPlanSchema = z.object({
  version: z.literal(3),
  kind: z.literal('narrated-video'),
  stage: z.literal('timed'),
  sourceText: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  targetDurationSeconds: z.number().positive(),
  language: z.string().min(1),
  title: z.string().min(1).max(100),
  sampleRate: z.number().int().positive(),
  voice: z.string().min(1),
  ttsSpeed: z.number().positive(),
  ttsSteps: z.number().int().positive(),
  voiceoverPlaybackRate: z.number().positive().default(1),
  voiceoverFile: z.string().min(1),
  durationMs: z.number().int().positive(),
  totalSamples: z.number().int().positive(),
  scenes: z.array(legacyV3TimedNarrationSceneSchema).min(1).max(6),
});

const legacyV4DraftNarratedPlanSchema = z.object({
  version: z.literal(4),
  kind: z.literal('narrated-video'),
  stage: z.literal('draft'),
  sourceText: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  targetDurationSeconds: z.number().positive(),
  language: z.string().min(1),
  title: z.string().min(1).max(100),
  palette: videoPaletteSchema,
  planningWarnings: z.array(z.string().min(1)).optional(),
  scenes: z.array(legacyV3DraftNarrationSceneSchema).min(1).max(6),
});

const legacyV4TimedNarratedPlanSchema = z.object({
  version: z.literal(4),
  kind: z.literal('narrated-video'),
  stage: z.literal('timed'),
  sourceText: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  targetDurationSeconds: z.number().positive(),
  language: z.string().min(1),
  title: z.string().min(1).max(100),
  palette: videoPaletteSchema,
  planningWarnings: z.array(z.string().min(1)).optional(),
  sampleRate: z.number().int().positive(),
  voice: z.string().min(1),
  ttsSpeed: z.number().positive(),
  ttsSteps: z.number().int().positive(),
  voiceoverPlaybackRate: z.number().positive().default(1),
  voiceoverFile: z.string().min(1),
  durationMs: z.number().int().positive(),
  totalSamples: z.number().int().positive(),
  scenes: z.array(legacyV3TimedNarrationSceneSchema).min(1).max(6),
});

const legacyV5DraftNarrationSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  backgroundPrompt: z.string().min(1).max(600),
  visual: legacyNarratedSceneVisualSchema,
  beats: z.array(narrationBeatSchema).min(1).max(12),
}).superRefine(addNarrationSceneIssues);

const legacyV5TimedNarrationSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  backgroundPrompt: z.string().min(1).max(600),
  visual: legacyNarratedSceneVisualSchema,
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  beats: z.array(timedNarrationBeatSchema).min(1).max(12),
  primaryItemTimings: z.array(anchoredItemTimingSchema).max(6),
  secondaryItemTimings: z.array(anchoredItemTimingSchema).max(6),
}).superRefine((scene, context) => {
  addNarrationSceneIssues(scene, context);
  for (const [field, items] of [
    ['primaryItemTimings', scene.primaryItems],
    ['secondaryItemTimings', scene.secondaryItems],
  ] as const) {
    if (scene[field].length !== items.length) {
      context.addIssue({code: 'custom', message: `${field} must contain one entry for every matching visual item.`, path: [field]});
    }
  }
});

const legacyV5DraftNarratedPlanSchema = z.object({
  version: z.literal(5),
  kind: z.literal('narrated-video'),
  stage: z.literal('draft'),
  sourceText: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  targetDurationSeconds: z.number().positive(),
  language: z.string().min(1),
  title: z.string().min(1).max(100),
  palette: videoPaletteSchema,
  planningWarnings: z.array(z.string().min(1)).optional(),
  scenes: z.array(legacyV5DraftNarrationSceneSchema).min(1).max(6),
});

const legacyV5TimedNarratedPlanSchema = z.object({
  version: z.literal(5),
  kind: z.literal('narrated-video'),
  stage: z.literal('timed'),
  sourceText: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  targetDurationSeconds: z.number().positive(),
  language: z.string().min(1),
  title: z.string().min(1).max(100),
  palette: videoPaletteSchema,
  planningWarnings: z.array(z.string().min(1)).optional(),
  sampleRate: z.number().int().positive(),
  voice: z.string().min(1),
  ttsSpeed: z.number().positive(),
  ttsSteps: z.number().int().positive(),
  voiceoverPlaybackRate: z.number().positive().default(1),
  voiceoverFile: z.string().min(1),
  durationMs: z.number().int().positive(),
  totalSamples: z.number().int().positive(),
  scenes: z.array(legacyV5TimedNarrationSceneSchema).min(1).max(6),
});

export const defaultSceneBackgroundPrompt = (scene: VisualContent): string =>
  `Abstract technical atmosphere for ${scene.title}. ${scene.reason}`.slice(0, 600);

const legacyPhraseId = (beatId: string): string => `${beatId}-phrase-1`;

const normalizeLegacyDraft = (
  plan: z.infer<typeof legacyDraftNarratedPlanSchema>,
): DraftNarratedPlan => draftNarratedPlanSchema.parse({
  ...plan,
  version: 6,
  palette: 'cyan',
  mediaAssets: [],
  scenes: plan.scenes.map((scene) => ({
    ...scene,
    backgroundPrompt: defaultSceneBackgroundPrompt(scene),
    visual: DEFAULT_NARRATED_SCENE_VISUAL,
    beats: scene.beats.map(({text, ...beat}) => ({
      ...beat,
      expression: 'none' as const,
      phrases: [{id: legacyPhraseId(beat.id), text}],
    })),
  })),
});

const normalizeLegacyTimed = (
  plan: z.infer<typeof legacyTimedNarratedPlanSchema>,
): TimedNarratedPlan => timedNarratedPlanSchema.parse({
  ...plan,
  version: 6,
  palette: 'cyan',
  mediaAssets: [],
  scenes: plan.scenes.map((scene) => ({
    ...scene,
    backgroundPrompt: defaultSceneBackgroundPrompt(scene),
    visual: DEFAULT_NARRATED_SCENE_VISUAL,
    beats: scene.beats.map(({text, ...beat}) => ({
      ...beat,
      expression: 'none' as const,
      phrases: [{
        id: legacyPhraseId(beat.id),
        text,
        startMs: beat.startMs,
        durationMs: beat.durationMs,
        sampleCount: beat.sampleCount,
      }],
    })),
  })),
});

const normalizeLegacyV2Draft = (
  plan: z.infer<typeof legacyV2DraftNarratedPlanSchema>,
): DraftNarratedPlan => draftNarratedPlanSchema.parse({
  ...plan,
  version: 6,
  palette: 'cyan',
  mediaAssets: [],
  scenes: plan.scenes.map((scene) => ({
    ...scene,
    visual: DEFAULT_NARRATED_SCENE_VISUAL,
    beats: scene.beats.map((beat) => ({
      ...beat,
      expression: 'none' as const,
    })),
  })),
});

const normalizeLegacyV2Timed = (
  plan: z.infer<typeof legacyV2TimedNarratedPlanSchema>,
): TimedNarratedPlan => timedNarratedPlanSchema.parse({
  ...plan,
  version: 6,
  palette: 'cyan',
  mediaAssets: [],
  scenes: plan.scenes.map((scene) => ({
    ...scene,
    visual: DEFAULT_NARRATED_SCENE_VISUAL,
    beats: scene.beats.map((beat) => ({
      ...beat,
      expression: 'none' as const,
    })),
  })),
});

const normalizeLegacyV3Draft = (
  plan: z.infer<typeof legacyV3DraftNarratedPlanSchema>,
): DraftNarratedPlan => draftNarratedPlanSchema.parse({
  ...plan,
  version: 6,
  palette: 'cyan',
  mediaAssets: [],
  scenes: plan.scenes.map((scene) => ({
    ...scene,
    visual: DEFAULT_NARRATED_SCENE_VISUAL,
  })),
});

const normalizeLegacyV3Timed = (
  plan: z.infer<typeof legacyV3TimedNarratedPlanSchema>,
): TimedNarratedPlan => timedNarratedPlanSchema.parse({
  ...plan,
  version: 6,
  palette: 'cyan',
  mediaAssets: [],
  scenes: plan.scenes.map((scene) => ({
    ...scene,
    visual: DEFAULT_NARRATED_SCENE_VISUAL,
  })),
});

const normalizeLegacyV4Draft = (
  plan: z.infer<typeof legacyV4DraftNarratedPlanSchema>,
): DraftNarratedPlan => draftNarratedPlanSchema.parse({
  ...plan,
  version: 6,
  mediaAssets: [],
  scenes: plan.scenes.map((scene) => ({
    ...scene,
    visual: DEFAULT_NARRATED_SCENE_VISUAL,
  })),
});

const normalizeLegacyV4Timed = (
  plan: z.infer<typeof legacyV4TimedNarratedPlanSchema>,
): TimedNarratedPlan => timedNarratedPlanSchema.parse({
  ...plan,
  version: 6,
  mediaAssets: [],
  scenes: plan.scenes.map((scene) => ({
    ...scene,
    visual: DEFAULT_NARRATED_SCENE_VISUAL,
  })),
});

const normalizeLegacyV5Draft = (
  plan: z.infer<typeof legacyV5DraftNarratedPlanSchema>,
): DraftNarratedPlan => draftNarratedPlanSchema.parse({
  ...plan,
  version: 6,
  mediaAssets: [],
});

const normalizeLegacyV5Timed = (
  plan: z.infer<typeof legacyV5TimedNarratedPlanSchema>,
): TimedNarratedPlan => timedNarratedPlanSchema.parse({
  ...plan,
  version: 6,
  mediaAssets: [],
});

export const narratedPlanSchema = z.union([
  draftNarratedPlanSchema,
  timedNarratedPlanSchema,
  legacyV5DraftNarratedPlanSchema.transform(normalizeLegacyV5Draft),
  legacyV5TimedNarratedPlanSchema.transform(normalizeLegacyV5Timed),
  legacyV4DraftNarratedPlanSchema.transform(normalizeLegacyV4Draft),
  legacyV4TimedNarratedPlanSchema.transform(normalizeLegacyV4Timed),
  legacyV3DraftNarratedPlanSchema.transform(normalizeLegacyV3Draft),
  legacyV3TimedNarratedPlanSchema.transform(normalizeLegacyV3Timed),
  legacyV2DraftNarratedPlanSchema.transform(normalizeLegacyV2Draft),
  legacyV2TimedNarratedPlanSchema.transform(normalizeLegacyV2Timed),
  legacyDraftNarratedPlanSchema.transform(normalizeLegacyDraft),
  legacyTimedNarratedPlanSchema.transform(normalizeLegacyTimed),
]);

export type NarratedPlan = z.infer<typeof narratedPlanSchema>;

export const publishAccentSchema = videoPaletteSchema;

export type PublishAccent = VideoPalette;

const youtubePublishMetadataSchema = z.object({
  title: z.string().trim().min(1).max(70),
  alternateTitles: z.array(z.string().trim().min(1).max(70)).length(2),
  description: z.string().trim().min(1).max(2_000),
  tags: z.array(z.string().trim().min(1).max(80)).min(15).max(20),
  hashtags: z.array(
    z.string().trim().min(1).max(32).regex(
      /^[\p{L}\p{N}_]+$/u,
      'Hashtags must omit the leading # and contain only letters, numbers, or underscores.',
    ),
  ).min(3).max(5),
}).superRefine((metadata, context) => {
  const titles = [metadata.title, ...metadata.alternateTitles]
    .map((title) => title.toLocaleLowerCase());
  if (new Set(titles).size !== titles.length) {
    context.addIssue({
      code: 'custom',
      message: 'Recommended and alternate titles must be unique.',
      path: ['alternateTitles'],
    });
  }

  const tags = metadata.tags.map((tag) => tag.toLocaleLowerCase());
  if (new Set(tags).size !== tags.length) {
    context.addIssue({
      code: 'custom',
      message: 'YouTube tags must be unique.',
      path: ['tags'],
    });
  }

  const hashtags = metadata.hashtags.map((hashtag) => hashtag.toLocaleLowerCase());
  if (new Set(hashtags).size !== hashtags.length) {
    context.addIssue({
      code: 'custom',
      message: 'Description hashtags must be unique.',
      path: ['hashtags'],
    });
  }
});

const publishThumbnailMetadataSchema = z.object({
  headline: z.string().trim().min(1).max(56),
  eyebrow: z.string().trim().min(1).max(32),
  sceneId: z.string().trim().min(1).max(80),
  accent: publishAccentSchema,
});

export const narratedPublishPlanSchema = z.object({
  version: z.literal(1),
  kind: z.literal('narrated-publish-kit'),
  sourcePlan: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  language: z.string().min(1),
  assetCredits: z.array(assetAttributionSchema).max(12).default([]),
  youtube: youtubePublishMetadataSchema,
  thumbnail: publishThumbnailMetadataSchema,
});

export type NarratedPublishPlan = z.infer<typeof narratedPublishPlanSchema>;

export const publishSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  icons: sceneIconSelectionSchema.default(EMPTY_SCENE_ICON_SELECTION),
});

export type PublishScene = z.infer<typeof publishSceneSchema>;

export const renderBackgroundSchema = z.enum(['transparent', 'green', 'dark']);
export type RenderBackground = z.infer<typeof renderBackgroundSchema>;

export const captionModeSchema = z.enum(['on', 'off']);
export type CaptionMode = z.infer<typeof captionModeSchema>;

export const sceneBackgroundModeSchema = z.enum(['ambient', 'generated']);
export type SceneBackgroundMode = z.infer<typeof sceneBackgroundModeSchema>;

export const generatedVisualModeSchema = z.enum(['off', 'auto']);
export type GeneratedVisualMode = z.infer<typeof generatedVisualModeSchema>;

export const imageQualitySchema = z.enum(['low', 'medium', 'high']);
export type ImageQuality = z.infer<typeof imageQualitySchema>;

export const technologyBrandIconSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  path: z.string().min(1),
  hex: z.string().regex(/^[0-9A-F]{6}$/i),
});

export type TechnologyBrandIcon = z.infer<typeof technologyBrandIconSchema>;

export const localBrandAssetSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  title: z.string().min(1),
  file: z.string().min(1),
  colorPolicy: z.enum(['original', 'monochrome-allowed']),
});

export type LocalBrandAsset = z.infer<typeof localBrandAssetSchema>;

export const localIconAssetSchema = z.object({
  id: iconIdSchema,
  file: z.string().min(1),
  colorPolicy: z.enum(['original', 'monochrome-allowed']),
});

export type LocalIconAsset = z.infer<typeof localIconAssetSchema>;

export const selectedMotionAssetSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  file: z.string().min(1),
  loop: z.enum(['once', 'loop']),
  playbackRate: z.number().positive().max(4),
  colorMap: z.record(
    z.string().regex(/^#[\da-f]{6}$/iu),
    z.enum(['primary', 'secondary']),
  ).default({}),
});

export type SelectedMotionAsset = z.infer<typeof selectedMotionAssetSchema>;

export const publishCoverInputSchema = z.object({
  publish: narratedPublishPlanSchema,
  scene: publishSceneSchema,
  profile: renderProfileSchema,
  technologyIcons: z.record(z.string(), technologyBrandIconSchema).default({}),
  localIconAssets: z.record(z.string(), localIconAssetSchema).default({}),
});

export type PublishCoverInput = z.infer<typeof publishCoverInputSchema>;

export const renderInputSchema = z.object({
  clip: visualClipSchema,
  background: renderBackgroundSchema,
  contentTopInset: z.number().int().nonnegative().optional(),
  fps: z.number().int().positive(),
  palette: videoPaletteSchema.default('cyan'),
  profile: renderProfileSchema,
  technologyIcons: z.record(z.string(), technologyBrandIconSchema).default({}),
});

export type RenderInput = z.infer<typeof renderInputSchema>;

export const narratedRenderInputSchema = z.object({
  plan: timedNarratedPlanSchema,
  captions: captionModeSchema,
  sceneBackground: sceneBackgroundModeSchema,
  backgroundAssets: z.record(z.string(), z.string().min(1)).default({}),
  foregroundAssets: z.record(z.string(), z.string().min(1)).default({}),
  fps: z.number().int().positive(),
  profile: renderProfileSchema,
  audioFile: z.string().min(1),
  technologyIcons: z.record(z.string(), technologyBrandIconSchema).default({}),
  localBrandAssets: z.record(z.string(), localBrandAssetSchema).default({}),
  localIconAssets: z.record(z.string(), localIconAssetSchema).default({}),
  motionAssets: z.record(z.string(), selectedMotionAssetSchema).default({}),
});

export type NarratedRenderInput = z.infer<typeof narratedRenderInputSchema>;

export type OutputFormat = 'prores' | 'webm' | 'green';

export interface ManifestClip extends AnimationClip {
  file: string;
}

export interface OutputManifest {
  version: 2;
  sourceSubtitle: string;
  generatedAt: string;
  format: OutputFormat;
  aspectRatio: RenderAspectRatio;
  width: number;
  height: number;
  clips: ManifestClip[];
}

export const outputManifestSchema = z.object({
  version: z.literal(2),
  sourceSubtitle: z.string().min(1),
  generatedAt: z.string().min(1),
  format: z.enum(['prores', 'webm', 'green']),
  aspectRatio: renderAspectRatioSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  clips: z.array(animationClipSchema.extend({file: z.string().min(1)})),
});
