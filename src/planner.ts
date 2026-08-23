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

Every suggestion must reference existing cueIndex values. Use the smallest consecutive cue range that contains the complete explanation. Do not overlap suggestions. Keep all visible text concise. Return suggestions in chronological order.

Speech-align every visible item:
- primaryItemStartCues must contain exactly one cueIndex for each primaryItems entry, in the same order.
- secondaryItemStartCues must contain exactly one cueIndex for each secondaryItems entry, in the same order. Return an empty array when there are no secondary items.
- Anchor each item to the cue where its concept is first spoken. Repeat a cueIndex when several items are introduced in the same cue.
- Every item cue must be inside the suggestion's startCue/endCue range and each array must be chronological.
- Do not invent an item that cannot be anchored to a specific spoken cue.`;

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

  const validateItemCues = (
    itemCues: number[],
    items: string[],
    fieldName: string,
  ): void => {
    if (itemCues.length !== items.length) {
      throw new Error(
        `AI returned ${fieldName} without one speech cue per item.`,
      );
    }

    let previousCue = suggestion.startCue;
    for (const cueIndex of itemCues) {
      if (cueIndex < suggestion.startCue || cueIndex > suggestion.endCue) {
        throw new Error(
          `AI returned a ${fieldName} cue outside its animation range: ${cueIndex}.`,
        );
      }
      if (!cues[cueIndex - 1]) {
        throw new Error(
          `AI referenced a cue outside the subtitle file: ${cueIndex}.`,
        );
      }
      if (cueIndex < previousCue) {
        throw new Error(`AI returned ${fieldName} cues out of chronological order.`);
      }
      previousCue = cueIndex;
    }
  };

  validateItemCues(
    suggestion.primaryItemStartCues,
    suggestion.primaryItems,
    'primary item',
  );
  validateItemCues(
    suggestion.secondaryItemStartCues,
    suggestion.secondaryItems,
    'secondary item',
  );
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

    const materializeItemTimings = (itemCues: number[]) =>
      itemCues.map((cueIndex) => ({
        cueIndex,
        startMs: cues[cueIndex - 1]!.startMs - firstCue.startMs,
      }));

    const {
      primaryItemStartCues,
      secondaryItemStartCues,
      ...animationContent
    } = suggestion;

    return {
      ...animationContent,
      id: `animation-${String(index + 1).padStart(2, '0')}`,
      sourceStartMs: firstCue.startMs,
      sourceEndMs: lastCue.endMs,
      durationMs: lastCue.endMs - firstCue.startMs,
      transcript: selectedCues.map((cue) => cue.text).join(' '),
      primaryItemTimings: materializeItemTimings(primaryItemStartCues),
      secondaryItemTimings: materializeItemTimings(secondaryItemStartCues),
    };
  });
};

export interface SuggestionOverlapResolution {
  suggestions: AnimationSuggestion[];
  warnings: string[];
}

/**
 * Uses earliest-finish interval scheduling to retain the largest possible
 * number of non-overlapping suggestions. Structured Outputs can constrain
 * individual ranges, but cannot enforce relationships between array entries.
 */
export const resolveOverlappingSuggestions = (
  suggestions: AnimationSuggestion[],
  cues: SubtitleCue[],
): SuggestionOverlapResolution => {
  const candidates = suggestions.map((suggestion, originalIndex) => {
    validateSuggestion(suggestion, cues);
    return {originalIndex, suggestion};
  });
  candidates.sort(
    (left, right) =>
      left.suggestion.endCue - right.suggestion.endCue ||
      left.suggestion.startCue - right.suggestion.startCue ||
      left.originalIndex - right.originalIndex,
  );

  const selected: typeof candidates = [];
  const warnings: string[] = [];

  for (const candidate of candidates) {
    const previous = selected.at(-1);
    if (
      previous &&
      candidate.suggestion.startCue <= previous.suggestion.endCue
    ) {
      warnings.push(
        `Dropped overlapping suggestion "${candidate.suggestion.title}" ` +
          `(cues ${candidate.suggestion.startCue}-${candidate.suggestion.endCue}); ` +
          `it conflicts with selected "${previous.suggestion.title}" ` +
          `(cues ${previous.suggestion.startCue}-${previous.suggestion.endCue}).`,
      );
      continue;
    }
    selected.push(candidate);
  }

  selected.sort(
    (left, right) =>
      left.suggestion.startCue - right.suggestion.startCue ||
      left.originalIndex - right.originalIndex,
  );

  return {
    suggestions: selected.map(({suggestion}) => suggestion),
    warnings,
  };
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

  const candidates = response.output_parsed.animations.slice(
    0,
    options.maxSuggestions,
  );
  const resolution = resolveOverlappingSuggestions(candidates, cues);

  return {
    version: 1,
    sourceSubtitle: options.sourceSubtitle,
    generatedAt: new Date().toISOString(),
    model: options.model,
    ...(resolution.warnings.length > 0
      ? {planningWarnings: resolution.warnings}
      : {}),
    clips: materializeSuggestions(resolution.suggestions, cues),
  };
};
