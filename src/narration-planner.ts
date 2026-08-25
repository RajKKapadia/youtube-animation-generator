import OpenAI from 'openai';
import {zodTextFormat} from 'openai/helpers/zod';
import {z} from 'zod';
import {
  draftNarrationSceneSchema,
  draftNarratedPlanSchema,
  maxNarrationExpressionsForDuration,
  type DraftNarratedPlan,
} from './types.js';
import {joinNarrationPhrases} from './narration-text.js';

export {joinNarrationPhrases} from './narration-text.js';

const narrationResponseSchema = z.object({
  title: z.string().min(1).max(100),
  scenes: z.array(draftNarrationSceneSchema).min(1).max(6),
});

const SYSTEM_PROMPT = `You are a precise visual writer and director for short educational videos.

Turn the supplied source into a self-contained narration and storyboard. Stay faithful to the source: do not invent facts, examples, numbers, claims, or conclusions. Open with a concise hook, build a clear explanation, and finish with a useful conclusion. The narration must sound natural when read aloud and must not refer to the source document.

Use at most six scenes and only these visual templates:
- process-flow: primaryItems are ordered nodes and secondaryItems is empty.
- comparison: primaryItems and secondaryItems are two labelled sides.
- timeline: primaryItems are ordered stages and secondaryItems is empty.
- callout: primaryItems are concise takeaways and secondaryItems is empty.

Divide every scene's spoken narration into semantic beats. Each beat must be one coherent utterance that can be spoken comfortably in a single breath, normally one sentence of roughly eight to twenty-four words. A beat is the speech boundary: start a new beat only where a natural spoken pause belongs.

Divide each beat into short ordered caption phrases, normally two to eight spoken words and never more than 120 characters. Caption phrases are display boundaries only: they are concatenated and synthesized as one continuous utterance without pauses between them. Make the concatenated phrases read as natural prose, and normally put sentence-ending punctuation only on the beat's final phrase. Phrase ids must be unique inside the scene. Together, the phrases are the entire spoken narration: do not add a separate beat-level narration field.

Give every beat an expression value: none, laugh, breath, or sigh. Use none by default. Use laugh only when the source genuinely supports a light or celebratory moment. Use sigh only when the source supports frustration, weariness, or relief. Use breath only when the delivery genuinely calls for an audible inhale; do not add it merely because a beat is the opening hook, a pivot, or a conclusion. Never use expressions on consecutive beats. Expressions are nonverbal delivery cues and must not introduce an emotion that is absent from the source. Keep raw tags such as <laugh> out of narration phrases.

Each visual item must be assigned to exactly one beat using its zero-based index. Indices must appear once, in increasing visual order across the beats. A beat may reveal several items. Never put an item index in two beats. Use empty index arrays when a beat reveals nothing in that lane.

Visible text must be concise enough for video cards. Narration may be more complete, but each beat should contain one coherent spoken thought. Scene ids, beat ids, and phrase ids must be stable lowercase kebab-case strings.

For every scene, write a concise backgroundPrompt describing an abstract, cinematic visual metaphor for that scene. It must request no text, logos, user interfaces, or prominent people; it must keep the center and bottom low-detail for overlays; and it must suit a dark navy, cyan, and violet technical palette.`;

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

  return draftNarratedPlanSchema.parse({
    version: 3,
    kind: 'narrated-video',
    stage: 'draft',
    sourceText: options.sourceText,
    generatedAt: new Date().toISOString(),
    model: options.model,
    targetDurationSeconds: options.targetDurationSeconds,
    language: options.language,
    ...response.output_parsed,
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
