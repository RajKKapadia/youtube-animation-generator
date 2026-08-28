import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import type {NarratedRenderInput} from '../types.js';
import {
  captionTopInset,
  PhraseCaption,
  SceneBackdrop,
} from './NarratedSceneLayer.js';
import {videoPaletteFor} from '../visual-palettes.js';
import {NarratedVisualLayer} from './NarratedVisualLayer.js';
import {LocalBrandAssetsProvider} from './TechnologyBadge.js';

export const NarratedVideo = ({
  audioFile,
  backgroundAssets,
  captions,
  foregroundAssets,
  fps,
  localBrandAssets,
  motionAssets,
  plan,
  profile,
  sceneBackground,
  technologyIcons,
}: NarratedRenderInput) => (
  <LocalBrandAssetsProvider assets={localBrandAssets}>
    <AbsoluteFill
      style={{backgroundColor: videoPaletteFor(plan.palette).background.start}}
    >
      {plan.scenes[0] ? (
        <SceneBackdrop
          mode="ambient"
          palette={plan.palette}
          scene={plan.scenes[0]}
        />
      ) : null}
      <Audio
        playbackRate={plan.voiceoverPlaybackRate}
        preservePitch
        src={staticFile(audioFile)}
      />
      {plan.scenes.map((scene) => (
        <Sequence
          durationInFrames={Math.max(1, Math.ceil((scene.durationMs / 1_000) * fps))}
          from={Math.round((scene.startMs / 1_000) * fps)}
          key={scene.id}
          name={scene.title}
        >
          <AbsoluteFill>
            <SceneBackdrop
              asset={backgroundAssets[scene.id]}
              mode={sceneBackground}
              palette={plan.palette}
              scene={scene}
            />
            <NarratedVisualLayer
              contentTopInset={captionTopInset(captions, profile)}
              fps={fps}
              foregroundAssets={foregroundAssets}
              motionAssets={motionAssets}
              palette={plan.palette}
              profile={profile}
              scene={scene}
              technologyIcons={technologyIcons}
            />
            <PhraseCaption captions={captions} profile={profile} scene={scene} />
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  </LocalBrandAssetsProvider>
);
