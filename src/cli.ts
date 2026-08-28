#!/usr/bin/env node

import {access, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename, dirname, extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {narrationScriptMarkdown, planNarratedVideo} from './narration-planner.js';
import {synthesizeNarration} from './narration-audio.js';
import {narratedOutputPaths, renderNarratedVideo} from './narrated-render.js';
import {
  materializeGeneratedVisuals,
  type GeneratedVisualAssets,
} from './generated-visuals.js';
import {
  discoverLocalImages,
  mirrorNarratedMediaCaches,
  stageSelectedLocalImages,
} from './local-images.js';
import {
  materializeSceneBackgrounds,
  type SceneBackgroundAssets,
} from './scene-backgrounds.js';
import {planAnimations} from './planner.js';
import {runPublishWorkflow} from './publish-workflow.js';
import {aspectSuffix, profilesForSelection} from './render-profile.js';
import {renderClips} from './render.js';
import {readSubtitleFile} from './subtitles.js';
import {
  enrichSourceWithResearch,
  loadOrCreateWebResearch,
} from './source-research.js';
import {
  aspectRatioSelectionSchema,
  captionModeSchema,
  generatedVisualModeSchema,
  imageQualitySchema,
  narratedPlanSchema,
  savedPlanSchema,
  sceneBackgroundModeSchema,
  webResearchModeSchema,
  type AspectRatioSelection,
  type CaptionMode,
  type DraftNarratedPlan,
  type GeneratedVisualMode,
  type ImageQuality,
  type NarratedPlan,
  type OutputFormat,
  type OutputManifest,
  type SavedPlan,
  type SceneBackgroundMode,
  type TimedNarratedPlan,
  type WebResearchMode,
} from './types.js';
import {
  supertonicLanguageSchema,
  supertonicVoiceChoiceSchema,
  type SupertonicVoiceChoice,
} from './supertonic/protocol.js';
import {selectSupertonicVoice} from './supertonic/voice-selection.js';

const VERSION = '0.7.0';
const FORMATS = new Set<OutputFormat>(['prores', 'webm', 'green']);

const help = `youtube-animations ${VERSION}

Generate editor-ready subtitle overlays or a complete narrated video from text.

Usage:
  youtube-animations <subtitle.srt|subtitle.vtt> [options]
  youtube-animations create <source.txt|source.md> [options]
  youtube-animations publish <narrated-plan.json> [options]
  youtube-animations --render-plan <plan.json> [options]
  youtube-animations create --render-plan <narrated-plan.json> [options]

Shared options:
  --aspect-ratio <16:9|9:16|both>  Output orientation (default: 16:9)
  --output-dir <path>               Override the output directory
  --model <model>                   OpenAI model (default: OPENAI_MODEL or gpt-5.6)
  --fps <number>                    Frames per second (default: 30)
  --plan-only                       Save or validate a plan without rendering
  --render-plan <path>              Render an existing plan without calling OpenAI
  --force                           Replace previously generated files

Subtitle overlay options:
  --format <prores|webm|green>      Output format (default: green)
  --max-suggestions <number>        Maximum animations (default: 6)

Narrated video options:
  --supertonic-assets-dir <path>    Model directory (default: models/supertonic-3)
  --voice <auto|M1..M5|F1..F5>     Voice style (default: auto)
  --language <code>                 Narration language (default: en)
  --tts-speed <number>              Speech speed, 0.7-2.0 (default: 1.05)
  --tts-steps <number>              Inference steps, 1-20 (default: 8)
  --target-duration <seconds>       Planning target (default: 60)
  --captions <on|off>               Phrase captions (default: on)
  --scene-background <mode>         ambient or generated (default: ambient)
  --image-model <model>             Image model (default: OPENAI_IMAGE_MODEL or gpt-image-2)
  --image-quality <quality>         low, medium, or high (default: medium)
  --generated-visuals <off|auto>    Grounded foreground generation (default: off)
  --research <off|auto|required>    Web research before planning (default: off)
  --refresh-research                Replace the matching research cache
  --regenerate-visuals              Explicitly refresh generated foreground images
  --regenerate-backgrounds          Replace matching cached scene images

Publish-kit options:
  --cover-aspect <16:9|9:16|both>   Cover orientation (default: both)
  --metadata-only                   Save or validate metadata without rendering covers
  --render-publish <publish.json>   Render edited metadata without calling OpenAI
  --help                            Show this help
  --version                         Show the version

Examples:
  youtube-animations episode.srt --aspect-ratio both
  youtube-animations create summary.md
  youtube-animations create summary.md --research required --plan-only
  youtube-animations create summary.md --aspect-ratio 9:16
  youtube-animations create --render-plan summary-video/summary.narration-plan.json
  youtube-animations publish summary-video/summary.narration-timed.json
  youtube-animations publish summary-video/summary.narration-plan.json --metadata-only
`;

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
  name: string,
): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
};

const parsePositiveNumber = (
  value: string | undefined,
  fallback: number,
  name: string,
): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
};

const parseTtsSpeed = (value: string | undefined): number => {
  const speed = parsePositiveNumber(value, 1.05, '--tts-speed');
  if (speed < 0.7 || speed > 2) {
    throw new Error('--tts-speed must be between 0.7 and 2.0.');
  }
  return speed;
};

const parseTtsSteps = (value: string | undefined): number => {
  const steps = parsePositiveInteger(value, 8, '--tts-steps');
  if (steps > 20) throw new Error('--tts-steps cannot exceed 20.');
  return steps;
};

const parseAspectRatio = (value: string | undefined): AspectRatioSelection => {
  const parsed = aspectRatioSelectionSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('--aspect-ratio must be one of: 16:9, 9:16, both.');
  }
  return parsed.data;
};

const parseCoverAspect = (value: string | undefined): AspectRatioSelection => {
  const parsed = aspectRatioSelectionSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('--cover-aspect must be one of: 16:9, 9:16, both.');
  }
  return parsed.data;
};

const parseCaptionMode = (value: string | undefined): CaptionMode => {
  const parsed = captionModeSchema.safeParse(value);
  if (!parsed.success) throw new Error('--captions must be one of: on, off.');
  return parsed.data;
};

const parseSceneBackground = (value: string | undefined): SceneBackgroundMode => {
  const parsed = sceneBackgroundModeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('--scene-background must be one of: ambient, generated.');
  }
  return parsed.data;
};

const parseImageQuality = (value: string | undefined): ImageQuality => {
  const parsed = imageQualitySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('--image-quality must be one of: low, medium, high.');
  }
  return parsed.data;
};

const parseGeneratedVisuals = (value: string | undefined): GeneratedVisualMode => {
  const parsed = generatedVisualModeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('--generated-visuals must be one of: off, auto.');
  }
  return parsed.data;
};

const parseResearchMode = (value: string | undefined): WebResearchMode => {
  const parsed = webResearchModeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('--research must be one of: off, auto, required.');
  }
  return parsed.data;
};

const parseVoice = (value: string | undefined): SupertonicVoiceChoice => {
  const parsed = supertonicVoiceChoiceSchema.safeParse(value);
  if (!parsed.success) throw new Error('--voice must be auto or one of M1..M5 or F1..F5.');
  return parsed.data;
};

const parseLanguage = (value: string | undefined): string => {
  const parsed = supertonicLanguageSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('--language is not supported by Supertonic 3.');
  }
  return parsed.data;
};

const loadLocalEnvironment = () => {
  try {
    process.loadEnvFile(resolve(process.cwd(), '.env'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};

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

const writeJson = async (
  filePath: string,
  value: unknown,
  force: boolean,
): Promise<void> => {
  await preflightOutputs([filePath], force);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const fileStem = (filePath: string): string =>
  basename(filePath, extname(filePath)).replace(/[^a-zA-Z0-9_-]+/g, '-');

const narratedPlanStem = (filePath: string): string =>
  basename(filePath)
    .replace(/\.narration-(?:plan|timed)\.json$/i, '')
    .replace(/\.json$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-');

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, 'utf8'));

const printPlanningWarnings = (warnings: string[] | undefined): void => {
  if (!warnings?.length) return;
  console.warn('Planning warnings:');
  for (const warning of warnings) console.warn(`  - ${warning}`);
};

const loadPlan = async (
  filePath: string,
): Promise<{kind: 'narrated'; plan: NarratedPlan} | {kind: 'subtitle'; plan: SavedPlan}> => {
  const raw = await readJson(filePath);
  const narrated = narratedPlanSchema.safeParse(raw);
  if (narrated.success) return {kind: 'narrated', plan: narrated.data};
  const subtitle = savedPlanSchema.safeParse(raw);
  if (subtitle.success) return {kind: 'subtitle', plan: subtitle.data};
  throw new Error(`Plan is neither a valid subtitle plan nor narrated-video plan: ${filePath}`);
};

interface CommonRuntimeOptions {
  aspectRatio: AspectRatioSelection;
  force: boolean;
  fps: number;
  outputDirectory?: string;
  planOnly: boolean;
}

interface NarratedVisualOptions {
  captions: CaptionMode;
  generatedVisuals: GeneratedVisualMode;
  imageModel: string;
  imageQuality: ImageQuality;
  regenerateBackgrounds: boolean;
  regenerateVisuals: boolean;
  sceneBackground: SceneBackgroundMode;
}

interface NarratedResearchOptions {
  mode: WebResearchMode;
  refresh: boolean;
}

const resolveForegroundVisuals = async ({
  aspectRatio,
  plan,
  planDirectory,
  stem,
  visual,
}: {
  aspectRatio: AspectRatioSelection;
  plan: DraftNarratedPlan | TimedNarratedPlan;
  planDirectory: string;
  stem: string;
  visual: NarratedVisualOptions;
}): Promise<GeneratedVisualAssets | undefined> => materializeGeneratedVisuals({
  allowGeneration: visual.generatedVisuals === 'auto',
  aspectRatio,
  model: visual.imageModel,
  outputDirectory: planDirectory,
  plan,
  quality: visual.imageQuality,
  regenerate: visual.regenerateVisuals,
  stem,
  validationModel: plan.model,
});

const resolveSceneBackgrounds = async ({
  aspectRatio,
  outputDirectory,
  plan,
  stem,
  visual,
}: {
  aspectRatio: AspectRatioSelection;
  outputDirectory: string;
  plan: DraftNarratedPlan | TimedNarratedPlan;
  stem: string;
  visual: NarratedVisualOptions;
}): Promise<SceneBackgroundAssets | undefined> => {
  if (visual.sceneBackground === 'ambient') return undefined;
  console.log(
    `Preparing ${plan.scenes.length} generated scene background${plan.scenes.length === 1 ? '' : 's'} for ${aspectRatio}...`,
  );
  return await materializeSceneBackgrounds({
    aspectRatio,
    model: visual.imageModel,
    outputDirectory,
    palette: plan.palette,
    quality: visual.imageQuality,
    regenerate: visual.regenerateBackgrounds,
    scenes: plan.scenes,
    stem,
  });
};

const runSubtitleWorkflow = async ({
  common,
  format,
  maxSuggestions,
  model,
  planPath,
  subtitlePath,
}: {
  common: CommonRuntimeOptions;
  format: OutputFormat;
  maxSuggestions: number;
  model: string;
  planPath?: string;
  subtitlePath?: string;
}) => {
  let plan: SavedPlan;
  let loadedPlanPath = planPath;
  if (loadedPlanPath) {
    const loaded = await loadPlan(loadedPlanPath);
    if (loaded.kind !== 'subtitle') {
      throw new Error('Use the narrated-video workflow for this plan.');
    }
    plan = loaded.plan;
  } else {
    if (!subtitlePath) throw new Error('Provide exactly one .srt or .vtt subtitle path.');
    const details = await stat(subtitlePath);
    if (!details.isFile()) throw new Error(`Subtitle path is not a file: ${subtitlePath}`);
    const cues = await readSubtitleFile(subtitlePath);
    console.log(`Read ${cues.length} subtitle cues.`);
    console.log(`Planning up to ${maxSuggestions} animations with ${model}...`);
    plan = await planAnimations(cues, {
      maxSuggestions,
      model,
      sourceSubtitle: subtitlePath,
    });
  }

  const stem = fileStem(plan.sourceSubtitle);
  const outputDirectory = common.outputDirectory ?? resolve(dirname(plan.sourceSubtitle), 'animations');
  await mkdir(outputDirectory, {recursive: true});
  if (!loadedPlanPath) {
    loadedPlanPath = resolve(outputDirectory, `${stem}.animation-plan.json`);
    await writeJson(loadedPlanPath, plan, common.force);
    console.log(`Saved plan: ${loadedPlanPath}`);
  }

  if (plan.planningWarnings?.length) {
    printPlanningWarnings(plan.planningWarnings);
  }
  if (common.planOnly) return;

  const manifestPaths = profilesForSelection(common.aspectRatio).map((profile) =>
    resolve(outputDirectory, `${stem}.animations${aspectSuffix(profile.aspectRatio)}.json`),
  );
  await preflightOutputs(manifestPaths, common.force);
  const renderedProfiles = await renderClips({
    aspectRatio: common.aspectRatio,
    clips: plan.clips,
    force: common.force,
    format,
    fps: common.fps,
    outputDirectory,
  });

  for (const rendered of renderedProfiles) {
    const manifest: OutputManifest = {
      version: 2,
      sourceSubtitle: plan.sourceSubtitle,
      generatedAt: new Date().toISOString(),
      format,
      aspectRatio: rendered.profile.aspectRatio,
      width: rendered.profile.width,
      height: rendered.profile.height,
      clips: rendered.clips,
    };
    const manifestPath = resolve(
      outputDirectory,
      `${stem}.animations${aspectSuffix(rendered.profile.aspectRatio)}.json`,
    );
    await writeJson(manifestPath, manifest, common.force);
    console.log(`Saved manifest: ${manifestPath}`);
  }
  console.log(`Animation clips are in: ${outputDirectory}`);
};

const renderTimedNarration = async ({
  backgroundAssets,
  foregroundAssets,
  common,
  plan,
  planDirectory,
  stem,
  visual,
}: {
  backgroundAssets?: SceneBackgroundAssets | undefined;
  foregroundAssets?: GeneratedVisualAssets | undefined;
  common: CommonRuntimeOptions;
  plan: TimedNarratedPlan;
  planDirectory: string;
  stem: string;
  visual: NarratedVisualOptions;
}) => {
  if (common.planOnly) {
    console.log('Timed narrated plan is valid; --plan-only skipped rendering.');
    return;
  }
  const outputDirectory = common.outputDirectory ?? planDirectory;
  await preflightOutputs(
    narratedOutputPaths({
      aspectRatio: common.aspectRatio,
      outputDirectory,
      stem,
    }).map(({outputPath}) => outputPath),
    common.force,
  );
  const resolvedForegroundAssets = foregroundAssets ?? await resolveForegroundVisuals({
    aspectRatio: common.aspectRatio,
    plan,
    planDirectory,
    stem,
    visual,
  });
  const resolvedBackgroundAssets = backgroundAssets ?? await resolveSceneBackgrounds({
    aspectRatio: common.aspectRatio,
    outputDirectory,
    plan,
    stem,
    visual,
  });
  const outputs = await renderNarratedVideo({
    aspectRatio: common.aspectRatio,
    backgroundAssets: resolvedBackgroundAssets,
    foregroundAssets: resolvedForegroundAssets,
    captions: visual.captions,
    force: common.force,
    fps: common.fps,
    outputDirectory,
    plan,
    sceneBackground: visual.sceneBackground,
    stem,
    voiceoverBaseDirectory: planDirectory,
  });
  for (const output of outputs) console.log(`Saved video: ${output.outputPath}`);
};

const runNarratedWorkflow = async ({
  assetsDirectory,
  common,
  language,
  model,
  planPath,
  research,
  sourcePath,
  speed,
  steps,
  targetDurationSeconds,
  visual,
  voice,
}: {
  assetsDirectory: string;
  common: CommonRuntimeOptions;
  language: string;
  model: string;
  planPath?: string;
  research: NarratedResearchOptions;
  sourcePath?: string;
  speed: number;
  steps: number;
  targetDurationSeconds: number;
  visual: NarratedVisualOptions;
  voice: SupertonicVoiceChoice;
}) => {
  let draft: DraftNarratedPlan;
  let stem: string;
  let outputDirectory: string;

  if (planPath) {
    if (research.mode !== 'off' || research.refresh) {
      throw new Error('Research options can only be used while planning a new narrated video.');
    }
    const loaded = await loadPlan(planPath);
    if (loaded.kind !== 'narrated') throw new Error('This is a subtitle animation plan.');
    printPlanningWarnings(loaded.plan.planningWarnings);
    stem = narratedPlanStem(planPath);
    outputDirectory = common.outputDirectory ?? dirname(planPath);
    if (loaded.plan.stage === 'timed') {
      await renderTimedNarration({
        common: {...common, outputDirectory},
        plan: loaded.plan,
        planDirectory: dirname(planPath),
        stem,
        visual,
      });
      return;
    }
    draft = loaded.plan;
    if (common.planOnly) {
      console.log('Draft narrated plan is valid; --plan-only skipped synthesis.');
      return;
    }
    await mirrorNarratedMediaCaches({
      plan: draft,
      sourceDirectory: dirname(planPath),
      stem,
      targetDirectory: outputDirectory,
    });
  } else {
    if (!sourcePath) throw new Error('Provide exactly one .txt or .md source path after create.');
    const extension = extname(sourcePath).toLowerCase();
    if (extension !== '.txt' && extension !== '.md') {
      throw new Error('Narrated video input must be a .txt or .md file.');
    }
    const details = await stat(sourcePath);
    if (!details.isFile()) throw new Error(`Source path is not a file: ${sourcePath}`);
    const sourceText = (await readFile(sourcePath, 'utf8')).trim();
    if (!sourceText) throw new Error(`Source text is empty: ${sourcePath}`);
    stem = fileStem(sourcePath);
    outputDirectory = common.outputDirectory ?? resolve(dirname(sourcePath), `${stem}-video`);
    await mkdir(outputDirectory, {recursive: true});
    const draftPath = resolve(outputDirectory, `${stem}.narration-plan.json`);
    const scriptPath = resolve(outputDirectory, `${stem}.narration-script.md`);
    const futurePaths = common.planOnly
      ? [draftPath, scriptPath]
      : [
          draftPath,
          scriptPath,
          resolve(outputDirectory, `${stem}.narration-timed.json`),
          resolve(outputDirectory, `${stem}.audio`),
          ...narratedOutputPaths({
            aspectRatio: common.aspectRatio,
            outputDirectory,
            stem,
          }).map(({outputPath}) => outputPath),
        ];
    await preflightOutputs(futurePaths, common.force);
    console.log(`Planning a roughly ${targetDurationSeconds}-second narrated video with ${model}...`);
    const localImages = await discoverLocalImages({sourcePath, stem});
    if (localImages.length > 0) {
      console.log(`Found ${localImages.length} valid local image${localImages.length === 1 ? '' : 's'} in ${resolve(dirname(sourcePath), 'images')}.`);
    }
    let planningSourceText = sourceText;
    let researchBundle;
    if (research.mode !== 'off') {
      console.log(`Researching the source with ${model} (${research.mode})...`);
      const researched = await loadOrCreateWebResearch({
        mode: research.mode,
        model,
        outputDirectory,
        refresh: research.refresh,
        sourceText,
        stem,
      });
      researchBundle = researched.bundle;
      planningSourceText = enrichSourceWithResearch(sourceText, researchBundle);
      console.log(
        `${researched.reused ? 'Reused' : 'Saved'} web research: ${researched.paths.json}`,
      );
      console.log(`Saved research report: ${researched.paths.markdown}`);
    }
    draft = await planNarratedVideo({
      generatedVisuals: visual.generatedVisuals,
      language,
      localImages,
      model,
      ...(researchBundle ? {originalSourceText: sourceText, research: researchBundle} : {}),
      sourceText: planningSourceText,
      targetDurationSeconds,
    });
    await stageSelectedLocalImages({
      catalog: localImages,
      outputDirectory,
      plan: draft,
      stem,
    });
    printPlanningWarnings(draft.planningWarnings);
    await writeJson(draftPath, draft, common.force);
    await writeFile(scriptPath, narrationScriptMarkdown(draft), 'utf8');
    console.log(`Saved narration script: ${scriptPath}`);
    console.log(`Saved draft plan: ${draftPath}`);
    if (common.planOnly) return;
  }

  await mkdir(outputDirectory, {recursive: true});
  const timedPath = resolve(outputDirectory, `${stem}.narration-timed.json`);
  const audioDirectoryName = `${stem}.audio`;
  const requestedVideoPaths = narratedOutputPaths({
    aspectRatio: common.aspectRatio,
    outputDirectory,
    stem,
  }).map(({outputPath}) => outputPath);
  await preflightOutputs(
    [timedPath, resolve(outputDirectory, audioDirectoryName), ...requestedVideoPaths],
    common.force,
  );
  const selectedVoice = voice === 'auto'
    ? selectSupertonicVoice(draft)
    : {
        voice,
        matchedSignals: [],
        reason: 'Selected explicitly with --voice.',
      };
  if (voice === 'auto') {
    console.log(`Auto-selected Supertonic ${selectedVoice.voice}: ${selectedVoice.reason}`);
  }
  const foregroundAssets = await resolveForegroundVisuals({
    aspectRatio: common.aspectRatio,
    plan: draft,
    planDirectory: outputDirectory,
    stem,
    visual,
  });
  const backgroundAssets = await resolveSceneBackgrounds({
    aspectRatio: common.aspectRatio,
    outputDirectory,
    plan: draft,
    stem,
    visual,
  });
  console.log(`Synthesizing ${draft.scenes.reduce((count, scene) => count + scene.beats.length, 0)} narration beats with Supertonic ${selectedVoice.voice}...`);
  const timed = await synthesizeNarration({
    assetsDirectory,
    audioDirectoryName,
    draft,
    force: common.force,
    outputDirectory,
    speed,
    steps,
    voice: selectedVoice.voice,
  });
  await writeJson(timedPath, timed, common.force);
  console.log(`Saved timed plan: ${timedPath}`);
  console.log(`Saved voiceover: ${resolve(outputDirectory, timed.voiceoverFile)}`);
  await renderTimedNarration({
    common: {...common, outputDirectory},
    plan: timed,
    planDirectory: outputDirectory,
    stem,
    visual,
    backgroundAssets,
    foregroundAssets,
  });
};

export const runCli = async (args: string[] = process.argv.slice(2)) => {
  loadLocalEnvironment();
  const {positionals, tokens, values} = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    tokens: true,
    options: {
      'aspect-ratio': {type: 'string', default: '16:9'},
      captions: {type: 'string', default: 'on'},
      'cover-aspect': {type: 'string', default: 'both'},
      force: {type: 'boolean', default: false},
      format: {type: 'string', default: 'green'},
      fps: {type: 'string'},
      help: {type: 'boolean', default: false},
      'image-model': {type: 'string'},
      'image-quality': {type: 'string', default: 'medium'},
      'generated-visuals': {type: 'string', default: 'off'},
      language: {type: 'string', default: 'en'},
      'max-suggestions': {type: 'string'},
      'metadata-only': {type: 'boolean', default: false},
      model: {type: 'string'},
      'output-dir': {type: 'string'},
      'plan-only': {type: 'boolean', default: false},
      'render-plan': {type: 'string'},
      'render-publish': {type: 'string'},
      'regenerate-backgrounds': {type: 'boolean', default: false},
      'refresh-research': {type: 'boolean', default: false},
      'regenerate-visuals': {type: 'boolean', default: false},
      research: {type: 'string', default: 'off'},
      'scene-background': {type: 'string', default: 'ambient'},
      'supertonic-assets-dir': {type: 'string', default: 'models/supertonic-3'},
      'target-duration': {type: 'string'},
      'tts-speed': {type: 'string'},
      'tts-steps': {type: 'string'},
      version: {type: 'boolean', default: false},
      voice: {type: 'string', default: 'auto'},
    },
  });

  if (values.help) {
    console.log(help);
    return;
  }
  if (values.version) {
    console.log(VERSION);
    return;
  }

  const format = values.format as OutputFormat;
  if (!FORMATS.has(format)) throw new Error('--format must be one of: prores, webm, green.');
  const maxSuggestions = parsePositiveInteger(values['max-suggestions'], 6, '--max-suggestions');
  if (maxSuggestions > 12) throw new Error('--max-suggestions cannot exceed 12.');
  const aspectRatio = parseAspectRatio(values['aspect-ratio']);
  const fps = parsePositiveInteger(values.fps, 30, '--fps');
  const model = values.model ?? process.env.OPENAI_MODEL ?? 'gpt-5.6';
  const publishCommand = positionals[0] === 'publish';
  const usedResearchOption = tokens.some(
    (token) => token.kind === 'option' && [
      'research',
      'refresh-research',
    ].includes(token.name),
  );
  const renderPublishPath = values['render-publish']
    ? resolve(values['render-publish'])
    : undefined;
  const usedPublishOnlyOption = tokens.some(
    (token) => token.kind === 'option' && [
      'cover-aspect',
      'metadata-only',
      'render-publish',
    ].includes(token.name),
  );
  if (publishCommand) {
    if (usedResearchOption) {
      throw new Error('Research options can only be used with narrated-video creation.');
    }
    if (positionals.length !== 2) {
      throw new Error('Provide exactly one narrated plan path after publish.');
    }
    if (values['render-plan'] || values['plan-only']) {
      throw new Error(
        'Publish uses --render-publish and --metadata-only instead of narration plan flags.',
      );
    }
    await runPublishWorkflow({
      aspectRatio: parseCoverAspect(values['cover-aspect']),
      force: values.force,
      metadataOnly: values['metadata-only'],
      model,
      ...(values['output-dir']
        ? {outputDirectory: resolve(values['output-dir'])}
        : {}),
      planPath: resolve(positionals[1]!),
      ...(renderPublishPath ? {renderPublishPath} : {}),
    });
    return;
  }
  if (usedPublishOnlyOption) {
    throw new Error('Publish-kit options can only be used with the publish command.');
  }
  const visual: NarratedVisualOptions = {
    captions: parseCaptionMode(values.captions),
    generatedVisuals: parseGeneratedVisuals(values['generated-visuals']),
    imageModel: values['image-model'] ?? process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
    imageQuality: parseImageQuality(values['image-quality']),
    regenerateBackgrounds: values['regenerate-backgrounds'],
    regenerateVisuals: values['regenerate-visuals'],
    sceneBackground: parseSceneBackground(values['scene-background']),
  };
  const research: NarratedResearchOptions = {
    mode: parseResearchMode(values.research),
    refresh: values['refresh-research'],
  };
  if (visual.regenerateBackgrounds && visual.sceneBackground !== 'generated') {
    throw new Error('--regenerate-backgrounds requires --scene-background generated.');
  }
  if (visual.regenerateVisuals && visual.generatedVisuals !== 'auto') {
    throw new Error('--regenerate-visuals requires --generated-visuals auto.');
  }
  if (research.refresh && research.mode === 'off') {
    throw new Error('--refresh-research requires --research auto or required.');
  }
  const common: CommonRuntimeOptions = {
    aspectRatio,
    force: values.force,
    fps,
    ...(values['output-dir'] ? {outputDirectory: resolve(values['output-dir'])} : {}),
    planOnly: values['plan-only'],
  };
  const createCommand = positionals[0] === 'create';
  const renderPlanPath = values['render-plan'] ? resolve(values['render-plan']) : undefined;
  const narratedOnlyOptions = new Set([
    'captions',
    'image-model',
    'image-quality',
    'generated-visuals',
    'research',
    'refresh-research',
    'regenerate-backgrounds',
    'regenerate-visuals',
    'scene-background',
  ]);
  const usedNarratedOnlyOption = tokens.some(
    (token) => token.kind === 'option' && narratedOnlyOptions.has(token.name),
  );

  if (renderPlanPath && !createCommand && positionals.length === 0) {
    const loaded = await loadPlan(renderPlanPath);
    if (loaded.kind === 'narrated') {
      await runNarratedWorkflow({
        assetsDirectory: resolve(values['supertonic-assets-dir']),
        common,
        language: parseLanguage(values.language),
        model,
        planPath: renderPlanPath,
        research,
        speed: parseTtsSpeed(values['tts-speed']),
        steps: parseTtsSteps(values['tts-steps']),
        targetDurationSeconds: parsePositiveNumber(values['target-duration'], 60, '--target-duration'),
        visual,
        voice: parseVoice(values.voice),
      });
      return;
    }
    if (usedNarratedOnlyOption) {
      throw new Error('Narrated visual options cannot be used with subtitle overlay plans.');
    }
    await runSubtitleWorkflow({common, format, maxSuggestions, model, planPath: renderPlanPath});
    return;
  }

  if (createCommand) {
    if (renderPlanPath && positionals.length !== 1) {
      throw new Error('Do not pass a text source together with --render-plan.');
    }
    if (!renderPlanPath && positionals.length !== 2) {
      throw new Error('Provide exactly one .txt or .md source path after create.');
    }
    const speed = parseTtsSpeed(values['tts-speed']);
    const steps = parseTtsSteps(values['tts-steps']);
    await runNarratedWorkflow({
      assetsDirectory: resolve(values['supertonic-assets-dir']),
      common,
      language: parseLanguage(values.language),
      model,
      research,
      ...(renderPlanPath ? {planPath: renderPlanPath} : {sourcePath: resolve(positionals[1]!)}),
      speed,
      steps,
      targetDurationSeconds: parsePositiveNumber(values['target-duration'], 60, '--target-duration'),
      visual,
      voice: parseVoice(values.voice),
    });
    return;
  }

  if (renderPlanPath || positionals.length !== 1) {
    throw new Error('Provide one subtitle path, or use create with a .txt/.md source.');
  }
  const subtitlePath = resolve(positionals[0]!);
  const extension = extname(subtitlePath).toLowerCase();
  if (extension !== '.srt' && extension !== '.vtt') {
    throw new Error('Subtitle input must be a .srt or .vtt file.');
  }
  if (usedNarratedOnlyOption) {
    throw new Error('Narrated visual options cannot be used with subtitle overlays.');
  }
  await runSubtitleWorkflow({common, format, maxSuggestions, model, subtitlePath});
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  });
}
