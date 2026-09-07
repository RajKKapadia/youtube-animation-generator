import {describe, expect, it} from 'vitest';
import {zodTextFormat} from 'openai/helpers/zod';
import {EXPLAINER_FIXTURES, FIXTURE_CODE, fixtureSubtitleSuggestion, makeExplainerDraft, makeExplainerTimedPlan} from './explainer-fixtures.js';
import {recoverUnsupportedNarratedVisuals} from './narration-planner.js';
import {materializeSubtitleVisualPlan} from './planner.js';
import {dataVisualizationSchema, draftNarrationSceneSuggestionSchema, narratedPlanSchema, outputManifestSchema, savedPlanSchema, subtitleAnimationPlanResponseSchema} from './types.js';
import {explainerGroundingIssue, visualTreatmentKey} from './explainer-visuals.js';
import {activeItemIndex, chartDomain, itemAnimationWindow, windowProgress} from './remotion/explainer-timing.js';

describe('six explainer treatments', () => {
  it.each(EXPLAINER_FIXTURES)('grounds and materializes $scene.id in both workflows', async ({scene, sourceText}) => {
    expect(explainerGroundingIssue(scene, sourceText)).toBeNull();
    const plan = await materializeSubtitleVisualPlan({cues: [{cueIndex: 1, sourceIndex: '1', startMs: 500, endMs: 6500, text: sourceText}], generatedVisuals: 'off', localImages: [], codeSources: [FIXTURE_CODE], model: 'test', palette: 'cyan', sourceSubtitle: '/tmp/test.srt', suggestions: [fixtureSubtitleSuggestion(scene)], warnings: []});
    expect(plan.version).toBe(3);
    expect(plan.clips[0]!.visual.kind).toBe(scene.visual.kind);
    expect(plan.clips[0]!.primaryItemTimings?.map(({startMs}) => startMs)).toEqual(scene.primaryItems.map(() => 0));
    expect(savedPlanSchema.parse(plan)).toEqual(plan);
  });

  it('keeps six distinct kinds, code excerpts, and payloads through draft and timed plans', async () => {
    const draft = await makeExplainerDraft();
    const timed = await makeExplainerTimedPlan();
    expect(new Set(draft.scenes.map(({visual}) => visualTreatmentKey(visual))).size).toBe(6);
    expect(timed.scenes.map(({visual}) => visual)).toEqual(draft.scenes.map(({visual}) => visual));
    expect(timed.scenes.flatMap(({primaryItemTimings}) => primaryItemTimings).every(({beatId}) => beatId.startsWith('beat-'))).toBe(true);
  });

  it('serializes the complete planner schema for Structured Outputs', () => {
    const format = JSON.stringify(zodTextFormat(subtitleAnimationPlanResponseSchema, 'explainer_test'));
    for (const {scene} of EXPLAINER_FIXTURES) expect(format).toContain(scene.visual.kind);
    expect(format).toContain('xDatumId');
    expect(format).toContain('highlights');
  });

  it('recovers an unsupported relationship while preserving its narration', () => {
    const original = EXPLAINER_FIXTURES[1]!;
    const scenes = structuredClone([original.scene]);
    if (scenes[0]!.visual.kind !== 'before-after') throw new Error('fixture');
    scenes[0]!.visual.pairs[0]!.sourceEvidence = 'An invented transformation.';
    const recovered = recoverUnsupportedNarratedVisuals({scenes, sourceText: original.sourceText});
    expect(recovered.scenes[0]!.visual.kind).toBe('diagram');
    expect(recovered.scenes[0]!.beats).toEqual(original.scene.beats);
    expect(recovered.warnings[0]).toContain('before-after');
  });

  it('rejects missing sequence endpoints but permits participants used repeatedly', () => {
    const fixture = structuredClone(EXPLAINER_FIXTURES[3]!.scene);
    expect(draftNarrationSceneSuggestionSchema.safeParse(fixture).success).toBe(true);
    if (fixture.visual.kind !== 'sequence-diagram') throw new Error('fixture');
    fixture.visual.messages[0]!.to = 'missing';
    expect(draftNarrationSceneSuggestionSchema.safeParse(fixture).success).toBe(false);
  });

  it('rejects unpaired states, repeated layer indices, and out-of-excerpt code highlights', () => {
    const before = structuredClone(EXPLAINER_FIXTURES[1]!.scene);
    before.secondaryItems.pop();
    expect(draftNarrationSceneSuggestionSchema.safeParse(before).success).toBe(false);
    const layers = structuredClone(EXPLAINER_FIXTURES[4]!.scene);
    if (layers.visual.kind === 'layered-architecture') layers.visual.layerOrder[1] = 0;
    expect(draftNarrationSceneSuggestionSchema.safeParse(layers).success).toBe(false);
    const code = structuredClone(EXPLAINER_FIXTURES[2]!.scene);
    if (code.visual.kind === 'code-walkthrough') code.visual.highlights[0]!.endLine = 9;
    expect(draftNarrationSceneSuggestionSchema.safeParse(code).success).toBe(false);
  });

  it('does not invent code when no code source was supplied', () => {
    const {scene, sourceText} = EXPLAINER_FIXTURES[2]!;
    const result = recoverUnsupportedNarratedVisuals({scenes: [scene], sourceText});
    expect(result.scenes[0]!.visual.kind).toBe('diagram');
    expect(result.warnings[0]).toContain('Unknown code source');
  });

  it('validates both chart axes and rejects invented numeric values before materialization', () => {
    const fixture = structuredClone(EXPLAINER_FIXTURES[5]!);
    if (fixture.scene.visual.kind !== 'data-visualization') throw new Error('fixture');
    const chart = fixture.scene.visual.chart;
    expect(dataVisualizationSchema.safeParse(chart).success).toBe(true);
    chart.data[1]!.value = -99;
    expect(recoverUnsupportedNarratedVisuals({scenes: [fixture.scene], sourceText: fixture.sourceText}).scenes[0]!.visual.kind).toBe('diagram');
    chart.data[2]!.value = 1;
    expect(dataVisualizationSchema.safeParse(chart).success).toBe(false);
    chart.data[2]!.value = 2;
    chart.data[3]!.unit = 'milliseconds';
    expect(dataVisualizationSchema.safeParse(chart).success).toBe(false);
  });

  it('migrates v6 narration without changing existing scene content and rejects new kinds in old envelopes', async () => {
    const plan = await makeExplainerDraft();
    const legacy = {...plan, version: 6, scenes: [{...plan.scenes[0]!, visual: {kind: 'diagram', motion: 'reveal', motif: 'none', assetId: null}}]};
    const upgraded = narratedPlanSchema.parse(legacy);
    expect(upgraded.version).toBe(7);
    expect(upgraded.scenes).toEqual(legacy.scenes);
    expect(narratedPlanSchema.safeParse({...plan, version: 6}).success).toBe(false);
    expect(narratedPlanSchema.safeParse({...plan, version: 6, scenes: [null]}).success).toBe(false);
  });

  it('migrates v2 subtitles and v3 manifests while preserving clip content', async () => {
    const {scene, sourceText} = EXPLAINER_FIXTURES[0]!;
    const plan = await materializeSubtitleVisualPlan({cues: [{cueIndex: 1, sourceIndex: '1', startMs: 0, endMs: 6000, text: sourceText}], generatedVisuals: 'off', localImages: [], model: 'test', palette: 'cyan', sourceSubtitle: '/tmp/test.srt', suggestions: [fixtureSubtitleSuggestion(scene)], warnings: []});
    const clips = plan.clips.map((clip) => ({...clip, visual: {kind: 'diagram', motion: 'reveal', motif: 'none', assetId: null}}));
    expect(savedPlanSchema.parse({...plan, version: 2, clips}).clips).toEqual(clips);
    expect(savedPlanSchema.safeParse({...plan, version: 2}).success).toBe(false);
    const manifest = {version: 3, sourceSubtitle: plan.sourceSubtitle, generatedAt: plan.generatedAt, format: 'green', palette: 'cyan', captions: 'off', sceneBackground: 'off', assetAttributions: [], aspectRatio: '16:9', width: 1920, height: 1080, clips: clips.map((clip) => ({...clip, file: 'clip.mp4'}))};
    expect(outputManifestSchema.parse(manifest).version).toBe(4);
  });
});

describe('speech-window motion', () => {
  it('does not reveal early, reaches its hold state, and finishes tiny windows immediately', () => {
    const window = itemAnimationWindow([1000, 2000], 0, 3000);
    expect(windowProgress(29, 30, window)).toBe(0);
    expect(windowProgress(45, 30, window)).toBe(1);
    expect(windowProgress(30, 30, itemAnimationWindow([1000, 1010], 0, 3000))).toBe(1);
    expect(activeItemIndex([1000, 2000], 1999)).toBe(0);
    expect(activeItemIndex([1000, 2000], 999)).toBe(-1);
  });
  it('sequences items sharing a cue and completes all motion before the hold window', () => {
    const windows = [0, 1, 2].map((index) => itemAnimationWindow([1000, 1000, 1000, 3000], index, 5000));
    expect(windows[0]!.startMs).toBe(1000);
    expect(windows[1]!.startMs).toBeGreaterThan(windows[0]!.startMs);
    expect(windows[2]!.startMs + windows[2]!.durationMs).toBeCloseTo(1800);
    const progress = windows.map((window) => windowProgress(39, 30, window));
    expect(progress[0]).toBe(1);
    expect(progress[1]).toBeGreaterThan(0);
    expect(progress[1]).toBeLessThan(1);
    expect(progress[2]).toBe(0);
  });
  it('gives constant and negative chart series finite proportional domains', () => {
    expect(chartDomain([0, 0])).toEqual([-1, 1]);
    expect(chartDomain([-5, -2])).toEqual([-5, -2]);
    expect(chartDomain([1, 2, 8])).toEqual([1, 8]);
  });
});
