import {existsSync} from 'node:fs';
import {copyFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import type {
  AspectRatioSelection,
  AnimationClip,
  CaptionMode,
  ClipBackgroundMode,
  ManifestClip,
  OutputFormat,
  RenderBackground,
  RenderProfile,
  SavedPlan,
} from './types.js';
import {aspectSuffix, profilesForSelection} from './render-profile.js';
import type {GeneratedVisualAssets} from './generated-visuals.js';
import type {SceneBackgroundAssets} from './scene-backgrounds.js';
import {stageVisualRenderAssets, type StagedVisualAssets} from './visual-render-assets.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

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

const findEntryPoint = (): string => {
  const compiled = resolve(currentDirectory, 'remotion/index.js');
  const source = resolve(currentDirectory, 'remotion/index.tsx');
  if (existsSync(compiled)) {
    return compiled;
  }
  if (existsSync(source)) {
    return source;
  }
  throw new Error('Could not find the Remotion entry point. Run the CLI from a complete build.');
};

const extensionForFormat = (format: OutputFormat): string => {
  switch (format) {
    case 'prores':
      return 'mov';
    case 'webm':
      return 'webm';
    case 'green':
    case 'h264':
      return 'mp4';
  }
};

const timestampForFilename = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}h${String(minutes).padStart(2, '0')}m${String(seconds).padStart(2, '0')}s`;
};

export const filenameForClip = (
  clip: AnimationClip,
  index: number,
  format: OutputFormat,
  profile: RenderProfile = profilesForSelection('16:9')[0]!,
): string =>
  `${timestampForFilename(clip.sourceStartMs)}-${String(index + 1).padStart(2, '0')}-${!clip.visual || clip.visual.kind === 'diagram' ? clip.template : clip.visual.kind}${aspectSuffix(profile.aspectRatio)}.${extensionForFormat(format)}`;

const renderOne = async ({
  background,
  backgroundAsset,
  captions,
  clip,
  force,
  format,
  fps,
  outputPath,
  palette,
  profile,
  sceneBackground,
  serveUrl,
  stagedAssets,
}: {
  background: RenderBackground;
  backgroundAsset?: string | undefined;
  captions: CaptionMode;
  clip: AnimationClip;
  force: boolean;
  format: OutputFormat;
  fps: number;
  outputPath: string;
  palette: SavedPlan['palette'];
  profile: RenderProfile;
  sceneBackground: ClipBackgroundMode;
  serveUrl: string;
  stagedAssets: StagedVisualAssets;
}): Promise<void> => {
  const inputProps = {
    background,
    ...(backgroundAsset ? {backgroundAsset} : {}),
    captions,
    clip,
    foregroundAssets: stagedAssets.foregroundAssets[profile.aspectRatio],
    fps,
    localBrandAssets: stagedAssets.localBrandAssets,
    localIconAssets: stagedAssets.localIconAssets,
    motionAssets: stagedAssets.motionAssets,
    palette,
    profile,
    sceneBackground,
    technologyIcons: stagedAssets.technologyIcons,
  };
  const browserExecutable = findBrowserExecutable();
  const composition = await selectComposition({
    serveUrl,
    id: 'SubtitleClip',
    inputProps,
    logLevel: 'warn',
    ...(browserExecutable ? {browserExecutable} : {}),
  });

  let lastReportedPercent = -1;
  const onProgress = ({progress}: {progress: number}) => {
    const percent = Math.floor(progress * 100);
    if (percent >= lastReportedPercent + 10 || percent === 100) {
      lastReportedPercent = percent;
      process.stdout.write(`\r  Rendering ${percent}%`);
    }
  };

  const common = {
    composition,
    inputProps,
    outputLocation: outputPath,
    overwrite: force,
    muted: true,
    serveUrl,
    onProgress,
    concurrency: 1,
    logLevel: 'warn' as const,
    ...(browserExecutable ? {browserExecutable} : {}),
  };

  if (format === 'prores') {
    await renderMedia({
      ...common,
      codec: 'prores',
      imageFormat: 'png',
      pixelFormat: 'yuva444p10le',
      proResProfile: '4444',
    });
  } else if (format === 'webm') {
    await renderMedia({
      ...common,
      codec: 'vp8',
      imageFormat: 'png',
      pixelFormat: 'yuva420p',
    });
  } else {
    await renderMedia({
      ...common,
      codec: 'h264',
      imageFormat: 'jpeg',
    });
  }

  process.stdout.write('\r  Rendering 100%\n');
};

export interface RenderClipsOptions {
  aspectRatio: AspectRatioSelection;
  backgroundAssets?: SceneBackgroundAssets | undefined;
  captions: CaptionMode;
  foregroundAssets?: GeneratedVisualAssets | undefined;
  force: boolean;
  format: OutputFormat;
  fps: number;
  outputDirectory: string;
  plan: SavedPlan;
  planDirectory: string;
  sceneBackground: ClipBackgroundMode;
}

export interface RenderedClipProfile {
  profile: RenderProfile;
  clips: ManifestClip[];
}

export const renderClips = async (
  options: RenderClipsOptions,
): Promise<RenderedClipProfile[]> => {
  await mkdir(options.outputDirectory, {recursive: true});

  const profiles = profilesForSelection(options.aspectRatio);
  const outputs = profiles.flatMap((profile) =>
    options.plan.clips.map((clip, index) => {
      const file = filenameForClip(clip, index, options.format, profile);
      return {clip, file, outputPath: resolve(options.outputDirectory, file), profile};
    }),
  );

  if (!options.force) {
    const existing = outputs.find(({outputPath}) => existsSync(outputPath));
    if (existing) {
      throw new Error(
        `Output already exists: ${existing.outputPath}. Use --force to replace generated clips.`,
      );
    }
  }

  if (outputs.length === 0) {
    return profiles.map((profile) => ({profile, clips: []}));
  }

  const publicDirectory = await mkdtemp(resolve(tmpdir(), 'youtube-animation-clips-public-'));
  try {
    const publicBackgroundAssets: SceneBackgroundAssets = {'16:9': {}, '9:16': {}};
    if (options.sceneBackground === 'generated') {
      for (const output of outputs) {
        const asset = options.backgroundAssets?.[output.profile.aspectRatio]?.[output.clip.id];
        if (!asset || !existsSync(asset)) {
          throw new Error(
            `Generated background does not exist for ${output.clip.id} (${output.profile.aspectRatio}).`,
          );
        }
        const publicName = basename(asset);
        await copyFile(asset, resolve(publicDirectory, publicName));
        publicBackgroundAssets[output.profile.aspectRatio][output.clip.id] = publicName;
      }
    }
    const scenes = options.plan.clips.map((clip) => ({
      id: clip.id,
      durationMs: clip.durationMs,
      template: clip.template,
      title: clip.title,
      primaryItems: clip.primaryItems,
      secondaryItems: clip.secondaryItems,
      leftLabel: clip.leftLabel,
      rightLabel: clip.rightLabel,
      reason: clip.reason,
      visual: clip.visual,
      icons: clip.icons,
      primaryItemTimings: clip.primaryItemTimings?.map(({startMs}) => ({startMs})) ?? [],
      secondaryItemTimings: clip.secondaryItemTimings?.map(({startMs}) => ({startMs})) ?? [],
      activityCues: clip.captionCues.map(({startMs, text}) => ({startMs, text})),
    }));
    const sourceById = new Map(options.plan.clips.map((clip) => [clip.id, clip.transcript]));
    const stagedAssets = await stageVisualRenderAssets({
      foregroundAssets: options.foregroundAssets,
      mediaAssets: options.plan.mediaAssets,
      planDirectory: options.planDirectory,
      profiles,
      publicDirectory,
      scenes,
      sourceTextForScene: (scene) => sourceById.get(scene.id) ?? '',
    });

    console.log('Bundling animation templates...');
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
      onProgress: (progress) => {
        if (progress === 1) console.log('Templates bundled.');
      },
    });

    const background: RenderBackground = options.format === 'green' ? 'green' : 'transparent';
    const rendered = new Map<string, ManifestClip[]>();
    for (const profile of profiles) rendered.set(profile.aspectRatio, []);

    for (const [index, output] of outputs.entries()) {
      console.log(
        `[${index + 1}/${outputs.length}] ${output.clip.title} -> ${output.file}`,
      );
      await renderOne({
        background,
        backgroundAsset: publicBackgroundAssets[output.profile.aspectRatio][output.clip.id],
        captions: options.captions,
        clip: output.clip,
        force: options.force,
        format: options.format,
        fps: options.fps,
        outputPath: output.outputPath,
        palette: options.plan.palette,
        profile: output.profile,
        sceneBackground: options.sceneBackground,
        serveUrl,
        stagedAssets,
      });
      rendered.get(output.profile.aspectRatio)!.push({...output.clip, file: output.file});
    }

    return profiles.map((profile) => ({
      profile,
      clips: rendered.get(profile.aspectRatio) ?? [],
    }));
  } finally {
    await rm(publicDirectory, {recursive: true, force: true});
  }
};
