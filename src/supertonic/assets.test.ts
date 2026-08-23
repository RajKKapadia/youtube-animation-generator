import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {validateSupertonicAssets} from './assets.js';

const temporaryDirectories: string[] = [];

const createAssets = async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'supertonic-assets-'));
  temporaryDirectories.push(directory);
  await mkdir(resolve(directory, 'onnx'), {recursive: true});
  await mkdir(resolve(directory, 'voice_styles'), {recursive: true});
  for (const name of [
    'duration_predictor.onnx',
    'text_encoder.onnx',
    'vector_estimator.onnx',
    'vocoder.onnx',
  ]) {
    await writeFile(resolve(directory, 'onnx', name), Buffer.alloc(1_024));
  }
  await writeFile(resolve(directory, 'onnx/tts.json'), '{}');
  await writeFile(resolve(directory, 'onnx/unicode_indexer.json'), '{}');
  await writeFile(resolve(directory, 'voice_styles/M1.json'), '{}');
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true}),
    ),
  );
});

describe('validateSupertonicAssets', () => {
  it('resolves a complete model and selected voice', async () => {
    const directory = await createAssets();
    await expect(validateSupertonicAssets(directory, 'M1')).resolves.toEqual({
      onnxDirectory: resolve(directory, 'onnx'),
      voiceStylePath: resolve(directory, 'voice_styles/M1.json'),
    });
  });

  it('reports all missing model and voice files', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'supertonic-assets-'));
    temporaryDirectories.push(directory);
    await expect(validateSupertonicAssets(directory, 'F5')).rejects.toThrow(
      'onnx/duration_predictor.onnx',
    );
    await expect(validateSupertonicAssets(directory, 'F5')).rejects.toThrow(
      'voice_styles/F5.json',
    );
  });

  it('detects unexpanded Git LFS pointers', async () => {
    const directory = await createAssets();
    await writeFile(
      resolve(directory, 'onnx/vocoder.onnx'),
      'version https://git-lfs.github.com/spec/v1\n',
    );
    await expect(validateSupertonicAssets(directory, 'M1')).rejects.toThrow(
      'looks like a Git LFS pointer',
    );
  });
});
