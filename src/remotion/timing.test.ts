import {describe, expect, it} from 'vitest';
import {
  createConnectionWindow,
  createRevealSchedule,
  createSteppedProgress,
  getBeatTransitionFrames,
} from './timing.js';

describe('createRevealSchedule', () => {
  it('spreads the same stages farther apart for a longer subtitle interval', () => {
    const short = createRevealSchedule({durationInFrames: 120, fps: 30, total: 5});
    const long = createRevealSchedule({durationInFrames: 1_800, fps: 30, total: 5});

    expect(short).toHaveLength(5);
    expect(long).toHaveLength(5);
    expect((long.at(-1) ?? 0) - long[0]!).toBeGreaterThan(
      ((short.at(-1) ?? 0) - short[0]!) * 10,
    );
  });

  it('keeps reveals ordered and leaves a completed-animation hold', () => {
    const durationInFrames = 900;
    const frames = createRevealSchedule({durationInFrames, fps: 30, total: 6});

    expect(frames).toEqual([...frames].sort((left, right) => left - right));
    expect(frames[0]).toBeLessThanOrEqual(36);
    expect(frames.at(-1)).toBeLessThanOrEqual(Math.round(durationInFrames * 0.72));
  });

  it('handles an empty or single-item animation', () => {
    expect(createRevealSchedule({durationInFrames: 120, fps: 30, total: 0})).toEqual([]);
    expect(createRevealSchedule({durationInFrames: 120, fps: 30, total: 1})).toEqual([10]);
  });

  it('converts speech offsets to exact reveal frames', () => {
    expect(
      createRevealSchedule({
        durationInFrames: 120,
        fps: 30,
        itemStartMs: [0, 250, 1_000, 2_100],
        total: 4,
      }),
    ).toEqual([0, 8, 30, 63]);
  });

  it('clamps speech offsets and falls back when anchor counts do not match', () => {
    expect(
      createRevealSchedule({
        durationInFrames: 120,
        fps: 30,
        itemStartMs: [-500, 9_000],
        total: 2,
      }),
    ).toEqual([0, 119]);

    expect(
      createRevealSchedule({
        durationInFrames: 120,
        fps: 30,
        itemStartMs: [0],
        total: 2,
      }),
    ).toEqual(createRevealSchedule({durationInFrames: 120, fps: 30, total: 2}));
  });
});

describe('createConnectionWindow', () => {
  it('keeps connector motion equally quick across short and long gaps', () => {
    const shortGap = createConnectionWindow(30, 90, 30);
    const longGap = createConnectionWindow(30, 900, 30);

    expect(shortGap.end - shortGap.start).toBe(getBeatTransitionFrames(30));
    expect(longGap.end - longGap.start).toBe(getBeatTransitionFrames(30));
    expect(shortGap.start).toBe(90);
    expect(longGap.start).toBe(900);
  });
});

describe('createSteppedProgress', () => {
  const revealFrames = [10, 100, 200];

  it('holds steady between stage timestamps', () => {
    expect(
      createSteppedProgress({frame: 50, revealFrames, transitionFrames: 8}),
    ).toBe(0);
    expect(
      createSteppedProgress({frame: 150, revealFrames, transitionFrames: 8}),
    ).toBe(0.5);
  });

  it('advances each segment during a short fixed transition', () => {
    expect(
      createSteppedProgress({frame: 104, revealFrames, transitionFrames: 8}),
    ).toBe(0.25);
    expect(
      createSteppedProgress({frame: 208, revealFrames, transitionFrames: 8}),
    ).toBe(1);
  });
});
