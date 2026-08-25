import {describe, expect, it} from 'vitest';
import {
  hexToRgba,
  VIDEO_PALETTES,
  videoPaletteFor,
  videoPaletteSchema,
} from './visual-palettes.js';

const luminance = (hex: string): number => {
  const value = hex.replace(/^#/u, '');
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
};

const contrast = (left: string, right: string): number => {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
};

describe('video palettes', () => {
  it('defines every validated palette with complete six-digit color tokens', () => {
    expect(Object.keys(VIDEO_PALETTES)).toEqual([
      'cyan',
      'violet',
      'emerald',
      'amber',
      'rose',
    ]);
    for (const id of videoPaletteSchema.options) {
      const palette = videoPaletteFor(id);
      for (const color of [
        ...Object.values(palette.background),
        ...Object.values(palette.accents),
      ]) {
        expect(color).toMatch(/^#[\dA-F]{6}$/u);
      }
      expect(palette.generatedImageDirection).not.toHaveLength(0);
      expect(palette.intendedFit).not.toHaveLength(0);
    }
  });

  it('keeps white text and both diagram accents legible on every dark base', () => {
    for (const palette of Object.values(VIDEO_PALETTES)) {
      for (const background of Object.values(palette.background)) {
        expect(contrast('#F8FAFC', background)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(palette.accents.primary, palette.background.start))
        .toBeGreaterThanOrEqual(3);
      expect(contrast(palette.accents.secondary, palette.background.start))
        .toBeGreaterThanOrEqual(3);
    }
  });

  it('derives deterministic alpha colors from catalog hex values', () => {
    expect(hexToRgba('#22D3EE', 0.46)).toBe('rgba(34, 211, 238, 0.46)');
    expect(() => hexToRgba('cyan', 0.5)).toThrow('six-digit hex color');
  });
});
