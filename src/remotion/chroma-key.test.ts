import {describe, expect, it} from 'vitest';
import {
  chromaKeySafeEffects,
  keySafeFilter,
  keySafeShadow,
} from './chroma-key.js';

describe('chroma-key-safe effects', () => {
  it('disables shadow and filter spill only when chroma key mode is enabled', () => {
    expect(chromaKeySafeEffects(true)).toEqual({
      '--video-chroma-key-filter': 'none',
      '--video-chroma-key-shadow': 'none',
    });
    expect(chromaKeySafeEffects(false)).toEqual({});
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
