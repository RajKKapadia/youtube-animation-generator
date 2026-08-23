import {z} from 'zod';

export const animationTemplateSchema = z.enum([
  'process-flow',
  'comparison',
  'timeline',
  'callout',
]);

export type AnimationTemplate = z.infer<typeof animationTemplateSchema>;

export const subtitleCueSchema = z.object({
  cueIndex: z.number().int().positive(),
  sourceIndex: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  text: z.string().min(1),
});

export type SubtitleCue = z.infer<typeof subtitleCueSchema>;

const animationContentSchema = z.object({
  startCue: z.number().int().positive(),
  endCue: z.number().int().positive(),
  template: animationTemplateSchema,
  title: z.string().min(1).max(80),
  primaryItems: z.array(z.string().min(1).max(80)).min(1).max(6),
  secondaryItems: z.array(z.string().min(1).max(80)).max(6),
  leftLabel: z.string().max(40),
  rightLabel: z.string().max(40),
  reason: z.string().min(1).max(180),
});

export const animationSuggestionSchema = animationContentSchema.extend({
  primaryItemStartCues: z.array(z.number().int().positive()).max(6),
  secondaryItemStartCues: z.array(z.number().int().positive()).max(6),
});

export const animationPlanResponseSchema = z.object({
  animations: z.array(animationSuggestionSchema).max(12),
});

export type AnimationSuggestion = z.infer<typeof animationSuggestionSchema>;

export const speechItemTimingSchema = z.object({
  cueIndex: z.number().int().positive(),
  startMs: z.number().int().nonnegative(),
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

export const savedPlanSchema = z.object({
  version: z.literal(1),
  sourceSubtitle: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  planningWarnings: z.array(z.string().min(1)).optional(),
  clips: z.array(animationClipSchema),
});

export type SavedPlan = z.infer<typeof savedPlanSchema>;

export const renderBackgroundSchema = z.enum(['transparent', 'green']);
export type RenderBackground = z.infer<typeof renderBackgroundSchema>;

export const technologyBrandIconSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  path: z.string().min(1),
  hex: z.string().regex(/^[0-9A-F]{6}$/i),
});

export type TechnologyBrandIcon = z.infer<typeof technologyBrandIconSchema>;

export const renderInputSchema = z.object({
  clip: animationClipSchema,
  background: renderBackgroundSchema,
  fps: z.number().int().positive(),
  technologyIcons: z.record(z.string(), technologyBrandIconSchema).default({}),
});

export type RenderInput = z.infer<typeof renderInputSchema>;

export type OutputFormat = 'prores' | 'webm' | 'green';

export interface ManifestClip extends AnimationClip {
  file: string;
}

export interface OutputManifest {
  version: 1;
  sourceSubtitle: string;
  generatedAt: string;
  format: OutputFormat;
  clips: ManifestClip[];
}
