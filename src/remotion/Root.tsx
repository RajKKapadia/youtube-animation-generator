import type {CalculateMetadataFunction} from 'remotion';
import {Composition} from 'remotion';
import {AnimationClip} from './AnimationClip.js';
import {NarratedVideo} from './NarratedVideo.js';
import {NarratedThumbnail} from './NarratedThumbnail.js';
import type {
  NarratedRenderInput,
  PublishCoverInput,
  RenderInput,
} from '../types.js';
import {
  narratedRenderInputSchema,
  publishCoverInputSchema,
  renderInputSchema,
} from '../types.js';
import {RENDER_PROFILES} from '../render-profile.js';
import {PUBLISH_COVER_PROFILES} from '../publish-profile.js';

const defaultProps: RenderInput = {
  background: 'transparent',
  fps: 30,
  palette: 'cyan',
  profile: RENDER_PROFILES['16:9'],
  technologyIcons: {},
  clip: {
    id: 'preview',
    durationMs: 6_000,
    template: 'process-flow',
    title: 'Request Processing',
    primaryItems: ['Client', 'API', 'Queue', 'Worker', 'Database'],
    primaryItemTimings: [
      {startMs: 0},
      {startMs: 0},
      {startMs: 2_000},
      {startMs: 4_000},
      {startMs: 4_000},
    ],
    secondaryItems: [],
    secondaryItemTimings: [],
    leftLabel: '',
    rightLabel: '',
    reason: 'Preview animation',
  },
};

const calculateMetadata: CalculateMetadataFunction<RenderInput> = async ({props}) => {
  const input = renderInputSchema.parse(props);
  return {
    durationInFrames: Math.max(1, Math.ceil((input.clip.durationMs / 1_000) * input.fps)),
    fps: input.fps,
    width: input.profile.width,
    height: input.profile.height,
  };
};

const defaultNarratedProps: NarratedRenderInput = {
  audioFile: 'voiceover.wav',
  backgroundAssets: {},
  captions: 'on',
  fps: 30,
  profile: RENDER_PROFILES['16:9'],
  technologyIcons: {},
  plan: {
    version: 4,
    kind: 'narrated-video',
    stage: 'timed',
    sourceText: 'A request moves through a queue.',
    generatedAt: '2026-08-23T00:00:00.000Z',
    model: 'preview',
    targetDurationSeconds: 6,
    language: 'en',
    title: 'Request flow',
    palette: 'cyan',
    sampleRate: 44_100,
    voice: 'M1',
    ttsSpeed: 1.05,
    ttsSteps: 8,
    voiceoverPlaybackRate: 1,
    voiceoverFile: 'voiceover.wav',
    durationMs: 6_000,
    totalSamples: 264_600,
    scenes: [{
      id: 'request-flow',
      backgroundPrompt: 'Abstract request pipeline with flowing data trails.',
      startMs: 0,
      durationMs: 6_000,
      template: 'process-flow',
      title: 'Request flow',
      primaryItems: ['Client', 'Queue', 'Worker'],
      secondaryItems: [],
      leftLabel: '',
      rightLabel: '',
      reason: 'Preview',
      beats: [
        {
          id: 'request',
          expression: 'breath',
          phrases: [{
            id: 'request-phrase-1',
            text: 'A client submits a request.',
            startMs: 300,
            durationMs: 2_000,
            sampleCount: 88_200,
          }],
          primaryItemIndices: [0, 1],
          secondaryItemIndices: [],
          startMs: 300,
          durationMs: 2_000,
          audioFile: 'beats/request.wav',
          sampleCount: 88_200,
        },
        {
          id: 'worker',
          expression: 'none',
          phrases: [{
            id: 'worker-phrase-1',
            text: 'A worker processes it.',
            startMs: 2_450,
            durationMs: 2_000,
            sampleCount: 88_200,
          }],
          primaryItemIndices: [2],
          secondaryItemIndices: [],
          startMs: 2_450,
          durationMs: 2_000,
          audioFile: 'beats/worker.wav',
          sampleCount: 88_200,
        },
      ],
      primaryItemTimings: [
        {beatId: 'request', startMs: 300},
        {beatId: 'request', startMs: 300},
        {beatId: 'worker', startMs: 2_450},
      ],
      secondaryItemTimings: [],
    }],
  },
  sceneBackground: 'ambient',
};

const calculateNarratedMetadata: CalculateMetadataFunction<NarratedRenderInput> = async ({props}) => {
  const input = narratedRenderInputSchema.parse(props);
  return {
    durationInFrames: Math.max(1, Math.ceil((input.plan.durationMs / 1_000) * input.fps)),
    fps: input.fps,
    width: input.profile.width,
    height: input.profile.height,
  };
};

const defaultPublishCoverProps: PublishCoverInput = {
  profile: PUBLISH_COVER_PROFILES['16:9'],
  publish: {
    version: 1,
    kind: 'narrated-publish-kit',
    sourcePlan: 'preview.narration-plan.json',
    generatedAt: '2026-08-25T00:00:00.000Z',
    model: 'preview',
    language: 'en',
    youtube: {
      title: 'Understand Queues with One Simple Request Flow',
      alternateTitles: [
        'How Queues Keep Producers and Consumers Independent',
        'Message Queues Explained with a Practical Visual Flow',
      ],
      description: 'See how a queue separates producers from consumers.\n\n#Queues #SystemDesign #Programming',
      tags: [
        'programming',
        'technology',
        'software tutorial',
        'message queues',
        'queue architecture',
        'system design',
        'backend development',
        'producer consumer pattern',
        'asynchronous processing',
        'distributed systems',
        'software architecture',
        'queue tutorial',
        'message broker basics',
        'decouple application services',
        'learn system design visually',
      ],
      hashtags: ['Queues', 'SystemDesign', 'Programming'],
    },
    thumbnail: {
      headline: 'Queues Make Systems Flow',
      eyebrow: 'System Design',
      sceneId: 'request-flow',
      accent: 'cyan',
    },
  },
  scene: {
    id: 'request-flow',
    template: 'process-flow',
    title: 'A queue decouples work',
    primaryItems: ['Producer', 'Queue', 'Consumer'],
    secondaryItems: [],
    leftLabel: '',
    rightLabel: '',
    reason: 'Shows how work moves independently.',
  },
  technologyIcons: {},
};

const calculatePublishCoverMetadata: CalculateMetadataFunction<PublishCoverInput> = async ({
  props,
}) => {
  const input = publishCoverInputSchema.parse(props);
  return {
    durationInFrames: 1,
    fps: 30,
    width: input.profile.width,
    height: input.profile.height,
  };
};

export const RemotionRoot = () => (
  <>
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
    <Composition
      id="NarratedVideo"
      component={NarratedVideo}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={defaultNarratedProps}
      calculateMetadata={calculateNarratedMetadata}
    />
    <Composition
      id="NarratedThumbnail"
      component={NarratedThumbnail}
      durationInFrames={1}
      fps={30}
      width={1280}
      height={720}
      defaultProps={defaultPublishCoverProps}
      calculateMetadata={calculatePublishCoverMetadata}
    />
  </>
);
