import {describe, it, expect} from 'vitest';
import {alignRecording, materializeRecordedPlan} from './recording-alignment.js';
import {draftNarratedPlanSchema, narratedPlanSchema} from './types.js';
import {assertMeasuredNarrationDuration} from './narration-duration.js';
import {estimateDraftNarrationTiming} from './narration-planner.js';

const draft = (text = 'The customer asks a question. The clerk gives an answer.') => draftNarratedPlanSchema.parse({version: 8, kind: 'narrated-video', stage: 'draft', sourceText: text, generatedAt: 'fixture', model: 'offline', targetDurationSeconds: 5, language: 'en', title: 'Recording', palette: 'cyan', mediaAssets: [], scenes: [{id: 'exchange', template: 'callout', title: 'Exchange', primaryItems: ['Question', 'Answer'], secondaryItems: [], leftLabel: '', rightLabel: '', reason: 'Recording fixture.', backgroundPrompt: 'Plain.', visual: {kind: 'diagram', motion: 'reveal', motif: 'none', assetId: null}, beats: [{id: 'first', expression: 'none', phrases: [{id: 'first-phrase', text: text.split('. ')[0] + '.'}], primaryItemIndices: [0], secondaryItemIndices: []}, {id: 'second', expression: 'none', phrases: [{id: 'second-phrase', text: text.split('. ')[1]!}], primaryItemIndices: [1], secondaryItemIndices: []}]}]});
const words = (text: string, pause = 0) => text.replaceAll('.', '').split(' ').filter(Boolean).map((word, index) => ({word, startMs: 300 + index * 400 + (index >= 5 ? pause : 0), endMs: 600 + index * 400 + (index >= 5 ? pause : 0), probability: .99}));

describe('recorded narration alignment', () => {
  it('matches the script monotonically through long pauses and retains original playback speed', () => {
    const plan = draft(), report = alignRecording(plan, words(plan.sourceText, 25000), 40000);
    expect(report.accepted).toBe(true);
    const timed = materializeRecordedPlan(plan, report, {durationMs: 40000, sampleRate: 48000, totalSamples: 1920000, voiceoverFile: 'audio/voiceover.wav', originalFile: 'recording/original.wav', sha256: 'a'.repeat(64), playbackSha256: 'b'.repeat(64)});
    expect(timed.audioSource?.kind).toBe('recorded');
    expect(timed.voiceoverPlaybackRate).toBe(1);
    expect(timed).not.toHaveProperty('ttsSpeed');
    expect(timed.scenes[0]!.beats[1]!.startMs).toBeGreaterThan(25000);
    expect(() => assertMeasuredNarrationDuration(timed)).not.toThrow();
    expect(() => assertMeasuredNarrationDuration({...timed, audioSource: {kind: 'tts'}})).toThrow('Measured narration');
  });
  it('allows small function-word differences', () => {
    const plan = draft();
    expect(alignRecording(plan, words(plan.sourceText.replace('a question', 'the question')), 10000).accepted).toBe(true);
  });
  it.each([
    ['changed subject', (text: string) => text.replace('customer', 'doctor')],
    ['missing section', (text: string) => text.split('. ')[0]!],
    ['repeated take', (text: string) => text + ' ' + text],
    ['reordered sections', (text: string) => text.split('. ').reverse().join('. ')],
  ])('rejects %s with reviewable diagnostics', (_, change) => {
    const plan = draft(), report = alignRecording(plan, words(change(plan.sourceText)), 30000);
    expect(report.accepted).toBe(false); expect(report.problems.length).toBeGreaterThan(0);
  });
  it('rejects changed quantities after spoken-number normalization', () => {
    const plan = draft('Revenue reached 50 rupees. Costs stayed unchanged.');
    expect(alignRecording(plan, words('Revenue reached fifty rupees Costs stayed unchanged'), 10000).accepted).toBe(true);
    expect(alignRecording(plan, words('Revenue reached sixty rupees Costs stayed unchanged'), 10000).accepted).toBe(false);
  });
  it('rejects invalid timestamps and uncertain speech', () => {
    const plan = draft(), input = words(plan.sourceText); input[1]!.probability = .1; input[2]!.startMs = 0;
    expect(alignRecording(plan, input, 10000).accepted).toBe(false);
  });
  it('upgrades version 7 draft and timed plans without dropping their voice parameters', () => {
    expect(narratedPlanSchema.parse({...draft(), version: 7}).version).toBe(8);
    const timed = estimateDraftNarrationTiming(draft());
    const upgraded = narratedPlanSchema.parse({...timed, version: 7, audioSource: undefined});
    expect(upgraded.stage).toBe('timed');
    if (upgraded.stage === 'timed') {expect(upgraded.audioSource?.kind).toBe('tts'); expect(upgraded.ttsSpeed).toBe(timed.ttsSpeed);}
  });
});
