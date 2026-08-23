export interface RevealScheduleOptions {
  durationInFrames: number;
  fps: number;
  itemStartMs?: readonly number[] | undefined;
  total: number;
  endFraction?: number;
}

/**
 * Converts speech-aligned millisecond offsets when they are available.
 * Legacy plans fall back to spreading reveals across the clip's actual
 * subtitle-derived duration, with a final hold for the completed graphic.
 */
export const createRevealSchedule = ({
  durationInFrames,
  endFraction = 0.72,
  fps,
  itemStartMs,
  total,
}: RevealScheduleOptions): number[] => {
  if (total <= 0) {
    return [];
  }

  const safeDuration = Math.max(1, durationInFrames);
  if (itemStartMs?.length === total) {
    return itemStartMs.map((startMs) =>
      Math.max(
        0,
        Math.min(safeDuration - 1, Math.round((startMs / 1_000) * fps)),
      ),
    );
  }

  const firstFrame = Math.min(
    Math.round(fps * 1.2),
    Math.max(2, Math.round(safeDuration * 0.08)),
  );
  const finalHold = Math.min(
    Math.round(fps * 1.5),
    Math.max(1, Math.round(safeDuration * 0.2)),
  );
  const latestReveal = Math.max(firstFrame, safeDuration - finalHold - 1);
  const lastFrame = Math.max(
    firstFrame,
    Math.min(Math.round(safeDuration * endFraction), latestReveal),
  );

  if (total === 1) {
    return [firstFrame];
  }

  return Array.from({length: total}, (_, index) =>
    Math.round(firstFrame + ((lastFrame - firstFrame) * index) / (total - 1)),
  );
};

export const createConnectionWindow = (
  fromFrame: number,
  toFrame: number,
  fps: number,
): {end: number; start: number} => {
  const start = Math.max(fromFrame + 1, toFrame);
  const end = start + getBeatTransitionFrames(fps);
  return {end, start};
};

export const getBeatTransitionFrames = (fps: number): number =>
  Math.max(3, Math.round(fps * 0.25));

export const createSteppedProgress = ({
  frame,
  revealFrames,
  transitionFrames,
}: {
  frame: number;
  revealFrames: number[];
  transitionFrames: number;
}): number => {
  if (revealFrames.length <= 1) {
    return revealFrames.length === 1 && frame >= revealFrames[0]! ? 1 : 0;
  }

  const segmentSize = 1 / (revealFrames.length - 1);
  let progress = 0;
  for (const revealFrame of revealFrames.slice(1)) {
    const segmentProgress = Math.max(
      0,
      Math.min(1, (frame - revealFrame) / Math.max(1, transitionFrames)),
    );
    progress += segmentProgress * segmentSize;
  }

  return Math.min(1, progress);
};
