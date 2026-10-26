import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {parseAnimationTools, parseSceneTools} from './animation-contract.js';
import {sourceTimeAt, sceneSpeakerIds} from './animation-recipes.js';
import {animationRecipeResponseShape, materializeAnimations} from './animation-tools.js';
import {animationProofPlan} from './verify-animation-tools.js';
import {draftNarratedPlanSchema} from './types.js';
import {prepareProject, discoverRecording, loadAnimationProject, stageOutputsValid} from './project-workflow.js';
import {fileHash} from './animation-runtime.js';

vi.mock('./narrated-render.js', () => ({renderNarratedVideo: vi.fn(async ({outputDirectory, stem}) => {const outputPath = resolve(outputDirectory, `${stem}.mp4`); await writeFile(outputPath, 'fixture video'); return [{outputPath}];})}));
const directories: string[] = [];
afterEach(async () => {vi.unstubAllEnvs(); await Promise.all(directories.splice(0).map(path => rm(path, {recursive: true, force: true})));});
const temporary = async () => {const path = await mkdtemp(resolve(tmpdir(), 'animation-workflow-')); directories.push(path); return path;};

describe('animation contracts and offline stages', () => {
  it('parses tool selections and rejects duplicate or ambiguous overrides', () => {
    expect(parseAnimationTools('off')).toEqual([]); expect(parseAnimationTools('auto')).toHaveLength(3);
    expect(parseSceneTools(['one=lottie', 'two=builtin'])).toEqual({one: 'lottie', two: 'builtin'});
    expect(() => parseSceneTools(['one=lottie', 'one=hyperframes'])).toThrow();
    expect(() => parseAnimationTools('lottie,lottie')).toThrow();
  });
  it('includes every bounded recipe in the schema-derived provider prompt', () => {
    const shape = animationRecipeResponseShape();
    for (const recipe of ['character-exchange', 'icon-reveal', 'comparison', 'chart']) expect(shape).toContain(recipe);
    expect(shape.length).toBeLessThan(1500);
  });
  it('retimes beat anchors independently instead of stretching the entire clip', () => {
    const from = [{id: 'a', startMs: 100, durationMs: 500}, {id: 'b', startMs: 1000, durationMs: 500}], to = [{id: 'a', startMs: 100, durationMs: 500}, {id: 'b', startMs: 5000, durationMs: 500}];
    expect(sourceTimeAt(5000, from, to, 2000, 7000)).toBe(1000);
    expect(() => sourceTimeAt(5000, from, [to[0]!], 2000, 7000)).toThrow('cue ids');
  });
  it('holds a character speaker until the next declared turn', () => {
    const scene = animationProofPlan().scenes[2]!;
    if (scene.visual.kind !== 'character-scene') throw new Error('Expected a character fixture.');
    expect(sceneSpeakerIds({...scene, visual: {...scene.visual, speakers: [scene.visual.speakers[0]!]}})).toEqual(['customer', 'customer']);
  });
  it('falls back for missing automatic tools and fails for a forced tool without calling a provider', async () => {
    const directory = await temporary(); vi.stubEnv('ANIMATION_TOOLS_DIR', resolve(directory, 'missing'));
    const plan = animationProofPlan();
    const options = {projectDirectory: directory, aspectRatio: 'both' as const, fps: 30, tools: parseAnimationTools(), overrides: {}, author: true};
    const result = await materializeAnimations(plan, options);
    expect(result.animationAssets).toEqual([]); expect(result.planningWarnings).toHaveLength(3);
    await expect(materializeAnimations(plan, {...options, overrides: {lottie: 'lottie'}})).rejects.toThrow('lottie failed');
  });
  it('resumes preparation without reauthoring, then renders a prior plan-only preparation', async () => {
    const directory = await temporary();
    const authorDraft = vi.fn(async () => draftNarratedPlanSchema.parse({...animationProofPlan(), stage: 'draft'}));
    const options = {directory, sourceHash: 'fixture', configuration: {aspectRatio: '16:9' as const, fps: 30, captions: 'on' as const, tools: [], overrides: {}, sceneBackground: 'ambient' as const}, model: 'offline', authorDraft, authorAssets: false, planOnly: true};
    await prepareProject(options); await prepareProject(options); expect(authorDraft).toHaveBeenCalledTimes(1);
    await prepareProject({...options, planOnly: false}); expect(authorDraft).toHaveBeenCalledTimes(1);
    expect((await loadAnimationProject(directory)).stages.prepare.outputs.some(file => file.file === 'draft.mp4')).toBe(true);
    await prepareProject({...options, sourceHash: 'changed'}); expect(authorDraft).toHaveBeenCalledTimes(2);
  });
  it('records failures and retries a preparation interrupted before its draft existed', async () => {
    const directory = await temporary(), authorDraft = vi.fn().mockRejectedValueOnce(new Error('interrupted')).mockResolvedValue(draftNarratedPlanSchema.parse({...animationProofPlan(), stage: 'draft'}));
    const options = {directory, sourceHash: 'fixture', configuration: {aspectRatio: '16:9' as const, fps: 30, captions: 'on' as const, tools: [], overrides: {}, sceneBackground: 'ambient' as const}, model: 'offline', authorDraft, authorAssets: false, planOnly: true};
    await expect(prepareProject(options)).rejects.toThrow('interrupted'); expect((await loadAnimationProject(directory)).stages.prepare.state).toBe('failed');
    await prepareProject(options); expect((await loadAnimationProject(directory)).stages.prepare.state).toBe('complete');
  });
  it('requires an unambiguous recording and detects stale stage outputs', async () => {
    const directory = await temporary(); await mkdir(resolve(directory, 'recording'));
    await expect(discoverRecording(directory)).rejects.toThrow('Found 0');
    await writeFile(resolve(directory, 'recording/voiceover.wav'), 'original');
    expect(await discoverRecording(directory)).toBe(resolve(directory, 'recording/voiceover.wav'));
    const stage = {state: 'complete' as const, inputHash: 'a', outputs: [{file: 'recording/voiceover.wav', sha256: await fileHash(resolve(directory, 'recording/voiceover.wav'))}]};
    expect(await stageOutputsValid(directory, stage, 'a')).toBe(true);
    await writeFile(resolve(directory, 'recording/voiceover.wav'), 'edited'); expect(await stageOutputsValid(directory, stage, 'a')).toBe(false);
    await writeFile(resolve(directory, 'recording/second.mp3'), 'second'); await expect(discoverRecording(directory)).rejects.toThrow('Found 2');
  });
});
