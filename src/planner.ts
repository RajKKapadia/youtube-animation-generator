import OpenAI from 'openai';
import {zodTextFormat} from 'openai/helpers/zod';
import {
  animationPlanResponseSchema,
  type AnimationClip,
  type AnimationSuggestion,
  type SavedPlan,
  type SubtitleCue,
} from './types.js';
import {formatTimestamp} from './subtitles.js';

const SYSTEM_PROMPT = `You are a visual director for technical YouTube videos.

Select only transcript sections where a short animation materially improves understanding. Prefer processes, architecture, comparisons, sequences, important definitions, and meaningful statistics. Do not suggest visuals for introductions, transitions, casual commentary, jokes, or sentences that are already obvious.

Choose from exactly these templates:
- process-flow: primaryItems are ordered nodes in a flow.
- comparison: primaryItems are left-side bullets, secondaryItems are right-side bullets, and both labels are required.
- timeline: primaryItems are ordered steps.
- callout: primaryItems contain one to three short phrases; labels must be empty strings.

Every suggestion must reference existing cueIndex values. Use the smallest consecutive cue range that contains the complete explanation. Do not overlap suggestions. Keep all visible text concise. Return suggestions in chronological order.`;

const serializeCues = (cues: SubtitleCue[]): string =>
  cues
    .map(
      (cue) =>
        `[${cue.cueIndex}] ${formatTimestamp(cue.startMs)}-${formatTimestamp(cue.endMs)} ${cue.text}`,
    )
    .join('\n');

const validateSuggestion = (
  suggestion: AnimationSuggestion,
  cues: SubtitleCue[],
): void => {
  if (suggestion.startCue > suggestion.endCue) {
    throw new Error(
      `AI returned an invalid cue range: ${suggestion.startCue}-${suggestion.endCue}.`,
    );
  }

  if (!cues[suggestion.startCue - 1] || !cues[suggestion.endCue - 1]) {
    throw new Error(
      `AI referenced a cue outside the subtitle file: ${suggestion.startCue}-${suggestion.endCue}.`,
    );
  }

  if (
    suggestion.template === 'comparison' &&
    (!suggestion.leftLabel ||
      !suggestion.rightLabel ||
      suggestion.secondaryItems.length === 0)
  ) {
    throw new Error('AI returned a comparison without two labelled sides.');
  }
};

export const materializeSuggestions = (
  suggestions: AnimationSuggestion[],
  cues: SubtitleCue[],
): AnimationClip[] => {
  const sorted = [...suggestions].sort((a, b) => a.startCue - b.startCue);
  let previousEndCue = 0;

  return sorted.map((suggestion, index) => {
    validateSuggestion(suggestion, cues);

    if (suggestion.startCue <= previousEndCue) {
      throw new Error(
        `AI returned overlapping animations near cue ${suggestion.startCue}.`,
      );
    }
    previousEndCue = suggestion.endCue;

    const selectedCues = cues.slice(suggestion.startCue - 1, suggestion.endCue);
    const firstCue = selectedCues[0];
    const lastCue = selectedCues.at(-1);
    if (!firstCue || !lastCue) {
      throw new Error('Could not resolve an AI-selected subtitle range.');
    }

    return {
      ...suggestion,
      id: `animation-${String(index + 1).padStart(2, '0')}`,
      sourceStartMs: firstCue.startMs,
      sourceEndMs: lastCue.endMs,
      durationMs: lastCue.endMs - firstCue.startMs,
      transcript: selectedCues.map((cue) => cue.text).join(' '),
    };
  });
};

export interface PlanOptions {
  model: string;
  maxSuggestions: number;
  sourceSubtitle: string;
}

export const planAnimations = async (
  cues: SubtitleCue[],
  options: PlanOptions,
): Promise<SavedPlan> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is required. Set it in your shell or in a local .env file.',
    );
  }

  const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
  const response = await client.responses.parse({
    model: options.model,
    store: false,
    input: [
      {role: 'system', content: SYSTEM_PROMPT},
      {
        role: 'user',
        content: `Suggest at most ${options.maxSuggestions} meaningful animations for these subtitle cues:\n\n${serializeCues(cues)}`,
      },
    ],
    text: {
      format: zodTextFormat(animationPlanResponseSchema, 'animation_plan'),
    },
  });

  if (!response.output_parsed) {
    throw new Error('OpenAI did not return a usable animation plan.');
  }

  const suggestions = response.output_parsed.animations.slice(
    0,
    options.maxSuggestions,
  );

  return {
    version: 1,
    sourceSubtitle: options.sourceSubtitle,
    generatedAt: new Date().toISOString(),
    model: options.model,
    clips: materializeSuggestions(suggestions, cues),
  };
};
