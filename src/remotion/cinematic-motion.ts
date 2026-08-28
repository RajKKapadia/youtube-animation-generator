import {Easing, interpolate, spring} from 'remotion';

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

export const CINEMATIC_MOTION = {
  sceneEntranceSeconds: 0.45,
  sceneExitSeconds: 0.3,
  connectorDrawSeconds: 0.6,
  chartGrowthSeconds: 0.8,
  ambientPeriodSeconds: 4,
  maxAmbientPixels: 6,
  maxAmbientScale: 0.015,
  imageScaleStart: 1.02,
  imageScaleEnd: 1.08,
  spring: {damping: 18, stiffness: 110, mass: 0.8},
} as const;

export const beatEntrance = (
  frame: number,
  fps: number,
  startMs: number,
): number => spring({
  fps,
  frame: frame - Math.round((startMs / 1_000) * fps),
  config: CINEMATIC_MOTION.spring,
  durationInFrames: Math.max(1, Math.round(fps * 0.55)),
});

export const sceneEntranceExit = (
  frame: number,
  fps: number,
  durationMs: number,
): number => {
  const durationFrames = Math.max(1, Math.ceil((durationMs / 1_000) * fps));
  const entrance = interpolate(
    frame,
    [0, Math.round(CINEMATIC_MOTION.sceneEntranceSeconds * fps)],
    [0, 1],
    {...clamp, easing: Easing.out(Easing.cubic)},
  );
  const exit = interpolate(
    frame,
    [durationFrames - Math.round(CINEMATIC_MOTION.sceneExitSeconds * fps), durationFrames],
    [1, 0],
    {...clamp, easing: Easing.in(Easing.cubic)},
  );
  return Math.min(entrance, exit);
};

export const timedProgress = (
  frame: number,
  fps: number,
  seconds: number,
  delaySeconds = 0,
): number => interpolate(
  frame,
  [Math.round(delaySeconds * fps), Math.round((delaySeconds + seconds) * fps)],
  [0, 1],
  {...clamp, easing: Easing.out(Easing.cubic)},
);

export const ambientWave = (
  frame: number,
  fps: number,
  phase = 0,
): number => Math.sin(
  (frame / Math.max(1, fps * CINEMATIC_MOTION.ambientPeriodSeconds)) * Math.PI * 2 + phase,
);
