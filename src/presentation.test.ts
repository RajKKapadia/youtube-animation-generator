import {readFile} from 'node:fs/promises';
import {describe, expect, it} from 'vitest';
import {compositionChoices, directScenes, presentationIssue, selectPresentation, visibleItemIndices} from './presentation.js';
import {selectCoverDirection, validateCoverDirection} from './cover-direction.js';
import {EXPLAINER_FIXTURES, makeExplainerDraft, makeExplainerTimedPlan} from './explainer-fixtures.js';
import {narratedPlanSchema, narratedPublishPlanSchema, publishSceneSchema, subtitleAnimationClipSchema} from './types.js';

describe('content-directed presentation', () => {
  it('selects structurally appropriate compositions without manufacturing evidence', () => {
    expect(EXPLAINER_FIXTURES.map(({scene}) => selectPresentation(scene).composition)).toEqual(['statement', 'comparison', 'evidence', 'process', 'process', 'evidence']);
    const callout = {...EXPLAINER_FIXTURES[0]!.scene, visual: {kind: 'diagram'}};
    expect(compositionChoices(callout)).toEqual(['statement']);
    expect(presentationIssue({...callout, presentation: {composition: 'evidence', reveal: 'focus'}})).toMatch(/cannot represent/);
  });
  it('varies equally suitable adjacent compositions deterministically', () => {
    const scene = {...EXPLAINER_FIXTURES[0]!.scene, visual: {kind: 'diagram'}, icons: {focal: 'security', primary: [null]}};
    const directed = directScenes([scene, scene, scene], true);
    expect(directed[0]!.presentation.composition).not.toBe(directed[1]!.presentation.composition);
    expect(directScenes([scene, scene, scene], true)).toEqual(directed);
    expect(directed.map(({storyRole}) => storyRole)).toEqual(['hook', 'explain', 'takeaway']);
    expect(directScenes([scene], false)[0]).not.toHaveProperty('storyRole');
  });
  it('honours delayed and simultaneous cues without discarding co-timed items', () => {
    const starts = [500, 500, 2200, 2200, 4000];
    expect(visibleItemIndices(starts, 499, 'focus')).toEqual([]);
    expect(visibleItemIndices(starts, 500, 'focus')).toEqual([0, 1]);
    expect(visibleItemIndices(starts, 2199, 'focus')).toEqual([0, 1]);
    expect(visibleItemIndices(starts, 2200, 'focus')).toEqual([2, 3]);
    expect(visibleItemIndices(starts, 2200, 'build')).toEqual([0, 1, 2, 3]);
    expect(visibleItemIndices(starts, 4500, 'focus')).toEqual([4]);
  });
  it('preserves presentation through saved narrated and subtitle plan parsing', async () => {
    const draft = await makeExplainerDraft();
    const directed = {...draft, scenes: directScenes(draft.scenes, true)};
    expect(narratedPlanSchema.parse(JSON.parse(JSON.stringify(directed))).scenes[0]!.presentation).toEqual(directed.scenes[0]!.presentation);
    const plan = await makeExplainerTimedPlan();
    const scene = directScenes(plan.scenes, false)[0]!;
    const clip = subtitleAnimationClipSchema.parse({...scene, startCue: 1, endCue: 1, sourceStartMs: 0, sourceEndMs: scene.durationMs, transcript: EXPLAINER_FIXTURES[0]!.sourceText, captionCues: [], primaryItemTimings: scene.primaryItemTimings.map(({startMs}) => ({startMs, cueIndex: 1})), secondaryItemTimings: []});
    expect(clip.presentation).toEqual(scene.presentation);
  });
  it('does not opt legacy saved plans into new layouts', async () => {
    const saved = JSON.parse(await readFile('fixtures/sample.narration-plan.json', 'utf8'));
    expect(narratedPlanSchema.parse(saved).scenes.every((scene) => scene.presentation === undefined)).toBe(true);
    const publish = narratedPublishPlanSchema.parse(JSON.parse(await readFile('fixtures/sample.publish.json', 'utf8')));
    expect(publish.thumbnail.composition).toBeUndefined();
  });
  it('rejects edited layouts that would hide a comparison lane', async () => {
    const draft = await makeExplainerDraft();
    draft.scenes[1]!.presentation = {composition: 'statement', reveal: 'focus'};
    expect(narratedPlanSchema.safeParse(draft).success).toBe(false);
  });
});

describe('cover direction', () => {
  it('preserves visual evidence and validates saved content references', async () => {
    const draft = await makeExplainerDraft();
    const scene = publishSceneSchema.parse(draft.scenes[5]);
    expect(scene.visual?.kind).toBe('data-visualization');
    const publish = narratedPublishPlanSchema.parse(JSON.parse(await readFile('fixtures/sample.publish.json', 'utf8')));
    publish.thumbnail = {...publish.thumbnail, sceneId: scene.id, ...selectCoverDirection(scene, publish.thumbnail.headline)};
    expect(() => validateCoverDirection(publish, scene)).not.toThrow();
    publish.thumbnail.primaryItemIndices = [99];
    expect(() => validateCoverDirection(publish, scene)).toThrow(/indices/);
  });
  it('does not silently invent missing comparison or evidence content', async () => {
    const draft = await makeExplainerDraft();
    const scene = publishSceneSchema.parse(draft.scenes[0]);
    const publish = narratedPublishPlanSchema.parse(JSON.parse(await readFile('fixtures/sample.publish.json', 'utf8')));
    publish.thumbnail.composition = 'comparison';
    expect(() => validateCoverDirection(publish, scene)).toThrow(/incompatible/);
    publish.thumbnail.composition = 'evidence';
    expect(() => validateCoverDirection(publish, scene)).toThrow(/incompatible/);
  });
  it('rejects mixing different before/after pairs and unknown chart values', async () => {
    const draft = await makeExplainerDraft();
    const scene = publishSceneSchema.parse(draft.scenes[1]);
    const publish = narratedPublishPlanSchema.parse(JSON.parse(await readFile('fixtures/sample.publish.json', 'utf8')));
    publish.thumbnail = {...publish.thumbnail, ...selectCoverDirection(scene, publish.thumbnail.headline)};
    publish.thumbnail.secondaryItemIndices = [1];
    expect(() => validateCoverDirection(publish, scene)).toThrow(/pairs/);
    const chart = publishSceneSchema.parse(draft.scenes[5]);
    publish.thumbnail = {...publish.thumbnail, ...selectCoverDirection(chart, publish.thumbnail.headline)};
    expect(publish.thumbnail.datumId).toBe('y-3');
    publish.thumbnail.datumId = 'missing';
    expect(() => validateCoverDirection(publish, chart)).toThrow(/datumId/);
  });
});
