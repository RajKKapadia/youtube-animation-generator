import type {CSSProperties} from 'react';
import type {VideoPalette} from '../visual-palettes.js';

const CHROMA_KEY_SHADOW_PROPERTY = '--video-chroma-key-shadow';
const CHROMA_KEY_FILTER_PROPERTY = '--video-chroma-key-filter';

export const chromaKeySafeEffects = (enabled: boolean): CSSProperties => enabled
  ? {
      [CHROMA_KEY_FILTER_PROPERTY]: 'none',
      [CHROMA_KEY_SHADOW_PROPERTY]: 'none',
      '--video-chroma-key-surface': '#0F172A',
      '--video-chroma-key-opacity': 1,
      // Text fill inherits independently of each label's accent color. A hard
      // outline stays readable on light footage without creating a green halo.
      WebkitTextFillColor: '#F8FAFC',
      WebkitTextStroke: '3px #020617',
      paintOrder: 'stroke fill',
    } as CSSProperties
  : {};

export const keySafeShadow = (shadow: string): string =>
  `var(${CHROMA_KEY_SHADOW_PROPERTY}, ${shadow})`;

export const keySafeFilter = (filter: string): string =>
  `var(${CHROMA_KEY_FILTER_PROPERTY}, ${filter})`;

export const keySafeSurface = (surface: string): string =>
  `var(--video-chroma-key-surface, ${surface})`;

// Keep unrevealed items hidden; fade opacity would bake green into the text.
// Transform-based motion and the original opacity outside green mode survive.
export const keySafeOpacity = (opacity: number): number | string => opacity <= 0
  ? 0
  : `var(--video-chroma-key-opacity, ${opacity})`;

export const keySafePalette = (palette: VideoPalette, enabled: boolean): VideoPalette =>
  enabled && (palette === 'emerald' || palette === 'cyan') ? 'violet' : palette;
