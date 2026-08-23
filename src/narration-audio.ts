import {access, mkdir, mkdtemp, rename, rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {validateSupertonicAssets} from './supertonic/assets.js';
import {runSupertonicWorker} from './supertonic/client.js';
import type {
  SupertonicResult,
  SupertonicVoice,
} from './supertonic/protocol.js';
import {supertonicLanguageSchema} from './supertonic/protocol.js';
import {
  timedNarratedPlanSchema,
  type DraftNarratedPlan,
  type TimedNarratedPlan,
} from './types.js';

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const samplesToMilliseconds = (samples: number, sampleRate: number): number =>
  Math.round((samples / sampleRate) * 1_000);

export const materializeTimedNarration = ({
  audioDirectoryName,
  draft,
  result,
  speed,
  steps,
  voice,
}: {
  audioDirectoryName: string;
  draft: DraftNarratedPlan;
  result: SupertonicResult;
  speed: number;
  steps: number;
  voice: SupertonicVoice;
}): TimedNarratedPlan => {
  if (result.scenes.length !== draft.scenes.length) {
    throw new Error('Supertonic result does not match the draft scene count.');
  }

  const scenes = draft.scenes.map((scene, sceneIndex) => {
    const timing = result.scenes[sceneIndex];
    if (!timing || timing.id !== scene.id || timing.beats.length !== scene.beats.length) {
      throw new Error(`Supertonic result does not match scene ${scene.id}.`);
    }
    const beatById = new Map(timing.beats.map((beat) => [beat.id, beat]));
    const timedBeats = scene.beats.map((beat) => {
      const beatTiming = beatById.get(beat.id);
      if (!beatTiming) {
        throw new Error(`Supertonic result is missing beat ${beat.id}.`);
      }
      return {
        ...beat,
        startMs: samplesToMilliseconds(
          beatTiming.startSample - timing.startSample,
          result.sampleRate,
        ),
        durationMs: Math.max(
          1,
          samplesToMilliseconds(beatTiming.sampleCount, result.sampleRate),
        ),
        audioFile: `${audioDirectoryName}/${beatTiming.file}`,
        sampleCount: beatTiming.sampleCount,
      };
    });

    const itemTimings = (
      lane: 'primaryItemIndices' | 'secondaryItemIndices',
      itemCount: number,
    ) => Array.from({length: itemCount}, (_, itemIndex) => {
      const beat = scene.beats.find((candidate) =>
        candidate[lane].includes(itemIndex),
      );
      const beatTiming = beat ? beatById.get(beat.id) : undefined;
      if (!beat || !beatTiming) {
        throw new Error(`Scene ${scene.id} has an unanchored visual item.`);
      }
      return {
        beatId: beat.id,
        startMs: samplesToMilliseconds(
          beatTiming.startSample - timing.startSample,
          result.sampleRate,
        ),
      };
    });

    return {
      id: scene.id,
      template: scene.template,
      title: scene.title,
      primaryItems: scene.primaryItems,
      secondaryItems: scene.secondaryItems,
      leftLabel: scene.leftLabel,
      rightLabel: scene.rightLabel,
      reason: scene.reason,
      startMs: samplesToMilliseconds(timing.startSample, result.sampleRate),
      durationMs: Math.max(
        1,
        samplesToMilliseconds(timing.sampleCount, result.sampleRate),
      ),
      beats: timedBeats,
      primaryItemTimings: itemTimings(
        'primaryItemIndices',
        scene.primaryItems.length,
      ),
      secondaryItemTimings: itemTimings(
        'secondaryItemIndices',
        scene.secondaryItems.length,
      ),
    };
  });

  return timedNarratedPlanSchema.parse({
    ...draft,
    stage: 'timed',
    sampleRate: result.sampleRate,
    voice,
    ttsSpeed: speed,
    ttsSteps: steps,
    voiceoverFile: `${audioDirectoryName}/${result.voiceoverFile}`,
    durationMs: Math.max(
      1,
      samplesToMilliseconds(result.totalSamples, result.sampleRate),
    ),
    totalSamples: result.totalSamples,
    scenes,
  });
};

export interface SynthesizeNarrationOptions {
  assetsDirectory: string;
  audioDirectoryName: string;
  draft: DraftNarratedPlan;
  force: boolean;
  outputDirectory: string;
  speed: number;
  steps: number;
  voice: SupertonicVoice;
}

export const synthesizeNarration = async (
  options: SynthesizeNarrationOptions,
  runWorker: typeof runSupertonicWorker = runSupertonicWorker,
): Promise<TimedNarratedPlan> => {
  await mkdir(options.outputDirectory, {recursive: true});
  const finalAudioDirectory = resolve(
    options.outputDirectory,
    options.audioDirectoryName,
  );
  if (!options.force && (await pathExists(finalAudioDirectory))) {
    throw new Error(
      `Output already exists: ${finalAudioDirectory}. Use --force to replace it.`,
    );
  }
  await validateSupertonicAssets(options.assetsDirectory, options.voice);

  const stagingDirectory = await mkdtemp(
    resolve(options.outputDirectory, '.supertonic-staging-'),
  );
  try {
    const result = await runWorker({
      assetsDirectory: resolve(options.assetsDirectory),
      outputDirectory: stagingDirectory,
      voice: options.voice,
      language: supertonicLanguageSchema.parse(options.draft.language),
      speed: options.speed,
      steps: options.steps,
      scenes: options.draft.scenes.map((scene) => ({
        id: scene.id,
        beats: scene.beats.map((beat) => ({id: beat.id, text: beat.text})),
      })),
    });
    const timed = materializeTimedNarration({
      audioDirectoryName: options.audioDirectoryName,
      draft: options.draft,
      result,
      speed: options.speed,
      steps: options.steps,
      voice: options.voice,
    });

    if (options.force) {
      await rm(finalAudioDirectory, {recursive: true, force: true});
    }
    await rename(stagingDirectory, finalAudioDirectory);
    return timed;
  } catch (error) {
    await rm(stagingDirectory, {recursive: true, force: true});
    throw error;
  }
};
