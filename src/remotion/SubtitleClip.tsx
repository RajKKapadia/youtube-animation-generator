import {AbsoluteFill} from 'remotion';
import type {SubtitleRenderInput, VisualItemTiming} from '../types.js';
import {videoPaletteFor} from '../visual-palettes.js';
import {AnimationClip} from './AnimationClip.js';
import {NarratedVisualLayer} from './NarratedVisualLayer.js';
import {
  captionTopInset,
  SceneBackdrop,
  TimedCaptionLayer,
} from './NarratedSceneLayer.js';
import {LocalIconAssetsProvider} from './SemanticIcon.js';
import {LocalBrandAssetsProvider} from './TechnologyBadge.js';

const fallbackTimings = (
  total: number,
  durationMs: number,
): VisualItemTiming[] => Array.from({length: total}, (_, index) => ({
  startMs: Math.min(
    Math.max(0, durationMs - 1),
    Math.round(((index + 1) / (total + 1)) * durationMs),
  ),
}));

export const SubtitleClip = ({
  background,
  backgroundAsset,
  captions,
  clip,
  foregroundAssets,
  fps,
  localBrandAssets,
  localIconAssets,
  motionAssets,
  palette,
  profile,
  sceneBackground,
  technologyIcons,
}: SubtitleRenderInput) => {
  const theme = videoPaletteFor(palette);
  const primaryItemTimings = clip.primaryItemTimings?.map(({startMs}) => ({startMs})) ??
    fallbackTimings(clip.primaryItems.length, clip.durationMs);
  const secondaryItemTimings = clip.secondaryItemTimings?.map(({startMs}) => ({startMs})) ??
    fallbackTimings(clip.secondaryItems.length, clip.durationMs);
  const scene = {
    id: clip.id,
    durationMs: clip.durationMs,
    template: clip.template,
    title: clip.title,
    primaryItems: clip.primaryItems,
    secondaryItems: clip.secondaryItems,
    leftLabel: clip.leftLabel,
    rightLabel: clip.rightLabel,
    reason: clip.reason,
    visual: clip.visual,
    icons: clip.icons,
    primaryItemTimings,
    secondaryItemTimings,
    activityCues: clip.captionCues.length > 0
      ? clip.captionCues.map(({startMs, text}) => ({startMs, text}))
      : [{startMs: 0, text: clip.transcript}],
  };
  const useLegacyDiagramRenderer =
    captions === 'off' &&
    sceneBackground === 'off' &&
    clip.captionCues.length === 0 &&
    clip.visual.kind === 'diagram' &&
    clip.visual.motion === 'reveal' &&
    clip.visual.motif === 'none' &&
    clip.visual.assetId === null;

  return (
    <LocalBrandAssetsProvider assets={localBrandAssets}>
      <LocalIconAssetsProvider assets={localIconAssets}>
        <AbsoluteFill
          style={{
            backgroundColor: sceneBackground === 'off'
              ? background === 'green'
                ? '#00FF00'
                : background === 'dark'
                  ? theme.background.start
                  : 'transparent'
              : theme.background.start,
          }}
        >
          {sceneBackground === 'off' ? null : (
            <SceneBackdrop
              asset={backgroundAsset}
              mode={sceneBackground}
              palette={palette}
              scene={scene}
            />
          )}
          {useLegacyDiagramRenderer ? (
            <AnimationClip
              background="transparent"
              clip={clip}
              contentTopInset={0}
              fps={fps}
              palette={palette}
              profile={profile}
              technologyIcons={technologyIcons}
            />
          ) : (
            <NarratedVisualLayer
              contentTopInset={captionTopInset(captions, profile)}
              fps={fps}
              foregroundAssets={foregroundAssets}
              motionAssets={motionAssets}
              palette={palette}
              profile={profile}
              scene={scene}
              technologyIcons={technologyIcons}
            />
          )}
          <TimedCaptionLayer
            captions={captions}
            cues={clip.captionCues}
            profile={profile}
          />
        </AbsoluteFill>
      </LocalIconAssetsProvider>
    </LocalBrandAssetsProvider>
  );
};
