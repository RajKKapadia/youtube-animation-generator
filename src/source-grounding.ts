export interface GroundedChartDatum {
  label: string;
  sourceEvidence: string;
  sourceToken: string;
}

export const normalizeGroundedText = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/[\u2010-\u2015\u2212]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim();

export const sourceContainsGroundedText = (
  sourceText: string,
  candidate: string,
): boolean => {
  if (!candidate.trim()) return false;
  return sourceText.includes(candidate) ||
    normalizeGroundedText(sourceText).includes(normalizeGroundedText(candidate));
};

export const chartDatumGroundingIssue = (
  sourceText: string,
  datum: GroundedChartDatum,
): string | null => {
  if (!sourceContainsGroundedText(sourceText, datum.sourceEvidence)) {
    return 'its evidence is not an extractive source excerpt';
  }
  if (!sourceContainsGroundedText(sourceText, datum.label)) {
    return `its label "${datum.label}" is absent from the source`;
  }
  if (!sourceContainsGroundedText(datum.sourceEvidence, datum.label)) {
    return 'its evidence does not contain its source label';
  }
  if (!sourceContainsGroundedText(datum.sourceEvidence, datum.sourceToken)) {
    return 'its evidence does not contain its numeric token';
  }
  if (!sourceContainsGroundedText(sourceText, datum.sourceToken)) {
    return `its numeric token "${datum.sourceToken}" is absent from the source`;
  }
  return null;
};
