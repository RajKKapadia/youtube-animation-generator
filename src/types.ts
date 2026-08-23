import {z} from 'zod';

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

export const narrationBeatSchema = z.object({
  id: z.string().min(1).max(80),
  text: z.string().min(1).max(600),
  primaryItemIndices: z.array(z.number().int().nonnegative()).max(6),
  secondaryItemIndices: z.array(z.number().int().nonnegative()).max(6),
});

export type NarrationBeat = z.infer<typeof narrationBeatSchema>;

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
  beats: z.array(narrationBeatSchema).min(1).max(12),
}).superRefine(addNarrationSceneIssues);

export type DraftNarrationScene = z.infer<typeof draftNarrationSceneSchema>;

export const draftNarratedPlanSchema = z.object({
  version: z.literal(1),
  kind: z.literal('narrated-video'),
  stage: z.literal('draft'),
  sourceText: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  targetDurationSeconds: z.number().positive(),
  language: z.string().min(1),
  title: z.string().min(1).max(100),
  scenes: z.array(draftNarrationSceneSchema).min(1).max(6),
}).superRefine((plan, context) => {
  const beatCount = plan.scenes.reduce((total, scene) => total + scene.beats.length, 0);
  if (beatCount > 64) {
    context.addIssue({
      code: 'custom',
      message: 'Narrated plans cannot exceed 64 semantic beats.',
      path: ['scenes'],
    });
  }
});

export type DraftNarratedPlan = z.infer<typeof draftNarratedPlanSchema>;

export const timedNarrationBeatSchema = narrationBeatSchema.extend({
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  audioFile: z.string().min(1),
  sampleCount: z.number().int().positive(),
});

export const anchoredItemTimingSchema = visualItemTimingSchema.extend({
  beatId: z.string().min(1),
});

export const timedNarrationSceneSchema = visualContentSchema.extend({
  id: z.string().min(1).max(80),
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
  scenes: z.array(timedNarrationSceneSchema).min(1).max(6),
}).superRefine((plan, context) => {
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

export const narratedPlanSchema = z.discriminatedUnion('stage', [
  draftNarratedPlanSchema,
  timedNarratedPlanSchema,
]);

export type NarratedPlan = z.infer<typeof narratedPlanSchema>;

export const renderBackgroundSchema = z.enum(['transparent', 'green', 'dark']);
export type RenderBackground = z.infer<typeof renderBackgroundSchema>;

export const technologyBrandIconSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  path: z.string().min(1),
  hex: z.string().regex(/^[0-9A-F]{6}$/i),
});

export type TechnologyBrandIcon = z.infer<typeof technologyBrandIconSchema>;

export const renderInputSchema = z.object({
  clip: visualClipSchema,
  background: renderBackgroundSchema,
  fps: z.number().int().positive(),
  profile: renderProfileSchema,
  technologyIcons: z.record(z.string(), technologyBrandIconSchema).default({}),
});

export type RenderInput = z.infer<typeof renderInputSchema>;

export const narratedRenderInputSchema = z.object({
  plan: timedNarratedPlanSchema,
  fps: z.number().int().positive(),
  profile: renderProfileSchema,
  audioFile: z.string().min(1),
  technologyIcons: z.record(z.string(), technologyBrandIconSchema).default({}),
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
