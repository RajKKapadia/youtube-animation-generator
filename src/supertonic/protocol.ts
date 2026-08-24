import {z} from 'zod';
import {narrationExpressionSchema} from './expressions.js';

export const supertonicVoiceSchema = z.enum([
  'M1',
  'M2',
  'M3',
  'M4',
  'M5',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
]);

export type SupertonicVoice = z.infer<typeof supertonicVoiceSchema>;

export const supertonicLanguageSchema = z.enum([
  'en', 'ko', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et',
  'fi', 'fr', 'hi', 'hr', 'hu', 'id', 'it', 'lt', 'lv', 'nl', 'pl',
  'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi', 'na',
]);

export const supertonicJobSchema = z.object({
  assetsDirectory: z.string().min(1),
  outputDirectory: z.string().min(1),
  voice: supertonicVoiceSchema,
  language: supertonicLanguageSchema,
  speed: z.number().min(0.7).max(2),
  steps: z.number().int().min(1).max(20),
  scenes: z.array(
    z.object({
      id: z.string().min(1),
      beats: z.array(
        z.object({
          id: z.string().min(1),
          expression: narrationExpressionSchema,
          phrases: z.array(
            z.object({id: z.string().min(1), text: z.string().min(1)}),
          ).min(1).max(12),
        }),
      ).min(1),
    }),
  ).min(1).max(6),
});

export type SupertonicJob = z.infer<typeof supertonicJobSchema>;

export const supertonicResultSchema = z.object({
  sampleRate: z.number().int().positive(),
  totalSamples: z.number().int().positive(),
  voiceoverFile: z.string().min(1),
  scenes: z.array(
    z.object({
      id: z.string().min(1),
      startSample: z.number().int().nonnegative(),
      sampleCount: z.number().int().positive(),
      beats: z.array(
        z.object({
          id: z.string().min(1),
          file: z.string().min(1),
          startSample: z.number().int().nonnegative(),
          sampleCount: z.number().int().positive(),
          phrases: z.array(
            z.object({
              id: z.string().min(1),
              startSample: z.number().int().nonnegative(),
              sampleCount: z.number().int().positive(),
            }),
          ).min(1).max(12),
        }),
      ),
    }),
  ),
});

export type SupertonicResult = z.infer<typeof supertonicResultSchema>;
