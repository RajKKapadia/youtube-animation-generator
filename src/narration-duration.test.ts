import {describe, expect, it} from 'vitest';
import {assertMeasuredNarrationDuration, draftNarrationDurationIssue, estimateNarrationDuration, narrationDurationBudget, narrationSpeechUnits} from './narration-duration.js';

const scene = (text: string) => ({beats: [{phrases: [{text}]}]});

describe('narration duration budgets', () => {
  it('divides a duration-based total among topics instead of imposing a per-topic minimum', () => {
    const one = narrationDurationBudget(150, 'en', 1.05, 1);
    const six = narrationDurationBudget(150, 'en', 1.05, 6);
    expect(six.targetUnits).toBeGreaterThan(250);
    expect(six.targetUnits).toBeLessThan(280);
    expect(six.targetUnits).toBeLessThan(one.targetUnits);
    expect(six.maximumSeconds).toBe(165);
    expect(narrationDurationBudget(60, 'en', 1.05, 6).targetUnits).toBeLessThan(120);
  });
  it('accounts for the requested speech speed and the scene/beat pause cost', () => {
    const scenes = [scene('A producer sends work.'), {beats: [...scene('A queue stores it.').beats, ...scene('A consumer receives it.').beats]}];
    const normal = estimateNarrationDuration(scenes, 'en');
    const slow = estimateNarrationDuration(scenes, 'en', 0.7);
    expect(normal.pauseSeconds).toBeCloseTo(1.35);
    expect(slow.seconds).toBeGreaterThan(normal.seconds);
    expect(narrationDurationBudget(150, 'en', 0.7).targetUnits).toBeLessThan(narrationDurationBudget(150, 'en').targetUnits);
  });
  it('budgets the text actually spoken, including expanded quantities and initialisms', () => {
    expect(narrationSpeechUnits('FIIs invested ₹12,34,567.', 'en')).toBeGreaterThan(10);
    expect(narrationSpeechUnits('FIIs invested ₹12,34,567.', 'fr')).toBe(3);
    expect(narrationSpeechUnits('今日は晴れです。', 'ja')).toBe(7);
  });
  it('rejects a 504-word draft for a 150-second target and accepts a concise complete draft', () => {
    const plan = {language: 'en', targetDurationSeconds: 150, scenes: [scene('word '.repeat(504))]};
    expect(draftNarrationDurationIssue(plan)).toContain('maximum 165s');
    expect(draftNarrationDurationIssue({...plan, scenes: [scene('word '.repeat(265))]})).toBeUndefined();
  });
  it('allows the exact measured boundary but blocks even a small excess; never pads a short source', () => {
    expect(() => assertMeasuredNarrationDuration({targetDurationSeconds: 150, durationMs: 165000})).not.toThrow();
    expect(() => assertMeasuredNarrationDuration({targetDurationSeconds: 150, durationMs: 165001})).toThrow('Video rendering stopped');
    expect(() => assertMeasuredNarrationDuration({targetDurationSeconds: 150, durationMs: 30000})).not.toThrow();
  });
});
