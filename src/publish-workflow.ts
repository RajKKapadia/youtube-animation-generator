import {validateCoverDirection} from './cover-direction.js';
import {access, mkdir, readFile, writeFile, stat, readdir} from 'node:fs/promises';
import {loadAnimationProject, stageOutputsValid} from './project-workflow.js';
import {atomicJson, fileHash, sha256} from './animation-runtime.js';
import {constants} from 'node:fs';
import {basename, dirname, resolve} from 'node:path';
import type {ImageBackground} from './image-background.js';
import {
  generateNarratedPublishPlan,
  publishKitMarkdown,
} from './publish.js';
import {
  publishCoverOutputPaths,
  renderPublishCovers,
} from './publish-render.js';
import {
  narratedPlanSchema,
  narratedPublishPlanSchema,
  publishSceneSchema,
  type AspectRatioSelection,
  type NarratedPlan,
  type NarratedPublishPlan,
  type PublishScene,
} from './types.js';

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const preflightOutputs = async (
  paths: string[],
  force: boolean,
): Promise<void> => {
  if (force) return;
  for (const filePath of paths) {
    if (await pathExists(filePath)) {
      throw new Error(`Output already exists: ${filePath}. Use --force to replace it.`);
    }
  }
};

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, 'utf8'));

const narratedPlanStem = (filePath: string): string =>
  basename(filePath)
    .replace(/\.narration-(?:plan|timed)\.json$/i, '')
    .replace(/\.json$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-');

const loadNarratedPlan = async (filePath: string): Promise<NarratedPlan> => {
  const parsed = narratedPlanSchema.safeParse(await readJson(filePath));
  if (!parsed.success) {
    throw new Error(`Publish input is not a valid narrated-video plan: ${filePath}`);
  }
  return parsed.data;
};

const loadPublishPlan = async (filePath: string): Promise<NarratedPublishPlan> => {
  const parsed = narratedPublishPlanSchema.safeParse(await readJson(filePath));
  if (!parsed.success) {
    throw new Error(`Publish metadata is not a valid narrated publish plan: ${filePath}`);
  }
  return parsed.data;
};

const selectedScene = (
  plan: NarratedPlan,
  publish: NarratedPublishPlan,
): PublishScene => {
  const scene = plan.scenes.find(({id}) => id === publish.thumbnail.sceneId);
  if (!scene) {
    throw new Error(
      `Publish metadata references missing narration scene: ${publish.thumbnail.sceneId}.`,
    );
  }
  const selected = publishSceneSchema.parse(scene);
  validateCoverDirection(publish, selected);
  return selected;
};

export interface RunPublishWorkflowOptions {
  aspectRatio: AspectRatioSelection;
  imageBackground?: ImageBackground;
  force: boolean;
  metadataOnly: boolean;
  model: string;
  outputDirectory?: string;
  planPath: string;
  renderPublishPath?: string;
}

export const runPublishWorkflow = async (
  options: RunPublishWorkflowOptions,
): Promise<void> => {
  if ((await stat(options.planPath)).isDirectory()) {
    const directory = options.planPath, project = await loadAnimationProject(directory);
    if (project.stages.assemble?.state !== 'complete' || !project.stages.assemble.outputs.some(file => file.file.endsWith('.mp4'))) throw new Error('Assemble a final video before publishing a staged project.');
    if (!await stageOutputsValid(directory, project.stages.assemble, project.stages.assemble.inputHash)) throw new Error('Final assembly assets changed. Reassemble before publishing.');
    const planPath = resolve(directory, 'final.narration-timed.json');
    const signature = sha256(JSON.stringify({plan: await fileHash(planPath), model: options.model, aspectRatio: options.aspectRatio, metadataOnly: options.metadataOnly, editedMetadata: options.renderPublishPath ? await fileHash(options.renderPublishPath) : null}));
    if (project.stages.publish?.outputs.some(file => file.file.endsWith('.publish.md')) && await stageOutputsValid(directory, project.stages.publish, signature)) {console.log('Reused completed publishing kit.'); return;}
    const previousPublish = project.stages.publish;
    project.stages.publish = {state: 'running', inputHash: signature, outputs: []};
    await atomicJson(resolve(directory, 'project.json'), project);
    try {
      // Saved metadata can be rendered again without reauthoring or paying again.
      const savedMetadata = resolve(directory, 'final.publish.json');
      await runPublishWorkflow({...options, planPath, force: true, ...(!options.renderPublishPath && previousPublish?.inputHash === signature && await pathExists(savedMetadata) ? {renderPublishPath: savedMetadata} : {})});
      if (options.renderPublishPath) {
        const edited = await loadPublishPlan(options.renderPublishPath);
        await atomicJson(savedMetadata, edited);
        await writeFile(resolve(directory, 'final.publish.md'), publishKitMarkdown(edited), 'utf8');
      }
      const files = (await readdir(directory)).filter(file => /^final.*(?:publish\.(?:json|md)|cover.*\.png|thumbnail.*\.png)$/iu.test(file));
      project.stages.publish = {state: 'complete', inputHash: signature, outputs: await Promise.all(files.map(async file => ({file, sha256: await fileHash(resolve(directory, file))})))};
      await atomicJson(resolve(directory, 'project.json'), project);
    } catch (error) {project.stages.publish = {state: 'failed', inputHash: signature, outputs: [], error: String(error)}; await atomicJson(resolve(directory, 'project.json'), project); throw error;}
    return;
  }
  const narration = await loadNarratedPlan(options.planPath);
  const stem = narratedPlanStem(options.planPath);
  const outputDirectory = options.outputDirectory ?? dirname(options.planPath);
  await mkdir(outputDirectory, {recursive: true});

  let publish: NarratedPublishPlan;
  if (options.renderPublishPath) {
    publish = await loadPublishPlan(options.renderPublishPath);
    selectedScene(narration, publish);
    if (options.metadataOnly) {
      console.log('Narrated publish plan is valid; --metadata-only skipped cover rendering.');
      return;
    }
  } else {
    const jsonPath = resolve(outputDirectory, `${stem}.publish.json`);
    const markdownPath = resolve(outputDirectory, `${stem}.publish.md`);
    const futurePaths = [jsonPath, markdownPath];
    if (!options.metadataOnly) {
      futurePaths.push(
        ...publishCoverOutputPaths({
          aspectRatio: options.aspectRatio,
          outputDirectory,
          stem,
        }).map(({outputPath}) => outputPath),
      );
    }
    await preflightOutputs(futurePaths, options.force);
    console.log(`Creating narrated-video publish metadata with ${options.model}...`);
    publish = await generateNarratedPublishPlan({
      model: options.model,
      plan: narration,
      sourcePlan: options.planPath,
    });
    await writeFile(
      jsonPath,
      `${JSON.stringify(publish, null, 2)}\n`,
      'utf8',
    );
    await writeFile(markdownPath, publishKitMarkdown(publish), 'utf8');
    console.log(`Saved publish metadata: ${jsonPath}`);
    console.log(`Saved copy-ready publish kit: ${markdownPath}`);
    if (options.metadataOnly) return;
  }

  const scene = selectedScene(narration, publish);
  const outputs = await renderPublishCovers({
    animationAssets: narration.animationAssets,
    aspectRatio: options.aspectRatio,
    mediaAssets: narration.mediaAssets,
    planDirectory: dirname(options.planPath),
    sourceText: narration.sourceText,
    force: options.force,
    outputDirectory,
    publish,
    scene,
    stem,
    ...(options.imageBackground ? {imageBackground: options.imageBackground} : {}),
  });
  for (const output of outputs) {
    console.log(`Saved publish cover: ${output.outputPath}`);
  }
};
