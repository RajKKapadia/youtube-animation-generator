import {z} from 'zod';

export const narrationExpressionSchema = z.enum([
  'none',
  'laugh',
  'breath',
  'sigh',
]);

export type NarrationExpression = z.infer<typeof narrationExpressionSchema>;

export const applyNarrationExpression = (
  text: string,
  expression: NarrationExpression,
): string => expression === 'none' ? text : `<${expression}> ${text}`;
