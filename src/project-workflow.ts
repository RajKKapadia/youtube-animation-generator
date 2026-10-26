import {z} from 'zod';
import {existsSync} from 'node:fs';
import {copyFile, mkdir, readFile, readdir, writeFile, lstat} from 'node:fs/promises';
import {basename, dirname, extname, resolve, relative} from 'node:path';
import {animationToolSchema, fileDigestSchema, type AnimationTool} from './animation-contract.js';
import {atomicJson, sha256, fileHash, projectPath, runLocalProcess, applicationRoot, animationToolsRoot, sequenceHash} from './animation-runtime.js';
import {materializeAnimations, renderAnimationAsset, ANIMATION_PINS} from './animation-tools.js';
import {estimateDraftNarrationTiming, narrationScriptMarkdown} from './narration-planner.js';
import {renderNarratedVideo} from './narrated-render.js';
import {narratedPlanSchema, type DraftNarratedPlan, type TimedNarratedPlan, type AspectRatioSelection, type CaptionMode} from './types.js';
import {alignRecording, materializeRecordedPlan} from './recording-alignment.js';
import type {SceneBackgroundAssets} from './scene-backgrounds.js';
import type {GeneratedVisualAssets} from './generated-visuals.js';

const stageSchema = z.object({state: z.enum(['running', 'complete', 'failed']), inputHash: z.string(), outputs: z.array(fileDigestSchema).prefault([]), error: z.string().optional()});
const configSchema = z.object({aspectRatio: z.enum(['16:9', '9:16', 'both']), fps: z.number().int().positive().max(120), captions: z.enum(['on', 'off']), tools: z.array(animationToolSchema), overrides: z.record(z.string(), z.union([animationToolSchema, z.literal('builtin')])), sceneBackground: z.enum(['ambient', 'image', 'generated']).prefault('ambient'), backgroundImage: fileDigestSchema.optional()});
export const projectManifestSchema = z.object({
  version: z.literal(1), kind: z.literal('animation-project'), sourceHash: z.string(), configuration: configSchema,
  toolVersions: z.record(z.string(), z.string()), stages: z.object({prepare: stageSchema, assemble: stageSchema.optional(), publish: stageSchema.optional()}),
  warnings: z.array(z.string()), visualAssets: z.object({backgrounds: z.record(z.string(), z.record(z.string(), z.string())).optional(), foregrounds: z.record(z.string(), z.record(z.string(), z.string())).optional()}).optional(),
});
export type AnimationProject = z.infer<typeof projectManifestSchema>;
export const loadAnimationProject = async (directory: string) => projectManifestSchema.parse(JSON.parse(await readFile(resolve(directory, 'project.json'), 'utf8')));
const loadPlan = async (path: string) => narratedPlanSchema.parse(JSON.parse(await readFile(path, 'utf8')));
const saveProject = (directory: string, project: AnimationProject) => atomicJson(resolve(directory, 'project.json'), projectManifestSchema.parse(project));
const digestOutputs = async (directory: string, paths: string[]) => Promise.all(paths.map(async file => ({file: relative(directory, file), sha256: await fileHash(file)})));
export const stageOutputsValid = async (directory: string, stage: z.infer<typeof stageSchema> | undefined, signature: string) => {
  if (!stage || stage.state !== 'complete' || stage.inputHash !== signature) return false;
  try {
    for (const file of stage.outputs) {
      if (await fileHash(projectPath(directory, file.file)) !== file.sha256) return false;
      if (/\.narration-(?:timed|plan)\.json$/u.test(file.file)) {
        const plan = await loadPlan(projectPath(directory, file.file));
        if (plan.stage === 'timed' && plan.audioSource?.kind === 'recorded' && await fileHash(projectPath(directory, plan.audioSource.playback.file)) !== plan.audioSource.playback.sha256) return false;
        for (const asset of plan.animationAssets ?? []) {
          for (const source of asset.sources) if (await fileHash(projectPath(directory, source.file)) !== source.sha256) return false;
          for (const sequence of Object.values(asset.renders)) if (sequence && (await sequenceHash(projectPath(directory, sequence.directory), sequence.frameCount)).sha256 !== sequence.sha256) return false;
        }
      }
    }
    return stage.outputs.length > 0;
  } catch {return false;}
};
const visualPaths = (directory: string, assets: Record<string, Record<string, string>> | undefined, absolute: boolean) => assets && Object.fromEntries(Object.entries(assets).map(([aspect, values]) => [aspect, Object.fromEntries(Object.entries(values).map(([id, file]) => [id, absolute ? projectPath(directory, file) : relative(directory, file)]))]));
const renderProjectVideo = async (directory: string, project: AnimationProject, plan: TimedNarratedPlan, stem: string) => {
  const background = project.configuration.backgroundImage;
  if (background && await fileHash(projectPath(directory, background.file)) !== background.sha256) throw new Error('Project background image changed; prepare again.');
  return renderNarratedVideo({aspectRatio: project.configuration.aspectRatio, captions: project.configuration.captions, fps: project.configuration.fps, force: true, outputDirectory: directory, plan, stem, sceneBackground: project.configuration.sceneBackground,
    ...(background ? {imageBackground: {filePath: projectPath(directory, background.file), sha256: background.sha256}} : {}),
    backgroundAssets: visualPaths(directory, project.visualAssets?.backgrounds, true) as SceneBackgroundAssets | undefined,
    foregroundAssets: visualPaths(directory, project.visualAssets?.foregrounds, true) as GeneratedVisualAssets | undefined,
  });
};

export interface PrepareProjectOptions {
  directory: string; sourceHash: string; configuration: z.infer<typeof configSchema>; model: string;
  authorDraft: () => Promise<DraftNarratedPlan>; authorAssets: boolean; planOnly: boolean;
  force?: boolean;
  prepareVisuals?: (plan: TimedNarratedPlan) => Promise<{backgrounds?: SceneBackgroundAssets | undefined; foregrounds?: GeneratedVisualAssets | undefined}>;
}
export const prepareProject = async (options: PrepareProjectOptions): Promise<AnimationProject> => {
  const directory = resolve(options.directory); await mkdir(directory, {recursive: true}); await mkdir(resolve(directory, 'recording'), {recursive: true});
  const signature = sha256(JSON.stringify({source: options.sourceHash, configuration: options.configuration, model: options.model, versions: ANIMATION_PINS}));
  let previous: AnimationProject | undefined;
  if (existsSync(resolve(directory, 'project.json'))) previous = await loadAnimationProject(directory);
  const project: AnimationProject = {version: 1, kind: 'animation-project', sourceHash: options.sourceHash, configuration: options.configuration, toolVersions: ANIMATION_PINS, warnings: [], stages: {prepare: {state: 'running', inputHash: signature, outputs: []}}};
  if (previous?.stages.prepare.inputHash === signature) {
    if (!options.force && (options.planOnly || previous.stages.prepare.outputs.some(output => output.file.endsWith('.mp4'))) && await stageOutputsValid(directory, previous.stages.prepare, signature)) {console.log(`Reused prepared project: ${directory}`); return previous;}
    if (previous.visualAssets) project.visualAssets = previous.visualAssets;
  }
  await saveProject(directory, project);
  try {
    const draftPath = resolve(directory, 'draft.narration-plan.json');
    let draft: DraftNarratedPlan;
    if (previous?.stages.prepare.inputHash === signature && existsSync(draftPath)) {
      const saved = await loadPlan(draftPath); if (saved.stage !== 'draft') throw new Error('Expected a draft plan.'); draft = saved;
    } else {draft = await options.authorDraft(); await atomicJson(draftPath, draft);}
    let preview = estimateDraftNarrationTiming(draft);
    if (!draft.animationAssets) {
      preview = await materializeAnimations(preview, {projectDirectory: directory, aspectRatio: project.configuration.aspectRatio, fps: project.configuration.fps, tools: project.configuration.tools, overrides: project.configuration.overrides, author: options.authorAssets, render: !options.planOnly, model: options.model});
      draft = {...draft, animationAssets: preview.animationAssets, planningWarnings: preview.planningWarnings};
      await atomicJson(draftPath, draft);
    } else {
      preview.animationAssets = draft.animationAssets;
      if (!options.planOnly) preview = await retimeProjectAnimations(directory, project, preview, preview);
    }
    draft = {...draft, animationAssets: preview.animationAssets};
    await atomicJson(draftPath, draft);
    await atomicJson(resolve(directory, 'preview.narration-timed.json'), preview);
    await writeFile(resolve(directory, 'script.md'), narrationScriptMarkdown(draft));
    await atomicJson(resolve(directory, 'storyboard.json'), draft.scenes.map(scene => ({id: scene.id, title: scene.title, visual: scene.visual, animation: draft.animationAssets?.find(asset => asset.sceneId === scene.id)?.tool ?? 'builtin'})));
    project.warnings = draft.planningWarnings ?? [];
    if (options.prepareVisuals && !project.visualAssets && !options.planOnly) {
      const assets = await options.prepareVisuals(preview);
      project.visualAssets = {...(assets.backgrounds ? {backgrounds: visualPaths(directory, assets.backgrounds, false)} : {}), ...(assets.foregrounds ? {foregrounds: visualPaths(directory, assets.foregrounds, false)} : {})};
    }
    const outputs = [draftPath, resolve(directory, 'preview.narration-timed.json'), resolve(directory, 'script.md'), resolve(directory, 'storyboard.json')];
    if (!options.planOnly) outputs.push(...(await renderProjectVideo(directory, project, preview, 'draft')).map(output => output.outputPath));
    project.stages.prepare = {state: 'complete', inputHash: signature, outputs: await digestOutputs(directory, outputs)};
    await saveProject(directory, project);
    console.log(`Prepared ${directory}. Record script.md, place voiceover.wav in recording/, then run assemble.`);
    return project;
  } catch (error) {project.stages.prepare = {state: 'failed', inputHash: signature, outputs: [], error: String(error)}; await saveProject(directory, project); throw error;}
};

export const discoverRecording = async (directory: string, explicit?: string): Promise<string> => {
  if (explicit) {const file = resolve(explicit); if (!(await lstat(file)).isFile()) throw new Error('Voiceover must be a regular file.'); return file;}
  const folder = resolve(directory, 'recording');
  const files = (await readdir(folder, {withFileTypes: true})).filter(file => file.isFile() && /\.(wav|mp3|m4a|flac|ogg)$/iu.test(file.name));
  if (files.length !== 1) throw new Error(`Found ${files.length} recordings in ${folder}. Provide exactly one or use --voiceover <file>.`);
  return resolve(folder, files[0]!.name);
};

export const retimeProjectAnimations = async (directory: string, project: AnimationProject, preview: TimedNarratedPlan, timed: TimedNarratedPlan): Promise<TimedNarratedPlan> => {
  const assets = [];
  for (const original of preview.animationAssets ?? []) {
    const asset = {...original, sources: await Promise.all(original.sources.map(async file => ({...file, sha256: await fileHash(projectPath(directory, file.file))})))};
    const scene = timed.scenes.find(scene => scene.id === asset.sceneId), source = preview.scenes.find(scene => scene.id === asset.sceneId);
    if (!scene || !source) throw new Error(`Animation ${asset.id} no longer matches the script.`);
    try {assets.push(await renderAnimationAsset(asset, source, scene, {projectDirectory: directory, aspectRatio: project.configuration.aspectRatio, fps: project.configuration.fps, palette: timed.palette}));}
    catch (error) {if (asset.forced) throw error; project.warnings.push(`${scene.id}: ${asset.tool} export failed; used built-in visual: ${String(error)}`);}
  }
  return {...timed, animationAssets: assets};
};

export const assembleProject = async (directoryInput: string, options: {voiceover?: string; alignment?: string; planOnly?: boolean; force?: boolean} = {}) => {
  const directory = resolve(directoryInput), project = await loadAnimationProject(directory);
  if (project.stages.prepare.state !== 'complete') throw new Error('Complete prepare before assembling a recording.');
  const draft = await loadPlan(resolve(directory, 'draft.narration-plan.json'));
  const preview = await loadPlan(resolve(directory, 'preview.narration-timed.json'));
  if (draft.stage !== 'draft' || preview.stage !== 'timed') throw new Error('Invalid project plan stages.');
  const recording = await discoverRecording(directory, options.voiceover), recordingHash = await fileHash(recording);
  const assetHashes = await Promise.all((preview.animationAssets ?? []).flatMap(asset => asset.sources.map(async file => [file.file, await fileHash(projectPath(directory, file.file))])));
  const signature = sha256(JSON.stringify({draft, recordingHash, assetHashes, config: project.configuration, versions: project.toolVersions, alignment: options.alignment ? await fileHash(resolve(options.alignment)) : 'faster-whisper-small-int8', planOnly: options.planOnly ?? false}));
  if (!options.force && await stageOutputsValid(directory, project.stages.assemble, signature)) {console.log('Reused completed assembly.'); return;}
  project.stages.assemble = {state: 'running', inputHash: signature, outputs: []}; delete project.stages.publish; await saveProject(directory, project);
  try {
    await mkdir(resolve(directory, 'audio'), {recursive: true}); await mkdir(resolve(directory, 'alignment'), {recursive: true}); await mkdir(resolve(directory, 'recording/original'), {recursive: true});
    const originalFile = `recording/original/${recordingHash.slice(0, 12)}${extname(recording).toLowerCase()}`;
    if (recording !== projectPath(directory, originalFile)) await copyFile(recording, projectPath(directory, originalFile));
    if (await fileHash(projectPath(directory, originalFile)) !== recordingHash) throw new Error('Recording changed during import. Finish recording and retry.');
    const voiceoverFile = 'audio/voiceover.wav';
    await runLocalProcess('ffmpeg', ['-v', 'error', '-y', '-i', projectPath(directory, originalFile), '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', projectPath(directory, voiceoverFile)]);
    const probe = JSON.parse(await runLocalProcess('ffprobe', ['-v', 'error', '-show_entries', 'stream=sample_rate,duration_ts,time_base', '-of', 'json', projectPath(directory, voiceoverFile)])) as {streams: Array<{sample_rate: string; duration_ts: number}>};
    const sampleRate = Number(probe.streams[0]!.sample_rate), totalSamples = Number(probe.streams[0]!.duration_ts), durationMs = Math.round(totalSamples / sampleRate * 1000);
    const wordsPath = resolve(directory, 'alignment/words.json');
    if (options.alignment) {if (resolve(options.alignment) !== wordsPath) await copyFile(resolve(options.alignment), wordsPath);}
    else {
      const python = resolve(animationToolsRoot(), 'python', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      if (!existsSync(python)) throw new Error('Local alignment is not installed. Run tools setup alignment; assembly never downloads models.');
      const job = resolve(directory, 'alignment/transcribe-job.json');
      await atomicJson(job, {audio: projectPath(directory, voiceoverFile), output: wordsPath, models: resolve(animationToolsRoot(), 'models'), language: draft.language});
      await runLocalProcess(python, [resolve(applicationRoot, 'scripts/transcribe-recording.py'), job], {timeoutMs: 1800000, env: {HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1'}});
    }
    const report = alignRecording(draft, JSON.parse(await readFile(wordsPath, 'utf8')), durationMs);
    await atomicJson(resolve(directory, 'alignment/report.json'), report);
    let timed = materializeRecordedPlan(draft, report, {durationMs, sampleRate, totalSamples, voiceoverFile, originalFile, sha256: recordingHash, playbackSha256: await fileHash(projectPath(directory, voiceoverFile))});
    timed = await retimeProjectAnimations(directory, project, preview, timed);
    await atomicJson(resolve(directory, 'final.narration-timed.json'), timed);
    const difference = durationMs / 1000 - draft.targetDurationSeconds;
    project.warnings.push(`Recording is ${(durationMs / 1000).toFixed(2)}s (${difference >= 0 ? '+' : ''}${difference.toFixed(2)}s from target); original playback speed retained.`);
    const outputs = [resolve(directory, 'final.narration-timed.json'), resolve(directory, 'alignment/report.json')];
    if (!options.planOnly) outputs.push(...(await renderProjectVideo(directory, project, timed, 'final')).map(output => output.outputPath));
    project.stages.assemble = {state: 'complete', inputHash: signature, outputs: await digestOutputs(directory, outputs)};
    await saveProject(directory, project); console.log(`Assembled ${directory}; ${project.warnings.at(-1)}`);
  } catch (error) {project.stages.assemble = {state: 'failed', inputHash: signature, outputs: [], error: String(error)}; await saveProject(directory, project); throw error;}
};
