import {z} from 'zod';
import {
  draftNarrationSceneSuggestionSchema,
  narratedVisualSuggestionSchema,
  videoPaletteSchema,
  type DraftNarrationSceneSuggestion,
} from './types.js';

export const narrationResponseSchema = z.object({
  title: z.string().min(1).max(100),
  palette: videoPaletteSchema,
  scenes: z.array(draftNarrationSceneSuggestionSchema).min(1).max(6),
});

// This intake schema is local only. The API still receives the full strict
// response schema, but optional visual errors must reach recovery before Zod's
// cross-field refinements run. Narration and item timing are never fabricated.
const responseIntakeSchema = z.object({
  ...narrationResponseSchema.shape,
  scenes: z.array(z.object({
    ...draftNarrationSceneSuggestionSchema.shape,
    visual: z.unknown(),
  })).min(1).max(6),
});

export const planningValidationSummary = (error: z.ZodError): string =>
  error.issues.slice(0, 12).map((issue) =>
    `${issue.path.join('.') || 'plan'}: ${issue.message}`,
  ).join('; ');

export const recoverNarrationResponse = (input: unknown): {
  title: string;
  palette: z.infer<typeof videoPaletteSchema>;
  scenes: DraftNarrationSceneSuggestion[];
  warnings: string[];
} => {
  const parsed = responseIntakeSchema.parse(input);
  const warnings: string[] = [];
  const scenes = parsed.scenes.map((scene): DraftNarrationSceneSuggestion => {
    const visual = narratedVisualSuggestionSchema.safeParse(scene.visual);
    if (!visual.success) {
      warnings.push(
        `Scene "${scene.title}" (${scene.id}) uses a code-native fallback because its optional visual is invalid: ${planningValidationSummary(visual.error)}`,
      );
    }
    const emptyComparison = scene.template === 'comparison' && scene.secondaryItems.length === 0;
    if (emptyComparison) {
      warnings.push(
        `Scene "${scene.title}" (${scene.id}) uses a callout because its comparison has no secondary items; existing text and narration were preserved.`,
      );
    }
    return {
      ...scene,
      template: emptyComparison ? 'callout' : scene.template,
      visual: visual.success ? visual.data : {kind: 'diagram', motion: 'reveal', motif: 'none'},
    };
  });
  return {...parsed, scenes, warnings};
};
