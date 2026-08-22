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

export const animationSuggestionSchema = z.object({
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

export const animationPlanResponseSchema = z.object({
  animations: z.array(animationSuggestionSchema).max(12),
});

export type AnimationSuggestion = z.infer<typeof animationSuggestionSchema>;

export const animationClipSchema = animationSuggestionSchema.extend({
  id: z.string().min(1),
  sourceStartMs: z.number().int().nonnegative(),
  sourceEndMs: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  transcript: z.string().min(1),
});

export type AnimationClip = z.infer<typeof animationClipSchema>;

export const savedPlanSchema = z.object({
  version: z.literal(1),
  sourceSubtitle: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  clips: z.array(animationClipSchema),
});

export type SavedPlan = z.infer<typeof savedPlanSchema>;

export const renderBackgroundSchema = z.enum(['transparent', 'green']);
export type RenderBackground = z.infer<typeof renderBackgroundSchema>;

export const renderInputSchema = z.object({
  clip: animationClipSchema,
  background: renderBackgroundSchema,
  fps: z.number().int().positive(),
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
