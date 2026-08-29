import {access, readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {
  narratedVisualMotifSchema,
  type NarratedVisualMotif,
} from './types.js';
import {semanticIconDefinitionFor} from './icon-catalog.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export const defaultAssetRoot = (): string => resolve(currentDirectory, '..', 'assets');

const assetIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

const relativeAssetPathSchema = z.string().min(1).refine(
  (value) => !isAbsolute(value) && !value.split(/[\\/]/u).includes('..'),
  'Asset paths must be relative and cannot traverse outside the asset root.',
);

export const motionAssetManifestSchema = z.object({
  version: z.literal(1),
  assets: z.array(z.object({
    id: assetIdSchema,
    motifs: z.array(narratedVisualMotifSchema.exclude(['none'])).min(1),
    keywords: z.array(z.string().trim().min(1)).min(1),
    file: relativeAssetPathSchema.refine(
      (value) => value.toLocaleLowerCase().endsWith('.json'),
      'Motion assets must be Lottie JSON files.',
    ),
    sourceUrl: z.url(),
    creator: z.string().trim().min(1),
    license: z.string().trim().min(1),
    licenseUrl: z.url().nullable(),
    attributionRequired: z.boolean().default(false),
    attribution: z.string().trim().min(1),
    loop: z.enum(['once', 'loop']),
    playbackRate: z.number().positive().max(4).default(1),
    priority: z.number().int().default(0),
    colorMap: z.record(
      z.string().regex(/^#[\da-f]{6}$/iu),
      z.enum(['primary', 'secondary']),
    ).default({}),
  })),
});

export type MotionAssetDefinition = z.infer<
  typeof motionAssetManifestSchema
>['assets'][number];

export const brandAssetManifestSchema = z.object({
  version: z.literal(1),
  assets: z.array(z.object({
    id: assetIdSchema,
    canonicalName: z.string().trim().min(1),
    aliases: z.array(z.string().trim().min(1)),
    file: relativeAssetPathSchema.refine(
      (value) => value.toLocaleLowerCase().endsWith('.svg'),
      'Curated brand assets must be SVG files.',
    ),
    sourceUrl: z.url(),
    guidelinesUrl: z.url().nullable(),
    license: z.string().trim().min(1),
    licenseUrl: z.url().nullable(),
    colorPolicy: z.enum(['original', 'monochrome-allowed']),
  })),
});

export type BrandAssetDefinition = z.infer<
  typeof brandAssetManifestSchema
>['assets'][number];

export const iconAssetManifestSchema = z.object({
  version: z.literal(1),
  assets: z.array(z.object({
    id: assetIdSchema,
    keywords: z.array(z.string().trim().min(1)).min(1),
    file: relativeAssetPathSchema.refine(
      (value) => value.toLocaleLowerCase().endsWith('.svg'),
      'Curated icon assets must be SVG files.',
    ),
    sourceUrl: z.url(),
    creator: z.string().trim().min(1),
    license: z.string().trim().min(1),
    licenseUrl: z.url().nullable(),
    attributionRequired: z.boolean(),
    attribution: z.string().trim().min(1).max(180),
    colorPolicy: z.enum(['original', 'monochrome-allowed']),
  })),
});

export type IconAssetDefinition = z.infer<
  typeof iconAssetManifestSchema
>['assets'][number];

export interface AssetRegistry {
  assetRoot: string;
  brandAssets: BrandAssetDefinition[];
  iconAssets: IconAssetDefinition[];
  motionAssets: MotionAssetDefinition[];
  warnings: string[];
}

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, 'utf8'));

const assertUnique = (
  values: Array<{label: string; value: string}>,
  subject: string,
): void => {
  const seen = new Map<string, string>();
  for (const {label, value} of values) {
    const existing = seen.get(value);
    if (existing) {
      throw new Error(`Duplicate ${subject} "${value}" in ${existing} and ${label}.`);
    }
    seen.set(value, label);
  }
};

const resolvedAssetPath = (assetRoot: string, file: string): string => {
  const root = resolve(assetRoot);
  const path = resolve(root, file);
  const pathFromRoot = relative(root, path);
  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error(`Asset path escapes the registry root: ${file}`);
  }
  return path;
};

const containsExpression = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsExpression);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) =>
    (key === 'x' && typeof child === 'string' && child.trim().length > 0) ||
    containsExpression(child),
  );
};

const containsTextLayer = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsTextLayer);
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.ty === 5 || Object.values(record).some(containsTextLayer);
};

export const validateLottieAnimationData = (
  value: unknown,
  label = 'Lottie asset',
): string[] => {
  const root = z.object({
    fr: z.number().positive(),
    w: z.number().positive(),
    h: z.number().positive(),
    ip: z.number(),
    op: z.number(),
    layers: z.array(z.unknown()),
    assets: z.array(z.record(z.string(), z.unknown())).optional(),
  }).parse(value);
  if (root.op <= root.ip) {
    throw new Error(`${label} must end after its first frame.`);
  }
  if (
    root.assets?.some((asset) =>
      (typeof asset.p === 'string' && asset.p.trim().length > 0) ||
      (typeof asset.u === 'string' && asset.u.trim().length > 0),
    )
  ) {
    throw new Error(`${label} contains external image or file references; only pure-vector Lottie JSON is supported.`);
  }
  if (containsTextLayer(value)) {
    throw new Error(`${label} contains text/font layers; only pure-vector Lottie JSON is supported.`);
  }
  return containsExpression(value)
    ? [`${label} contains a Lottie expression and requires manual flicker review.`]
    : [];
};

const validateSvg = (source: string, label: string): void => {
  if (!/<svg\b/iu.test(source)) {
    throw new Error(`${label} is not an SVG document.`);
  }
  if (/<script\b/iu.test(source) || /(?:href|src)\s*=\s*["']https?:/iu.test(source)) {
    throw new Error(`${label} contains executable or remote content.`);
  }
};

export const normalizeAssetLabel = (value: string): string =>
  value
    .toLocaleLowerCase('en-US')
    .replaceAll('&', ' and ')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();

export const loadAssetRegistry = async (
  assetRoot = defaultAssetRoot(),
): Promise<AssetRegistry> => {
  const [motionManifest, brandManifest, iconManifest] = await Promise.all([
    readJson(resolve(assetRoot, 'motion/manifest.json')).then((value) =>
      motionAssetManifestSchema.parse(value),
    ),
    readJson(resolve(assetRoot, 'brands/manifest.json')).then((value) =>
      brandAssetManifestSchema.parse(value),
    ),
    readJson(resolve(assetRoot, 'icons/manifest.json')).then((value) =>
      iconAssetManifestSchema.parse(value),
    ),
  ]);

  assertUnique(
    motionManifest.assets.map(({id}) => ({label: `motion asset ${id}`, value: id})),
    'motion asset id',
  );
  assertUnique(
    brandManifest.assets.map(({id}) => ({label: `brand asset ${id}`, value: id})),
    'brand asset id',
  );
  assertUnique(
    brandManifest.assets.flatMap((asset) =>
      [asset.canonicalName, ...asset.aliases].map((name) => ({
        label: `brand asset ${asset.id}`,
        value: normalizeAssetLabel(name),
      })),
    ),
    'brand alias',
  );
  assertUnique(
    iconManifest.assets.map(({id}) => ({label: `icon asset ${id}`, value: id})),
    'icon asset id',
  );
  for (const asset of iconManifest.assets) {
    if (semanticIconDefinitionFor(asset.id)) {
      throw new Error(`Local icon asset id "${asset.id}" conflicts with a built-in semantic icon.`);
    }
  }

  const warnings: string[] = [];
  for (const asset of motionManifest.assets) {
    const path = resolvedAssetPath(assetRoot, asset.file);
    await access(path, constants.R_OK);
    const data = await readJson(path);
    warnings.push(...validateLottieAnimationData(data, `Motion asset ${asset.id}`));
  }
  for (const asset of brandManifest.assets) {
    const path = resolvedAssetPath(assetRoot, asset.file);
    await access(path, constants.R_OK);
    validateSvg(await readFile(path, 'utf8'), `Brand asset ${asset.id}`);
  }
  for (const asset of iconManifest.assets) {
    const path = resolvedAssetPath(assetRoot, asset.file);
    await access(path, constants.R_OK);
    validateSvg(await readFile(path, 'utf8'), `Icon asset ${asset.id}`);
  }

  return {
    assetRoot: resolve(assetRoot),
    brandAssets: brandManifest.assets,
    iconAssets: iconManifest.assets,
    motionAssets: [...motionManifest.assets].sort(
      (left, right) => right.priority - left.priority || left.id.localeCompare(right.id),
    ),
    warnings,
  };
};

export const motionAssetForMotif = (
  registry: AssetRegistry,
  motif: NarratedVisualMotif,
): MotionAssetDefinition | undefined => motif === 'none'
  ? undefined
  : registry.motionAssets.find((asset) => asset.motifs.includes(motif));

export const motionAssetForScene = (
  registry: AssetRegistry,
  motif: NarratedVisualMotif,
  sceneText: string,
): MotionAssetDefinition | undefined => {
  if (motif === 'none') return undefined;
  const normalizedScene = ` ${normalizeAssetLabel(sceneText)} `;
  const candidates = registry.motionAssets
    .filter((asset) => asset.motifs.includes(motif))
    .map((asset) => ({
      asset,
      score: asset.keywords.reduce((score, keyword) => {
        const normalizedKeyword = normalizeAssetLabel(keyword);
        if (!normalizedKeyword || !normalizedScene.includes(` ${normalizedKeyword} `)) {
          return score;
        }
        return score + normalizedKeyword.split(' ').length;
      }, 0),
    }))
    .filter(({score}) => score > 0)
    .sort((left, right) =>
      right.score - left.score ||
      right.asset.priority - left.asset.priority ||
      left.asset.id.localeCompare(right.asset.id),
    );
  return candidates[0]?.asset;
};

export const iconAssetForId = (
  registry: AssetRegistry,
  id: string,
): IconAssetDefinition | undefined =>
  registry.iconAssets.find((asset) => asset.id === id);

export const brandAssetForLabel = (
  registry: AssetRegistry,
  label: string,
): BrandAssetDefinition | undefined => {
  const normalized = normalizeAssetLabel(label);
  return registry.brandAssets.find((asset) =>
    [asset.canonicalName, ...asset.aliases]
      .map(normalizeAssetLabel)
      .includes(normalized),
  );
};

export const assetFilePath = (
  registry: AssetRegistry,
  file: string,
): string => resolvedAssetPath(registry.assetRoot, file);
