import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {planNarratedVideo, type NarrationPlanOptions} from './narration-planner.js';
import {narrationResponseSchema, planningValidationSummary, recoverNarrationResponse, repairCharacterScene, sanitizeNarratedCandidate, PLACEHOLDER_ITEM} from './narration-plan-recovery.js';
import {draftNarratedPlanSchema, narratedVisualSuggestionSchema, type DraftNarrationSceneSuggestion} from './types.js';

const {create} = vi.hoisted(() => ({create: vi.fn()}));
vi.mock('openai', () => ({default: class {responses = {create};}}));
beforeEach(() => vi.stubEnv('OPENAI_API_KEY', 'fixture-key'));
afterEach(() => {vi.unstubAllEnvs(); create.mockReset();});

const sourceText = 'India investment increased 119%. Global investment increased 110%.';
const options: NarrationPlanOptions = {
  generatedVisuals: 'off', language: 'en', model: 'fixture-model', sourceText, targetDurationSeconds: 60,
};
const scene = (): DraftNarrationSceneSuggestion => ({
  id: 'investment', title: 'Investment growth', reason: 'Compares reported growth.',
  template: 'callout', primaryItems: ['India', 'Global'], secondaryItems: [], leftLabel: '', rightLabel: '',
  backgroundPrompt: 'Abstract low-detail backdrop.',
  icons: {focal: null, primary: [null, null], secondary: []},
  beats: [
    {id: 'india', expression: 'none', phrases: [{id: 'india-phrase', text: 'India investment increased 119%.'}], primaryItemIndices: [0], secondaryItemIndices: []},
    {id: 'global', expression: 'none', phrases: [{id: 'global-phrase', text: 'Global investment increased 110%.'}], primaryItemIndices: [1], secondaryItemIndices: []},
  ],
  visual: {
    kind: 'data-visualization', motion: 'reveal', motif: 'analytics',
    chart: {
      type: 'grouped-bars', title: 'Investment growth',
      data: [
        {id: 'india', label: 'India', value: 119, unit: '%', precision: 0, sourceToken: '119%', sourceEvidence: 'India investment increased 119%.'},
        {id: 'global', label: 'Global', value: 110, unit: '%', precision: 0, sourceToken: '110%', sourceEvidence: 'Global investment increased 110%.'},
      ],
      series: [{id: 'india', label: 'India'}, {id: 'global', label: 'Global'}],
      categories: [{id: 'growth', label: 'Growth', values: [{seriesId: 'india', datumId: 'india'}, {seriesId: 'global', datumId: 'global'}]}],
      cards: [], derivedAnnotations: [],
    },
  },
});
const payload = (scenes: unknown[] = [scene()]) => ({title: 'Investment growth', palette: 'cyan', scenes});
const response = (value: unknown) => ({status: 'completed', output: [], output_text: JSON.stringify(value)});
const chartScene = () => {
  const value = scene();
  if (value.visual.kind !== 'data-visualization') throw new Error('Expected chart fixture');
  return {...value, visual: value.visual};
};

describe('narrated planner recovery at the raw response boundary', () => {
  it.each(['missing value', 'missing series', 'extra cards', 'duplicate value series', 'duplicate series id'])(
    'recovers a grouped-bar %s before strict parsing without inventing chart data', async (failure) => {
      const broken = chartScene();
      const chart = broken.visual.chart;
      if (failure === 'missing value') chart.categories[0]!.values.pop();
      if (failure === 'missing series') chart.series = [];
      if (failure === 'extra cards') chart.cards = [{id: 'india-card', label: 'India', datumId: 'india', annotationId: null}];
      if (failure === 'duplicate value series') chart.categories[0]!.values[1]!.seriesId = 'india';
      if (failure === 'duplicate series id') chart.series[1]!.id = 'india';
      const value = payload([broken, {...scene(), id: 'valid-neighbor'}]);
      expect(narrationResponseSchema.safeParse(value).success).toBe(false);
      create.mockResolvedValue(response(value));
      const plan = await planNarratedVideo(options);
      expect(create).toHaveBeenCalledTimes(1);
      // Exercise the actual SDK format parser that used to throw before recovery.
      const request = create.mock.calls[0]![0];
      expect(request.text.format.strict).toBe(true);
      expect(request.store).toBe(false);
      expect(() => request.text.format.$parseRaw(JSON.stringify(value))).toThrow();
      expect(plan.scenes[0]!.visual).toMatchObject({kind: 'diagram', motion: 'reveal', motif: 'none'});
      expect(plan.scenes[0]!.beats).toEqual(broken.beats);
      expect(plan.scenes[0]!.primaryItems).toEqual(broken.primaryItems);
      expect(plan.scenes[1]!.visual).toMatchObject(scene().visual);
      expect(plan.planningWarnings?.join(' ')).toContain('optional visual is invalid');
      expect(draftNarratedPlanSchema.safeParse(plan).success).toBe(true);
    },
  );

  it('recovers a generated image without its required direction and an empty comparison', async () => {
    const image = {...scene(), visual: {
      kind: 'image-focus', motion: 'drift', motif: 'none', source: 'generated',
      localImageId: null, generatedDirection: null, fit: 'cover', focalPosition: 'center',
    }};
    const comparison = {...scene(), id: 'comparison', template: 'comparison'};
    const value = payload([image, comparison]);
    expect(narrationResponseSchema.safeParse(value).success).toBe(false);
    create.mockResolvedValue(response(value));
    const plan = await planNarratedVideo(options);
    expect(create).toHaveBeenCalledTimes(1);
    expect(plan.scenes[0]!.visual.kind).toBe('diagram');
    expect(plan.mediaAssets).toEqual([]);
    expect(plan.scenes[1]!.template).toBe('callout');
    expect(plan.scenes[1]!.secondaryItems).toEqual([]);
    expect(plan.scenes[1]!.beats).toEqual(comparison.beats);
    expect(plan.planningWarnings?.join(' ')).toContain('no secondary items');
  });

  it('keeps exact source grounding after structural recovery', async () => {
    const invalid = chartScene();
    invalid.visual.chart.data[0]!.value = 999;
    create.mockResolvedValue(response(payload([invalid])));
    const plan = await planNarratedVideo(options);
    expect(plan.scenes[0]!.visual.kind).toBe('diagram');
    expect(plan.planningWarnings?.join(' ')).toContain('not exactly supported');
  });

  it('requests a targeted repair for invalid anchors and validates the returned plan', async () => {
    const invalid = scene();
    invalid.beats[1]!.primaryItemIndices = [0];
    create.mockResolvedValueOnce(response(payload([invalid]))).mockResolvedValueOnce(response(payload()));
    const onPlanningRetry = vi.fn();
    const plan = await planNarratedVideo({...options, onPlanningRetry});
    expect(create).toHaveBeenCalledTimes(2);
    expect(onPlanningRetry).toHaveBeenCalledWith(expect.stringContaining('2/3'));
    const request = create.mock.calls[1]![0];
    expect(request.model).toBe(options.model);
    expect(JSON.stringify(request.input)).toContain(sourceText);
    expect(request.input[2].content).toBe(JSON.stringify(payload([invalid])));
    expect(request.input[3].content).toContain('anchored exactly once');
    expect(plan.scenes[0]!.beats).toEqual(scene().beats);
    expect(plan.planningWarnings?.join(' ')).toContain('attempt 1 needed correction');
  });

  it('stops after two corrective requests and leaves strict saved-plan validation intact', async () => {
    const invalid = scene();
    invalid.beats[1]!.primaryItemIndices = [];
    create.mockResolvedValue(response(payload([invalid])));
    await expect(planNarratedVideo(options)).rejects.toThrow('failed validation after 3 attempts');
    expect(create).toHaveBeenCalledTimes(3);
    expect(narrationResponseSchema.safeParse(payload([invalid])).success).toBe(false);
    expect(create.mock.calls[2]![0].input).toHaveLength(4);
  });

  it('revalidates plan-wide expression limits on repair', async () => {
    const invalid = scene();
    invalid.beats.forEach((beat) => {beat.expression = 'breath';});
    create.mockResolvedValueOnce(response(payload([invalid]))).mockResolvedValueOnce(response(payload()));
    const plan = await planNarratedVideo(options);
    expect(create).toHaveBeenCalledTimes(2);
    expect(plan.planningWarnings?.join(' ')).toContain('consecutive narration beats');
  });

  it('repairs invalid JSON using the same bounded path', async () => {
    create.mockResolvedValueOnce({...response(payload()), output_text: '{'}).mockResolvedValueOnce(response(payload()));
    const plan = await planNarratedVideo(options);
    expect(create).toHaveBeenCalledTimes(2);
    expect(plan.planningWarnings?.join(' ')).toContain('not valid JSON');
  });

  it.each([
    [{status: 'incomplete', incomplete_details: {reason: 'max_output_tokens'}, output: [], output_text: '{}'}, 'did not complete'],
    [{status: 'completed', output: [{type: 'message', content: [{type: 'refusal', refusal: 'Cannot help'}]}], output_text: ''}, 'declined'],
    [{status: 'completed', output: [], output_text: ''}, 'usable'],
  ])('does not retry incomplete, refused, or empty responses', async (value, message) => {
    create.mockResolvedValue(value);
    await expect(planNarratedVideo(options)).rejects.toThrow(message);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not classify a connection or authentication error as a plan error', async () => {
    const error = new Error('Connection error');
    create.mockRejectedValue(error);
    await expect(planNarratedVideo(options)).rejects.toBe(error);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('sanitizeNarratedCandidate — character scenes', () => {
  const sceneWith = (visual: unknown) => ({
    scenes: [{
      id: 'scene-1', title: 'Check-in', template: 'callout',
      primaryItems: ['first', 'second'], secondaryItems: [],
      reason: 'r', backgroundPrompt: 'b',
      icons: {focal: null, primary: [], secondary: []},
      beats: [{id: 'b1', expression: 'none', phrases: [{id: 'p1', text: 'x'}], primaryItemIndices: [0, 1], secondaryItemIndices: []}],
      visual,
    }],
  });
  const visualOf = (input: unknown) =>
    ((sanitizeNarratedCandidate(input) as {scenes: {visual: Record<string, unknown>}[]}).scenes[0]!.visual);

  const base = {
    kind: 'character-scene', motion: 'reveal', motif: 'security',
    set: 'counter', sign: 'RECEPTION',
    cast: [
      {id: 'guest', label: 'guest', position: 'left', outfit: 'casual', age: 'adult', behindSet: false, prop: 'mobile', propPrimaryItemIndex: 0},
      {id: 'desk', label: 'front desk', position: 'right', outfit: 'uniform', age: 'adult', behindSet: true, prop: null, propPrimaryItemIndex: null},
    ],
    speakers: [{primaryItemIndex: 0, castId: 'guest'}, {primaryItemIndex: 1, castId: 'desk'}],
    callout: null,
  };

  it('drops a prop whose cue points past the last visible item', () => {
    // The real failure: a correctly staged scene was rejected outright over a
    // decorative prop index.
    const cast = [{...base.cast[0], propPrimaryItemIndex: 5}, base.cast[1]];
    const visual = visualOf(sceneWith({...base, cast}));
    expect((visual.cast as Record<string, unknown>[])[0]!.prop).toBeNull();
    expect((visual.cast as Record<string, unknown>[])[0]!.propPrimaryItemIndex).toBeNull();
  });

  it('keeps a prop whose cue is valid', () => {
    const visual = visualOf(sceneWith(base));
    expect((visual.cast as Record<string, unknown>[])[0]!.prop).toBe('mobile');
  });

  it('drops speaking turns that point nowhere and de-duplicates the rest', () => {
    const speakers = [
      {primaryItemIndex: 0, castId: 'guest'},
      {primaryItemIndex: 9, castId: 'desk'},
      {primaryItemIndex: 0, castId: 'desk'},
    ];
    const visual = visualOf(sceneWith({...base, speakers}));
    expect(visual.speakers).toEqual([{primaryItemIndex: 0, castId: 'guest'}]);
  });

  it('reassigns a speaking turn given to someone not on stage', () => {
    const visual = visualOf(sceneWith({...base, speakers: [{primaryItemIndex: 0, castId: 'porter'}]}));
    expect((visual.speakers as {castId: string}[])[0]!.castId).toBe('guest');
  });

  it('always leaves at least one speaking turn', () => {
    const visual = visualOf(sceneWith({...base, speakers: []}));
    expect((visual.speakers as unknown[]).length).toBe(1);
  });

  it('clamps a callout cue instead of discarding the callout', () => {
    const callout = {icon: null, eyebrow: 'e', headline: 'h', tone: 'positive', primaryItemIndex: 7, sourceEvidence: 'x'};
    const visual = visualOf(sceneWith({...base, callout}));
    expect((visual.callout as {primaryItemIndex: number}).primaryItemIndex).toBe(1);
  });

  it('separates two characters placed in the same slot', () => {
    const cast = [{...base.cast[0], position: 'left'}, {...base.cast[1], position: 'left'}];
    const visual = visualOf(sceneWith({...base, cast}));
    const positions = (visual.cast as {position: string}[]).map(({position}) => position);
    expect(new Set(positions).size).toBe(2);
  });

  it('puts someone behind a counter that has nobody behind it', () => {
    const cast = base.cast.map((member) => ({...member, behindSet: false}));
    const visual = visualOf(sceneWith({...base, cast}));
    expect((visual.cast as {behindSet: boolean}[]).some(({behindSet}) => behindSet)).toBe(true);
  });

  it('clears staging that only a counter can have', () => {
    const visual = visualOf(sceneWith({...base, set: 'none'}));
    expect(visual.sign).toBeNull();
    expect((visual.cast as {behindSet: boolean}[]).every(({behindSet}) => !behindSet)).toBe(true);
  });

  it('leaves other treatments untouched', () => {
    const diagram = {kind: 'diagram', motion: 'reveal', motif: 'none'};
    expect(visualOf(sceneWith(diagram))).toEqual(diagram);
  });
});

describe('planningValidationSummary', () => {
  const visual = (extra: Record<string, unknown>) => ({
    kind: 'character-scene', motion: 'reveal', motif: 'security',
    set: 'counter', sign: 'RECEPTION',
    cast: [
      {id: 'guest', label: 'guest', position: 'left', outfit: 'casual', age: 'adult', behindSet: false, prop: null, propPrimaryItemIndex: null},
      {id: 'desk', label: 'front desk', position: 'right', outfit: 'uniform', age: 'adult', behindSet: true, prop: null, propPrimaryItemIndex: null},
    ],
    speakers: [{primaryItemIndex: 0, castId: 'guest'}],
    callout: null,
    ...extra,
  });
  const summarize = (value: unknown): string => {
    const result = narratedVisualSuggestionSchema.safeParse(value);
    if (result.success) throw new Error('expected a validation failure');
    return planningValidationSummary(result.error);
  };

  // A failed union reports one top-level "Invalid input"; without flattening,
  // a scene rejected over a single bad enum looked identical to one with no
  // recognisable shape, which made planner warnings undiagnosable.
  it('names the offending field instead of reporting "Invalid input"', () => {
    const summary = summarize(visual({
      cast: [
        {id: 'guest', label: 'guest', position: 'left', outfit: 'casual', age: 'adult', behindSet: false, prop: null, propPrimaryItemIndex: null},
        {id: 'desk', label: 'desk', position: 'right', outfit: 'uniform', age: 'grown-up', behindSet: true, prop: null, propPrimaryItemIndex: null},
      ],
    }));
    expect(summary).not.toBe('plan: Invalid input');
    expect(summary.startsWith('cast.1.age')).toBe(true);
  });

  it('leads with the wrong value, not another branch missing fields', () => {
    expect(summarize(visual({set: 'desk'})).startsWith('set:')).toBe(true);
  });

  it('still says something useful when the treatment is unrecognised', () => {
    const summary = summarize({kind: 'puppet-show', motion: 'reveal', motif: 'none'});
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).not.toBe('plan: Invalid input');
  });

  it('does not repeat an identical complaint from several branches', () => {
    const summary = summarize(visual({set: 'desk'}));
    const lines = summary.split('; ');
    expect(new Set(lines).size).toBe(lines.length);
  });
});

describe('sanitizeNarratedCandidate — treatment names', () => {
  const sceneWithKind = (kind: string) => ({
    scenes: [{
      id: 's', title: 't', template: 'callout', primaryItems: ['a'], secondaryItems: [],
      reason: 'r', backgroundPrompt: 'b', icons: {focal: null, primary: [], secondary: []},
      beats: [{id: 'b', expression: 'none', phrases: [{id: 'p', text: 'x'}], primaryItemIndices: [0], secondaryItemIndices: []}],
      visual: {
        kind, motion: 'reveal', motif: 'security', set: 'front-desk', sign: 'X',
        cast: [
          {id: 'g', label: 'guest', position: 'left', outfit: 'casual', age: 'adult', behindSet: false, prop: null, propPrimaryItemIndex: null},
          {id: 'r', label: 'receptionist', position: 'right', outfit: 'uniform', age: 'adult', behindSet: true, prop: null, propPrimaryItemIndex: null},
        ],
        speakers: [{primaryItemIndex: 0, castId: 'g'}], callout: null,
      },
    }],
  });
  const visualOf = (kind: string) =>
    (sanitizeNarratedCandidate(sceneWithKind(kind)) as {scenes: {visual: Record<string, unknown>}[]}).scenes[0]!.visual;

  // An exact-match check let a mis-cased kind skip every repair, and the union
  // then failed on a field the sanitizer would have fixed.
  it.each(['Character-Scene', ' character-scene ', 'character_scene', 'CHARACTER SCENE'])(
    'recognises %s and still repairs the scene',
    (written) => {
      const visual = visualOf(written);
      expect(visual.kind).toBe('character-scene');
      expect(visual.set).toBe('none');
    },
  );

  it('canonicalises other treatment names too', () => {
    expect(visualOf('Kinetic-Text').kind).toBe('kinetic-text');
  });

  it('leaves an unrecognised name alone for validation to reject', () => {
    expect(visualOf('puppet-show').kind).toBe('puppet-show');
  });
});

describe('sanitizeNarratedCandidate — over-long labels', () => {
  const long = 'This traditional hotel check-in process exposes your full name and your exact date of birth and your home address to a stranger';
  const out = () => (sanitizeNarratedCandidate({
    scenes: [{
      id: 's', title: long, template: 'callout',
      primaryItems: ['short', long], secondaryItems: [],
      reason: 'r', backgroundPrompt: 'b', icons: {focal: null, primary: [], secondary: []},
      beats: [{id: 'b', expression: 'none', phrases: [{id: 'p', text: 'x'}], primaryItemIndices: [0, 1], secondaryItemIndices: []}],
      visual: {kind: 'diagram', motion: 'reveal', motif: 'none'},
    }],
  }) as {scenes: {title: string; primaryItems: string[]}[]}).scenes[0]!;

  // Left unrepaired this failed the whole plan, and the repair loop tended to
  // rewrite the label just as long, so all three attempts burned.
  it('brings an over-long item inside the schema limit', () => {
    for (const item of out().primaryItems) expect(item.length).toBeLessThanOrEqual(80);
  });

  it('brings an over-long title inside the limit', () => {
    expect(out().title.length).toBeLessThanOrEqual(80);
  });

  it('trims at a word boundary rather than mid-word', () => {
    const trimmed = out().primaryItems[1]!;
    expect(trimmed.endsWith('…')).toBe(true);
    expect(trimmed.slice(0, -1).trimEnd()).toBe(trimmed.slice(0, -1));
    expect(long.startsWith(trimmed.slice(0, -1))).toBe(true);
  });

  it('leaves a label that already fits exactly as written', () => {
    expect(out().primaryItems[0]).toBe('short');
  });
});


describe('character-scene repair gaps', () => {
  const scene = (visual: unknown) => ({
    title: 'Check-in', palette: 'cyan',
    scenes: [{
      id: 'scene-1', title: 'Check-in', template: 'callout',
      primaryItems: ['first', 'second'], secondaryItems: [],
      leftLabel: '', rightLabel: '',
      reason: 'r', backgroundPrompt: 'b',
      icons: {focal: null, primary: [], secondary: []},
      beats: [{id: 'b1', expression: 'none', phrases: [{id: 'p1', text: 'x'}], primaryItemIndices: [0, 1], secondaryItemIndices: []}],
      visual,
    }],
  });
  const cast = (overrides: Array<Record<string, unknown>>) => overrides;

  // explainerStructureIssue hard-fails on duplicate ids, and the sanitizer
  // deduplicated positions but never ids, so this was a silent downgrade.
  it('makes duplicate cast ids distinct', () => {
    const repaired = repairCharacterScene({
      kind: 'character-scene',
      cast: cast([{id: 'guest', position: 'left'}, {id: 'guest', position: 'right'}]),
      speakers: [{primaryItemIndex: 0, castId: 'guest'}],
    }, 2);
    const ids = (repaired.cast as Record<string, unknown>[]).map(({id}) => id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe('guest');
    // The speaker must still point at somebody on stage.
    expect(ids).toContain((repaired.speakers as Record<string, unknown>[])[0]!.castId);
  });

  it('backfills a missing or unusable id', () => {
    const repaired = repairCharacterScene({
      kind: 'character-scene',
      cast: cast([{position: 'left'}, {id: 'Front Desk!', position: 'right'}]),
      speakers: [],
    }, 2);
    const ids = (repaired.cast as Record<string, unknown>[]).map(({id}) => String(id));
    expect(ids[0]).toBe('cast-1');
    expect(ids[1]).toBe('front-desk');
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/u);
  });

  // `entry.prop != null` is false for undefined, so a member with no prop key
  // kept `prop: undefined` and failed z.string().nullable().
  it('nulls a prop that was simply absent', () => {
    const repaired = repairCharacterScene({
      kind: 'character-scene',
      cast: cast([{id: 'guest', position: 'left'}, {id: 'desk', position: 'right'}]),
      speakers: [],
    }, 2);
    for (const member of repaired.cast as Record<string, unknown>[]) {
      expect(member.prop).toBeNull();
      expect(member.propPrimaryItemIndex).toBeNull();
    }
  });

  it('drops a prop or callout icon that is not in the catalogue', () => {
    const repaired = repairCharacterScene({
      kind: 'character-scene',
      cast: cast([
        {id: 'guest', position: 'left', prop: 'not-a-real-icon', propPrimaryItemIndex: 0},
        {id: 'desk', position: 'right'},
      ]),
      speakers: [{primaryItemIndex: 0, castId: 'guest'}],
      callout: {
        icon: 'also-not-real', eyebrow: 'e', headline: 'h',
        tone: 'positive', primaryItemIndex: 0, sourceEvidence: 'x',
      },
    }, 2);
    expect((repaired.cast as Record<string, unknown>[])[0]!.prop).toBeNull();
    expect((repaired.callout as Record<string, unknown>).icon).toBeNull();
    // The outcome the callout marks survives; only the undrawable icon goes.
    expect((repaired.callout as Record<string, unknown>).headline).toBe('h');
  });

  // Repair is called from both sanitizeNarratedCandidate and
  // recoverNarrationResponse, so it has to be a projection onto the valid set.
  it('is idempotent', () => {
    const inputs: Array<Record<string, unknown>> = [
      {kind: 'character-scene', cast: cast([{id: 'guest', position: 'left'}, {id: 'guest', position: 'left'}]), speakers: []},
      {kind: 'character-scene', set: 'counter', sign: 'DESK', cast: cast([{id: 'a', position: 'left'}, {id: 'b', position: 'right'}]), speakers: [{primaryItemIndex: 9, castId: 'zz'}]},
      {kind: 'character-scene', cast: cast([{id: 'a', position: 'left', prop: 'mobile', propPrimaryItemIndex: 0}, {id: 'b', position: 'right'}]), speakers: [{primaryItemIndex: 1, castId: 'b'}], callout: {icon: 'mobile', eyebrow: 'e', headline: 'h', tone: 'neutral', primaryItemIndex: 7, sourceEvidence: 's'}},
    ];
    for (const input of inputs) {
      const once = repairCharacterScene(structuredClone(input), 2);
      const twice = repairCharacterScene(structuredClone(once), 2);
      expect(twice).toEqual(once);
    }
  });

  // The whole point of the prefaults: a model that produces only the fields
  // that carry meaning keeps its scene instead of getting a plain diagram.
  it('keeps a minimal character scene through recovery with no warning', () => {
    const recovered = recoverNarrationResponse(scene({
      kind: 'character-scene',
      cast: cast([{id: 'guest', position: 'left'}, {id: 'desk', position: 'right'}]),
      sourceEvidence: 'The front desk asks for identity proof',
      speakers: [{primaryItemIndex: 0, castId: 'guest'}],
    }));
    expect(recovered.scenes[0]!.visual.kind).toBe('character-scene');
    expect(recovered.warnings).toEqual([]);
    expect(recovered.lostVisuals).toEqual([]);
  });

  // Forgiveness stops at grounding: an invented exchange must still be lost.
  it('still reports a character scene with no source evidence as lost', () => {
    const recovered = recoverNarrationResponse(scene({
      kind: 'character-scene',
      cast: cast([{id: 'guest', position: 'left'}, {id: 'desk', position: 'right'}]),
      speakers: [{primaryItemIndex: 0, castId: 'guest'}],
    }));
    expect(recovered.scenes[0]!.visual.kind).toBe('diagram');
    expect(recovered.lostVisuals).toHaveLength(1);
    expect(recovered.lostVisuals[0]).toMatchObject({kind: 'character-scene', reason: 'shape'});
    // The focused branch error must name the real field, not union noise.
    expect(recovered.lostVisuals[0]!.details).toContain('sourceEvidence');
  });

  it('normalises a loosely written kind before repairing it', () => {
    const recovered = recoverNarrationResponse(scene({
      kind: 'Character_Scene',
      cast: cast([{id: 'guest', position: 'left'}, {id: 'desk', position: 'right'}]),
      sourceEvidence: 'The front desk asks for identity proof',
      speakers: [{primaryItemIndex: 0, castId: 'guest'}],
    }));
    expect(recovered.scenes[0]!.visual.kind).toBe('character-scene');
  });
});


describe('losing a character scene triggers one targeted retry', () => {
  const exchangeSource = 'A guest arrives to check in. The front desk asks for identity proof and hands over a key.';
  const exchangeOptions: NarrationPlanOptions = {
    ...options, sourceText: exchangeSource,
  };
  const characterScene = (visual: unknown): DraftNarrationSceneSuggestion => ({
    id: 'check-in', title: 'Check-in', reason: 'Stages the exchange.',
    template: 'callout', primaryItems: ['Arrive', 'Show proof'], secondaryItems: [],
    leftLabel: '', rightLabel: '', backgroundPrompt: 'A hotel reception interior.',
    icons: {focal: null, primary: [null, null], secondary: []},
    beats: [
      {id: 'arrive', expression: 'none', phrases: [{id: 'p1', text: 'A guest arrives to check in.'}], primaryItemIndices: [0], secondaryItemIndices: []},
      {id: 'proof', expression: 'none', phrases: [{id: 'p2', text: 'The front desk asks for identity proof.'}], primaryItemIndices: [1], secondaryItemIndices: []},
    ],
    visual,
  } as DraftNarrationSceneSuggestion);

  const goodVisual = {
    kind: 'character-scene',
    cast: [{id: 'guest', position: 'left'}, {id: 'front-desk', position: 'right'}],
    sourceEvidence: 'The front desk asks for identity proof',
    speakers: [{primaryItemIndex: 0, castId: 'guest'}, {primaryItemIndex: 1, castId: 'front-desk'}],
  };

  // The core regression: every decorative field omitted, one call, no downgrade.
  it('keeps a minimal character scene without any retry', async () => {
    create.mockResolvedValue(response({
      title: 'Check-in', palette: 'cyan', scenes: [characterScene(structuredClone(goodVisual))],
    }));
    const plan = await planNarratedVideo(exchangeOptions);
    expect(create).toHaveBeenCalledTimes(1);
    expect(plan.scenes[0]!.visual.kind).toBe('character-scene');
    expect(plan.planningWarnings ?? []).toEqual([]);
  });

  it('retries once when the model wanted a character scene and lost it', async () => {
    const broken = structuredClone(goodVisual) as Record<string, unknown>;
    delete broken['sourceEvidence'];
    create
      .mockResolvedValueOnce(response({title: 'Check-in', palette: 'cyan', scenes: [characterScene(broken)]}))
      .mockResolvedValueOnce(response({title: 'Check-in', palette: 'cyan', scenes: [characterScene(structuredClone(goodVisual))]}));
    const plan = await planNarratedVideo(exchangeOptions);
    expect(create).toHaveBeenCalledTimes(2);
    expect(plan.scenes[0]!.visual.kind).toBe('character-scene');

    const second = create.mock.calls[1]![0] as {input: Array<{role: string; content: unknown}>};
    const repair = String(second.input[second.input.length - 1]!.content);
    expect(repair).toContain('character-scene');
    expect(repair).toContain('sourceEvidence');
    // Never paraphrase the excerpt to make it fit: that would use the repair
    // loop to launder a grounding violation.
    expect(repair).toContain('do not paraphrase');
  });

  // Budget guard: character retries are capped at one so the remaining attempt
  // stays available for genuine schema repair.
  it('retries at most once even when the scene is lost again', async () => {
    const broken = structuredClone(goodVisual) as Record<string, unknown>;
    delete broken['sourceEvidence'];
    create.mockResolvedValue(response({
      title: 'Check-in', palette: 'cyan', scenes: [characterScene(structuredClone(broken))],
    }));
    const plan = await planNarratedVideo(exchangeOptions);
    expect(create).toHaveBeenCalledTimes(2);
    // Degrades rather than failing the run: a character scene is optional.
    expect(plan.scenes[0]!.visual.kind).toBe('diagram');
    expect(plan.planningWarnings?.join(' ')).toContain('Check-in');
  });

  it('makes exactly one call when no character scene was ever attempted', async () => {
    create.mockResolvedValue(response(payload()));
    await planNarratedVideo(options);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('fails only when --require-characters was asked for', async () => {
    const broken = structuredClone(goodVisual) as Record<string, unknown>;
    delete broken['sourceEvidence'];
    create.mockResolvedValue(response({
      title: 'Check-in', palette: 'cyan', scenes: [characterScene(structuredClone(broken))],
    }));
    await expect(planNarratedVideo({...exchangeOptions, requireCharacters: true}))
      .rejects.toThrow(/Character scenes were requested/u);
  });
});


// Found by an end-to-end run, not by a unit test: Gemini returned a character
// scene with no primaryItems, the sanitizer substituted its placeholder to keep
// the scene alive, and the new on-screen step label would have displayed it.
describe('the empty-items placeholder', () => {
  it('is still substituted so a scene with no items survives', () => {
    const sanitized = sanitizeNarratedCandidate({
      scenes: [{
        id: 's', title: 't', template: 'callout', primaryItems: [], secondaryItems: [],
        reason: 'r', backgroundPrompt: 'b', icons: {focal: null, primary: [], secondary: []},
        beats: [{id: 'b', expression: 'none', phrases: [{id: 'p', text: 'x'}], primaryItemIndices: [], secondaryItemIndices: []}],
        visual: {kind: 'diagram', motion: 'reveal', motif: 'none'},
      }],
    }) as {scenes: {primaryItems: string[]}[]};
    expect(sanitized.scenes[0]!.primaryItems).toEqual([PLACEHOLDER_ITEM]);
  });

  it('is exported so the render path can recognise and skip it', () => {
    expect(PLACEHOLDER_ITEM).toBe('Key Concept');
  });
});
