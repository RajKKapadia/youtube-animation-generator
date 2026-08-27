import {describe, expect, it} from 'vitest';
import {RENDER_PROFILES} from '../render-profile.js';
import {timedNarrationSceneSchema} from '../types.js';
import {
  captionTopInset,
  captionPhraseAtMs,
  sceneBackdropOpacity,
} from './NarratedSceneLayer.js';

const scene = timedNarrationSceneSchema.parse({
  id: 'captions',
  backgroundPrompt: 'Abstract caption timing.',
  startMs: 0,
  durationMs: 2_000,
  template: 'callout',
  title: 'Caption timing',
  primaryItems: ['Exact timing'],
  secondaryItems: [],
  leftLabel: '',
  rightLabel: '',
  reason: 'Fixture',
  beats: [{
    id: 'caption-beat',
    expression: 'breath',
    phrases: [
      {
        id: 'first',
        text: 'First phrase',
        startMs: 300,
        durationMs: 500,
        sampleCount: 500,
      },
      {
        id: 'second',
        text: 'Second phrase',
        startMs: 850,
        durationMs: 500,
        sampleCount: 500,
      },
    ],
    primaryItemIndices: [0],
    secondaryItemIndices: [],
    startMs: 300,
    durationMs: 1_050,
    audioFile: 'beats/captions.wav',
    sampleCount: 1_050,
  }],
  primaryItemTimings: [{beatId: 'caption-beat', startMs: 300}],
  secondaryItemTimings: [],
});

describe('phrase captions', () => {
  it('uses inclusive starts, exclusive ends, and leaves inter-phrase gaps empty', () => {
    expect(captionPhraseAtMs(scene, 299)).toBeUndefined();
    expect(captionPhraseAtMs(scene, 300)?.id).toBe('first');
    expect(captionPhraseAtMs(scene, 799)?.id).toBe('first');
    expect(captionPhraseAtMs(scene, 800)).toBeUndefined();
    expect(captionPhraseAtMs(scene, 850)?.id).toBe('second');
    expect(captionPhraseAtMs(scene, 1_350)).toBeUndefined();
  });

  it('reserves orientation-specific top space only when captions are enabled', () => {
    expect(captionTopInset('on', RENDER_PROFILES['16:9'])).toBe(190);
    expect(captionTopInset('on', RENDER_PROFILES['9:16'])).toBe(180);
    expect(captionTopInset('off', RENDER_PROFILES['9:16'])).toBe(0);
  });

  it('crossfades scene backdrops at their boundaries', () => {
    expect(sceneBackdropOpacity(0, 90, 30)).toBe(0);
    expect(sceneBackdropOpacity(11, 90, 30)).toBe(1);
    expect(sceneBackdropOpacity(45, 90, 30)).toBe(1);
    expect(sceneBackdropOpacity(89, 90, 30)).toBe(0);
  });
});
