import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename, dirname, resolve} from 'node:path';
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
  return publishSceneSchema.parse(scene);
};

export interface RunPublishWorkflowOptions {
  aspectRatio: AspectRatioSelection;
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
    aspectRatio: options.aspectRatio,
    force: options.force,
    outputDirectory,
    publish,
    scene,
    stem,
  });
  for (const output of outputs) {
    console.log(`Saved publish cover: ${output.outputPath}`);
  }
};
