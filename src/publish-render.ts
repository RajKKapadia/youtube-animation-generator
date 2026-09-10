import {stageVisualRenderAssets} from './visual-render-assets.js';
import {validateCoverDirection} from './cover-direction.js';
import {existsSync} from 'node:fs';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {
  publishCoverProfilesForSelection,
  publishCoverSuffix,
} from './publish-profile.js';
import {resolveTechnologyBrandIcons} from './technology-catalog.js';
import {stageImageBackground, type ImageBackground} from './image-background.js';
import type {
  AspectRatioSelection,
  NarratedPublishPlan,
  PublishScene,
  NarratedMediaAsset,
  RenderProfile,
} from './types.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const findEntryPoint = (): string => {
  const compiled = resolve(currentDirectory, 'remotion/index.js');
  const source = resolve(currentDirectory, 'remotion/index.tsx');
  if (existsSync(compiled)) return compiled;
  if (existsSync(source)) return source;
  throw new Error('Could not find the Remotion entry point. Run from a complete build.');
};

const findBrowserExecutable = (): string | undefined => {
  if (process.env.REMOTION_BROWSER_EXECUTABLE) {
    return process.env.REMOTION_BROWSER_EXECUTABLE;
  }
  return [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((candidate) => existsSync(candidate));
};

export interface PublishCoverOutput {
  file: string;
  outputPath: string;
  profile: RenderProfile;
}

export interface RenderPublishCoversOptions {
  aspectRatio: AspectRatioSelection;
  mediaAssets?: NarratedMediaAsset[];
  planDirectory?: string;
  sourceText?: string;
  imageBackground?: ImageBackground;
  force: boolean;
  outputDirectory: string;
  publish: NarratedPublishPlan;
  scene: PublishScene;
  stem: string;
}

export const publishCoverOutputPaths = (
  options: Pick<
    RenderPublishCoversOptions,
    'aspectRatio' | 'outputDirectory' | 'stem'
  >,
): PublishCoverOutput[] => publishCoverProfilesForSelection(options.aspectRatio)
  .map((profile) => {
    const file = `${options.stem}${publishCoverSuffix(profile.aspectRatio)}`;
    return {file, outputPath: resolve(options.outputDirectory, file), profile};
  });

export const renderPublishCovers = async (
  options: RenderPublishCoversOptions,
): Promise<PublishCoverOutput[]> => {
  validateCoverDirection(options.publish, options.scene);
  await mkdir(options.outputDirectory, {recursive: true});
  const outputs = publishCoverOutputPaths(options);
  if (!options.force) {
    const existing = outputs.find(({outputPath}) => existsSync(outputPath));
    if (existing) {
      throw new Error(
        `Output already exists: ${existing.outputPath}. Use --force to replace publish covers.`,
      );
    }
  }

  const publicDirectory = await mkdtemp(resolve(tmpdir(), 'youtube-publish-assets-'));
  try {
    const backgroundImageAsset = options.imageBackground
      ? await stageImageBackground(options.imageBackground, publicDirectory)
      : undefined;
    const coverScene = options.scene;
    const visual = options.publish.thumbnail.composition && coverScene.visual?.kind !== 'image-focus'
      ? coverScene.visual
      : options.publish.thumbnail.composition === 'evidence' ? coverScene.visual : undefined;
    const staged = await stageVisualRenderAssets({
      mediaAssets: options.mediaAssets ?? [],
      planDirectory: options.planDirectory ?? options.outputDirectory,
      profiles: outputs.map(({profile}) => profile),
      publicDirectory,
      scenes: [{...coverScene, visual: visual ?? {kind: 'diagram', motion: 'reveal', motif: 'none', assetId: null},
        durationMs: 1000, primaryItemTimings: coverScene.primaryItems.map(() => ({startMs: 0})),
        secondaryItemTimings: coverScene.secondaryItems.map(() => ({startMs: 0})), activityCues: []}],
      sourceTextForScene: () => options.sourceText ?? '',
    });
    const localIconAssets = staged.localIconAssets;
    console.log('Bundling code-native publish-cover templates...');
    const serveUrl = await bundle({
      entryPoint: findEntryPoint(),
      publicDir: publicDirectory,
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          extensionAlias: {
            ...config.resolve?.extensionAlias,
            '.js': ['.js', '.ts', '.tsx'],
          },
        },
      }),
    });
    const technologyIcons = resolveTechnologyBrandIcons([
      ...options.scene.primaryItems,
      ...options.scene.secondaryItems,
    ]);
    const browserExecutable = findBrowserExecutable();

    for (const [index, output] of outputs.entries()) {
      const inputProps = {
        publish: options.publish,
        scene: options.scene,
        profile: output.profile,
        technologyIcons: options.publish.thumbnail.composition ? staged.technologyIcons : technologyIcons,
        localIconAssets,
        localBrandAssets: options.publish.thumbnail.composition ? staged.localBrandAssets : {},
        foregroundAssets: staged.foregroundAssets[output.profile.aspectRatio],
        ...(backgroundImageAsset ? {backgroundImageAsset} : {}),
      };
      const composition = await selectComposition({
        serveUrl,
        id: 'NarratedThumbnail',
        inputProps,
        logLevel: 'warn',
        ...(browserExecutable ? {browserExecutable} : {}),
      });
      console.log(
        `[${index + 1}/${outputs.length}] ${output.profile.aspectRatio} -> ${output.file}`,
      );
      await renderStill({
        serveUrl,
        composition,
        inputProps,
        output: output.outputPath,
        frame: 0,
        imageFormat: 'png',
        logLevel: 'warn',
        ...(browserExecutable ? {browserExecutable} : {}),
      });
    }
    return outputs;
  } finally {
    await rm(publicDirectory, {recursive: true, force: true});
  }
};
