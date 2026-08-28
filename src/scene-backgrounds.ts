import {createHash} from 'node:crypto';
import {access, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import OpenAI from 'openai';
import {z} from 'zod';
import {profilesForSelection} from './render-profile.js';
import {
  imageQualitySchema,
  renderAspectRatioSchema,
  type AspectRatioSelection,
  type DraftNarrationScene,
  type ImageQuality,
  type RenderAspectRatio,
  type VideoPalette,
} from './types.js';
import {videoPaletteFor} from './visual-palettes.js';

const backgroundManifestEntrySchema = z.object({
  sceneId: z.string().min(1),
  aspectRatio: renderAspectRatioSchema,
  prompt: z.string().min(1),
  promptHash: z.string().min(1),
  model: z.string().min(1),
  quality: imageQualitySchema,
  file: z.string().min(1),
});

const backgroundManifestSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().min(1),
  entries: z.array(backgroundManifestEntrySchema),
});

export type BackgroundManifestEntry = z.infer<typeof backgroundManifestEntrySchema>;
export type BackgroundManifest = z.infer<typeof backgroundManifestSchema>;

export type SceneBackgroundAssets = Record<
  RenderAspectRatio,
  Record<string, string>
>;

export const IMAGE_SIZE_BY_ASPECT: Record<RenderAspectRatio, string> = {
  '16:9': '2048x1152',
  '9:16': '1152x2048',
};

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const safeFilenamePart = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'scene';

export const sceneBackgroundPrompt = (
  scene: Pick<DraftNarrationScene, 'backgroundPrompt' | 'title'>,
  aspectRatio: RenderAspectRatio,
  palette: VideoPalette,
): string => {
  const orientation = aspectRatio === '16:9'
    ? 'wide cinematic 16:9 landscape composition'
    : 'tall cinematic 9:16 portrait composition';
  return [
    scene.backgroundPrompt.trim(),
    `${orientation}.`,
    'Abstract cinematic educational-video background.',
    videoPaletteFor(palette).generatedImageDirection,
    'No text, letters, numbers, logos, watermarks, user-interface panels, or prominent people.',
    'Keep the center and upper caption area low-detail and high-contrast for foreground diagrams and subtitles.',
  ].join(' ');
};

export const sceneBackgroundCacheKey = ({
  aspectRatio,
  model,
  prompt,
  quality,
  sceneId,
}: {
  aspectRatio: RenderAspectRatio;
  model: string;
  prompt: string;
  quality: ImageQuality;
  sceneId: string;
}): string => createHash('sha256')
  .update(JSON.stringify({aspectRatio, model, prompt, quality, sceneId}))
  .digest('hex');

export interface GenerateSceneImageOptions {
  model: string;
  prompt: string;
  quality: ImageQuality;
  size: string;
}

export type GenerateSceneImage = (
  options: GenerateSceneImageOptions,
) => Promise<Buffer>;

const isTransientImageError = (error: unknown): boolean => {
  const status = (error as {status?: unknown})?.status;
  return status === 429 || (typeof status === 'number' && status >= 500);
};

export const withTransientImageRetries = async <T>(
  operation: () => Promise<T>,
  wait: (milliseconds: number) => Promise<void> = async (milliseconds) => {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
  },
): Promise<T> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientImageError(error) || attempt === 2) throw error;
      await wait(500 * 2 ** attempt);
    }
  }
  throw new Error('Image generation retry loop ended unexpectedly.');
};

export const createOpenAIImageGenerator = (): GenerateSceneImage => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is required for uncached image generation.',
    );
  }
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
  });
  return async ({model, prompt, quality, size}) => withTransientImageRetries(
    async () => {
      const response = await client.images.generate({
        background: 'opaque',
        model,
        n: 1,
        output_compression: 88,
        output_format: 'jpeg',
        prompt,
        quality,
        size,
      });
      const encoded = response.data?.[0]?.b64_json;
      if (!encoded) {
        throw new Error('OpenAI image generation returned no image data.');
      }
      return Buffer.from(encoded, 'base64');
    },
  );
};

const readManifest = async (directory: string): Promise<BackgroundManifest> => {
  try {
    return backgroundManifestSchema.parse(
      JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8')),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {version: 1, generatedAt: new Date(0).toISOString(), entries: []};
    }
    throw new Error(`Invalid generated-background manifest in ${directory}.`, {
      cause: error,
    });
  }
};

const assetsFromEntries = (
  directory: string,
  entries: BackgroundManifestEntry[],
): SceneBackgroundAssets => {
  const assets: SceneBackgroundAssets = {'16:9': {}, '9:16': {}};
  for (const entry of entries) {
    assets[entry.aspectRatio][entry.sceneId] = resolve(directory, entry.file);
  }
  return assets;
};

export interface MaterializeSceneBackgroundsOptions {
  aspectRatio: AspectRatioSelection;
  generateImage?: GenerateSceneImage;
  model: string;
  outputDirectory: string;
  palette: VideoPalette;
  quality: ImageQuality;
  regenerate: boolean;
  scenes: DraftNarrationScene[];
  stem: string;
}

export const materializeSceneBackgrounds = async (
  options: MaterializeSceneBackgroundsOptions,
): Promise<SceneBackgroundAssets> => {
  const finalDirectory = resolve(
    options.outputDirectory,
    `${options.stem}.backgrounds`,
  );
  const existingManifest = await readManifest(finalDirectory);
  const requested = profilesForSelection(options.aspectRatio).flatMap((profile) =>
    options.scenes.map((scene) => {
      const prompt = sceneBackgroundPrompt(
        scene,
        profile.aspectRatio,
        options.palette,
      );
      const promptHash = sceneBackgroundCacheKey({
        aspectRatio: profile.aspectRatio,
        model: options.model,
        prompt,
        quality: options.quality,
        sceneId: scene.id,
      });
      const file = `${safeFilenamePart(scene.id)}-${profile.aspectRatio.replace(':', 'x')}-${promptHash.slice(0, 12)}.jpg`;
      return {
        sceneId: scene.id,
        aspectRatio: profile.aspectRatio,
        prompt,
        promptHash,
        model: options.model,
        quality: options.quality,
        file,
      } satisfies BackgroundManifestEntry;
    }),
  );

  const allCached = !options.regenerate && await Promise.all(
    requested.map(async (entry) => {
      const recorded = existingManifest.entries.some((candidate) =>
        candidate.promptHash === entry.promptHash && candidate.file === entry.file,
      );
      return recorded && await pathExists(resolve(finalDirectory, entry.file));
    }),
  ).then((results) => results.every(Boolean));
  if (allCached) {
    return assetsFromEntries(finalDirectory, requested);
  }

  const generateImage = options.generateImage ?? createOpenAIImageGenerator();
  await mkdir(options.outputDirectory, {recursive: true});
  const stagingDirectory = await mkdtemp(
    resolve(options.outputDirectory, `.${options.stem}.backgrounds-staging-`),
  );
  const backupDirectory = resolve(
    options.outputDirectory,
    `.${options.stem}.backgrounds-backup-${process.pid}-${Date.now()}`,
  );
  let movedExisting = false;
  try {
    if (await pathExists(finalDirectory)) {
      await cp(finalDirectory, stagingDirectory, {recursive: true});
    }
    for (const entry of requested) {
      const stagedPath = resolve(stagingDirectory, entry.file);
      if (!options.regenerate && await pathExists(stagedPath)) continue;
      const bytes = await generateImage({
        model: entry.model,
        prompt: entry.prompt,
        quality: entry.quality,
        size: IMAGE_SIZE_BY_ASPECT[entry.aspectRatio],
      });
      await writeFile(stagedPath, bytes);
    }

    const byFile = new Map(
      existingManifest.entries.map((entry) => [entry.file, entry]),
    );
    for (const entry of requested) byFile.set(entry.file, entry);
    const manifest: BackgroundManifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      entries: [...byFile.values()],
    };
    await writeFile(
      resolve(stagingDirectory, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    if (await pathExists(finalDirectory)) {
      await rename(finalDirectory, backupDirectory);
      movedExisting = true;
    }
    await rename(stagingDirectory, finalDirectory);
    if (movedExisting) {
      await rm(backupDirectory, {recursive: true, force: true});
    }
    return assetsFromEntries(finalDirectory, requested);
  } catch (error) {
    await rm(stagingDirectory, {recursive: true, force: true});
    if (movedExisting && !await pathExists(finalDirectory)) {
      await rename(backupDirectory, finalDirectory);
    }
    const requestId = (error as {request_id?: unknown})?.request_id;
    const suffix = typeof requestId === 'string' ? ` Request ID: ${requestId}.` : '';
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`Could not materialize generated scene backgrounds.${detail}${suffix}`, {
      cause: error,
    });
  }
};
