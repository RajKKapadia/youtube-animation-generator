import {existsSync} from 'node:fs';
import {copyFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {aspectSuffix, profilesForSelection} from './render-profile.js';
import type {
  AspectRatioSelection,
  CaptionMode,
  RenderProfile,
  SceneBackgroundMode,
  TimedNarratedPlan,
} from './types.js';
import type {SceneBackgroundAssets} from './scene-backgrounds.js';
import type {GeneratedVisualAssets} from './generated-visuals.js';
import {stageVisualRenderAssets} from './visual-render-assets.js';
import {stageImageBackground, type ImageBackground} from './image-background.js';

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

const createSilentWavBuffer = (durationSeconds = 2, sampleRate = 44100): Buffer => {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const numSamples = Math.max(sampleRate, Math.floor(durationSeconds * sampleRate));
  const dataSize = numSamples * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
};

export interface NarratedOutput {
  file: string;
  outputPath: string;
  profile: RenderProfile;
}

export interface RenderNarratedVideoOptions {
  aspectRatio: AspectRatioSelection;
  backgroundAssets?: SceneBackgroundAssets | undefined;
  imageBackground?: ImageBackground | undefined;
  foregroundAssets?: GeneratedVisualAssets | undefined;
  captions: CaptionMode;
  force: boolean;
  fps: number;
  outputDirectory: string;
  plan: TimedNarratedPlan;
  sceneBackground: SceneBackgroundMode;
  stem: string;
  voiceoverBaseDirectory?: string;
  stillsOnly?: boolean | undefined;
}

export const narratedOutputPaths = (
  options: Pick<RenderNarratedVideoOptions, 'aspectRatio' | 'outputDirectory' | 'stem'>,
): NarratedOutput[] => profilesForSelection(options.aspectRatio).map((profile) => {
  const file = `${options.stem}${aspectSuffix(profile.aspectRatio)}.mp4`;
  return {file, outputPath: resolve(options.outputDirectory, file), profile};
});

export const narratedStillPaths = (
  options: Pick<RenderNarratedVideoOptions, 'aspectRatio' | 'outputDirectory' | 'stem' | 'plan'>,
): string[] => {
  const stillsDirectory = resolve(options.outputDirectory, `${options.stem}.stills`);
  const profiles = profilesForSelection(options.aspectRatio);
  const paths: string[] = [];
  for (const profile of profiles) {
    const aspect = profile.aspectRatio.replace(':', 'x');
    for (const [sceneIndex, scene] of options.plan.scenes.entries()) {
      const prefix = `scene-${sceneIndex + 1}-${scene.id}`;
      paths.push(resolve(stillsDirectory, `${prefix}-${aspect}.png`));
      paths.push(resolve(stillsDirectory, `${prefix}-mid-${aspect}.png`));
      paths.push(resolve(stillsDirectory, `${prefix}-final-${aspect}.png`));
    }
  }
  return paths;
};

export const renderNarratedVideo = async (
  options: RenderNarratedVideoOptions,
): Promise<NarratedOutput[]> => {
  await mkdir(options.outputDirectory, {recursive: true});
  const outputs = narratedOutputPaths(options);
  if (options.stillsOnly) {
    if (!options.force) {
      const stillPaths = narratedStillPaths(options);
      const existing = stillPaths.find((path) => existsSync(path));
      if (existing) {
        throw new Error(
          `Output already exists: ${existing}. Use --force to replace scene screenshots.`,
        );
      }
    }
  } else if (!options.force) {
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
  if (!existsSync(voiceoverPath) && !options.stillsOnly) {
    throw new Error(`Narration voiceover does not exist: ${voiceoverPath}`);
  }

  const publicDirectory = await mkdtemp(resolve(tmpdir(), 'youtube-animations-public-'));
  try {
    const publicAudioName = basename(voiceoverPath);
    if (existsSync(voiceoverPath)) {
      await copyFile(voiceoverPath, resolve(publicDirectory, publicAudioName));
    } else {
      const silentBuffer = createSilentWavBuffer(Math.ceil(options.plan.durationMs / 1000) + 2);
      await writeFile(resolve(publicDirectory, publicAudioName), silentBuffer);
    }
    const publicBackgroundAssets: SceneBackgroundAssets = {'16:9': {}, '9:16': {}};
    if (options.sceneBackground === 'image') {
      const publicName = await stageImageBackground(options.imageBackground, publicDirectory);
      for (const {profile} of outputs) {
        for (const scene of options.plan.scenes) {
          publicBackgroundAssets[profile.aspectRatio][scene.id] = publicName;
        }
      }
    }
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
    const planDirectory = options.voiceoverBaseDirectory ?? options.outputDirectory;
    const visualScenes = options.plan.scenes.map((scene) => ({
      ...scene,
      activityCues: scene.beats.map((beat) => ({
        startMs: beat.startMs,
        text: beat.phrases.map(({text}) => text).join(' '),
      })),
      primaryItemTimings: scene.primaryItemTimings.map(({startMs}) => ({startMs})),
      secondaryItemTimings: scene.secondaryItemTimings.map(({startMs}) => ({startMs})),
    }));
    const staged = await stageVisualRenderAssets({
      foregroundAssets: options.foregroundAssets,
      mediaAssets: options.plan.mediaAssets,
      planDirectory,
      profiles: outputs.map(({profile}) => profile),
      publicDirectory,
      scenes: visualScenes,
      sourceTextForScene: () => options.plan.sourceText,
    });

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
        foregroundAssets: staged.foregroundAssets[output.profile.aspectRatio],
        fps: options.fps,
        profile: output.profile,
        audioFile: publicAudioName,
        technologyIcons: staged.technologyIcons,
        localBrandAssets: staged.localBrandAssets,
        localIconAssets: staged.localIconAssets,
        motionAssets: staged.motionAssets,
      };
      const composition = await selectComposition({
        serveUrl,
        id: 'NarratedVideo',
        inputProps,
        logLevel: 'warn',
        ...(browserExecutable ? {browserExecutable} : {}),
      });
      if (options.stillsOnly) {
        const stillsDirectory = resolve(options.outputDirectory, `${options.stem}.stills`);
        await mkdir(stillsDirectory, {recursive: true});
        let accumulatedMs = 0;
        for (const [sceneIndex, scene] of options.plan.scenes.entries()) {
          const aspect = output.profile.aspectRatio.replace(':', 'x');
          const prefix = `scene-${sceneIndex + 1}-${scene.id}`;

          // Midpoint frame: halfway through the scene
          const targetMsMid = accumulatedMs + Math.floor(scene.durationMs * 0.5);
          const frameMid = Math.floor((targetMsMid / 1000) * options.fps);
          const midFile = `${prefix}-mid-${aspect}.png`;
          const midPath = resolve(stillsDirectory, midFile);
          await renderStill({
            serveUrl,
            composition,
            inputProps,
            frame: frameMid,
            output: midPath,
            imageFormat: 'png',
            logLevel: 'warn',
            ...(browserExecutable ? {browserExecutable} : {}),
          });
          console.log(`Saved scene screenshot [${sceneIndex + 1}/${options.plan.scenes.length}] (mid): ${midPath}`);

          // Final full reveal frame: 88% into the scene with all items revealed
          const targetMsFinal = accumulatedMs + Math.min(scene.durationMs - 200, Math.floor(scene.durationMs * 0.88));
          const frameFinal = Math.floor((targetMsFinal / 1000) * options.fps);
          const finalFile = `${prefix}-final-${aspect}.png`;
          const finalPath = resolve(stillsDirectory, finalFile);
          await renderStill({
            serveUrl,
            composition,
            inputProps,
            frame: frameFinal,
            output: finalPath,
            imageFormat: 'png',
            logLevel: 'warn',
            ...(browserExecutable ? {browserExecutable} : {}),
          });
          console.log(`Saved scene screenshot [${sceneIndex + 1}/${options.plan.scenes.length}] (final): ${finalPath}`);

          // Also copy to canonical still path so tools expecting scene-X-id-16x9.png get the full reveal
          const canonicalFile = `${prefix}-${aspect}.png`;
          const canonicalPath = resolve(stillsDirectory, canonicalFile);
          await copyFile(finalPath, canonicalPath);

          accumulatedMs += scene.durationMs;
        }
      } else {
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
    }
    return outputs;
  } finally {
    await rm(publicDirectory, {recursive: true, force: true});
  }
};
