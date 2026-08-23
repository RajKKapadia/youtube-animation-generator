import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import type {
  AnimationClip,
  ManifestClip,
  OutputFormat,
  RenderBackground,
  TechnologyBrandIcon,
} from './types.js';

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
): string =>
  `${timestampForFilename(clip.sourceStartMs)}-${String(index + 1).padStart(2, '0')}-${clip.template}.${extensionForFormat(format)}`;

const renderOne = async ({
  background,
  clip,
  force,
  format,
  fps,
  outputPath,
  serveUrl,
  technologyIcons,
}: {
  background: RenderBackground;
  clip: AnimationClip;
  force: boolean;
  format: OutputFormat;
  fps: number;
  outputPath: string;
  serveUrl: string;
  technologyIcons: Record<string, TechnologyBrandIcon>;
}): Promise<void> => {
  const inputProps = {background, clip, fps, technologyIcons};
  const browserExecutable = findBrowserExecutable();
  const composition = await selectComposition({
    serveUrl,
    id: 'AnimationClip',
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
  clips: AnimationClip[];
  force: boolean;
  format: OutputFormat;
  fps: number;
  outputDirectory: string;
}

export const renderClips = async (
  options: RenderClipsOptions,
): Promise<ManifestClip[]> => {
  await mkdir(options.outputDirectory, {recursive: true});

  const outputs = options.clips.map((clip, index) => {
    const file = filenameForClip(clip, index, options.format);
    return {clip, file, outputPath: resolve(options.outputDirectory, file)};
  });

  if (!options.force) {
    const existing = outputs.find(({outputPath}) => existsSync(outputPath));
    if (existing) {
      throw new Error(
        `Output already exists: ${existing.outputPath}. Use --force to replace generated clips.`,
      );
    }
  }

  if (outputs.length === 0) {
    return [];
  }

  console.log('Bundling animation templates...');
  const serveUrl = await bundle({
    entryPoint: findEntryPoint(),
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
      if (progress === 1) {
        console.log('Templates bundled.');
      }
    },
  });

  const background: RenderBackground = options.format === 'green' ? 'green' : 'transparent';
  const {resolveTechnologyBrandIcons} = await import('./technology-catalog.js');
  const technologyIcons = resolveTechnologyBrandIcons(
    options.clips.flatMap((clip) => [
      ...clip.primaryItems,
      ...clip.secondaryItems,
    ]),
  );
  const manifestClips: ManifestClip[] = [];

  for (const [index, output] of outputs.entries()) {
    console.log(
      `[${index + 1}/${outputs.length}] ${output.clip.title} -> ${output.file}`,
    );
    await renderOne({
      background,
      clip: output.clip,
      force: options.force,
      format: options.format,
      fps: options.fps,
      outputPath: output.outputPath,
      serveUrl,
      technologyIcons,
    });
    manifestClips.push({...output.clip, file: output.file});
  }

  return manifestClips;
};
