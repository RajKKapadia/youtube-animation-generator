import {describe, expect, it} from 'vitest';
import {calculateChartAnnotation, formatChartDatum} from './data-visualization.js';
import {dataVisualizationSchema} from './types.js';

const chart = dataVisualizationSchema.parse({
  type: 'grouped-bars',
  title: 'Peak mixed-token throughput',
  data: [
    {id: 'new-gpt', label: 'Jalapeño GPT-OSS', value: 85_448, unit: 'mixed tokens/s/kW', precision: 0, sourceEvidence: 'Jalapeño GPT-OSS reached 85,448 mixed tokens/s/kW.', sourceToken: '85,448'},
    {id: 'old-gpt', label: 'Existing GPT-OSS', value: 44_960, unit: 'mixed tokens/s/kW', precision: 0, sourceEvidence: 'Existing GPT-OSS reached 44,960 mixed tokens/s/kW.', sourceToken: '44,960'},
    {id: 'new-deepseek', label: 'Jalapeño DeepSeek', value: -19_641, unit: 'mixed tokens/s/kW', precision: 0, sourceEvidence: 'Jalapeño DeepSeek changed by -19,641 mixed tokens/s/kW.', sourceToken: '-19,641'},
    {id: 'old-deepseek', label: 'Existing DeepSeek', value: 11_781, unit: 'mixed tokens/s/kW', precision: 0, sourceEvidence: 'Existing DeepSeek reached 11,781 mixed tokens/s/kW.', sourceToken: '11,781'},
  ],
  series: [{id: 'new', label: 'Jalapeño'}, {id: 'old', label: 'Existing best'}],
  categories: [
    {id: 'gpt', label: 'GPT-OSS', values: [{seriesId: 'new', datumId: 'new-gpt'}, {seriesId: 'old', datumId: 'old-gpt'}]},
    {id: 'deepseek', label: 'DeepSeek', values: [{seriesId: 'new', datumId: 'new-deepseek'}, {seriesId: 'old', datumId: 'old-deepseek'}]},
  ],
  cards: [],
  derivedAnnotations: [
    {id: 'gpt-ratio', label: 'Higher', operation: 'ratio', currentDatumId: 'new-gpt', baselineDatumId: 'old-gpt', precision: 1},
    {id: 'gpt-difference', label: 'Difference', operation: 'difference', currentDatumId: 'new-gpt', baselineDatumId: 'old-gpt', precision: 0},
    {id: 'gpt-change', label: 'Change', operation: 'percent-change', currentDatumId: 'new-gpt', baselineDatumId: 'old-gpt', precision: 1},
  ],
});

describe('source chart calculations', () => {
  it('keeps negative source values and formats source precision deterministically', () => {
    expect(chart.data.find(({id}) => id === 'new-deepseek')?.value).toBe(-19_641);
    expect(formatChartDatum(chart.data[0]!)).toBe('85,448 mixed tokens/s/kW');
  });

  it('calculates ratios, differences, and percent changes from operand ids', () => {
    expect(calculateChartAnnotation(chart, chart.derivedAnnotations[0]!)).toEqual({
      value: 85_448 / 44_960,
      unit: '×',
      display: '≈1.9×',
    });
    expect(calculateChartAnnotation(chart, chart.derivedAnnotations[1]!).display)
      .toBe('≈40,488 mixed tokens/s/kW');
    expect(calculateChartAnnotation(chart, chart.derivedAnnotations[2]!).display)
      .toBe('≈90.1%');
  });

  it('rejects zero denominators, incompatible units, and layout overflows', () => {
    const zero = structuredClone(chart);
    zero.data[1]!.value = 0;
    expect(() => dataVisualizationSchema.parse(zero)).toThrow('baselines cannot be zero');

    const incompatible = structuredClone(chart);
    incompatible.data[1]!.unit = 'seconds';
    expect(() => dataVisualizationSchema.parse(incompatible)).toThrow('compatible units');

    const overflow = structuredClone(chart);
    overflow.categories.push(
      {...overflow.categories[0]!, id: 'three'},
      {...overflow.categories[0]!, id: 'four'},
      {...overflow.categories[0]!, id: 'five'},
    );
    expect(() => dataVisualizationSchema.parse(overflow)).toThrow();
  });

  it('requires 2-4 cards for metric-card layouts', () => {
    expect(() => dataVisualizationSchema.parse({
      type: 'metric-cards',
      title: 'Metrics',
      data: chart.data.slice(0, 2),
      series: [],
      categories: [],
      cards: [{id: 'only', label: 'Only', datumId: 'new-gpt', annotationId: null}],
      derivedAnnotations: [],
    })).toThrow('2-4 cards');
  });
});
