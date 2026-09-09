import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {planNarratedVideo, type NarrationPlanOptions} from './narration-planner.js';
import {narrationResponseSchema} from './narration-plan-recovery.js';
import {draftNarratedPlanSchema, type DraftNarrationSceneSuggestion} from './types.js';

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
