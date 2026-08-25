import type {NarrationPhrase} from './types.js';

type SpokenPhrase = Pick<NarrationPhrase, 'text'>;

export const joinNarrationPhrases = (
  phrases: readonly SpokenPhrase[],
  language: string,
): string => phrases
  .map(({text}) => text.trim())
  .join(language === 'ja' ? '' : ' ');

const LETTER_OR_NUMBER = /[\p{L}\p{N}]/gu;
const WORD = /[\p{L}\p{N}]+/gu;
const SENTENCE_PUNCTUATION = /[.!?\u3002\uff01\uff1f]/gu;
const CLAUSE_PUNCTUATION = /[,;:\u3001\uff0c\uff1b\uff1a\u2014]/gu;

const matchCount = (text: string, pattern: RegExp): number =>
  Array.from(text.matchAll(pattern)).length;

export const narrationPhraseTimingWeight = (text: string): number => {
  const normalized = text.normalize('NFKC');
  const spokenCharacters = matchCount(normalized, LETTER_OR_NUMBER);
  const words = matchCount(normalized, WORD);
  const sentencePauses = matchCount(normalized, SENTENCE_PUNCTUATION);
  const clausePauses = matchCount(normalized, CLAUSE_PUNCTUATION);

  return Math.max(
    1,
    spokenCharacters + words * 2 + sentencePauses * 4 + clausePauses * 2,
  );
};

export const allocateNarrationPhraseSamples = (
  phrases: readonly SpokenPhrase[],
  totalSamples: number,
): number[] => {
  if (!Number.isInteger(totalSamples) || totalSamples < phrases.length) {
    throw new Error(
      `Cannot allocate ${totalSamples} audio samples across ${phrases.length} narration phrases.`,
    );
  }
  if (phrases.length === 0) {
    throw new Error('Cannot allocate audio samples without narration phrases.');
  }

  const weights = phrases.map(({text}) => narrationPhraseTimingWeight(text));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const distributableSamples = totalSamples - phrases.length;
  const exactExtras = weights.map(
    (weight) => (weight / totalWeight) * distributableSamples,
  );
  const allocations = exactExtras.map((samples) => Math.floor(samples) + 1);
  const allocatedSamples = allocations.reduce((sum, samples) => sum + samples, 0);
  const remainingSamples = totalSamples - allocatedSamples;
  const remainderOrder = exactExtras
    .map((samples, index) => ({fraction: samples - Math.floor(samples), index}))
    .sort((left, right) =>
      right.fraction - left.fraction || left.index - right.index,
  );

  for (let index = 0; index < remainingSamples; index++) {
    const allocationIndex = remainderOrder[index]!.index;
    allocations[allocationIndex] = allocations[allocationIndex]! + 1;
  }

  return allocations;
};
