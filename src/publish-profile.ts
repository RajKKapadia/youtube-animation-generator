import type {
  AspectRatioSelection,
  RenderAspectRatio,
  RenderProfile,
} from './types.js';

export const PUBLISH_COVER_PROFILES: Record<RenderAspectRatio, RenderProfile> = {
  '16:9': {
    aspectRatio: '16:9',
    width: 1280,
    height: 720,
    safeArea: {top: 44, right: 54, bottom: 44, left: 54},
  },
  '9:16': {
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    safeArea: {top: 120, right: 72, bottom: 180, left: 72},
  },
};

export const publishCoverProfilesForSelection = (
  selection: AspectRatioSelection,
): RenderProfile[] => selection === 'both'
  ? [PUBLISH_COVER_PROFILES['16:9'], PUBLISH_COVER_PROFILES['9:16']]
  : [PUBLISH_COVER_PROFILES[selection]];

export const publishCoverSuffix = (aspectRatio: RenderAspectRatio): string =>
  aspectRatio === '9:16' ? '.cover-9x16.png' : '.thumbnail.png';
