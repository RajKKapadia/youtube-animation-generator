import {existsSync} from 'node:fs';
import {copyFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {
  CHARACTER_PROTOTYPE_FPS,
  SCENARIOS,
  type ScenarioName,
} from './remotion/character-prototype.js';
import {videoPaletteSchema} from './visual-palettes.js';

// Renders the code-drawn character scenes to stills plus mp4s, with no provider
// key, no TTS model and no plan file. Mirrors the other render-*-fixtures.ts
// scripts. Usage:
//   pnpm fixtures:characters <outDir> [scenario|all] [palette] [--stills-only]
//     [--background <path>]

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const positional = args.filter((arg, index) =>
  !arg.startsWith('--') && args[index - 1] !== '--background');
const output = resolve(positional[0] ?? '/tmp/youtube-animation-character-prototype');
const requested = positional[1] ?? 'all';
const paletteOverride = positional[2] ? videoPaletteSchema.parse(positional[2]) : undefined;
const stillsOnly = args.includes('--stills-only');
const vertical = args.includes('--vertical');
const backgroundFlag = args.indexOf('--background');
const backgroundPath = backgroundFlag >= 0 ? args[backgroundFlag + 1] : undefined;

const scenarioNames = Object.keys(SCENARIOS) as ScenarioName[];
const selected: ScenarioName[] = requested === 'all'
  ? scenarioNames
  : [(() => {
      if (!scenarioNames.includes(requested as ScenarioName)) {
        throw new Error(`Unknown scenario "${requested}". Expected one of: ${scenarioNames.join(', ')}, all.`);
      }
      return requested as ScenarioName;
    })()];

const here = dirname(fileURLToPath(import.meta.url));
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync);

/**
 * One still per beat, sampled near the end of the beat so any item the beat
 * introduces has settled, plus one after the callout resolves. Derived from the
 * scenario rather than hardcoded, so a new scenario needs no new timings.
 */
const momentsFor = (name: ScenarioName): Array<[string, number]> => {
  const {props} = SCENARIOS[name];
  const beatMoments = props.beats.map((beat, index): [string, number] => [
    `${String(index + 1).padStart(2, '0')}-${beat.speakerId ?? 'narration'}`,
    beat.startMs + beat.durationMs * 0.8,
  ]);
  return props.callout
    ? [...beatMoments, ['99-callout', props.callout.atMs + 1_200]]
    : beatMoments;
};

const main = async () => {
  await mkdir(output, {recursive: true});
  const publicDir = await mkdtemp(resolve(tmpdir(), 'character-prototype-'));
  let backgroundImage: string | undefined;
  if (backgroundPath) {
    const source = resolve(backgroundPath);
    if (!existsSync(source)) throw new Error(`Background image not found: ${source}`);
    backgroundImage = `backdrop${extname(source) || '.png'}`;
    await copyFile(source, resolve(publicDir, backgroundImage));
    console.log(`Using background ${basename(source)}`);
  }

  const entryPoint = resolve(here, 'remotion/character-prototype.tsx');
  const serveUrl = await bundle({
    entryPoint,
    publicDir,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        extensionAlias: {...config.resolve?.extensionAlias, '.js': ['.js', '.ts', '.tsx']},
      },
    }),
  });
  const common = {
    serveUrl,
    ...(browserExecutable ? {browserExecutable} : {}),
    logLevel: 'warn' as const,
  };

  for (const name of selected) {
    const scenario = SCENARIOS[name];
    const inputProps = {
      ...scenario.props,
      vertical,
      ...(paletteOverride ? {palette: paletteOverride} : {}),
      ...(backgroundImage ? {backgroundImage} : {}),
    };
    const prefix = `${name}${vertical ? '-9x16' : ''}${backgroundImage ? '-bg' : ''}`;
    const composition = await selectComposition({
      ...common,
      id: `CharacterScene-${name}${vertical ? '-vertical' : ''}`,
      inputProps,
    });

    for (const [moment, atMs] of momentsFor(name)) {
      await renderStill({
        ...common,
        composition,
        inputProps,
        frame: Math.round((atMs / 1_000) * CHARACTER_PROTOTYPE_FPS),
        output: resolve(output, `${prefix}-${moment}.png`),
      });
      console.log(`Wrote ${prefix}-${moment}.png`);
    }

    if (!stillsOnly) {
      await renderMedia({
        ...common,
        codec: 'h264',
        composition,
        inputProps,
        outputLocation: resolve(output, `${prefix}.mp4`),
      });
      console.log(`Wrote ${prefix}.mp4 (${scenario.durationMs / 1_000}s, silent)`);
    }
  }

  await rm(publicDir, {recursive: true, force: true});
};

await main();
