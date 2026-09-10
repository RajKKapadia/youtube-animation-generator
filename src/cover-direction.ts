import type {NarratedPublishPlan, PublishScene} from './types.js';
import {compositionChoices, selectPresentation} from './presentation.js';

export const selectCoverDirection = (scene: PublishScene, headline: string) => {
  const composition = scene.visual?.kind === 'image-focus' && scene.visual.source === 'generated'
    ? 'statement' as const
    : selectPresentation({...scene, title: headline}).composition;
  const pair = scene.visual?.kind === 'before-after' ? scene.visual.pairs[0] : undefined;
  const chart = scene.visual?.kind === 'data-visualization' ? scene.visual.chart : undefined;
  const datumId = chart?.type === 'line-chart' ? chart.points.at(-1)?.yDatumId : chart?.data[0]?.id;
  return {
    composition,
    primaryItemIndices: pair ? [pair.primaryItemIndex] : scene.visual?.kind === 'layered-architecture' ? scene.visual.layerOrder.slice(0, 3) : scene.primaryItems.slice(0, composition === 'process' ? 3 : 1).map((_, i) => i),
    secondaryItemIndices: composition === 'comparison' ? [pair?.secondaryItemIndex ?? 0] : [],
    ...(datumId ? {datumId} : {}),
  };
};

export const validateCoverDirection = (publish: NarratedPublishPlan, scene: PublishScene): void => {
  const direction = publish.thumbnail;
  if (!direction.composition) return;
  // A statement is always a truthful static summary; richer layouts require data.
  if (direction.composition !== 'statement' && !compositionChoices(scene).includes(direction.composition)) {
    throw new Error(`Cover composition ${direction.composition} is incompatible with scene ${scene.id}.`);
  }
  if (direction.composition === 'evidence' && scene.visual?.kind === 'image-focus' && scene.visual.source === 'generated') {
    throw new Error('Publish covers cannot generate foreground images. Select a statement composition or a supplied local image scene.');
  }
  for (const [indices, items] of [[direction.primaryItemIndices, scene.primaryItems], [direction.secondaryItemIndices, scene.secondaryItems]] as const) {
    if (indices && (new Set(indices).size !== indices.length || indices.some((i) => i >= items.length))) throw new Error('Cover item references must be unique indices inside the selected scene.');
  }
  if (direction.primaryItemIndices?.length === 0) throw new Error('A directed cover requires at least one primary item.');
  if ((direction.primaryItemIndices?.length ?? 1) > (direction.composition === 'process' ? 3 : 1) || (direction.secondaryItemIndices?.length ?? 0) > 1) {
    throw new Error('Directed covers show one focal item, one item per comparison side, or at most three process steps.');
  }
  if (direction.composition === 'comparison' && direction.secondaryItemIndices?.length === 0) throw new Error('A comparison cover requires both sides.');
  if (scene.visual?.kind === 'before-after' && direction.composition === 'comparison') {
    const first = scene.visual.pairs[0]!;
    const primary = direction.primaryItemIndices ?? [first.primaryItemIndex];
    const secondary = direction.secondaryItemIndices ?? [first.secondaryItemIndex];
    const pairs = scene.visual.pairs;
    if (primary.length !== secondary.length || primary.some((index, i) => !pairs.some((pair) => pair.primaryItemIndex === index && pair.secondaryItemIndex === secondary[i]))) {
      throw new Error('Cover selections must preserve the source-backed before/after pairs.');
    }
  }
  if (direction.datumId && (scene.visual?.kind !== 'data-visualization' || !scene.visual.chart.data.some(({id}) => id === direction.datumId))) {
    throw new Error('Cover datumId must reference a validated datum in the selected scene.');
  }
};
