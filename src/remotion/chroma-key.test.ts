import {describe, expect, it} from 'vitest';
import {
  chromaKeySafeEffects,
  keySafeFilter,
  keySafeShadow,
  keySafeSurface,
  keySafeOpacity,
  keySafePalette,
} from './chroma-key.js';

describe('chroma-key-safe effects', () => {
  it('disables shadow and filter spill only when chroma key mode is enabled', () => {
    expect(chromaKeySafeEffects(true)).toEqual({
      '--video-chroma-key-filter': 'none',
      '--video-chroma-key-shadow': 'none',
      '--video-chroma-key-surface': '#0F172A',
      '--video-chroma-key-opacity': 1,
      WebkitTextFillColor: '#F8FAFC',
      WebkitTextStroke: '3px #020617',
      paintOrder: 'stroke fill',
    });
    expect(chromaKeySafeEffects(false)).toEqual({});
  });

  it('keeps unrevealed content hidden while allowing opaque green-screen entrances', () => {
    expect(keySafeOpacity(0)).toBe(0);
    expect(keySafeOpacity(0.2)).toBe('var(--video-chroma-key-opacity, 0.2)');
    expect(keySafeOpacity(0.8)).toBe('var(--video-chroma-key-opacity, 0.8)');
    expect(keySafeSurface('rgba(15,23,42,0.92)')).toBe(
      'var(--video-chroma-key-surface, rgba(15,23,42,0.92))',
    );
  });

  it('removes green-heavy accents only from green exports', () => {
    for (const palette of ['cyan', 'emerald', 'violet', 'rose', 'amber'] as const) {
      expect(keySafePalette(palette, false)).toBe(palette);
      expect(keySafePalette(palette, true)).toBe(
        palette === 'cyan' || palette === 'emerald' ? 'violet' : palette,
      );
    }
  });

  it('preserves the styled effect as the non-green fallback', () => {
    expect(keySafeShadow('0 18px 48px rgba(0,0,0,0.5)')).toBe(
      'var(--video-chroma-key-shadow, 0 18px 48px rgba(0,0,0,0.5))',
    );
    expect(keySafeFilter('drop-shadow(0 0 22px #22D3EE66)')).toBe(
      'var(--video-chroma-key-filter, drop-shadow(0 0 22px #22D3EE66))',
    );
  });
});
