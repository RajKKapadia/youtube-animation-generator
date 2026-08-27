import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  brandAssetForLabel,
  loadAssetRegistry,
  validateLottieAnimationData,
} from './asset-registry.js';

const temporaryDirectories: string[] = [];

const vectorLottie = (extra: Record<string, unknown> = {}) => ({
  v: '5.12.2',
  fr: 30,
  ip: 0,
  op: 60,
  w: 512,
  h: 512,
  assets: [],
  layers: [{ty: 4, shapes: []}],
  ...extra,
});

const motionAsset = {
  id: 'agent-pulse',
  motifs: ['ai-agent'],
  keywords: ['agent'],
  file: 'motion/agent-pulse.json',
  sourceUrl: 'https://example.com/agent-pulse',
  creator: 'Fixture creator',
  license: 'Fixture license',
  licenseUrl: 'https://example.com/license',
  attribution: 'Fixture creator',
  loop: 'loop',
  playbackRate: 1,
  colorMap: {},
};

const brandAsset = {
  id: 'acme',
  canonicalName: 'Acme',
  aliases: ['Acme Corp'],
  file: 'brands/acme.svg',
  sourceUrl: 'https://example.com/brand',
  guidelinesUrl: 'https://example.com/guidelines',
  license: 'Trademark use policy',
  licenseUrl: 'https://example.com/trademark',
  colorPolicy: 'original',
};

const createRegistry = async ({
  brands = [brandAsset],
  lottie = vectorLottie(),
  motion = [motionAsset],
}: {
  brands?: unknown[];
  lottie?: unknown;
  motion?: unknown[];
} = {}) => {
  const root = await mkdtemp(resolve(tmpdir(), 'asset-registry-'));
  temporaryDirectories.push(root);
  await mkdir(resolve(root, 'motion'), {recursive: true});
  await mkdir(resolve(root, 'brands'), {recursive: true});
  await writeFile(resolve(root, 'motion/manifest.json'), JSON.stringify({version: 1, assets: motion}));
  await writeFile(resolve(root, 'brands/manifest.json'), JSON.stringify({version: 1, assets: brands}));
  await writeFile(resolve(root, 'motion/agent-pulse.json'), JSON.stringify(lottie));
  await writeFile(resolve(root, 'brands/acme.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>');
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true}),
    ),
  );
});

describe('asset registry validation', () => {
  it('loads pure-vector local assets and resolves exact aliases', async () => {
    const registry = await loadAssetRegistry(await createRegistry());
    expect(registry.motionAssets.map(({id}) => id)).toEqual(['agent-pulse']);
    expect(brandAssetForLabel(registry, 'ACME CORP')?.id).toBe('acme');
    expect(registry.warnings).toEqual([]);
  });

  it('rejects duplicate brand aliases', async () => {
    const root = await createRegistry({
      brands: [
        brandAsset,
        {...brandAsset, id: 'second', canonicalName: 'Second', aliases: ['acme corp']},
      ],
    });
    await expect(loadAssetRegistry(root)).rejects.toThrow('Duplicate brand alias');
  });

  it('rejects unsafe paths and missing files', async () => {
    const unsafe = await createRegistry({
      motion: [{...motionAsset, file: '../secret.json'}],
    });
    await expect(loadAssetRegistry(unsafe)).rejects.toThrow('cannot traverse');

    const missing = await createRegistry({
      motion: [{...motionAsset, file: 'motion/missing.json'}],
    });
    await expect(loadAssetRegistry(missing)).rejects.toThrow();
  });

  it('rejects external dependencies and text layers and flags expressions', () => {
    expect(() => validateLottieAnimationData(
      vectorLottie({assets: [{p: 'image.png', u: 'https://example.com/'}]}),
    )).toThrow('external image or file references');
    expect(() => validateLottieAnimationData(
      vectorLottie({layers: [{ty: 5}]}),
    )).toThrow('text/font layers');
    expect(validateLottieAnimationData(
      vectorLottie({layers: [{ty: 4, x: 'time * 2'}]}),
      'Expression fixture',
    )).toEqual([
      'Expression fixture contains a Lottie expression and requires manual flicker review.',
    ]);
  });
});
