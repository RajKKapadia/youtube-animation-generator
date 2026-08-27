import OpenAI from 'openai';
import {zodTextFormat} from 'openai/helpers/zod';
import {z} from 'zod';
import {
  draftNarrationSceneSuggestionSchema,
  draftNarratedPlanSchema,
  maxNarrationExpressionsForDuration,
  videoPaletteSchema,
  type DraftNarrationSceneSuggestion,
  type DraftNarratedPlan,
} from './types.js';
import {joinNarrationPhrases} from './narration-text.js';
import {
  brandAssetForLabel,
  loadAssetRegistry,
  motionAssetForMotif,
  normalizeAssetLabel,
  type AssetRegistry,
} from './asset-registry.js';
import {exactTechnologyBrandIconFor} from './technology-catalog.js';

export {joinNarrationPhrases} from './narration-text.js';

const narrationResponseSchema = z.object({
  title: z.string().min(1).max(100),
  palette: videoPaletteSchema,
  scenes: z.array(draftNarrationSceneSuggestionSchema).min(1).max(6),
});

const SYSTEM_PROMPT = `You are a precise visual writer and director for short educational videos.

Turn the supplied source into a self-contained narration and storyboard. Stay faithful to the source: do not invent facts, examples, numbers, claims, or conclusions. Open with a concise hook, build a clear explanation, and finish with a useful conclusion. The narration must sound natural when read aloud and must not refer to the source document.

Use at most six scenes and only these visual templates:
- process-flow: primaryItems are ordered nodes and secondaryItems is empty.
- comparison: primaryItems and secondaryItems are two labelled sides.
- timeline: primaryItems are ordered stages and secondaryItems is empty.
- callout: primaryItems are concise takeaways and secondaryItems is empty.

Also choose one visual treatment for every scene:
- diagram: use one of the four templates above for processes, comparisons, timelines, and compact callouts.
- agent-workflow: use a central AI agent with orbiting tools and request/result tokens. Use only when an agent or autonomous workflow is genuinely central to the source.
- brand-showcase: use only exact company or product names explicitly present in the source. Put those names in primaryItems without descriptive prose. Never invent a brand.
- network-map: use for hub-and-spoke relationships, integrations, dependencies, and distributed systems.
- metric-focus: use only when the source contains the exact displayed number or claim. Keep that exact number or claim in a primaryItem; never calculate or invent a statistic.
- icon-spotlight: use for one dominant semantic concept with concise supporting chips.

Choose a compatible motion: diagram supports reveal, flow, pulse, or scan; agent-workflow supports flow, orbit, or pulse; brand-showcase supports reveal or drift; network-map supports flow, orbit, or pulse; metric-focus supports reveal, count-up, or pulse; icon-spotlight supports reveal, pulse, scan, or drift. Choose a controlled motif from none, ai-agent, automation, data, search, document, message, analytics, cloud, or security. Use none only for diagrams. Keep template fields truthful and useful as a static fallback: process-flow for agent workflows and network maps, and callout for brand showcases, metric focus, and icon spotlights.

When the video has four or more scenes, target at least three distinct visual treatments and avoid repeating the same treatment in adjacent scenes when the source supports an honest alternative. Truthfulness takes priority over variety.

Divide every scene's spoken narration into semantic beats. Each beat must be one coherent utterance that can be spoken comfortably in a single breath, normally one sentence of roughly eight to twenty-four words. A beat is the speech boundary: start a new beat only where a natural spoken pause belongs.

Divide each beat into short ordered caption phrases, normally two to eight spoken words and never more than 120 characters. Caption phrases are display boundaries only: they are concatenated and synthesized as one continuous utterance without pauses between them. Make the concatenated phrases read as natural prose, and normally put sentence-ending punctuation only on the beat's final phrase. Phrase ids must be unique inside the scene. Together, the phrases are the entire spoken narration: do not add a separate beat-level narration field.

Give every beat an expression value: none, laugh, breath, or sigh. Use none by default. Use laugh only when the source genuinely supports a light or celebratory moment. Use sigh only when the source supports frustration, weariness, or relief. Use breath only when the delivery genuinely calls for an audible inhale; do not add it merely because a beat is the opening hook, a pivot, or a conclusion. Never use expressions on consecutive beats. Expressions are nonverbal delivery cues and must not introduce an emotion that is absent from the source. Keep raw tags such as <laugh> out of narration phrases.

Each visual item must be assigned to exactly one beat using its zero-based index. Indices must appear once, in increasing visual order across the beats. A beat may reveal several items. Never put an item index in two beats. Use empty index arrays when a beat reveals nothing in that lane.

Visible text must be concise enough for video cards. Narration may be more complete, but each beat should contain one coherent spoken thought. Scene ids, beat ids, and phrase ids must be stable lowercase kebab-case strings.

Choose exactly one palette for the complete video based on the source's dominant subject and tone:
- cyan for infrastructure, clarity, precision, and technical subjects.
- violet for artificial intelligence, creativity, abstraction, and future-facing ideas.
- emerald for growth, optimization, reliability, and sustainable systems.
- amber for cost, urgency, caution, tradeoffs, and consequential decisions.
- rose for human impact, conflict, risk, and emotionally significant subjects.
Use cyan when no other palette is clearly more appropriate. Do not vary the palette between scenes.

For every scene, write a concise backgroundPrompt describing an abstract, cinematic visual metaphor for that scene. Keep it color-neutral because the renderer adds the selected palette. It must request no text, logos, user interfaces, or prominent people, and it must keep the center and bottom low-detail for overlays.`;

const sourceContainsLabel = (sourceText: string, label: string): boolean => {
  const source = ` ${normalizeAssetLabel(sourceText)} `;
  const candidate = ` ${normalizeAssetLabel(label)} `;
  return candidate.trim().length > 0 && source.includes(candidate);
};

const numericClaims = (value: string): string[] =>
  value.match(/[+-]?\d[\d,]*(?:\.\d+)?\s*%?/gu)?.map((claim) =>
    claim.replaceAll(',', '').replaceAll(' ', ''),
  ) ?? [];

export const assertSourceBackedNarratedVisuals = ({
  scenes,
  sourceText,
}: {
  scenes: DraftNarrationSceneSuggestion[];
  sourceText: string;
}): void => {
  const sourceNumbers = new Set(numericClaims(sourceText));
  for (const scene of scenes) {
    if (scene.visual.kind === 'brand-showcase') {
      for (const label of [...scene.primaryItems, ...scene.secondaryItems]) {
        if (!sourceContainsLabel(sourceText, label)) {
          throw new Error(
            `Brand showcase label "${label}" in scene ${scene.id} is not present in the source text.`,
          );
        }
      }
    }
    if (scene.visual.kind === 'metric-focus') {
      const metric = scene.primaryItems[0] ?? '';
      const claims = numericClaims(metric);
      const unsupported = claims.find((claim) => !sourceNumbers.has(claim));
      if (unsupported) {
        throw new Error(
          `Metric scene ${scene.id} contains source-unsupported number "${unsupported}".`,
        );
      }
    }
  }
};

export const narratedVisualPlanningWarnings = ({
  registry,
  scenes,
  sourceText,
}: {
  registry: AssetRegistry;
  scenes: DraftNarrationSceneSuggestion[];
  sourceText: string;
}): string[] => {
  const warnings = [...registry.warnings];
  if (scenes.length >= 4 && new Set(scenes.map(({visual}) => visual.kind)).size < 3) {
    warnings.push(
      'The source supported fewer than three truthful visual treatments; the saved plan preserves accuracy over forced variety.',
    );
  }
  if (scenes.some((scene, index) => index > 0 && scene.visual.kind === scenes[index - 1]?.visual.kind)) {
    warnings.push(
      'Adjacent scenes repeat a visual treatment because the planner could not select a truthful alternative.',
    );
  }
  for (const scene of scenes.filter(({visual}) => visual.kind === 'brand-showcase')) {
    for (const label of scene.primaryItems) {
      if (!sourceContainsLabel(sourceText, label)) {
        warnings.push(
          `Brand label "${label}" in scene ${scene.id} is not an exact source-text match; it will render without a logo.`,
        );
        continue;
      }
      if (!exactTechnologyBrandIconFor(label) && !brandAssetForLabel(registry, label)) {
        warnings.push(
          `No exact logo is registered for "${label}" in scene ${scene.id}; a semantic icon and text label will be used.`,
        );
      }
    }
  }
  return [...new Set(warnings)];
};

export const materializeNarratedVisuals = ({
  registry,
  scenes,
}: {
  registry: AssetRegistry;
  scenes: DraftNarrationSceneSuggestion[];
}) => scenes.map((scene) => {
  const supportsMotionAsset =
    scene.visual.kind === 'agent-workflow' ||
    scene.visual.kind === 'icon-spotlight';
  const asset = supportsMotionAsset
    ? motionAssetForMotif(registry, scene.visual.motif)
    : undefined;
  return {
    ...scene,
    visual: {...scene.visual, assetId: asset?.id ?? null},
  };
});

export interface NarrationPlanOptions {
  language: string;
  model: string;
  sourceText: string;
  targetDurationSeconds: number;
}

export const planNarratedVideo = async (
  options: NarrationPlanOptions,
): Promise<DraftNarratedPlan> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is required. Set it in your shell or in a local .env file.',
    );
  }

  const targetWords = Math.max(40, Math.round(options.targetDurationSeconds * 2.15));
  const expressionLimit = maxNarrationExpressionsForDuration(
    options.targetDurationSeconds,
  );
  const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
  const response = await client.responses.parse({
    model: options.model,
    store: false,
    input: [
      {role: 'system', content: SYSTEM_PROMPT},
      {
        role: 'user',
        content:
          `Create a roughly ${options.targetDurationSeconds}-second video in language code ` +
          `"${options.language}". Aim for about ${targetWords} spoken words. ` +
          `Use no more than ${expressionLimit} non-neutral voice ` +
          `expression${expressionLimit === 1 ? '' : 's'} across the complete video.\n\n` +
          `SOURCE:\n${options.sourceText}`,
      },
    ],
    text: {
      format: zodTextFormat(narrationResponseSchema, 'narrated_video_plan'),
    },
  });

  if (!response.output_parsed) {
    throw new Error('OpenAI did not return a usable narrated-video plan.');
  }

  assertSourceBackedNarratedVisuals({
    scenes: response.output_parsed.scenes,
    sourceText: options.sourceText,
  });
  const registry = await loadAssetRegistry();
  const planningWarnings = narratedVisualPlanningWarnings({
    registry,
    scenes: response.output_parsed.scenes,
    sourceText: options.sourceText,
  });

  return draftNarratedPlanSchema.parse({
    version: 5,
    kind: 'narrated-video',
    stage: 'draft',
    sourceText: options.sourceText,
    generatedAt: new Date().toISOString(),
    model: options.model,
    targetDurationSeconds: options.targetDurationSeconds,
    language: options.language,
    ...response.output_parsed,
    planningWarnings,
    scenes: materializeNarratedVisuals({
      registry,
      scenes: response.output_parsed.scenes,
    }),
  });
};

export const narrationScriptMarkdown = (plan: DraftNarratedPlan): string => {
  const sections = plan.scenes.map((scene, sceneIndex) => {
    const narration = scene.beats
      .map((beat) => {
        const text = joinNarrationPhrases(beat.phrases, plan.language);
        return beat.expression === 'none'
          ? text
          : `*[${beat.expression}]* ${text}`;
      })
      .join(plan.language === 'ja' ? '' : ' ');
    return `## Scene ${sceneIndex + 1}: ${scene.title}\n\n${narration}`;
  });

  return `# ${plan.title}\n\n${sections.join('\n\n')}\n`;
};
