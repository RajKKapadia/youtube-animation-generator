import {access, mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  materializeSceneBackgrounds,
  sceneBackgroundPrompt,
  withTransientImageRetries,
} from './scene-backgrounds.js';
import {draftNarrationSceneSchema} from './types.js';

const temporaryDirectories: string[] = [];

const scene = draftNarrationSceneSchema.parse({
  id: 'queue-flow',
  backgroundPrompt: 'A glowing queue carrying durable work between two systems.',
  template: 'process-flow',
  title: 'A durable queue',
  primaryItems: ['Producer', 'Queue', 'Consumer'],
  secondaryItems: [],
  leftLabel: '',
  rightLabel: '',
  reason: 'Shows decoupling.',
  beats: [{
    id: 'flow',
    expression: 'none',
    phrases: [{id: 'flow-phrase', text: 'Work moves through the queue.'}],
    primaryItemIndices: [0, 1, 2],
    secondaryItemIndices: [],
  }],
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true}),
    ),
  );
});

const makeOutputDirectory = async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'scene-backgrounds-'));
  temporaryDirectories.push(directory);
  return directory;
};

describe('scene background prompts', () => {
  it('adds orientation and readability constraints without changing the plan prompt', () => {
    const prompt = sceneBackgroundPrompt(scene, '9:16');
    expect(prompt).toContain('tall cinematic 9:16 portrait');
    expect(prompt).toContain('No text');
    expect(prompt).toContain('lower caption area low-detail');
    expect(scene.backgroundPrompt).toBe(
      'A glowing queue carrying durable work between two systems.',
    );
  });
});

describe('materializeSceneBackgrounds', () => {
  it('generates and caches native assets for both orientations', async () => {
    const outputDirectory = await makeOutputDirectory();
    const calls: Array<{quality: string; size: string}> = [];
    const assets = await materializeSceneBackgrounds({
      aspectRatio: 'both',
      generateImage: async ({quality, size}) => {
        calls.push({quality, size});
        return Buffer.from(`image:${size}`);
      },
      model: 'gpt-image-2',
      outputDirectory,
      quality: 'medium',
      regenerate: false,
      scenes: [scene],
      stem: 'video',
    });

    expect(calls).toEqual([
      {quality: 'medium', size: '2048x1152'},
      {quality: 'medium', size: '1152x2048'},
    ]);
    await expect(access(assets['16:9']['queue-flow']!)).resolves.toBeUndefined();
    await expect(access(assets['9:16']['queue-flow']!)).resolves.toBeUndefined();

    const cached = await materializeSceneBackgrounds({
      aspectRatio: 'both',
      generateImage: async () => {
        throw new Error('cache miss');
      },
      model: 'gpt-image-2',
      outputDirectory,
      quality: 'medium',
      regenerate: false,
      scenes: [scene],
      stem: 'video',
    });
    expect(cached).toEqual(assets);
  });

  it('invalidates by prompt and regenerates explicitly without --force', async () => {
    const outputDirectory = await makeOutputDirectory();
    let calls = 0;
    const generateImage = async () => {
      calls += 1;
      return Buffer.from(`image-${calls}`);
    };
    await materializeSceneBackgrounds({
      aspectRatio: '16:9',
      generateImage,
      model: 'gpt-image-2',
      outputDirectory,
      quality: 'medium',
      regenerate: false,
      scenes: [scene],
      stem: 'video',
    });
    await materializeSceneBackgrounds({
      aspectRatio: '16:9',
      generateImage,
      model: 'gpt-image-2',
      outputDirectory,
      quality: 'medium',
      regenerate: false,
      scenes: [{...scene, backgroundPrompt: `${scene.backgroundPrompt} New direction.`}],
      stem: 'video',
    });
    await materializeSceneBackgrounds({
      aspectRatio: '16:9',
      generateImage,
      model: 'gpt-image-2',
      outputDirectory,
      quality: 'medium',
      regenerate: true,
      scenes: [{...scene, backgroundPrompt: `${scene.backgroundPrompt} New direction.`}],
      stem: 'video',
    });
    expect(calls).toBe(3);
    const manifest = JSON.parse(
      await readFile(resolve(outputDirectory, 'video.backgrounds/manifest.json'), 'utf8'),
    ) as {entries: unknown[]};
    expect(manifest.entries).toHaveLength(2);
  });

  it('leaves no promoted cache when a requested image fails', async () => {
    const outputDirectory = await makeOutputDirectory();
    let calls = 0;
    await expect(materializeSceneBackgrounds({
      aspectRatio: 'both',
      generateImage: async () => {
        calls += 1;
        if (calls === 2) throw new Error('moderation blocked');
        return Buffer.from('first image');
      },
      model: 'gpt-image-2',
      outputDirectory,
      quality: 'medium',
      regenerate: false,
      scenes: [scene],
      stem: 'video',
    })).rejects.toThrow('Could not materialize generated scene backgrounds');
    await expect(access(resolve(outputDirectory, 'video.backgrounds'))).rejects.toThrow();
  });

  it('preserves the previous cache and cleans staging after regeneration fails', async () => {
    const outputDirectory = await makeOutputDirectory();
    const assets = await materializeSceneBackgrounds({
      aspectRatio: '16:9',
      generateImage: async () => Buffer.from('stable image'),
      model: 'gpt-image-2',
      outputDirectory,
      quality: 'medium',
      regenerate: false,
      scenes: [scene],
      stem: 'video',
    });
    const originalImage = await readFile(assets['16:9']['queue-flow']!);

    await expect(materializeSceneBackgrounds({
      aspectRatio: '16:9',
      generateImage: async () => {
        throw Object.assign(new Error('authentication failed'), {status: 401});
      },
      model: 'gpt-image-2',
      outputDirectory,
      quality: 'medium',
      regenerate: true,
      scenes: [scene],
      stem: 'video',
    })).rejects.toThrow('authentication failed');

    await expect(readFile(assets['16:9']['queue-flow']!)).resolves.toEqual(originalImage);
    expect((await readdir(outputDirectory)).filter((name) =>
      name.startsWith('.video.backgrounds-'),
    )).toEqual([]);
  });
});

describe('withTransientImageRetries', () => {
  it('retries 429/5xx errors and immediately rejects user errors', async () => {
    let transientCalls = 0;
    const waits: number[] = [];
    await expect(withTransientImageRetries(
      async () => {
        transientCalls += 1;
        if (transientCalls < 3) throw Object.assign(new Error('busy'), {status: 429});
        return 'ok';
      },
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    )).resolves.toBe('ok');
    expect(waits).toEqual([500, 1_000]);

    let userErrorCalls = 0;
    await expect(withTransientImageRetries(
      async () => {
        userErrorCalls += 1;
        throw Object.assign(new Error('blocked'), {status: 400});
      },
      async () => undefined,
    )).rejects.toThrow('blocked');
    expect(userErrorCalls).toBe(1);
  });
});
