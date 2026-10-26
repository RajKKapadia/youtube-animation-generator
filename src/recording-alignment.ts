import {z} from 'zod';
import {normalizeNarrationSpeech} from './narration-speech.js';
import {timedNarratedPlanSchema, type DraftNarratedPlan, type TimedNarratedPlan} from './types.js';

export const recordedWordsSchema = z.array(z.object({
  word: z.string().min(1), startMs: z.number().nonnegative(), endMs: z.number().positive(), probability: z.number().min(0).max(1).prefault(1),
})).min(1).max(20000);
export type RecordedWord = z.infer<typeof recordedWordsSchema>[number];
const FILLERS = new Set('a an the and or but to of in on at for is are was were be been being that this it its um uh well so actually just very really'.split(' '));
const tokenize = (text: string, language: string) => {
  const normalized = normalizeNarrationSpeech(text, language).toLowerCase().replaceAll('’', "'")
    .replace(/\bwe're\b/gu, 'we are').replace(/\bit's\b/gu, 'it is').replace(/\bthat's\b/gu, 'that is').replace(/\bdon't\b/gu, 'do not').replace(/\bcan't\b/gu, 'cannot');
  return normalized.match(language === 'ja' ? /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+/gu : /[\p{L}\p{N}]+/gu) ?? [];
};
const equivalent = (a: string, b: string) => a === b || (a.length > 4 && b.length > 4 && (a + 's' === b || b + 's' === a));

export interface AlignmentReport {
  version: 1;
  accepted: boolean;
  coverage: number;
  problems: string[];
  words: RecordedWord[];
  phrases: Array<{sceneId: string; beatId: string; phraseId: string; startMs: number; endMs: number; matched: number; total: number}>;
}

export const alignRecording = (draft: DraftNarratedPlan, input: unknown, durationMs: number): AlignmentReport => {
  const words = recordedWordsSchema.parse(input);
  const problems: string[] = [];
  let previous = 0;
  for (const word of words) {
    if (word.startMs < previous || word.endMs <= word.startMs || word.endMs > durationMs + 20) problems.push(`Invalid or overlapping word timing near "${word.word}".`);
    previous = word.endMs;
  }
  const phrases = draft.scenes.flatMap(scene => scene.beats.flatMap(beat => beat.phrases.map(phrase => ({sceneId: scene.id, beatId: beat.id, phraseId: phrase.id, tokens: tokenize(phrase.text, draft.language)}))));
  const expected = phrases.flatMap(phrase => phrase.tokens);
  // Normalize numeric groups together: "1,200" and "twelve hundred" cannot silently become unrelated tokens.
  const heard = words.flatMap((word, index) => tokenize(word.word, draft.language).map(token => ({token, index})));
  const n = expected.length, m = heard.length;
  if (!n || !m || (n + 1) * (m + 1) > 8_000_000) throw new Error('Recording alignment is empty or too large. Split the project into smaller videos.');
  const width = m + 1, costs = new Uint16Array((n + 1) * width);
  for (let i = 0; i <= n; i++) costs[i * width] = i;
  for (let j = 0; j <= m; j++) costs[j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    costs[i * width + j] = Math.min(costs[(i - 1) * width + j]! + 1, costs[i * width + j - 1]! + 1, costs[(i - 1) * width + j - 1]! + (equivalent(expected[i - 1]!, heard[j - 1]!.token) ? 0 : 1));
  }
  const matched = new Map<number, number>(); let i = n, j = m;
  while (i || j) {
    const value = costs[i * width + j]!;
    if (i && j && equivalent(expected[i - 1]!, heard[j - 1]!.token) && value === costs[(i - 1) * width + j - 1]) {matched.set(i - 1, heard[j - 1]!.index); i--; j--;}
    else if (j && value === costs[i * width + j - 1]! + 1) {
      if (!FILLERS.has(heard[j - 1]!.token)) problems.push(`Unexpected or repeated recorded word "${heard[j - 1]!.token}" near ${words[heard[j - 1]!.index]!.startMs}ms.`);
      j--;
    } else if (i && value === costs[(i - 1) * width + j]! + 1) {
      if (!FILLERS.has(expected[i - 1]!)) problems.push(`Missing or changed script word "${expected[i - 1]}".`);
      i--;
    } else {
      if (!FILLERS.has(expected[i - 1]!) || !FILLERS.has(heard[j - 1]!.token)) problems.push(`Script "${expected[i - 1]}" differs from recording "${heard[j - 1]!.token}".`);
      i--; j--;
    }
  }
  let offset = 0;
  const aligned = phrases.map(phrase => {
    const indices = phrase.tokens.flatMap((_, index) => matched.has(offset + index) ? [matched.get(offset + index)!] : []); offset += phrase.tokens.length;
    if (!indices.length || indices.length / Math.max(1, phrase.tokens.length) < .8) problems.push(`Uncertain or missing phrase ${phrase.phraseId}.`);
    if (indices.some(index => words[index]!.probability < .35)) problems.push(`Low-confidence speech in phrase ${phrase.phraseId}; review the transcript.`);
    return {sceneId: phrase.sceneId, beatId: phrase.beatId, phraseId: phrase.phraseId, startMs: Math.round(words[indices[0] ?? 0]!.startMs), endMs: Math.round(words[indices.at(-1) ?? 0]!.endMs), matched: indices.length, total: phrase.tokens.length};
  });
  const coverage = matched.size / Math.max(1, n);
  if (coverage < .9) problems.push(`Script coverage ${(coverage * 100).toFixed(1)}% is below 90%.`);
  return {version: 1, accepted: problems.length === 0, coverage, problems: [...new Set(problems)], words, phrases: aligned};
};

export const materializeRecordedPlan = (draft: DraftNarratedPlan, report: AlignmentReport, audio: {durationMs: number; sampleRate: number; totalSamples: number; voiceoverFile: string; originalFile: string; sha256: string; playbackSha256: string}): TimedNarratedPlan => {
  if (!report.accepted) throw new Error(`Recording does not match the script: ${report.problems.slice(0, 6).join(' ')}`);
  const scenes = draft.scenes.map((scene, index) => {
    const first = report.phrases.find(phrase => phrase.sceneId === scene.id)!;
    const next = draft.scenes[index + 1];
    const nextFirst = next ? report.phrases.find(phrase => phrase.sceneId === next.id)!.startMs : audio.durationMs;
    const startMs = index === 0 ? 0 : first.startMs;
    const durationMs = nextFirst - startMs;
    const beats = scene.beats.map(beat => {
      const timings = report.phrases.filter(phrase => phrase.sceneId === scene.id && phrase.beatId === beat.id);
      const start = timings[0]!.startMs - startMs, end = timings.at(-1)!.endMs - startMs;
      return {...beat, startMs: start, durationMs: Math.max(1, end - start), audioFile: audio.voiceoverFile, sampleCount: Math.round((end - start) / 1000 * audio.sampleRate), phrases: beat.phrases.map(phrase => {
        const timing = timings.find(item => item.phraseId === phrase.id)!;
        return {...phrase, startMs: timing.startMs - startMs, durationMs: Math.max(1, timing.endMs - timing.startMs), sampleCount: Math.round((timing.endMs - timing.startMs) / 1000 * audio.sampleRate)};
      })};
    });
    const anchors = (lane: 'primaryItemIndices' | 'secondaryItemIndices', count: number) => Array.from({length: count}, (_, itemIndex) => {const beat = beats.find(beat => beat[lane].includes(itemIndex))!; return {beatId: beat.id, startMs: beat.startMs};});
    return {...scene, startMs, durationMs, beats, primaryItemTimings: anchors('primaryItemIndices', scene.primaryItems.length), secondaryItemTimings: anchors('secondaryItemIndices', scene.secondaryItems.length)};
  });
  return timedNarratedPlanSchema.parse({...draft, stage: 'timed', audioSource: {kind: 'recorded', original: {file: audio.originalFile, sha256: audio.sha256}, playback: {file: audio.voiceoverFile, sha256: audio.playbackSha256}, alignmentReport: 'alignment/report.json'}, voiceoverFile: audio.voiceoverFile, sampleRate: audio.sampleRate, totalSamples: audio.totalSamples, durationMs: audio.durationMs, voiceoverPlaybackRate: 1, scenes});
};
