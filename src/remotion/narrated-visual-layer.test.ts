import {describe, expect, it} from 'vitest';
import type {SelectedMotionAsset} from '../types.js';
import {
  lottieSourceFrameAt,
  recolorLottieAnimation,
} from './NarratedMotionAsset.js';
import {
  metricDisplayAtProgress,
  verticalAgentWorkflowNodeClearance,
} from './NarratedVisualLayer.js';

const asset: SelectedMotionAsset = {
  id: 'fixture',
  file: 'fixture.json',
  loop: 'loop',
  playbackRate: 0.75,
  colorMap: {'#22D3EE': 'primary'},
};

describe('narrated visual motion', () => {
  it('keeps metric text exact at the hold frame', () => {
    expect(metricDisplayAtProgress('Revenue grew 42.5%', 0)).toBe('Revenue grew 0.0%');
    expect(metricDisplayAtProgress('Revenue grew 42.5%', 0.5)).toBe('Revenue grew 21.3%');
    expect(metricDisplayAtProgress('Revenue grew 42.5%', 1)).toBe('Revenue grew 42.5%');
    expect(metricDisplayAtProgress('No sourced number', 0.5)).toBe('No sourced number');
  });

  it('reserves visible clearance below vertical workflow orbit labels', () => {
    expect(verticalAgentWorkflowNodeClearance()).toBeGreaterThanOrEqual(16);
  });

  it('selects stable scene-relative Lottie frames for loop and hold behavior', () => {
    expect(lottieSourceFrameAt({
      fps: 30,
      frame: 45,
      inPoint: 0,
      loop: true,
      outPoint: 30,
      playbackRate: 1,
      sourceFps: 30,
    })).toBe(15);
    expect(lottieSourceFrameAt({
      fps: 30,
      frame: 45,
      inPoint: 0,
      loop: false,
      outPoint: 30,
      playbackRate: 1,
      sourceFps: 30,
    })).toBe(29);
  });

  it('recolors only mapped static vector fills', () => {
    const animation = {
      fr: 30,
      w: 512,
      h: 512,
      op: 60,
      layers: [{
        ty: 4,
        shapes: [{ty: 'fl', c: {a: 0, k: [0.133333, 0.827451, 0.933333, 1]}}],
      }],
    };
    const recolored = recolorLottieAnimation(animation, asset, 'amber');
    const color = (recolored.layers as Array<{shapes: Array<{c: {k: number[]}}>}>)
      [0]!.shapes[0]!.c.k;
    expect(color.slice(0, 3)).toEqual([
      251 / 255,
      191 / 255,
      36 / 255,
    ]);
  });
});
