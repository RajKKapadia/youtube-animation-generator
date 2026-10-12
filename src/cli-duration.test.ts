import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {runCli} from './cli.js';
import {materializeTimedNarration} from './narration-audio.js';
import {draftNarratedPlanSchema} from './types.js';

const {synthesize, render, visuals, backgrounds, planner} = vi.hoisted(() => ({
  synthesize: vi.fn(), render: vi.fn(), visuals: vi.fn(), backgrounds: vi.fn(), planner: vi.fn(),
}));
vi.mock('./narration-audio.js', async (original) => ({...await original<typeof import('./narration-audio.js')>(), synthesizeNarration: synthesize}));
vi.mock('./narration-planner.js', async (original) => ({...await original<typeof import('./narration-planner.js')>(), planNarratedVideo: planner}));
vi.mock('./narrated-render.js', async (original) => ({...await original<typeof import('./narrated-render.js')>(), renderNarratedVideo: render}));
vi.mock('./generated-visuals.js', async (original) => ({...await original<typeof import('./generated-visuals.js')>(), materializeGeneratedVisuals: visuals}));
vi.mock('./scene-backgrounds.js', async (original) => ({...await original<typeof import('./scene-backgrounds.js')>(), materializeSceneBackgrounds: backgrounds}));

const draft = draftNarratedPlanSchema.parse({
  version: 7, kind: 'narrated-video', stage: 'draft', sourceText: 'A queue holds work until a consumer is ready.',
  generatedAt: '2026-10-09', model: 'fixture', targetDurationSeconds: 150, language: 'en', title: 'Queue', palette: 'cyan', mediaAssets: [],
  scenes: [{id: 'queue', title: 'Queue', template: 'callout', primaryItems: ['Queue'], secondaryItems: [], leftLabel: '', rightLabel: '', reason: 'Explains a queue.',
    backgroundPrompt: 'Abstract queue.', icons: {focal: null, primary: [null], secondary: []}, visual: {kind: 'diagram', motion: 'reveal', motif: 'none', assetId: null},
    beats: [{id: 'explain', expression: 'none', phrases: [{id: 'phrase', text: 'A queue holds work until a consumer is ready.'}], primaryItemIndices: [0], secondaryItemIndices: []}],
  }],
});
const timed = (durationMs: number) => materializeTimedNarration({
  audioDirectoryName: 'summary.audio', draft, speed: 1.05, steps: 8, voice: 'M1',
  result: {sampleRate: 1000, totalSamples: durationMs, voiceoverFile: 'voiceover.wav', scenes: [{id: 'queue', startSample: 0, sampleCount: durationMs,
    beats: [{id: 'explain', file: 'beat.wav', startSample: 300, sampleCount: durationMs - 600, phrases: [{id: 'phrase', startSample: 300, sampleCount: durationMs - 600}]}],
  }]},
});
const directories: string[] = [];
const save = async (plan: unknown) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'cli-duration-'));
  directories.push(directory);
  const path = resolve(directory, 'summary.narration-plan.json');
  await writeFile(path, JSON.stringify(plan));
  return {directory, path};
};
beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', 'fixture-key');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  visuals.mockResolvedValue(undefined);
  backgrounds.mockResolvedValue(undefined);
  render.mockResolvedValue([]);
  planner.mockResolvedValue(structuredClone(draft));
});
afterEach(async () => {
  vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

describe('CLI duration enforcement', () => {
  it('stops a newly measured overrun before images or video and retains the timed plan for review', async () => {
    synthesize.mockResolvedValue(timed(166000));
    const {directory, path} = await save(draft);
    await expect(runCli(['create', '--render-plan', path, '--voice', 'M1', '--scene-background', 'generated'])).rejects.toThrow('maximum is 165s');
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    expect(visuals).not.toHaveBeenCalled();
    expect(backgrounds).not.toHaveBeenCalled();
    expect(planner).not.toHaveBeenCalled();
    const saved = JSON.parse(await readFile(resolve(directory, 'summary.narration-timed.json'), 'utf8'));
    expect(saved.durationMs).toBe(166000);
  });
  it.each([{flags: []}, {flags: ['--audio-only']}, {flags: ['--plan-only']}])('blocks an oversized saved timed plan with $flags without reauthoring it', async ({flags}) => {
    const {path} = await save(timed(271532));
    await expect(runCli(['create', '--render-plan', path, ...flags])).rejects.toThrow('Measured narration is 271.5s');
    expect(synthesize).not.toHaveBeenCalled();
    expect(planner).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(visuals).not.toHaveBeenCalled();
  });
  it('accepts the 15-second boundary and leaves measured audio/timing unchanged', async () => {
    const plan = timed(165000);
    synthesize.mockResolvedValue(plan);
    const {path} = await save(draft);
    await runCli(['create', '--render-plan', path, '--voice', 'M1']);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({plan: expect.objectContaining({durationMs: 165000, targetDurationSeconds: 150})}));
  });
  it('rejects an oversized saved draft in plan-only mode before TTS', async () => {
    const long = structuredClone(draft);
    long.scenes[0]!.beats[0]!.phrases = Array.from({length: 12}, (_, i) => ({id: `phrase-${i}`, text: 'This is a detailed explanation of how work is passed between a producer and a consumer in a queue.'}));
    long.targetDurationSeconds = 60;
    const {path} = await save(long);
    await expect(runCli(['create', '--render-plan', path, '--plan-only'])).rejects.toThrow('Narration exceeds the duration budget');
    expect(synthesize).not.toHaveBeenCalled();
    expect(planner).not.toHaveBeenCalled();
  });
  it('passes the selected TTS speed to authoring so the script budget fits the actual settings', async () => {
    const {directory} = await save(draft);
    const source = resolve(directory, 'source.md');
    await writeFile(source, draft.sourceText);
    await runCli(['create', source, '--target-duration', '150', '--tts-speed', '0.8', '--plan-only']);
    expect(planner).toHaveBeenCalledWith(expect.objectContaining({targetDurationSeconds: 150, ttsSpeed: 0.8}));
    expect(synthesize).not.toHaveBeenCalled();
  });
});
