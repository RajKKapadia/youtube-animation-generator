import {cp, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {AnimationAsset} from './animation-contract.js';
import type {RenderAspectRatio} from './types.js';
import {fileHash, projectPath, sequenceHash} from './animation-runtime.js';

export interface AnimationFrames {directory: string; frameCount: number; tool: string}
export const stageAnimationFrames = async (assets: AnimationAsset[], planDirectory: string, publicDirectory: string, aspects: RenderAspectRatio[]): Promise<Record<RenderAspectRatio, Record<string, AnimationFrames>>> => {
  const result: Record<RenderAspectRatio, Record<string, AnimationFrames>> = {'16:9': {}, '9:16': {}};
  const scenes = new Set<string>();
  for (const asset of assets) {
    if (scenes.has(asset.sceneId)) throw new Error(`Duplicate animation source for ${asset.sceneId}.`); scenes.add(asset.sceneId);
    for (const file of asset.sources) if (await fileHash(projectPath(planDirectory, file.file)) !== file.sha256) throw new Error(`Animation source changed: ${file.file}. Reassemble the project before rendering a saved plan.`);
    for (const aspect of aspects) {
      const sequence = asset.renders[aspect]; if (!sequence) throw new Error(`Missing ${aspect} animation export for ${asset.sceneId}. Prepare/assemble this orientation first.`);
      const path = projectPath(planDirectory, sequence.directory);
      if ((await sequenceHash(path, sequence.frameCount)).sha256 !== sequence.sha256) throw new Error(`Animation frames changed for ${asset.sceneId}; reassemble the project.`);
      const directory = `animation-${asset.id}-${aspect.replace(':', 'x')}`;
      await mkdir(resolve(publicDirectory, directory), {recursive: true});
      await cp(path, resolve(publicDirectory, directory), {recursive: true});
      result[aspect][asset.sceneId] = {directory, frameCount: sequence.frameCount, tool: asset.tool};
    }
  }
  return result;
};
