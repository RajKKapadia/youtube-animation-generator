import {joinNarrationPhrases} from './narration-text.js';
import {normalizeNarrationSpeech} from './narration-speech.js';
import {BETWEEN_BEATS_SECONDS, SCENE_POST_ROLL_SECONDS, SCENE_PRE_ROLL_SECONDS} from './supertonic/synthesis.js';

export const NARRATION_DURATION_TOLERANCE_SECONDS = 15;
// Conservative planning estimates, not a promise about a particular voice.
// Measured PCM duration is checked separately before rendering.
const DEFAULT_TTS_SPEED = 1.05;
const WORDS_PER_SECOND = 1.85;
const JAPANESE_CHARACTERS_PER_SECOND = 3.7;

interface NarrationSceneText {
  beats: Array<{expression?: string; phrases: Array<{text: string}>}>;
}

export const narrationSpeechUnits = (text: string, language: string): number => {
  const spoken = normalizeNarrationSpeech(text, language);
  return language === 'ja'
    ? (spoken.match(/[\p{L}\p{N}]/gu) ?? []).length
    : spoken.split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
};

export const narrationDurationBudget = (
  targetDurationSeconds: number,
  language: string,
  speed = DEFAULT_TTS_SPEED,
  pointCount = 1,
) => {
  const unitsPerSecond = (language === 'ja' ? JAPANESE_CHARACTERS_PER_SECOND : WORDS_PER_SECOND) * speed / DEFAULT_TTS_SPEED;
  // Reserve room for scene boundaries and a few semantic beats per topic.
  const reservedSeconds = Math.max(1, pointCount) * 0.9;
  const maximumSeconds = targetDurationSeconds + NARRATION_DURATION_TOLERANCE_SECONDS;
  const targetUnits = Math.max(1, Math.floor((targetDurationSeconds - reservedSeconds) * unitsPerSecond));
  return {targetUnits, maximumSeconds, unitsPerSecond, unitLabel: language === 'ja' ? 'spoken characters' : 'spoken words'};
};

export const estimateNarrationDuration = (
  scenes: NarrationSceneText[],
  language: string,
  speed = DEFAULT_TTS_SPEED,
) => {
  const {unitsPerSecond, unitLabel} = narrationDurationBudget(1, language, speed);
  let units = 0;
  let pauseSeconds = 0;
  for (const scene of scenes) {
    pauseSeconds += SCENE_PRE_ROLL_SECONDS + SCENE_POST_ROLL_SECONDS
      + Math.max(0, scene.beats.length - 1) * BETWEEN_BEATS_SECONDS;
    for (const beat of scene.beats) {
      units += narrationSpeechUnits(joinNarrationPhrases(beat.phrases, language), language);
      if (beat.expression && beat.expression !== 'none') pauseSeconds += 1;
    }
  }
  // Above 1.3, the audio pipeline applies the remaining speed in playback,
  // including the inserted silence. Below that only speech changes speed.
  pauseSeconds /= Math.max(1, speed / 1.3);
  return {units, unitLabel, pauseSeconds, seconds: units / unitsPerSecond + pauseSeconds};
};

export const draftNarrationDurationIssue = (
  plan: {scenes: NarrationSceneText[]; language: string; targetDurationSeconds: number},
  speed = DEFAULT_TTS_SPEED,
): string | undefined => {
  const estimate = estimateNarrationDuration(plan.scenes, plan.language, speed);
  const budget = narrationDurationBudget(plan.targetDurationSeconds, plan.language, speed);
  if (estimate.seconds <= budget.maximumSeconds) return undefined;
  const maximumUnits = Math.max(0, Math.floor((budget.maximumSeconds - estimate.pauseSeconds) * budget.unitsPerSecond));
  return `Narration exceeds the duration budget: ${estimate.units} ${estimate.unitLabel}, estimated ${estimate.seconds.toFixed(1)}s for a ${plan.targetDurationSeconds}s target (maximum ${budget.maximumSeconds}s including ${NARRATION_DURATION_TOLERANCE_SECONDS}s tolerance). `
    + `Rewrite toward ${budget.targetUnits} ${estimate.unitLabel} total and no more than ${maximumUnits} with this scene structure. `
    + 'Cover EVERY source point and preserve essential qualifications. Shorten each explanation, remove repeated framing and optional details, and update visual items, beat anchors and sourceCoverage together. Do not omit topics, truncate sentences or increase speech speed. If faithful coverage cannot fit, request a longer target.';
};

export const assertDraftNarrationDuration = (
  plan: Parameters<typeof draftNarrationDurationIssue>[0],
  speed = DEFAULT_TTS_SPEED,
): void => {
  const issue = draftNarrationDurationIssue(plan, speed);
  if (issue) throw new Error(`${issue} Edit the draft plan or recreate it from the source with a longer --target-duration; --render-plan never rewrites narration.`);
};

export const assertMeasuredNarrationDuration = (
  plan: {durationMs: number; targetDurationSeconds: number},
): void => {
  const maximumSeconds = plan.targetDurationSeconds + NARRATION_DURATION_TOLERANCE_SECONDS;
  if (plan.durationMs <= maximumSeconds * 1000) return;
  throw new Error(`Measured narration is ${(plan.durationMs / 1000).toFixed(1)}s for a ${plan.targetDurationSeconds}s target; the maximum is ${maximumSeconds}s including ${NARRATION_DURATION_TOLERANCE_SECONDS}s tolerance. Video rendering stopped. Shorten the draft narration and regenerate its audio, or recreate the plan with a longer --target-duration. Saved audio and timed plans remain available for review; --render-plan never rewrites narration.`);
};
