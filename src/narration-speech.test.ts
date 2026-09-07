import {describe, expect, it} from 'vitest';
import {normalizeNarrationSpeech} from './narration-speech.js';

const speak = (text: string) => normalizeNarrationSpeech(text, 'en');

describe('English narration pronunciation', () => {
  it.each([
    ['−₹3,111.94 Cr', 'minus three thousand one hundred and eleven point nine four crore rupees'],
    ['+₹8,930.12 crore', 'plus eight thousand nine hundred and thirty point one two crore rupees'],
    ['+₹5,818.18 crore', 'plus five thousand eight hundred and eighteen point one eight crore rupees'],
    ['₹1,23,456.00', 'one lakh twenty three thousand four hundred and fifty six point zero zero rupees'],
    ['₹1,234,567', 'twelve lakh thirty four thousand five hundred and sixty seven rupees'],
    ['1,234,567', 'one million two hundred and thirty four thousand five hundred and sixty seven'],
    ['1,23,456', 'one lakh twenty three thousand four hundred and fifty six'],
    ['−0.0500%', 'minus zero point zero five zero zero percent'],
    ['±.05%', 'plus or minus zero point zero five percent'],
    ['0.00, 007', 'zero point zero zero, zero zero seven'],
    ['$5.2M', 'five point two million dollars'],
    ['USD 12.50', 'twelve point five zero US dollars'],
    ['EUR 1', 'one euro'],
    ['£2 billion', 'two billion pounds'],
    ['INR500', 'five hundred rupees'],
    ['Rs.12.50', 'twelve point five zero rupees'],
    ['₹− 2.00', 'minus two point zero zero rupees'],
    ['2 lakh and 3.76 Cr', 'two lakh and three point seven six crore'],
    ['25K users', 'twenty five thousand users'],
    ['9007199254740993', 'nine quadrillion seven trillion one hundred and ninety nine billion two hundred and fifty four million seven hundred and forty thousand nine hundred and ninety three'],
  ])('verbalizes %s without rounding or losing units', (input, expected) => {
    expect(speak(input)).toBe(expected);
    expect(speak(expected)).toBe(expected);
  });

  it('expands only the known financial initialisms and preserves prose punctuation', () => {
    expect(speak('FII minus ₹3,111.94 crore, DII plus ₹8,930.12 crore.')).toBe(
      'foreign institutional investors minus three thousand one hundred and eleven point nine four crore rupees, domestic institutional investors plus eight thousand nine hundred and thirty point one two crore rupees.',
    );
    expect(speak('FIIs, DIIs and FPIs use the API.')).toBe(
      'foreign institutional investors, domestic institutional investors and foreign portfolio investors use the API.',
    );
    expect(speak('Total:\n  ₹5.00.\nNext: 12.')).toBe('Total:\n  five point zero zero rupees.\nNext: twelve.');
  });

  it.each([
    'v1.2.3 and GPT-5 and H264 and M3 and report-2026.pdf',
    '2026-09-07, 07/09/2026, 10:30, 3/4, 5-10 and 5–10',
    '192.168.1.1, 1e-6, 2.3E+8, 20kg, 128MB and 1.23ms',
    'https://example.com/FII/123.45 and foo123@example.com and `x = 1.2`',
    'Invalid groups: 1,23 or 123,45,678 or 1,2,3.',
  ])('does not partially rewrite ambiguous literals: %s', (input) => {
    expect(speak(input)).toBe(input);
  });

  it('does not introduce English words in another language or language auto-detection', () => {
    for (const language of ['hi', 'ja', 'de', 'na']) {
      expect(normalizeNarrationSpeech('₹8,930.12 crore; 12.05%', language)).toBe('₹8,930.12 crore; 12.05%');
    }
  });
});
