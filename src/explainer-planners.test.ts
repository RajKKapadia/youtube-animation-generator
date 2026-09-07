import {afterEach, describe, expect, it, vi} from 'vitest';
import {EXPLAINER_FIXTURES, FIXTURE_CODE, fixtureSubtitleSuggestion} from './explainer-fixtures.js';
import {planNarratedVideo} from './narration-planner.js';
import {planAnimations} from './planner.js';

const {parse} = vi.hoisted(() => ({parse: vi.fn()}));
vi.mock('openai', () => ({default: class {responses = {parse};}}));
afterEach(() => {vi.unstubAllEnvs(); parse.mockReset();});

describe('planner request and materialization integration', () => {
  it('sends numbered source code to narrated planning and persists locally extracted code', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'fixture-key');
    const {scene, sourceText} = EXPLAINER_FIXTURES[2]!;
    parse.mockResolvedValue({output_parsed: {title: scene.title, palette: 'cyan', scenes: [scene]}});
    const plan = await planNarratedVideo({generatedVisuals: 'off', language: 'en', model: 'fixture-model', sourceText, targetDurationSeconds: 10, codeSources: [FIXTURE_CODE]});
    expect(plan.version).toBe(7);
    expect(plan.scenes[0]!.visual).toMatchObject({kind: 'code-walkthrough', excerpt: {text: FIXTURE_CODE.text}});
    const request = parse.mock.calls[0]![0];
    expect(request.store).toBe(false);
    expect(JSON.stringify(request.input)).toContain(`CODE_SOURCE_ID ${FIXTURE_CODE.id}`);
    expect(JSON.stringify(request.input)).toContain('3:     return message');
  });

  it('sends the same source catalog to subtitle planning and preserves cue timing', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'fixture-key');
    const {scene, sourceText} = EXPLAINER_FIXTURES[2]!;
    parse.mockResolvedValue({output_parsed: {palette: 'cyan', animations: [fixtureSubtitleSuggestion(scene)]}});
    const plan = await planAnimations([{cueIndex: 1, sourceIndex: '1', startMs: 1000, endMs: 7000, text: sourceText}], {model: 'fixture-model', sourceSubtitle: '/tmp/fixture.srt', maxSuggestions: 6, codeSources: [FIXTURE_CODE]});
    expect(plan.version).toBe(3);
    expect(plan.clips[0]!.visual).toMatchObject({kind: 'code-walkthrough', excerpt: {text: FIXTURE_CODE.text}});
    expect(plan.clips[0]!.sourceStartMs).toBe(1000);
    expect(plan.clips[0]!.primaryItemTimings).toEqual([{cueIndex: 1, startMs: 0}, {cueIndex: 1, startMs: 0}, {cueIndex: 1, startMs: 0}]);
    expect(JSON.stringify(parse.mock.calls[0]![0].input)).toContain(`CODE_SOURCE_ID ${FIXTURE_CODE.id}`);
  });

  it('saves a warning and preserves narration when a model selects unavailable code', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'fixture-key');
    const {scene, sourceText} = EXPLAINER_FIXTURES[2]!;
    parse.mockResolvedValue({output_parsed: {title: scene.title, palette: 'cyan', scenes: [scene]}});
    const plan = await planNarratedVideo({generatedVisuals: 'off', language: 'en', model: 'fixture-model', sourceText, targetDurationSeconds: 10});
    expect(plan.scenes[0]!.visual.kind).toBe('diagram');
    expect(plan.scenes[0]!.beats).toEqual(scene.beats);
    expect(plan.planningWarnings?.join(' ')).toContain('Unknown code source');
  });
});
