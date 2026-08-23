import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import type {NarratedRenderInput, VisualClip} from '../types.js';
import {AnimationClip} from './AnimationClip.js';

export const NarratedVideo = ({
  audioFile,
  fps,
  plan,
  profile,
  technologyIcons,
}: NarratedRenderInput) => (
  <AbsoluteFill style={{backgroundColor: '#020617'}}>
    <Audio src={staticFile(audioFile)} />
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
          <AnimationClip
            background="dark"
            clip={clip}
            fps={fps}
            profile={profile}
            technologyIcons={technologyIcons}
          />
        </Sequence>
      );
    })}
  </AbsoluteFill>
);
