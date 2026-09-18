import {access, mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  cloudflareDimensions,
  cloudflareImageBody,
} from './providers/cloudflare-image.js';
import {
  materializeSceneBackgrounds,
  sceneBackgroundCacheKey,
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
  visual: {
    kind: 'diagram',
    motion: 'reveal',
    motif: 'none',
    assetId: null,
  },
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
    const {prompt} = sceneBackgroundPrompt(scene, '9:16', 'emerald');
    expect(prompt).toContain('tall cinematic 9:16 portrait');
    expect(prompt).toContain('deep teal-green palette');
    expect(prompt).toContain('upper caption area low-detail');
    expect(scene.backgroundPrompt).toBe(
      'A glowing queue carrying durable work between two systems.',
    );
  });

  // A model with no negative-prompt parameter conditions on whatever nouns it
  // is shown, so listing "text, logos, people" in the positive prompt invited
  // exactly what it was meant to forbid.
  it('keeps excluded nouns out of the positive prompt', () => {
    const {negativePrompt, prompt} = sceneBackgroundPrompt(scene, '16:9', 'cyan');
    for (const noun of ['text', 'letters', 'logos', 'watermarks', 'people']) {
      expect(prompt.toLowerCase()).not.toContain(noun);
      expect(negativePrompt).toContain(noun);
    }
  });

  // A character scene stands drawn figures on a floor. Asking for an abstract
  // metaphor at the same time produced a blur the cast floated over.
  it('asks a staged scene for a literal room with a visible floor', () => {
    const staged = sceneBackgroundPrompt({...scene, staged: true}, '16:9', 'cyan');
    const plain = sceneBackgroundPrompt(scene, '16:9', 'cyan');
    expect(staged.prompt).toContain('deserted real interior');
    expect(staged.prompt).toContain('eye level');
    expect(staged.prompt).toContain('lower third');
    // SDXL drew photographic people behind the drawn cast on the first
    // end-to-end run, so the emptiness is stated positively too.
    expect(staged.prompt).toContain('Nobody is present');
    expect(staged.prompt).not.toContain('Abstract cinematic');
    expect(plain.prompt).toContain('Abstract cinematic');
    expect(plain.prompt).not.toContain('deserted real interior');
  });

  it('leads with the scene content so boilerplate cannot crowd it out', () => {
    const {prompt} = sceneBackgroundPrompt(scene, '16:9', 'cyan');
    expect(prompt.startsWith(scene.backgroundPrompt)).toBe(true);
  });

  it('changes generated-image prompts and cache keys with the stored palette', () => {
    const cyan = sceneBackgroundPrompt(scene, '16:9', 'cyan').prompt;
    const amber = sceneBackgroundPrompt(scene, '16:9', 'amber').prompt;
    expect(amber).toContain('deep amber-brown palette');
    expect(amber).not.toBe(cyan);
    const keyFor = (prompt: string) => sceneBackgroundCacheKey({
      aspectRatio: '16:9',
      model: 'gpt-image-2',
      prompt,
      quality: 'medium',
      sceneId: scene.id,
    });
    expect(keyFor(amber)).not.toBe(keyFor(cyan));
  });

  it('separates cache keys when only the exclusions change', () => {
    const base = {
      aspectRatio: '16:9' as const,
      model: 'gpt-image-2',
      prompt: 'same prompt',
      quality: 'medium' as const,
      sceneId: scene.id,
    };
    expect(sceneBackgroundCacheKey({...base, negativePrompt: 'text'}))
      .not.toBe(sceneBackgroundCacheKey({...base, negativePrompt: 'text, people'}));
  });
});

describe('cloudflare image parameters', () => {
  // flux-1-schnell takes no width/height, so it always returned a square that
  // objectFit:cover then cropped ~42% of the height out of a 16:9 frame.
  it('sends dimensions and a negative prompt only to models that accept them', () => {
    const flux = cloudflareImageBody({
      model: '@cf/black-forest-labs/flux-1-schnell',
      negativePrompt: 'text, people',
      prompt: 'a room',
      size: '2048x1152',
    });
    expect(flux).toEqual({prompt: 'a room', steps: 8});

    const sdxl = cloudflareImageBody({
      model: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      negativePrompt: 'text, people',
      prompt: 'a room',
      size: '2048x1152',
    });
    expect(sdxl.negative_prompt).toBe('text, people');
    expect(sdxl.num_steps).toBe(20);
    expect(sdxl.width).toBe(1_344);
    expect(sdxl.height).toBe(760);

    // An unrecognised model keeps the conservative prompt-only body.
    expect(cloudflareImageBody({
      model: '@cf/some/future-model',
      negativePrompt: 'text',
      prompt: 'a room',
      size: '2048x1152',
    })).toEqual({prompt: 'a room'});
  });

  it('preserves aspect ratio, snaps to multiples of 8, and clamps the range', () => {
    expect(cloudflareDimensions('1152x2048')).toEqual({width: 760, height: 1_344});
    const square = cloudflareDimensions('1024x1024');
    expect(square).toEqual({width: 1_024, height: 1_024});
    for (const size of ['2048x1152', '1152x2048', '1024x1024']) {
      const dimensions = cloudflareDimensions(size);
      expect(dimensions).not.toBeNull();
      expect(dimensions!.width % 8).toBe(0);
      expect(dimensions!.height % 8).toBe(0);
      expect(Math.max(dimensions!.width, dimensions!.height)).toBeLessThanOrEqual(2_048);
      expect(Math.min(dimensions!.width, dimensions!.height)).toBeGreaterThanOrEqual(256);
    }
    // An unparseable size omits the parameter rather than guessing.
    expect(cloudflareDimensions('auto')).toBeNull();
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
      palette: 'emerald',
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
      palette: 'emerald',
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
      palette: 'emerald',
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
      palette: 'emerald',
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
      palette: 'emerald',
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
      palette: 'emerald',
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
      palette: 'emerald',
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
      palette: 'emerald',
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
