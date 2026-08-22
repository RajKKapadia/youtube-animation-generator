import {describe, expect, it} from 'vitest';
import {fitTextToBox} from './text-fit.js';

const approximateWidth = (text: string, fontSize: number): number =>
  text.length * fontSize * 0.54;

describe('fitTextToBox', () => {
  it('reduces and wraps a long card label without losing words', () => {
    const text = 'Store knowledge in vector database';
    const result = fitTextToBox({
      lineHeight: 1.15,
      maxFontSize: 29,
      maxHeight: 140,
      maxLines: 5,
      maxWidth: 194,
      measureWidth: approximateWidth,
      text,
    });

    expect(result.fontSize).toBeLessThanOrEqual(29);
    expect(result.lines.length).toBeLessThanOrEqual(5);
    expect(result.lines.length * result.fontSize * 1.15).toBeLessThanOrEqual(140);
    expect(result.lines.join(' ')).toBe(text);
  });

  it('breaks an unusually long token instead of overflowing horizontally', () => {
    const text = 'averylongunbrokenconfigurationidentifierthatexceedsthecardwidth';
    const result = fitTextToBox({
      lineHeight: 1.15,
      maxFontSize: 24,
      maxHeight: 140,
      maxLines: 5,
      maxWidth: 194,
      measureWidth: approximateWidth,
      text,
    });

    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.lines.join('')).toBe(text);
    expect(
      result.lines.every((line) => approximateWidth(line, result.fontSize) <= 194),
    ).toBe(true);
  });

  it('keeps short labels at the preferred font size', () => {
    const result = fitTextToBox({
      lineHeight: 1.15,
      maxFontSize: 29,
      maxHeight: 140,
      maxLines: 5,
      maxWidth: 194,
      measureWidth: approximateWidth,
      text: 'Start Redis',
    });

    expect(result.fontSize).toBe(29);
    expect(result.lines).toEqual(['Start Redis']);
  });
});
