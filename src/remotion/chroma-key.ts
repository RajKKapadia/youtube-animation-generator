import type {CSSProperties} from 'react';

const CHROMA_KEY_SHADOW_PROPERTY = '--video-chroma-key-shadow';
const CHROMA_KEY_FILTER_PROPERTY = '--video-chroma-key-filter';

export const chromaKeySafeEffects = (enabled: boolean): CSSProperties => enabled
  ? {
      [CHROMA_KEY_FILTER_PROPERTY]: 'none',
      [CHROMA_KEY_SHADOW_PROPERTY]: 'none',
    } as CSSProperties
  : {};

export const keySafeShadow = (shadow: string): string =>
  `var(${CHROMA_KEY_SHADOW_PROPERTY}, ${shadow})`;

export const keySafeFilter = (filter: string): string =>
  `var(${CHROMA_KEY_FILTER_PROPERTY}, ${filter})`;
