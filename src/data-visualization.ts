import type {
  ChartDatum,
  ChartDerivedAnnotation,
  DataVisualization,
} from './types.js';

export interface CalculatedChartAnnotation {
  value: number;
  unit: string;
  display: string;
}

const rounded = (value: number, precision: number): number => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const formatNumber = (value: number, precision: number): string =>
  rounded(value, precision).toLocaleString('en-US', {
    maximumFractionDigits: precision,
    minimumFractionDigits: precision,
    useGrouping: true,
  });

export const formatChartDatum = (datum: ChartDatum): string =>
  `${formatNumber(datum.value, datum.precision)}${datum.unit === '%' ? '%' : ` ${datum.unit}`}`;

export const calculateChartAnnotation = (
  chart: DataVisualization,
  annotation: ChartDerivedAnnotation,
): CalculatedChartAnnotation => {
  const current = chart.data.find(({id}) => id === annotation.currentDatumId);
  const baseline = chart.data.find(({id}) => id === annotation.baselineDatumId);
  if (!current || !baseline) {
    throw new Error(`Chart annotation ${annotation.id} references missing operands.`);
  }
  if (current.unit !== baseline.unit) {
    throw new Error(`Chart annotation ${annotation.id} compares incompatible units.`);
  }
  if (baseline.value === 0) {
    throw new Error(`Chart annotation ${annotation.id} has a zero baseline.`);
  }

  if (annotation.operation === 'ratio') {
    const value = current.value / baseline.value;
    return {
      value,
      unit: '×',
      display: `≈${formatNumber(value, annotation.precision)}×`,
    };
  }
  if (annotation.operation === 'difference') {
    const value = current.value - baseline.value;
    return {
      value,
      unit: current.unit,
      display: `≈${formatNumber(value, annotation.precision)}${current.unit === '%' ? '%' : ` ${current.unit}`}`,
    };
  }
  const value = ((current.value - baseline.value) / Math.abs(baseline.value)) * 100;
  return {
    value,
    unit: '%',
    display: `≈${formatNumber(value, annotation.precision)}%`,
  };
};
