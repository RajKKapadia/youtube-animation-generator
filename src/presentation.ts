import {z} from 'zod';

export const compositionSchema = z.enum(['statement', 'focal', 'comparison', 'process', 'evidence']);
export const presentationSchema = z.object({
  composition: compositionSchema,
  reveal: z.enum(['focus', 'build']),
});
export const storyRoleSchema = z.enum(['hook', 'explain', 'evidence', 'takeaway']);
export type Composition = z.infer<typeof compositionSchema>;
export type Presentation = z.infer<typeof presentationSchema>;

interface Presentable {
  title: string;
  template: string;
  primaryItems: string[];
  secondaryItems: string[];
  visual?: {kind: string} | undefined;
  icons?: {focal: string | null; primary: Array<string | null>} | undefined;
}

const hash = (text: string): number => {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.codePointAt(0)!, 16777619);
  return value >>> 0;
};

/** Composition follows content structure; variety never creates a relationship. */
export const compositionChoices = (scene: Presentable): Composition[] => {
  const kind = scene.visual?.kind;
  if (kind === 'data-visualization' || kind === 'code-walkthrough' || kind === 'image-focus' || kind === 'metric-focus') return ['evidence'];
  if (scene.template === 'comparison' && scene.secondaryItems.length) return ['comparison'];
  if (['agent-workflow', 'network-map', 'sequence-diagram', 'layered-architecture'].includes(kind ?? '') || scene.template === 'process-flow' || scene.template === 'timeline') return ['process'];
  if (kind === 'kinetic-text') return ['statement'];
  if (kind === 'brand-showcase' || kind === 'icon-spotlight') return ['focal'];
  return scene.icons?.focal || scene.icons?.primary.some(Boolean) ? ['statement', 'focal'] : ['statement'];
};

export const selectPresentation = (scene: Presentable, previous?: Composition): Presentation => {
  const choices = compositionChoices(scene);
  const alternatives = choices.filter((choice) => choice !== previous);
  const eligible = alternatives.length ? alternatives : choices;
  const composition = eligible[hash(scene.title) % eligible.length]!;
  return {composition, reveal: composition === 'process' ? 'build' : 'focus'};
};

export const presentationIssue = (scene: Presentable & {presentation?: Presentation | undefined}): string | undefined =>
  scene.presentation && !compositionChoices(scene).includes(scene.presentation.composition)
    ? `Composition ${scene.presentation.composition} cannot represent this scene's visual structure.`
    : undefined;

export const directScenes = <T extends Presentable>(scenes: T[], narrated: boolean) => {
  let previous: Composition | undefined;
  return scenes.map((scene, index) => {
    const presentation = selectPresentation(scene, previous);
    previous = presentation.composition;
    const storyRole = index === 0 ? 'hook' : index === scenes.length - 1 ? 'takeaway' : presentation.composition === 'evidence' ? 'evidence' : 'explain';
    return {...scene, presentation, ...(narrated ? {storyRole: storyRoleSchema.parse(storyRole)} : {})};
  });
};

/** Keep every item sharing a speech cue visible together, including a delayed first cue. */
export const visibleItemIndices = (starts: readonly number[], timeMs: number, reveal: Presentation['reveal']): number[] => {
  const started = starts.flatMap((start, index) => start <= timeMs ? [index] : []);
  if (reveal === 'build' || !started.length) return started;
  const latest = Math.max(...started.map((index) => starts[index]!));
  return started.filter((index) => starts[index] === latest);
};

export const PRESENTATION_PLANNING_PROMPT = `Presentation direction: make one idea clear in each scene. Prefer short visible labels and 1-3 supporting items. Use longer narration to explain the labels rather than making the viewer read the whole narration twice. Reveal items at the existing semantic speech boundaries; never split a natural utterance merely to create a visual change. Comparisons and diagrams must retain the relationships needed for understanding. Prefer small readable code excerpts and simple charts. Composition is selected and saved locally from the verified visual structure; do not invent presentation metadata.`;
