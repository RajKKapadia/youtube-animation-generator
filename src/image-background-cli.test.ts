import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {runCli} from './cli.js';
import {makeExplainerTimedPlan} from './explainer-fixtures.js';
import {renderNarratedVideo} from './narrated-render.js';
import {renderClips} from './render.js';
import {profilesForSelection} from './render-profile.js';
import {materializeSceneBackgrounds} from './scene-backgrounds.js';
import {outputManifestSchema} from './types.js';

vi.mock('./narrated-render.js', async (original) => ({
  ...await original<typeof import('./narrated-render.js')>(),
  renderNarratedVideo: vi.fn(async () => []),
}));
vi.mock('./render.js', async (original) => ({
  ...await original<typeof import('./render.js')>(),
  renderClips: vi.fn(async (options) => profilesForSelection(options.aspectRatio).map((profile) => ({profile, clips: []}))),
}));
vi.mock('./scene-backgrounds.js', async (original) => ({
  ...await original<typeof import('./scene-backgrounds.js')>(),
  materializeSceneBackgrounds: vi.fn(async () => {throw new Error('Unexpected background generation');}),
}));

const directories: string[] = [];
const setup = async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'image-background-cli-'));
  directories.push(directory);
  const imagePath = resolve(directory, 'Custom background.png');
  await writeFile(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0mQAAAAASUVORK5CYII=', 'base64'));
  return {directory, imagePath};
};
afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(directories.splice(0).map((path) => rm(path, {recursive: true, force: true})));
});

describe('custom background CLI workflows', () => {
  it.each(['16:9', '9:16', 'both'])('uses the image for a timed narrated plan in %s without generating backgrounds', async (aspect) => {
    const {directory, imagePath} = await setup();
    const planPath = resolve(directory, 'test.narration-timed.json');
    await writeFile(planPath, JSON.stringify(await makeExplainerTimedPlan()));
    await runCli(['--render-plan', planPath, '--background-image', imagePath, '--aspect-ratio', aspect]);
    expect(renderNarratedVideo).toHaveBeenCalledWith(expect.objectContaining({
      aspectRatio: aspect, sceneBackground: 'image',
      imageBackground: {filePath: imagePath, sha256: expect.stringMatching(/^[a-f0-9]{64}$/u)},
    }));
    expect(materializeSceneBackgrounds).not.toHaveBeenCalled();
  });

  it('accepts explicit image mode for subtitle rerenders and defaults to H.264 in both manifests', async () => {
    const {directory, imagePath} = await setup();
    const planPath = resolve(directory, 'sample.animation-plan.json');
    await writeFile(planPath, await readFile(resolve('fixtures/sample.animation-plan.json')));
    await runCli(['--render-plan', planPath, '--output-dir', directory, '--background-image', imagePath, '--scene-background', 'image', '--aspect-ratio', 'both']);
    expect(renderClips).toHaveBeenCalledWith(expect.objectContaining({
      aspectRatio: 'both', sceneBackground: 'image', format: 'h264',
      imageBackground: expect.objectContaining({filePath: imagePath}),
    }));
    const manifests = (await readdir(directory)).filter((file) => /\.animations.*\.json$/u.test(file));
    expect(manifests).toHaveLength(2);
    for (const file of manifests) {
      expect(outputManifestSchema.parse(JSON.parse(await readFile(resolve(directory, file), 'utf8')))).toMatchObject({
        sceneBackground: 'image', format: 'h264',
      });
    }
    expect(materializeSceneBackgrounds).not.toHaveBeenCalled();
  });

  it('validates a background on the create plan-only path without rendering or staging assets', async () => {
    const {directory, imagePath} = await setup();
    const planPath = resolve(directory, 'sample.narration-plan.json');
    await writeFile(planPath, await readFile(resolve('fixtures/sample.narration-plan.json')));
    await runCli(['create', '--render-plan', planPath, '--plan-only', '--background-image', imagePath]);
    expect(renderNarratedVideo).not.toHaveBeenCalled();
    expect(materializeSceneBackgrounds).not.toHaveBeenCalled();
    expect((await readdir(directory)).sort()).toEqual(['Custom background.png', 'sample.narration-plan.json']);
    await expect(runCli(['create', 'missing.md', '--plan-only', '--background-image', `${imagePath}.missing.png`]))
      .rejects.toThrow('Invalid --background-image');
  });

  it('rejects conflicting or incomplete image options before starting a workflow', async () => {
    const {imagePath} = await setup();
    for (const mode of ['off', 'ambient', 'generated']) {
      await expect(runCli(['missing.srt', '--background-image', imagePath, '--scene-background', mode]))
        .rejects.toThrow('cannot be combined');
    }
    for (const format of ['green', 'prores', 'webm']) {
      await expect(runCli(['missing.srt', '--background-image', imagePath, '--format', format]))
        .rejects.toThrow('require --format h264');
    }
    await expect(runCli(['create', 'missing.md', '--scene-background', 'image']))
      .rejects.toThrow('requires --background-image');
    await expect(runCli(['create', 'missing.md', '--background-image', imagePath, '--regenerate-backgrounds']))
      .rejects.toThrow('--regenerate-backgrounds requires');
    expect(renderClips).not.toHaveBeenCalled();
    expect(renderNarratedVideo).not.toHaveBeenCalled();
  });
});
