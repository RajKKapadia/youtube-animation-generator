import type {CalculateMetadataFunction} from 'remotion';
import {Composition} from 'remotion';
import {AnimationClip} from './AnimationClip.js';
import type {RenderInput} from '../types.js';
import {renderInputSchema} from '../types.js';

const defaultProps: RenderInput = {
  background: 'transparent',
  fps: 30,
  technologyIcons: {},
  clip: {
    id: 'preview',
    startCue: 1,
    endCue: 3,
    sourceStartMs: 0,
    sourceEndMs: 6_000,
    durationMs: 6_000,
    template: 'process-flow',
    title: 'Request Processing',
    primaryItems: ['Client', 'API', 'Queue', 'Worker', 'Database'],
    secondaryItems: [],
    leftLabel: '',
    rightLabel: '',
    reason: 'Preview animation',
    transcript: 'A request moves through the system.',
  },
};

const calculateMetadata: CalculateMetadataFunction<RenderInput> = async ({props}) => {
  const input = renderInputSchema.parse(props);
  return {
    durationInFrames: Math.max(1, Math.ceil((input.clip.durationMs / 1_000) * input.fps)),
    fps: input.fps,
  };
};

export const RemotionRoot = () => (
  <Composition
    id="AnimationClip"
    component={AnimationClip}
    durationInFrames={180}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={defaultProps}
    calculateMetadata={calculateMetadata}
  />
);
