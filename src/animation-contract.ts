import {z} from 'zod';

export const animationToolSchema = z.enum(['hyperframes', 'lottie', 'stykanimate']);
export type AnimationTool = z.infer<typeof animationToolSchema>;
export const projectFileSchema = z.string().min(1).refine(
  value => !/^(?:[\\/]|[a-z]:)/iu.test(value) && !value.split(/[\\/]/u).includes('..'),
  'Project files must be relative and cannot escape the project.',
);
export const fileDigestSchema = z.object({file: projectFileSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/u)});
export const animationRecipeSchema = z.object({
  treatment: z.enum(['kinetic-text', 'comparison', 'diagram', 'chart', 'icon-reveal', 'pulse', 'character-exchange']),
  emphasis: z.enum(['reveal', 'flow', 'pulse']).prefault('reveal'),
  accent: z.enum(['primary', 'secondary']).prefault('primary'),
  gestures: z.array(z.enum(['idle', 'wave', 'point', 'agree'])).max(12).prefault([]),
});
export type AnimationRecipe = z.infer<typeof animationRecipeSchema>;
export const animationFrameSequenceSchema = z.object({
  directory: projectFileSchema,
  frameCount: z.number().int().positive(),
  fps: z.number().int().positive().max(120),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type AnimationFrameSequence = z.infer<typeof animationFrameSequenceSchema>;
export const animationAssetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  sceneId: z.string().min(1),
  tool: animationToolSchema,
  forced: z.boolean(),
  toolVersion: z.string().min(1),
  recipe: animationRecipeSchema,
  sources: z.array(fileDigestSchema).min(1),
  renders: z.object({'16:9': animationFrameSequenceSchema.optional(), '9:16': animationFrameSequenceSchema.optional()}),
});
export type AnimationAsset = z.infer<typeof animationAssetSchema>;
export const audioSourceSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('tts')}),
  z.object({kind: z.literal('silent')}),
  z.object({kind: z.literal('recorded'), original: fileDigestSchema, playback: fileDigestSchema, alignmentReport: projectFileSchema}),
]);

export const parseAnimationTools = (value = 'auto'): AnimationTool[] => {
  if (value === 'auto') return [...animationToolSchema.options];
  if (value === 'off') return [];
  const tools = value.split(',');
  if (new Set(tools).size !== tools.length) throw new Error('Duplicate animation tool selection.');
  return tools.map(tool => animationToolSchema.parse(tool));
};
export const parseSceneTools = (values: string[] = []): Record<string, AnimationTool | 'builtin'> => {
  const result: Record<string, AnimationTool | 'builtin'> = {};
  for (const value of values) {
    const [id, tool, extra] = value.split('=');
    if (!id || !tool || extra || result[id]) throw new Error('Use one --scene-tool scene-id=tool per scene.');
    result[id] = tool === 'builtin' ? tool : animationToolSchema.parse(tool);
  }
  return result;
};
