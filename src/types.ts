import {z} from 'zod';
import {
  narrationExpressionSchema,
  type NarrationExpression,
} from './supertonic/expressions.js';
import {
  videoPaletteSchema,
  type VideoPalette,
} from './visual-palettes.js';

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

export const narratedVisualSuggestionSchema = z.object({
  kind: narratedVisualKindSchema,
  motion: narratedMotionSchema,
  motif: narratedVisualMotifSchema,
}).superRefine(addNarratedVisualIssues);

export type NarratedVisualSuggestion = z.infer<
  typeof narratedVisualSuggestionSchema
>;

export const narratedSceneVisualSchema = z.object({
  kind: narratedVisualKindSchema,
  motion: narratedMotionSchema,
  motif: narratedVisualMotifSchema,
  assetId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).nullable(),
}).superRefine(addNarratedVisualIssues);

export type NarratedSceneVisual = z.infer<typeof narratedSceneVisualSchema>;

export const DEFAULT_NARRATED_SCENE_VISUAL: NarratedSceneVisual = {
  kind: 'diagram',
  motion: 'reveal',
  motif: 'none',
  assetId: null,
};

const addNarrationSceneIssues = (
  scene: VisualContent & {beats: NarrationBeat[]},
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
};

export const draftNarrationSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  backgroundPrompt: z.string().min(1).max(600),
  visual: narratedSceneVisualSchema,
  beats: z.array(narrationBeatSchema).min(1).max(12),
}).superRefine(addNarrationSceneIssues);

export const draftNarrationSceneSuggestionSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
  backgroundPrompt: z.string().min(1).max(600),
  visual: narratedVisualSuggestionSchema,
  beats: z.array(narrationBeatSchema).min(1).max(12),
}).superRefine(addNarrationSceneIssues);

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
    scenes: Array<{beats: NarrationBeat[]}>;
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
};

export const draftNarratedPlanSchema = z.object({
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
  scenes: z.array(draftNarrationSceneSchema).min(1).max(6),
}).superRefine(addNarratedPlanIssues);

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
  scenes: z.array(timedNarrationSceneSchema).min(1).max(6),
}).superRefine((plan, context) => {
  addNarratedPlanIssues(plan, context);
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

export const defaultSceneBackgroundPrompt = (scene: VisualContent): string =>
  `Abstract technical atmosphere for ${scene.title}. ${scene.reason}`.slice(0, 600);

const legacyPhraseId = (beatId: string): string => `${beatId}-phrase-1`;

const normalizeLegacyDraft = (
  plan: z.infer<typeof legacyDraftNarratedPlanSchema>,
): DraftNarratedPlan => draftNarratedPlanSchema.parse({
  ...plan,
  version: 5,
  palette: 'cyan',
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
  version: 5,
  palette: 'cyan',
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
  version: 5,
  palette: 'cyan',
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
  version: 5,
  palette: 'cyan',
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
  version: 5,
  palette: 'cyan',
  scenes: plan.scenes.map((scene) => ({
    ...scene,
    visual: DEFAULT_NARRATED_SCENE_VISUAL,
  })),
});

const normalizeLegacyV3Timed = (
  plan: z.infer<typeof legacyV3TimedNarratedPlanSchema>,
): TimedNarratedPlan => timedNarratedPlanSchema.parse({
  ...plan,
  version: 5,
  palette: 'cyan',
  scenes: plan.scenes.map((scene) => ({
    ...scene,
    visual: DEFAULT_NARRATED_SCENE_VISUAL,
  })),
});

const normalizeLegacyV4Draft = (
  plan: z.infer<typeof legacyV4DraftNarratedPlanSchema>,
): DraftNarratedPlan => draftNarratedPlanSchema.parse({
  ...plan,
  version: 5,
  scenes: plan.scenes.map((scene) => ({
    ...scene,
    visual: DEFAULT_NARRATED_SCENE_VISUAL,
  })),
});

const normalizeLegacyV4Timed = (
  plan: z.infer<typeof legacyV4TimedNarratedPlanSchema>,
): TimedNarratedPlan => timedNarratedPlanSchema.parse({
  ...plan,
  version: 5,
  scenes: plan.scenes.map((scene) => ({
    ...scene,
    visual: DEFAULT_NARRATED_SCENE_VISUAL,
  })),
});

export const narratedPlanSchema = z.union([
  draftNarratedPlanSchema,
  timedNarratedPlanSchema,
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
  youtube: youtubePublishMetadataSchema,
  thumbnail: publishThumbnailMetadataSchema,
});

export type NarratedPublishPlan = z.infer<typeof narratedPublishPlanSchema>;

export const publishSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
});

export type PublishScene = z.infer<typeof publishSceneSchema>;

export const renderBackgroundSchema = z.enum(['transparent', 'green', 'dark']);
export type RenderBackground = z.infer<typeof renderBackgroundSchema>;

export const captionModeSchema = z.enum(['on', 'off']);
export type CaptionMode = z.infer<typeof captionModeSchema>;

export const sceneBackgroundModeSchema = z.enum(['ambient', 'generated']);
export type SceneBackgroundMode = z.infer<typeof sceneBackgroundModeSchema>;

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
  fps: z.number().int().positive(),
  profile: renderProfileSchema,
  audioFile: z.string().min(1),
  technologyIcons: z.record(z.string(), technologyBrandIconSchema).default({}),
  localBrandAssets: z.record(z.string(), localBrandAssetSchema).default({}),
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
