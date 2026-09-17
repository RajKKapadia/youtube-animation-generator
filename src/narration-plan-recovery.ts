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

export const sanitizeNarratedCandidate = (input: unknown): unknown => {
  if (!input || typeof input !== 'object') return input;
  const candidate = input as Record<string, unknown>;
  const validPalettes = ['cyan', 'violet', 'emerald', 'amber', 'rose'];
  const validTemplates = ['process-flow', 'comparison', 'timeline', 'callout'];
  const validExpressions = ['none', 'laugh', 'breath', 'sigh'];

  const rawScenes = Array.isArray(candidate.scenes) ? candidate.scenes : [];
  const scenes = rawScenes.slice(0, 6).map((rawScene: Record<string, unknown>, sIdx: number) => {
    const template = validTemplates.includes(String(rawScene.template))
      ? String(rawScene.template)
      : (Array.isArray(rawScene.secondaryItems) && rawScene.secondaryItems.length > 0 ? 'comparison' : 'callout');

    const rawPrimary = Array.isArray(rawScene.primaryItems) ? rawScene.primaryItems : [];
    const primaryItems = rawPrimary.slice(0, 6).map(String);
    if (primaryItems.length === 0) primaryItems.push('Key Concept');

    const isComparison = template === 'comparison';
    const rawSecondary = Array.isArray(rawScene.secondaryItems) ? rawScene.secondaryItems : [];
    const secondaryItems = isComparison ? rawSecondary.slice(0, 6).map(String) : [];

    const rawIcons = (rawScene.icons && typeof rawScene.icons === 'object') ? rawScene.icons as Record<string, unknown> : {};
    const primaryIcons = (Array.isArray(rawIcons.primary) ? rawIcons.primary : []).slice(0, primaryItems.length).map(String);
    while (primaryIcons.length < primaryItems.length) primaryIcons.push('code');

    const secondaryIcons = (Array.isArray(rawIcons.secondary) ? rawIcons.secondary : []).slice(0, secondaryItems.length).map(String);
    while (secondaryIcons.length < secondaryItems.length) secondaryIcons.push('code');

    const rawBeats = Array.isArray(rawScene.beats) ? rawScene.beats : [];
    let beats = rawBeats.map((rawBeat: Record<string, unknown>, bIdx: number) => {
      const rawPhrases = Array.isArray(rawBeat.phrases) ? rawBeat.phrases : [];
      const phrases = rawPhrases.map((rawPhrase: Record<string, unknown>, pIdx: number) => {
        let text = String(rawPhrase.text || 'Key takeaway.');
        if (text.length > 120) {
          text = text.slice(0, 117) + '...';
        }
        return {
          id: String(rawPhrase.id || `phrase-${sIdx}-${bIdx}-${pIdx}`),
          text,
        };
      });

      const expression = validExpressions.includes(String(rawBeat.expression))
        ? String(rawBeat.expression)
        : 'none';

      return {
        id: String(rawBeat.id || `beat-${sIdx}-${bIdx}`),
        expression,
        phrases: phrases.length > 0 ? phrases : [{id: `phrase-${sIdx}-${bIdx}-0`, text: 'Key takeaway.'}],
        primaryItemIndices: (Array.isArray(rawBeat.primaryItemIndices) ? rawBeat.primaryItemIndices : []).map(Number),
        secondaryItemIndices: (Array.isArray(rawBeat.secondaryItemIndices) ? rawBeat.secondaryItemIndices : []).map(Number),
      };
    });

    if (beats.length === 0) {
      beats = [{
        id: `beat-${sIdx}-0`,
        expression: 'none',
        phrases: [{id: `phrase-${sIdx}-0-0`, text: String(rawScene.reason || rawScene.title || 'Explanation.')}],
        primaryItemIndices: primaryItems.map((_, idx) => idx),
        secondaryItemIndices: secondaryItems.map((_, idx) => idx),
      }];
    }

    const allPrimary = beats.flatMap((b) => b.primaryItemIndices);
    const primaryMatches = allPrimary.length === primaryItems.length && allPrimary.every((v, idx) => v === idx);
    if (!primaryMatches) {
      beats.forEach((b) => { b.primaryItemIndices = []; });
      primaryItems.forEach((_, itemIdx) => {
        const targetBeat = beats[Math.min(itemIdx, beats.length - 1)];
        if (targetBeat) {
          targetBeat.primaryItemIndices.push(itemIdx);
        }
      });
    }

    const allSecondary = beats.flatMap((b) => b.secondaryItemIndices);
    const secondaryMatches = allSecondary.length === secondaryItems.length && allSecondary.every((v, idx) => v === idx);
    if (!secondaryMatches) {
      beats.forEach((b) => { b.secondaryItemIndices = []; });
      secondaryItems.forEach((_, itemIdx) => {
        const targetBeat = beats[Math.min(itemIdx, beats.length - 1)];
        if (targetBeat) {
          targetBeat.secondaryItemIndices.push(itemIdx);
        }
      });
    }

    return {
      ...rawScene,
      id: String(rawScene.id || `scene-${sIdx + 1}`),
      title: String(rawScene.title || `Scene ${sIdx + 1}`),
      template,
      primaryItems,
      secondaryItems,
      leftLabel: isComparison ? String(rawScene.leftLabel || 'Side A') : '',
      rightLabel: isComparison ? String(rawScene.rightLabel || 'Side B') : '',
      reason: String(rawScene.reason || 'Visual evidence for claim.'),
      backgroundPrompt: String(rawScene.backgroundPrompt || 'Abstract minimal tech backdrop.'),
      icons: {
        focal: rawIcons.focal ? String(rawIcons.focal) : null,
        primary: primaryIcons,
        secondary: secondaryIcons,
      },
      visual: rawScene.visual && typeof rawScene.visual === 'object'
        ? rawScene.visual
        : {kind: 'diagram', motion: 'reveal', motif: 'none'},
      beats,
    };
  });

  const palette = validPalettes.includes(String(candidate.palette)) ? String(candidate.palette) : 'emerald';

  return {
    ...candidate,
    title: String(candidate.title || 'Untitled Video'),
    palette,
    scenes,
  };
};

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
