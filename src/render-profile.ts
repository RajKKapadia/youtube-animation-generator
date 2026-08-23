import type {
  AnimationTemplate,
  AspectRatioSelection,
  RenderAspectRatio,
  RenderProfile,
} from './types.js';

export const isVerticalDimensions = (width: number, height: number): boolean =>
  height > width;

export const VERTICAL_TEMPLATE_LAYOUTS: Record<
  AnimationTemplate,
  {axis: 'vertical'; structure: string}
> = {
  'process-flow': {axis: 'vertical', structure: 'stacked-nodes-down-connectors'},
  comparison: {axis: 'vertical', structure: 'stacked-panels-compact-grid'},
  timeline: {axis: 'vertical', structure: 'vertical-spine-alternating-stages'},
  callout: {axis: 'vertical', structure: 'tall-centered-panel'},
};

export const RENDER_PROFILES: Record<RenderAspectRatio, RenderProfile> = {
  '16:9': {
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    safeArea: {top: 54, right: 90, bottom: 54, left: 90},
  },
  '9:16': {
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    safeArea: {top: 120, right: 72, bottom: 220, left: 72},
  },
};

export const profilesForSelection = (
  selection: AspectRatioSelection,
): RenderProfile[] =>
  selection === 'both'
    ? [RENDER_PROFILES['16:9'], RENDER_PROFILES['9:16']]
    : [RENDER_PROFILES[selection]];

export const aspectSuffix = (aspectRatio: RenderAspectRatio): string =>
  aspectRatio === '9:16' ? '-9x16' : '';
