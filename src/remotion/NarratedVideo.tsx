import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import type {NarratedRenderInput, VisualClip} from '../types.js';
import {AnimationClip} from './AnimationClip.js';
import {
  captionTopInset,
  PhraseCaption,
  SceneBackdrop,
} from './NarratedSceneLayer.js';
import {videoPaletteFor} from '../visual-palettes.js';

export const NarratedVideo = ({
  audioFile,
  backgroundAssets,
  captions,
  fps,
  plan,
  profile,
  sceneBackground,
  technologyIcons,
}: NarratedRenderInput) => (
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
    {plan.scenes.map((scene) => {
      const clip: VisualClip = {
        id: scene.id,
        durationMs: scene.durationMs,
        template: scene.template,
        title: scene.title,
        primaryItems: scene.primaryItems,
        secondaryItems: scene.secondaryItems,
        leftLabel: scene.leftLabel,
        rightLabel: scene.rightLabel,
        reason: scene.reason,
        primaryItemTimings: scene.primaryItemTimings.map(({startMs}) => ({startMs})),
        secondaryItemTimings: scene.secondaryItemTimings.map(({startMs}) => ({startMs})),
      };
      return (
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
            <AnimationClip
              background="transparent"
              clip={clip}
              contentTopInset={captionTopInset(captions, profile)}
              fps={fps}
              palette={plan.palette}
              profile={profile}
              technologyIcons={technologyIcons}
            />
            <PhraseCaption captions={captions} profile={profile} scene={scene} />
          </AbsoluteFill>
        </Sequence>
      );
    })}
  </AbsoluteFill>
);
