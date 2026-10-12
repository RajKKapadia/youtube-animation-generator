import {afterEach, describe, expect, it, vi} from 'vitest';
import {sourceCoverageIssues, sourcePointsFor} from './source-coverage.js';
import {estimateDraftNarrationTiming, narrationResponseSchemaFor, narrationResponseShapeFor, planNarratedVideo} from './narration-planner.js';
import {sanitizeNarratedCandidate} from './narration-plan-recovery.js';
import {supertonicJobSchema} from './supertonic/protocol.js';

const {create, chat} = vi.hoisted(() => ({create: vi.fn(), chat: vi.fn()}));
vi.mock('openai', () => ({default: class {
  responses = {create};
  chat = {completions: {create: chat}};
}}));
afterEach(() => {vi.unstubAllEnvs(); create.mockReset(); chat.mockReset();});

const stories = [
  ['Model release', 'Mistral released a multimodal model. Its reported benchmarks need independent evaluation.'],
  ['Creator experiments', 'YouTube lets creators test video hooks. Tests compare three different cuts.'],
  ['Technology hiring', 'India technology hiring increased. Experienced engineers account for most openings.'],
];
const source = stories.map(([label, text], index) => `${index + 1}. ${label}\n${text}`).join('\n\n');
const scenes = stories.map(([title, text], index) => ({
  id: `story-${index + 1}`, title, reason: 'Explains this story.', backgroundPrompt: 'Quiet abstract backdrop.',
  template: 'callout', primaryItems: [title], secondaryItems: [], leftLabel: '', rightLabel: '',
  visual: {kind: 'diagram', motion: 'reveal', motif: 'none'},
  icons: {focal: null, primary: [null], secondary: []},
  beats: [{id: 'explain', expression: 'none', phrases: [{id: 'spoken', text}], primaryItemIndices: [0], secondaryItemIndices: []}],
}));
const coverage = stories.map(([, text], index) => ({pointId: `point-${index + 1}`, sceneId: `story-${index + 1}`, beatIds: ['explain'], sourceEvidence: text!}));
const payload = {title: 'Three technology updates', palette: 'cyan', scenes, sourceCoverage: coverage};
const response = (value: unknown) => ({status: 'completed', output: [], output_text: JSON.stringify(value)});

describe('source point inventory', () => {
  it('keeps numbered story titles with their full multi-paragraph explanation', () => {
    const points = sourcePointsFor('1. Models\nFirst paragraph.\n\nQualification.\n\n2. Creators\nHook testing.');
    expect(points.map(({label}) => label)).toEqual(['Models', 'Creators']);
    expect(points[0]!.text).toContain('Qualification.');
  });
  it('handles markdown sections, bullets and plain paragraphs without treating a title as a story', () => {
    expect(sourcePointsFor('# Roundup\n\n## Models\nRelease details.\n\n## Creators\nTesting details.').map(({label}) => label)).toEqual(['Models', 'Creators']);
    expect(sourcePointsFor('# Roundup\n\n## Updates\n- Models launched.\n- Creators test hooks.')).toHaveLength(2);
    expect(sourcePointsFor('# Roundup\n## Models\n## Creators').map(({label}) => label)).toEqual(['Models', 'Creators']);
    expect(sourcePointsFor('Models launched.\n\nCreators test hooks.')).toHaveLength(2);
  });
  it('does not split a fenced code example into numbered stories', () => {
    expect(sourcePointsFor('Explain this code.\n```txt\n1. example\n2. example\n```')).toHaveLength(1);
  });
  it('keeps tabular headers and nested takeaway lists inside their numbered section', () => {
    const points = sourcePointsFor([
      '1. Ranked transactions',
      '#\tCompany\tBuyer / seller\tValue',
      '1\tITC\tInstitutional buyer\t₹100 cr',
      '2. Ownership transition',
      'The foreign exit was absorbed by institutional funds.',
      '3. Market context and takeaways',
      'The index declined despite institutional buying.',
      'The developments that matter most:',
      '1. The ownership transition attracted several funds.',
      '2. Foreign selling accelerated.',
      '3. A smaller company attracted a new mutual fund.',
      'These are distinct transactions, not monthly holdings changes.',
    ].join('\n'));
    expect(points.map(({label}) => label)).toEqual(['Ranked transactions', 'Ownership transition', 'Market context and takeaways']);
    expect(points[0]!.text).toContain('#\tCompany\tBuyer / seller\tValue');
    expect(points[2]!.text).toContain('3. A smaller company');
    expect(points[2]!.text).toContain('not monthly holdings changes');
  });
  it('retains supporting bullets without swallowing the next numbered story', () => {
    const points = sourcePointsFor('1. Models\n- A release detail.\n- A qualification.\n2. Creators\n  1. First experiment.\n  2. Second experiment.\n\n3. Hiring\nMore openings.');
    expect(points.map(({label}) => label)).toEqual(['Models', 'Creators', 'Hiring']);
    expect(points[0]!.text).toContain('A qualification.');
    expect(points[1]!.text).toContain('Second experiment.');
    expect(sourcePointsFor('- Models launched.\n  - A qualification.\n- Creators test hooks.').map(({label}) => label)).toEqual(['Models launched.', 'Creators test hooks.']);
  });
});

describe('spoken coverage validation', () => {
  it('rejects missing later stories, fabricated excerpts and references only to labels', () => {
    const points = sourcePointsFor(source);
    expect(sourceCoverageIssues(points, coverage, scenes)).toEqual([]);
    expect(sourceCoverageIssues(points, coverage.slice(0, 1), scenes).join(' ')).toContain('Missing narrated coverage for point-3');
    expect(sourceCoverageIssues(points, [{...coverage[0]!, sourceEvidence: 'Invented evidence'}], scenes).join(' ')).toContain('copied from that source point');
    expect(sourceCoverageIssues(points, [{...coverage[0]!, beatIds: ['title']}], scenes).join(' ')).toContain('existing spoken beats');
    expect(sourceCoverageIssues(points, coverage.map((entry) => ({...entry, sceneId: scenes[0]!.id})), scenes).join(' ')).toContain('needs its own spoken explanation');
  });
  it('includes the same required coverage shape for structured and JSON-mode providers', () => {
    expect(narrationResponseSchemaFor(true).safeParse({...payload, sourceCoverage: undefined}).success).toBe(false);
    expect(narrationResponseShapeFor({generatedVisuals: 'off', hasCodeSources: false, hasLocalImages: false, sourceHasNumbers: false, requireCoverage: true})).toContain('sourceCoverage');
  });
});

describe('complete summary planning', () => {
  it.each(['openai', 'groq'] as const)('repairs repeated caption ids locally on %s without changing speech or coverage', async (provider) => {
    vi.stubEnv(provider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY', 'fixture-key');
    const input = structuredClone(payload);
    const beat = input.scenes[0]!.beats[0]!;
    beat.phrases = [{id: 'spoken', text: 'A source detail.'}, {id: 'spoken-2', text: 'A qualification.'}, {id: 'spoken', text: 'The closing sentence.'}];
    input.scenes[0]!.beats.push({...structuredClone(beat), id: 'detail', primaryItemIndices: []});
    const mock = provider === 'openai' ? create : chat;
    mock.mockResolvedValue(provider === 'openai' ? response(input) : {choices: [{message: {content: JSON.stringify(input)}}]});
    const plan = await planNarratedVideo({provider, model: 'fixture', sourceText: source, targetDurationSeconds: 150, language: 'en', generatedVisuals: 'off'});
    expect(mock).toHaveBeenCalledTimes(1);
    const phrases = plan.scenes[0]!.beats.flatMap(({phrases}) => phrases);
    expect(new Set(phrases.map(({id}) => id)).size).toBe(phrases.length);
    expect(phrases.slice(0, 3).map(({id}) => id)).toEqual(['spoken', 'spoken-2', 'spoken-3']);
    expect(phrases.map(({text}) => text)).toEqual(input.scenes[0]!.beats.flatMap(({phrases}) => phrases.map(({text}) => text)));
    expect(plan.sourceCoverage).toEqual(coverage);
    expect(plan.planningWarnings?.join(' ')).toContain('duplicate caption phrase ids renamed');
  });
  it.each(['openai', 'groq'] as const)('reports character, anchor and coverage failures together on %s', async (provider) => {
    vi.stubEnv(provider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY', 'fixture-key');
    const missing = structuredClone({...payload, scenes: scenes.slice(0, 1), sourceCoverage: coverage.slice(0, 1)});
    missing.scenes[0]!.beats[0]!.primaryItemIndices = [];
    const broken = {...missing, scenes: [{...missing.scenes[0], visual: {kind: 'character-scene'}}]};
    const mock = provider === 'openai' ? create : chat;
    if (provider === 'openai') mock.mockResolvedValueOnce(response(broken)).mockResolvedValueOnce(response(payload));
    else mock.mockResolvedValueOnce({choices: [{message: {content: JSON.stringify(broken)}}]}).mockResolvedValueOnce({choices: [{message: {content: JSON.stringify(payload)}}]});
    const onPlanningRetry = vi.fn();
    await planNarratedVideo({provider, model: 'fixture', sourceText: source, targetDurationSeconds: 150, language: 'en', generatedVisuals: 'off', onPlanningRetry});
    expect(mock).toHaveBeenCalledTimes(2);
    const warning = onPlanningRetry.mock.calls[0]![0];
    expect(warning).toContain('character-scene');
    expect(warning).toContain('Missing narrated coverage for point-3');
    // JSON-mode sanitation already repairs item anchors before validation.
    if (provider === 'openai') expect(warning).toContain('anchored exactly once');
  });
  it.each(['openai', 'groq'] as const)('repairs an omitted story on %s and keeps coverage after timing', async (provider) => {
    vi.stubEnv(provider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY', 'fixture-key');
    const missing = {...payload, scenes: scenes.slice(0, 1), sourceCoverage: coverage.slice(0, 1)};
    const mock = provider === 'openai' ? create : chat;
    if (provider === 'openai') mock.mockResolvedValueOnce(response(missing)).mockResolvedValueOnce(response(payload));
    else mock.mockResolvedValueOnce({choices: [{message: {content: JSON.stringify(missing)}}]}).mockResolvedValueOnce({choices: [{message: {content: JSON.stringify(payload)}}]});
    const plan = await planNarratedVideo({provider, model: 'fixture', sourceText: source, targetDurationSeconds: 10, language: 'en', generatedVisuals: 'off'});
    expect(mock).toHaveBeenCalledTimes(2);
    expect(plan.scenes).toHaveLength(3);
    expect(plan.sourceCoverage).toEqual(coverage);
    expect(estimateDraftNarrationTiming(plan).sourceCoverage).toEqual(coverage);
    const request = JSON.stringify(mock.mock.calls[0]![0]);
    expect(request).toContain('ALL its distinct points');
    expect(request).toContain('soft target, never a cutoff');
    expect(request).toContain('165 spoken words');
    expect(request).not.toContain('focused on ONE clear takeaway');
  });
  it('fails after bounded retries rather than accepting a first-topic-only plan', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'fixture-key');
    create.mockResolvedValue(response({...payload, scenes: scenes.slice(0, 1), sourceCoverage: coverage.slice(0, 1)}));
    await expect(planNarratedVideo({provider: 'openai', model: 'fixture', sourceText: source, targetDurationSeconds: 60, language: 'en', generatedVisuals: 'off'})).rejects.toThrow('Missing narrated coverage for point-3');
    expect(create).toHaveBeenCalledTimes(3);
  });
  it('inventories original topics rather than research-added bullet points', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'fixture-key');
    create.mockResolvedValue(response(payload));
    const research = {version: 1 as const, kind: 'web-research' as const, sourceHash: 'a'.repeat(64), researchedAt: '2026-10-08T00:00:00Z', model: 'fixture', mode: 'auto' as const, searchContextSize: 'medium' as const, maxToolCalls: 4 as const, queries: ['fixture'], summary: 'Supporting evidence.', claims: [], sources: []};
    await planNarratedVideo({provider: 'openai', model: 'fixture', sourceText: `${source}\n\n- Extra research note.`, originalSourceText: source, research, targetDurationSeconds: 60, language: 'en', generatedVisuals: 'off'});
    expect(JSON.stringify(create.mock.calls[0]![0])).toContain('REQUIRED SOURCE POINTS (3, in source order)');
  });
  it('keeps scenes after the sixth on the JSON-mode path and allows speech over sixty seconds', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'fixture-key');
    const many = Array.from({length: 8}, (_, index) => ({...scenes[index % 3]!, id: `scene-${index}`, beats: scenes.map((scene, beatIndex) => ({...scene.beats[0]!, id: `beat-${beatIndex}`, phrases: scene.beats[0]!.phrases.map((phrase) => ({...phrase, id: `phrase-${beatIndex}`})), primaryItemIndices: beatIndex === 0 ? [0] : []}))}));
    expect((sanitizeNarratedCandidate({title: 'All stories', scenes: many}) as {scenes: unknown[]}).scenes).toHaveLength(8);
    create.mockResolvedValue(response({title: 'All stories', palette: 'cyan', scenes: many}));
    const plan = await planNarratedVideo({provider: 'openai', model: 'fixture', sourceText: stories.map(([, text]) => text).join(' '), targetDurationSeconds: 60, language: 'en', generatedVisuals: 'off'});
    expect(plan.scenes).toHaveLength(8);
    expect(estimateDraftNarrationTiming(plan).durationMs).toBeGreaterThan(60000);
    expect(supertonicJobSchema.parse({assetsDirectory: '/tmp/model', outputDirectory: '/tmp/output', voice: 'M1', language: 'en', speed: 1.05, steps: 8, scenes: plan.scenes}).scenes).toHaveLength(8);
  });
  it('wraps long JSON-mode caption phrases without losing the rest of the narration', () => {
    const original = 'This is a detailed source supported explanation. '.repeat(4) + 'The qualification at the end must survive.';
    const input = structuredClone(payload);
    input.scenes[0]!.beats[0]!.phrases = [{id: 'long', text: original}];
    const sanitized = sanitizeNarratedCandidate(input) as typeof payload;
    const phrases = sanitized.scenes[0]!.beats[0]!.phrases;
    expect(phrases.map(({text}) => text).join(' ')).toBe(original);
    expect(phrases.every(({text}) => text.length <= 120)).toBe(true);
  });
});
