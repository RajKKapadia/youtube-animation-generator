import {readFile, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {SupertonicVoice} from './protocol.js';

const MODEL_FILES = [
  'onnx/duration_predictor.onnx',
  'onnx/text_encoder.onnx',
  'onnx/vector_estimator.onnx',
  'onnx/vocoder.onnx',
  'onnx/tts.json',
  'onnx/unicode_indexer.json',
] as const;

export interface SupertonicAssets {
  onnxDirectory: string;
  voiceStylePath: string;
}

export const validateSupertonicAssets = async (
  assetsDirectory: string,
  voice: SupertonicVoice,
): Promise<SupertonicAssets> => {
  const root = resolve(assetsDirectory);
  const required = [...MODEL_FILES, `voice_styles/${voice}.json`];
  const missing: string[] = [];

  for (const relativePath of required) {
    const fullPath = resolve(root, relativePath);
    try {
      const details = await stat(fullPath);
      if (!details.isFile() || details.size === 0) {
        missing.push(relativePath);
      } else if (relativePath.endsWith('.onnx') && details.size < 1_024) {
        missing.push(`${relativePath} (looks like a Git LFS pointer)`);
      }
    } catch {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Supertonic assets are incomplete in ${root}. Missing or invalid: ${missing.join(', ')}. ` +
        'Clone https://huggingface.co/Supertone/supertonic-3 with Git LFS.',
    );
  }

  for (const relativePath of [
    'onnx/tts.json',
    'onnx/unicode_indexer.json',
    `voice_styles/${voice}.json`,
  ]) {
    try {
      JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));
    } catch (error) {
      throw new Error(`Invalid Supertonic JSON asset: ${relativePath}`, {cause: error});
    }
  }

  return {
    onnxDirectory: resolve(root, 'onnx'),
    voiceStylePath: resolve(root, 'voice_styles', `${voice}.json`),
  };
};
