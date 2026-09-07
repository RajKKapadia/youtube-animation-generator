import {loadAssetRegistry} from './asset-registry.js';
import {codeHash, type CodeSource} from './local-code.js';
import {materializeNarratedVisuals} from './narration-planner.js';
import {draftNarratedPlanSchema, draftNarrationSceneSuggestionSchema, timedNarratedPlanSchema, type DraftNarrationSceneSuggestion, type SubtitleAnimationSuggestion} from './types.js';

const codeText = 'def greet(name):\n    message = f"Hello, {name}"\n    return message';
export const FIXTURE_CODE: CodeSource = {id: 'code-greeting', originalName: 'greeting.py', language: 'python', text: codeText, sha256: codeHash(codeText)};
const source = {
  kinetic: 'Start small. Make the change visible. Verify the result. Keep the useful parts.',
  before: 'Before migration, Manual handoff becomes Automatic routing. Repeated entry becomes Shared records. Delayed feedback becomes Immediate feedback.',
  code: 'The greeting function accepts a name, formats a message, and returns it.',
  sequence: 'Client sends Request to API. API sends Read query to Database. Database sends Rows to API. API sends Response to Client.',
  architecture: 'The application layers from top to bottom are Presentation, API, Business rules, Data access, Database, and Storage.',
  line: 'At 1 seconds, Throughput was 20 requests/s. At 2 seconds, Throughput was 45 requests/s. At 4 seconds, Throughput was 35 requests/s. At 8 seconds, Throughput was 70 requests/s.',
};
const fixtures = [
  {id: 'kinetic-text', title: 'Make each idea count', primaryItems: ['Start small.', 'Make the change visible.', 'Verify the result.', 'Keep the useful parts.'], sourceText: source.kinetic, visual: {kind: 'kinetic-text', motion: 'pulse', motif: 'none'}},
  {id: 'before-after', title: 'A clearer workflow', primaryItems: ['Manual handoff', 'Repeated entry', 'Delayed feedback'], secondaryItems: ['Automatic routing', 'Shared records', 'Immediate feedback'], template: 'comparison', leftLabel: 'Before', rightLabel: 'After', sourceText: source.before, visual: {kind: 'before-after', motion: 'reveal', motif: 'automation', pairs: [
    {primaryItemIndex: 0, secondaryItemIndex: 0, sourceEvidence: 'Before migration, Manual handoff becomes Automatic routing.'},
    {primaryItemIndex: 1, secondaryItemIndex: 1, sourceEvidence: 'Repeated entry becomes Shared records.'},
    {primaryItemIndex: 2, secondaryItemIndex: 2, sourceEvidence: 'Delayed feedback becomes Immediate feedback.'},
  ]}},
  {id: 'code-walkthrough', title: 'Read the function one step at a time', primaryItems: ['Accept a name', 'Format the message', 'Return the result'], sourceText: source.code, visual: {kind: 'code-walkthrough', motion: 'scan', motif: 'document', sourceId: FIXTURE_CODE.id, startLine: 1, endLine: 3, sourceEvidence: source.code, highlights: [1, 2, 3].map((line, index) => ({primaryItemIndex: index, startLine: line, endLine: line}))}},
  {id: 'sequence-diagram', title: 'Follow one request and its response', primaryItems: ['Request', 'Read query', 'Rows', 'Response'], template: 'process-flow', sourceText: source.sequence, visual: {kind: 'sequence-diagram', motion: 'flow', motif: 'message', participants: ['Client', 'API', 'Database'].map((label) => ({id: label.toLowerCase(), label})), messages: [
    {from: 'client', to: 'api', primaryItemIndex: 0, sourceEvidence: 'Client sends Request to API.'},
    {from: 'api', to: 'database', primaryItemIndex: 1, sourceEvidence: 'API sends Read query to Database.'},
    {from: 'database', to: 'api', primaryItemIndex: 2, sourceEvidence: 'Database sends Rows to API.'},
    {from: 'api', to: 'client', primaryItemIndex: 3, sourceEvidence: 'API sends Response to Client.'},
  ]}},
  {id: 'layered-architecture', title: 'Build the application layer by layer', primaryItems: ['Presentation', 'API', 'Business rules', 'Data access', 'Database', 'Storage'], template: 'process-flow', sourceText: source.architecture, visual: {kind: 'layered-architecture', motion: 'reveal', motif: 'cloud', layerOrder: [0, 1, 2, 3, 4, 5], sourceEvidence: source.architecture}},
  {id: 'line-chart', title: 'Throughput across the measured interval', primaryItems: ['First observation', 'Second observation', 'Third observation', 'Fourth observation'], sourceText: source.line, visual: {kind: 'data-visualization', motion: 'reveal', motif: 'analytics', chart: {
    type: 'line-chart', title: 'Measured throughput', series: [], categories: [], cards: [], derivedAnnotations: [],
    data: [[1, 20], [2, 45], [4, 35], [8, 70]].flatMap(([x, y], index) => [
      {id: `x-${index}`, label: String(x), value: x, unit: 'seconds', precision: 0, sourceToken: String(x), sourceEvidence: `At ${x} seconds, Throughput was ${y} requests/s.`},
      {id: `y-${index}`, label: 'Throughput', value: y, unit: 'requests/s', precision: 0, sourceToken: String(y), sourceEvidence: `At ${x} seconds, Throughput was ${y} requests/s.`},
    ]),
    points: [0, 1, 2, 3].map((index) => ({xDatumId: `x-${index}`, yDatumId: `y-${index}`, primaryItemIndex: index})),
  }}},
];

export const EXPLAINER_FIXTURES = fixtures.map((fixture) => {
  const secondaryItems = 'secondaryItems' in fixture ? fixture.secondaryItems! : [];
  const scene = draftNarrationSceneSuggestionSchema.parse({
    template: 'callout', secondaryItems: [], leftLabel: '', rightLabel: '', ...fixture,
    reason: 'Explain the supplied source through a timed animation.', backgroundPrompt: 'Low-detail abstract atmosphere.',
    icons: {focal: null, primary: fixture.primaryItems.map(() => null), secondary: secondaryItems.map(() => null)},
    beats: fixture.primaryItems.flatMap((item, index) => [
      {id: `beat-${index}`, expression: 'none', phrases: [{id: `phrase-${index}`, text: item}], primaryItemIndices: [index], secondaryItemIndices: []},
      ...(secondaryItems[index] ? [{id: `beat-${index}-after`, expression: 'none', phrases: [{id: `phrase-${index}-after`, text: secondaryItems[index]}], primaryItemIndices: [], secondaryItemIndices: [index]}] : []),
    ]),
  });
  return {sourceText: fixture.sourceText, scene};
});

export const fixtureSubtitleSuggestion = (scene: DraftNarrationSceneSuggestion): SubtitleAnimationSuggestion => ({
  template: scene.template, title: scene.title, primaryItems: scene.primaryItems, secondaryItems: scene.secondaryItems,
  leftLabel: scene.leftLabel, rightLabel: scene.rightLabel, reason: scene.reason, backgroundPrompt: scene.backgroundPrompt, visual: scene.visual, icons: scene.icons,
  startCue: 1, endCue: 1, primaryItemStartCues: scene.primaryItems.map(() => 1), secondaryItemStartCues: scene.secondaryItems.map(() => 1),
});

export const makeExplainerDraft = async () => {
  const registry = await loadAssetRegistry();
  const result = materializeNarratedVisuals({registry, scenes: EXPLAINER_FIXTURES.map(({scene}) => scene), codeSources: [FIXTURE_CODE]});
  return draftNarratedPlanSchema.parse({version: 7, kind: 'narrated-video', stage: 'draft', sourceText: EXPLAINER_FIXTURES.map(({sourceText}) => sourceText).join('\n'), generatedAt: '2026-09-07T00:00:00Z', model: 'offline-fixture', targetDurationSeconds: 36, language: 'en', title: 'Six ways to explain an idea', palette: 'cyan', mediaAssets: [], scenes: result.scenes});
};

export const makeExplainerTimedPlan = async () => {
  const draft = await makeExplainerDraft();
  return timedNarratedPlanSchema.parse({...draft, stage: 'timed', sampleRate: 24000, totalSamples: 36 * 24000, durationMs: 36000, voice: 'M1', ttsSpeed: 1, ttsSteps: 5, voiceoverPlaybackRate: 1, voiceoverFile: 'fixture.wav', scenes: draft.scenes.map((scene, sceneIndex) => {
    const step = 4800 / scene.beats.length;
    return {...scene, startMs: sceneIndex * 6000, durationMs: 6000,
      beats: scene.beats.map((beat, index) => ({...beat, startMs: 400 + index * step, durationMs: step, sampleCount: step * 24, audioFile: 'fixture.wav', phrases: beat.phrases.map((phrase) => ({...phrase, startMs: 400 + index * step, durationMs: step, sampleCount: step * 24}))})),
      primaryItemTimings: scene.primaryItems.map((_, index) => {const beatIndex = scene.beats.findIndex((beat) => beat.primaryItemIndices.includes(index)); return {beatId: scene.beats[beatIndex]!.id, startMs: 400 + beatIndex * step};}),
      secondaryItemTimings: scene.secondaryItems.map((_, index) => {const beatIndex = scene.beats.findIndex((beat) => beat.secondaryItemIndices.includes(index)); return {beatId: scene.beats[beatIndex]!.id, startMs: 400 + beatIndex * step};}),
    };
  })});
};
