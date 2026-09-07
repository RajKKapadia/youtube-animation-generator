export const activeItemIndex = (starts: number[], nowMs: number): number => starts.findLastIndex((start) => nowMs >= start);

/** Share a cue's animation budget when several items are introduced together. */
export const itemAnimationWindow = (starts: number[], index: number, durationMs: number) => {
  const anchor = starts[index] ?? durationMs;
  const first = starts.indexOf(anchor);
  const count = starts.filter((start) => start === anchor).length || 1;
  const next = starts.find((start) => start > anchor) ?? durationMs;
  const available = Math.max(0, Math.min(next, Math.max(anchor, durationMs - 300)) - anchor);
  const slot = Math.min(450 * count, available * .4) / count;
  return {startMs: anchor + Math.max(0, index - first) * slot, durationMs: slot};
};

export const windowProgress = (frame: number, fps: number, window: {startMs: number; durationMs: number}) => {
  const elapsed = frame * 1000 / fps - window.startMs;
  if (elapsed < 0) return 0;
  if (window.durationMs < 1000 / fps) return 1;
  return 1 - Math.pow(1 - Math.min(1, elapsed / window.durationMs), 3);
};

export const chartDomain = (values: number[]): [number, number] => {
  const low = Math.min(...values), high = Math.max(...values);
  if (low === high) { const pad = Math.max(1, Math.abs(low) * 0.1); return [low - pad, high + pad]; }
  return [low, high];
};
