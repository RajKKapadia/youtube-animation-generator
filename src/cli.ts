#!/usr/bin/env node

import {access, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename, dirname, extname, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {planAnimations} from './planner.js';
import {renderClips} from './render.js';
import {readSubtitleFile} from './subtitles.js';
import {
  savedPlanSchema,
  type OutputFormat,
  type OutputManifest,
  type SavedPlan,
} from './types.js';

const VERSION = '0.1.0';
const FORMATS = new Set<OutputFormat>(['prores', 'webm', 'green']);

const help = `youtube-animations ${VERSION}

Generate separate, editor-ready animation clips from subtitle files.

Usage:
  youtube-animations <subtitle.srt> [options]
  youtube-animations --render-plan <animation-plan.json> [options]

Options:
  --format <prores|webm|green>  Output format (default: prores)
  --output-dir <path>           Output directory (default: animations/ beside subtitles)
  --model <model>               OpenAI model (default: OPENAI_MODEL or gpt-5.6)
  --max-suggestions <number>    Maximum animations to generate (default: 6)
  --fps <number>                Frames per second (default: 30)
  --plan-only                   Create the plan without rendering clips
  --render-plan <path>          Render an existing plan without calling OpenAI
  --force                       Replace previously generated files
  --help                        Show this help
  --version                     Show the version

Examples:
  youtube-animations /videos/episode-12.srt
  youtube-animations episode.vtt --format webm --max-suggestions 4
  youtube-animations --render-plan animations/episode.animation-plan.json
`;

const parsePositiveInteger = (value: string | undefined, fallback: number, name: string) => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
};

const loadLocalEnvironment = () => {
  try {
    process.loadEnvFile(resolve(process.cwd(), '.env'));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw error;
    }
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

const writeJson = async (
  filePath: string,
  value: unknown,
  force: boolean,
): Promise<void> => {
  if (!force && (await pathExists(filePath))) {
    throw new Error(`Output already exists: ${filePath}. Use --force to replace it.`);
  }
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const subtitleStem = (filePath: string): string =>
  basename(filePath, extname(filePath)).replace(/[^a-zA-Z0-9_-]+/g, '-');

const readSavedPlan = async (filePath: string): Promise<SavedPlan> =>
  savedPlanSchema.parse(JSON.parse(await readFile(filePath, 'utf8')));

const main = async () => {
  loadLocalEnvironment();

  const {positionals, values} = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      force: {type: 'boolean', default: false},
      format: {type: 'string', default: 'prores'},
      fps: {type: 'string'},
      help: {type: 'boolean', default: false},
      'max-suggestions': {type: 'string'},
      model: {type: 'string'},
      'output-dir': {type: 'string'},
      'plan-only': {type: 'boolean', default: false},
      'render-plan': {type: 'string'},
      version: {type: 'boolean', default: false},
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
  if (!FORMATS.has(format)) {
    throw new Error('--format must be one of: prores, webm, green.');
  }

  const fps = parsePositiveInteger(values.fps, 30, '--fps');
  const maxSuggestions = parsePositiveInteger(
    values['max-suggestions'],
    6,
    '--max-suggestions',
  );
  if (maxSuggestions > 12) {
    throw new Error('--max-suggestions cannot exceed 12.');
  }
  const force = values.force;

  let plan: SavedPlan;
  let planPath: string | null = null;

  if (values['render-plan']) {
    if (positionals.length > 0) {
      throw new Error('Do not pass a subtitle path together with --render-plan.');
    }
    planPath = resolve(values['render-plan']);
    plan = await readSavedPlan(planPath);
  } else {
    const subtitleArgument = positionals[0];
    if (!subtitleArgument || positionals.length !== 1) {
      throw new Error('Provide exactly one .srt or .vtt subtitle path.');
    }

    const subtitlePath = resolve(subtitleArgument);
    const fileStats = await stat(subtitlePath);
    if (!fileStats.isFile()) {
      throw new Error(`Subtitle path is not a file: ${subtitlePath}`);
    }

    const cues = await readSubtitleFile(subtitlePath);
    const model = values.model ?? process.env.OPENAI_MODEL ?? 'gpt-5.6';
    console.log(`Read ${cues.length} subtitle cues.`);
    console.log(`Planning up to ${maxSuggestions} animations with ${model}...`);
    plan = await planAnimations(cues, {
      maxSuggestions,
      model,
      sourceSubtitle: subtitlePath,
    });
  }

  const sourceDirectory = dirname(plan.sourceSubtitle);
  const outputDirectory = values['output-dir']
    ? resolve(values['output-dir'])
    : resolve(sourceDirectory, 'animations');
  await mkdir(outputDirectory, {recursive: true});

  const stem = subtitleStem(plan.sourceSubtitle);
  if (!planPath) {
    planPath = resolve(outputDirectory, `${stem}.animation-plan.json`);
    await writeJson(planPath, plan, force);
    console.log(`Saved plan: ${planPath}`);
  }

  if (plan.clips.length === 0) {
    console.log('No transcript sections required an animation.');
  } else {
    console.log(`Selected ${plan.clips.length} animation${plan.clips.length === 1 ? '' : 's'}:`);
    for (const clip of plan.clips) {
      console.log(
        `  ${clip.id} ${clip.template} ${Math.round(clip.sourceStartMs / 1_000)}s-${Math.round(clip.sourceEndMs / 1_000)}s: ${clip.title}`,
      );
    }
  }

  if (values['plan-only']) {
    return;
  }

  const manifestClips = await renderClips({
    clips: plan.clips,
    force,
    format,
    fps,
    outputDirectory,
  });

  const manifest: OutputManifest = {
    version: 1,
    sourceSubtitle: plan.sourceSubtitle,
    generatedAt: new Date().toISOString(),
    format,
    clips: manifestClips,
  };
  const manifestPath = resolve(outputDirectory, `${stem}.animations.json`);
  await writeJson(manifestPath, manifest, force);
  console.log(`Saved manifest: ${manifestPath}`);
  console.log(`Animation clips are in: ${outputDirectory}`);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
