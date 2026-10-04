import {access, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {APIConnectionTimeoutError} from 'openai';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {runCli} from './cli.js';
import {draftNarratedPlanSchema} from './types.js';

const {create, planNarratedVideo} = vi.hoisted(() => ({create: vi.fn(), planNarratedVideo: vi.fn()}));
vi.mock('openai', async (importOriginal) => ({
  ...await importOriginal<typeof import('openai')>(),
  default: class { responses = {create}; },
}));
vi.mock('./narration-planner.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./narration-planner.js')>(), planNarratedVideo,
}));

const directories: string[] = [];
const sourceText = 'A queue separates producers from consumers.';
beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', 'fixture-key');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  planNarratedVideo.mockImplementation(async (options) => ({
    version: 7, kind: 'narrated-video', stage: 'draft', sourceText: options.sourceText,
    ...(options.research ? {research: options.research, originalSourceText: options.originalSourceText} : {}),
    generatedAt: '2026-10-04', model: 'fixture', targetDurationSeconds: 10, language: 'en', title: 'Queues', mediaAssets: [], palette: 'cyan',
    scenes: [{id: 'queue', template: 'callout', title: 'Queue', primaryItems: ['Queue'], secondaryItems: [],
      leftLabel: '', rightLabel: '', reason: 'Shows the queue.',
      backgroundPrompt: 'Abstract queue backdrop.', icons: {focal: null, primary: [null], secondary: []},
      visual: {kind: 'diagram', motion: 'reveal', motif: 'none', assetId: null},
      beats: [{id: 'queue', expression: 'none', phrases: [{id: 'queue-phrase', text: sourceText}], primaryItemIndices: [0], secondaryItemIndices: []}],
    }],
  }));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  create.mockReset();
  planNarratedVideo.mockReset();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});
const runResearch = async (mode: 'auto' | 'required') => {
  const directory = await mkdtemp(resolve(tmpdir(), 'cli-research-'));
  directories.push(directory);
  const source = resolve(directory, 'summary.txt');
  await writeFile(source, sourceText);
  return {directory, run: () => runCli(['create', source, '--research', mode, '--model', 'fixture', '--plan-only'])};
};

describe('CLI research boundaries', () => {
  it('continues an auto run from the original source and saves the fallback warning', async () => {
    create.mockRejectedValue(new APIConnectionTimeoutError());
    const {directory, run} = await runResearch('auto');
    await run();
    expect(planNarratedVideo).toHaveBeenCalledWith(expect.objectContaining({sourceText}));
    expect(planNarratedVideo.mock.calls[0]![0].research).toBeUndefined();
    const plan = JSON.parse(await readFile(resolve(directory, 'summary-video/summary.narration-plan.json'), 'utf8'));
    expect(plan.sourceText).toBe(sourceText);
    expect(plan.research).toBeUndefined();
    expect(draftNarratedPlanSchema.parse(plan)).toMatchObject({sourceText});
    expect(plan.planningWarnings.join(' ')).toContain('it has not been web-verified');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Research warning: Optional web research'));
    await expect(access(resolve(directory, 'summary-video/summary.research.json'))).rejects.toThrow();
  });

  it('stops a required run before planning when research is unavailable', async () => {
    create.mockRejectedValue(new APIConnectionTimeoutError());
    const {directory, run} = await runResearch('required');
    await expect(run()).rejects.toThrow('OpenAI web research request failed');
    expect(planNarratedVideo).not.toHaveBeenCalled();
    await expect(access(resolve(directory, 'summary-video/summary.narration-plan.json'))).rejects.toThrow();
  });

  it('retains valid research while excluding a claim citing an unreturned URL', async () => {
    create.mockResolvedValue({status: 'completed', output: [{type: 'web_search_call', status: 'completed',
      action: {type: 'search', sources: [{url: 'https://example.com/queues'}]},
    }], output_text: JSON.stringify({summary: 'One claim could not be verified.', claims: [
      {claim: 'Queues retain pending work.', status: 'supported', sourceUrls: ['https://example.com/queues']},
      {claim: 'Unverified extra material.', status: 'context', sourceUrls: ['https://invented.example/fact']},
    ]})});
    const {directory, run} = await runResearch('auto');
    await run();
    const options = planNarratedVideo.mock.calls[0]![0];
    expect(options.sourceText).toContain('Queues retain pending work.');
    expect(options.sourceText).not.toContain('Unverified extra material.');
    expect(options.originalSourceText).toBe(sourceText);
    const plan = JSON.parse(await readFile(resolve(directory, 'summary-video/summary.narration-plan.json'), 'utf8'));
    expect(plan.planningWarnings.join(' ')).toContain('no valid citations remain');
    expect(plan.research.claims).toHaveLength(1);
  });
});
