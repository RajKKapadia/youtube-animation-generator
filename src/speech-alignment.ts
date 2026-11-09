import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {animationToolsRoot, applicationRoot, atomicJson, runLocalProcess} from './animation-runtime.js';
import {alignRecording, wordsInScene, type AlignmentReport} from './recording-alignment.js';
import {timedNarratedPlanSchema, type DraftNarratedPlan, type TimedNarratedPlan} from './types.js';
import {compileStoryMotion, chooseStorySpeechCues, storyTimingWarnings} from './story-motion.js';

/** Apply a validated transcript without changing the measured scene/audio boundaries. */
export const applyGeneratedSpeechAlignment = (
  plan: TimedNarratedPlan,
  report: AlignmentReport,
): TimedNarratedPlan => {
  if (!report.accepted) {
    throw new Error(`Speech alignment rejected: ${report.problems.slice(0, 3).join(' ')}`);
  }
  const rate = plan.voiceoverPlaybackRate;
  const words = report.words.map(word => ({
    ...word, startMs: word.startMs / rate, endMs: word.endMs / rate,
  }));
  const scenes = plan.scenes.map(scene => {
    const wordTimings = wordsInScene(words, scene.startMs, scene.durationMs);
    // Keep all timing changes atomic; a failed validation retains the original plan.
    const beats = scene.beats.map(beat => {
      const phrases = beat.phrases.map(phrase => {
        const aligned = report.phrases.find(item =>
          item.sceneId === scene.id && item.phraseId === phrase.id);
        if (!aligned) throw new Error(`Missing aligned phrase ${scene.id}/${phrase.id}.`);
        const startMs = Math.round(aligned.startMs / rate - scene.startMs);
        const endMs = Math.round(aligned.endMs / rate - scene.startMs);
        if (startMs < 0 || endMs > scene.durationMs) {
          throw new Error(`Aligned phrase ${phrase.id} crossed its measured scene boundary.`);
        }
        return {
          ...phrase, startMs, durationMs: Math.max(1, endMs - startMs),
          sampleCount: Math.max(1, Math.round((endMs - startMs) * rate * plan.sampleRate / 1000)),
        };
      });
      const startMs = phrases[0]!.startMs;
      const endMs = phrases.at(-1)!.startMs + phrases.at(-1)!.durationMs;
      return {
        ...beat, phrases, startMs, durationMs: Math.max(1, endMs - startMs),
        sampleCount: Math.max(1, Math.round((endMs - startMs) * rate * plan.sampleRate / 1000)),
      };
    });
    const anchor = (items: typeof scene.primaryItemTimings) => items.map(item => ({
      ...item, startMs: beats.find(beat => beat.id === item.beatId)!.startMs,
    }));
    return {
      ...scene, wordTimings, beats,
      primaryItemTimings: anchor(scene.primaryItemTimings),
      secondaryItemTimings: anchor(scene.secondaryItemTimings),
    };
  });
  return timedNarratedPlanSchema.parse({...plan, scenes});
};

export {storyTimingWarnings} from './story-motion.js';

/** Only the new motion path requests alignment. This never installs or downloads anything. */
export const alignGeneratedStoryNarration = async (
  draft: DraftNarratedPlan,
  plan: TimedNarratedPlan,
  audioDirectory: string,
): Promise<TimedNarratedPlan> => {
  if (!plan.scenes.some(scene => scene.visual.kind === 'story-motion')) return plan;
  const root = animationToolsRoot();
  const python = resolve(root, 'python', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  // Same pinned installation consumed by scripts/transcribe-recording.py.
  const model = resolve(root, 'models/models--Systran--faster-whisper-small/snapshots/536b0662742c02347bc0e980a01041f333bce120');
  let result = plan;
  const warnings: string[] = [];
  if (!existsSync(python) || !existsSync(model)) {
    warnings.push('Local word alignment is unavailable. Story motion uses estimated phrase timing; tools setup alignment enables verified word cues.');
  } else {
    try {
      const output = resolve(audioDirectory, 'alignment.words.json');
      const job = resolve(audioDirectory, 'alignment.job.json');
      await atomicJson(job, {
        audio: resolve(audioDirectory, 'voiceover.wav'), output,
        models: resolve(root, 'models'), language: draft.language,
      });
      await runLocalProcess(python, [resolve(applicationRoot, 'scripts/transcribe-recording.py'), job], {
        timeoutMs: 1800000, env: {HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1'},
      });
      const report = alignRecording(
        draft, JSON.parse(await readFile(output, 'utf8')),
        plan.durationMs * plan.voiceoverPlaybackRate,
      );
      await atomicJson(resolve(audioDirectory, 'alignment.report.json'), report);
      result = applyGeneratedSpeechAlignment(plan, report);
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error).slice(0, 500);
      warnings.push(`Word alignment could not be verified; retained estimated phrase timing: ${message}`);
    }
  }
  warnings.push(...storyTimingWarnings(result));
  const scenes = result.scenes.flatMap(scene => {
    if (scene.visual.kind !== 'story-motion') return [];
    return [{
      id: scene.id,
      ...compileStoryMotion(scene.visual, chooseStorySpeechCues(
        scene.visual, scene.wordTimings, scene.beats.flatMap(beat => beat.phrases),
      ), scene.durationMs),
    }];
  });
  await atomicJson(resolve(audioDirectory, 'story-timing.json'), {version: 1, scenes});
  return {
    ...result,
    planningWarnings: [...new Set([...(result.planningWarnings ?? []), ...warnings])],
  };
};
