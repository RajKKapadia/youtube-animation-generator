import {existsSync} from 'node:fs';
import {copyFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {aspectSuffix, profilesForSelection} from './render-profile.js';
import type {
  AspectRatioSelection,
  CaptionMode,
  RenderProfile,
  SceneBackgroundMode,
  TimedNarratedPlan,
} from './types.js';
import type {SceneBackgroundAssets} from './scene-backgrounds.js';
import {
  assetFilePath,
  brandAssetForLabel,
  loadAssetRegistry,
  normalizeAssetLabel,
} from './asset-registry.js';

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

export interface NarratedOutput {
  file: string;
  outputPath: string;
  profile: RenderProfile;
}

export interface RenderNarratedVideoOptions {
  aspectRatio: AspectRatioSelection;
  backgroundAssets?: SceneBackgroundAssets | undefined;
  captions: CaptionMode;
  force: boolean;
  fps: number;
  outputDirectory: string;
  plan: TimedNarratedPlan;
  sceneBackground: SceneBackgroundMode;
  stem: string;
  voiceoverBaseDirectory?: string;
}

export const narratedOutputPaths = (
  options: Pick<RenderNarratedVideoOptions, 'aspectRatio' | 'outputDirectory' | 'stem'>,
): NarratedOutput[] => profilesForSelection(options.aspectRatio).map((profile) => {
  const file = `${options.stem}${aspectSuffix(profile.aspectRatio)}.mp4`;
  return {file, outputPath: resolve(options.outputDirectory, file), profile};
});

export const renderNarratedVideo = async (
  options: RenderNarratedVideoOptions,
): Promise<NarratedOutput[]> => {
  await mkdir(options.outputDirectory, {recursive: true});
  const outputs = narratedOutputPaths(options);
  if (!options.force) {
    const existing = outputs.find(({outputPath}) => existsSync(outputPath));
    if (existing) {
      throw new Error(
        `Output already exists: ${existing.outputPath}. Use --force to replace narrated videos.`,
      );
    }
  }

  const voiceoverPath = resolve(
    options.voiceoverBaseDirectory ?? options.outputDirectory,
    options.plan.voiceoverFile,
  );
  if (!existsSync(voiceoverPath)) {
    throw new Error(`Narration voiceover does not exist: ${voiceoverPath}`);
  }

  const publicDirectory = await mkdtemp(resolve(tmpdir(), 'youtube-animations-public-'));
  try {
    const publicAudioName = basename(voiceoverPath);
    await copyFile(voiceoverPath, resolve(publicDirectory, publicAudioName));
    const publicBackgroundAssets: SceneBackgroundAssets = {'16:9': {}, '9:16': {}};
    if (options.sceneBackground === 'generated') {
      for (const output of outputs) {
        for (const scene of options.plan.scenes) {
          const asset = options.backgroundAssets?.[output.profile.aspectRatio]?.[scene.id];
          if (!asset || !existsSync(asset)) {
            throw new Error(
              `Generated background does not exist for ${scene.id} (${output.profile.aspectRatio}).`,
            );
          }
          const publicName = basename(asset);
          await copyFile(asset, resolve(publicDirectory, publicName));
          publicBackgroundAssets[output.profile.aspectRatio][scene.id] = publicName;
        }
      }
    }
    const registry = await loadAssetRegistry();
    for (const warning of registry.warnings) {
      console.warn(`Asset registry warning: ${warning}`);
    }

    const motionAssets: Record<string, {
      id: string;
      file: string;
      loop: 'once' | 'loop';
      playbackRate: number;
      colorMap: Record<string, 'primary' | 'secondary'>;
    }> = {};
    for (const assetId of new Set(
      options.plan.scenes.flatMap((scene) => scene.visual.assetId ? [scene.visual.assetId] : []),
    )) {
      const asset = registry.motionAssets.find(({id}) => id === assetId);
      if (!asset) {
        throw new Error(
          `Narrated plan references unregistered motion asset "${assetId}". Add it to assets/motion/manifest.json before rendering.`,
        );
      }
      const publicName = `motion-${asset.id}.json`;
      await copyFile(assetFilePath(registry, asset.file), resolve(publicDirectory, publicName));
      motionAssets[asset.id] = {
        id: asset.id,
        file: publicName,
        loop: asset.loop,
        playbackRate: asset.playbackRate,
        colorMap: asset.colorMap,
      };
    }

    const allLabels = options.plan.scenes.flatMap((scene) => [
      ...scene.primaryItems,
      ...scene.secondaryItems,
    ]);
    const brandLabels = new Set(
      options.plan.scenes
        .filter((scene) => scene.visual.kind === 'brand-showcase')
        .flatMap((scene) => [...scene.primaryItems, ...scene.secondaryItems]),
    );
    const diagramLabels = new Set(
      options.plan.scenes
        .filter((scene) => scene.visual.kind === 'diagram')
        .flatMap((scene) => [...scene.primaryItems, ...scene.secondaryItems]),
    );
    const normalizedSource = ` ${normalizeAssetLabel(options.plan.sourceText)} `;
    const isSourceBackedBrand = (label: string): boolean =>
      normalizedSource.includes(` ${normalizeAssetLabel(label)} `);
    const {
      exactTechnologyBrandIconFor,
      technologyBrandIconFor,
    } = await import('./technology-catalog.js');
    const technologyIcons = Object.fromEntries(
      [...new Set(allLabels)].flatMap((label) => {
        const icon = brandLabels.has(label)
          ? isSourceBackedBrand(label)
            ? exactTechnologyBrandIconFor(label)
            : undefined
          : diagramLabels.has(label)
            ? technologyBrandIconFor(label)
            : exactTechnologyBrandIconFor(label);
        return icon ? [[label, icon] as const] : [];
      }),
    );

    const copiedBrands = new Map<string, string>();
    const localBrandAssets: Record<string, {
      id: string;
      title: string;
      file: string;
      colorPolicy: 'original' | 'monochrome-allowed';
    }> = {};
    for (const label of new Set(allLabels)) {
      if (technologyIcons[label]) continue;
      if (brandLabels.has(label) && !isSourceBackedBrand(label)) continue;
      const asset = brandAssetForLabel(registry, label);
      if (!asset) continue;
      const publicName = copiedBrands.get(asset.id) ?? `brand-${asset.id}.svg`;
      if (!copiedBrands.has(asset.id)) {
        await copyFile(assetFilePath(registry, asset.file), resolve(publicDirectory, publicName));
        copiedBrands.set(asset.id, publicName);
      }
      localBrandAssets[label] = {
        id: asset.id,
        title: asset.canonicalName,
        file: publicName,
        colorPolicy: asset.colorPolicy,
      };
    }

    console.log('Bundling narrated-video templates...');
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
    const browserExecutable = findBrowserExecutable();

    for (const [index, output] of outputs.entries()) {
      const inputProps = {
        plan: options.plan,
        captions: options.captions,
        sceneBackground: options.sceneBackground,
        backgroundAssets: publicBackgroundAssets[output.profile.aspectRatio],
        fps: options.fps,
        profile: output.profile,
        audioFile: publicAudioName,
        technologyIcons,
        localBrandAssets,
        motionAssets,
      };
      const composition = await selectComposition({
        serveUrl,
        id: 'NarratedVideo',
        inputProps,
        logLevel: 'warn',
        ...(browserExecutable ? {browserExecutable} : {}),
      });
      console.log(
        `[${index + 1}/${outputs.length}] ${output.profile.aspectRatio} -> ${output.file}`,
      );
      await renderMedia({
        serveUrl,
        composition,
        inputProps,
        outputLocation: output.outputPath,
        overwrite: options.force,
        codec: 'h264',
        audioCodec: 'aac',
        imageFormat: 'jpeg',
        muted: false,
        concurrency: 1,
        logLevel: 'warn',
        ...(browserExecutable ? {browserExecutable} : {}),
      });
    }
    return outputs;
  } finally {
    await rm(publicDirectory, {recursive: true, force: true});
  }
};
