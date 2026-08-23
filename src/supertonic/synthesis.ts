import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {SupertonicJob, SupertonicResult} from './protocol.js';
import {trimSynthesizedWaveform, writePcm16Wav} from './wav.js';

export const SCENE_PRE_ROLL_SECONDS = 0.3;
export const BETWEEN_BEATS_SECONDS = 0.15;
export const SCENE_POST_ROLL_SECONDS = 0.3;

export interface SynthesisEngine {
  sampleRate: number;
  synthesize: (
    text: string,
    language: string,
    steps: number,
    speed: number,
  ) => Promise<{audio: ArrayLike<number>; durationSeconds: number}>;
}

const safeFilenamePart = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'beat';

export const synthesizeJob = async (
  job: SupertonicJob,
  engine: SynthesisEngine,
): Promise<SupertonicResult> => {
  const beatsDirectory = resolve(job.outputDirectory, 'beats');
  await mkdir(beatsDirectory, {recursive: true});
  const preRollSamples = Math.round(SCENE_PRE_ROLL_SECONDS * engine.sampleRate);
  const betweenBeatSamples = Math.round(BETWEEN_BEATS_SECONDS * engine.sampleRate);
  const postRollSamples = Math.round(SCENE_POST_ROLL_SECONDS * engine.sampleRate);
  const audioChunks: Float32Array[] = [];
  const scenes: SupertonicResult['scenes'] = [];
  let cursor = 0;
  let beatNumber = 0;

  const appendSilence = (sampleCount: number) => {
    audioChunks.push(new Float32Array(sampleCount));
    cursor += sampleCount;
  };

  for (const scene of job.scenes) {
    const sceneStartSample = cursor;
    appendSilence(preRollSamples);
    const beats: SupertonicResult['scenes'][number]['beats'] = [];

    for (const [beatIndex, beat] of scene.beats.entries()) {
      if (beatIndex > 0) {
        appendSilence(betweenBeatSamples);
      }
      const synthesis = await engine.synthesize(
        beat.text,
        job.language,
        job.steps,
        job.speed,
      );
      const audio = trimSynthesizedWaveform(
        synthesis.audio,
        synthesis.durationSeconds,
        engine.sampleRate,
      );
      beatNumber += 1;
      const file = `beats/${String(beatNumber).padStart(3, '0')}-${safeFilenamePart(beat.id)}.wav`;
      await writePcm16Wav(resolve(job.outputDirectory, file), audio, engine.sampleRate);
      beats.push({
        id: beat.id,
        file,
        startSample: cursor,
        sampleCount: audio.length,
      });
      audioChunks.push(audio);
      cursor += audio.length;
    }

    appendSilence(postRollSamples);
    scenes.push({
      id: scene.id,
      startSample: sceneStartSample,
      sampleCount: cursor - sceneStartSample,
      beats,
    });
  }

  const combined = new Float32Array(cursor);
  let writeOffset = 0;
  for (const chunk of audioChunks) {
    combined.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  const voiceoverFile = 'voiceover.wav';
  await writePcm16Wav(
    resolve(job.outputDirectory, voiceoverFile),
    combined,
    engine.sampleRate,
  );

  return {
    sampleRate: engine.sampleRate,
    totalSamples: combined.length,
    voiceoverFile,
    scenes,
  };
};
