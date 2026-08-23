import {existsSync} from 'node:fs';
import {mkdir, readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {RENDER_PROFILES} from './render-profile.js';
import {savedPlanSchema} from './types.js';
import {resolveTechnologyBrandIcons} from './technology-catalog.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, '..');
const outputDirectory = resolve(process.argv[2] ?? '/tmp/youtube-animation-layout-fixtures');
const entryPoint = existsSync(resolve(currentDirectory, 'remotion/index.js'))
  ? resolve(currentDirectory, 'remotion/index.js')
  : resolve(currentDirectory, 'remotion/index.tsx');

const main = async () => {
  const plan = savedPlanSchema.parse(
    JSON.parse(
      await readFile(
        resolve(repositoryRoot, 'fixtures/vertical-worst-case.animation-plan.json'),
        'utf8',
      ),
    ),
  );
  await mkdir(outputDirectory, {recursive: true});
  const serveUrl = await bundle({
    entryPoint,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        extensionAlias: {
          ...config.resolve?.extensionAlias,
          '.js': ['.js', '.ts', '.tsx'],
        },
      },
    }),
  });
  const icons = resolveTechnologyBrandIcons(
    plan.clips.flatMap((clip) => [...clip.primaryItems, ...clip.secondaryItems]),
  );
  const browserExecutable = '/usr/bin/google-chrome-stable';
  let rendered = 0;
  for (const profile of [RENDER_PROFILES['16:9'], RENDER_PROFILES['9:16']]) {
    for (const clip of plan.clips) {
      const inputProps = {
        background: 'dark' as const,
        clip,
        fps: 30,
        profile,
        technologyIcons: icons,
      };
      const composition = await selectComposition({
        serveUrl,
        id: 'AnimationClip',
        inputProps,
        browserExecutable,
        logLevel: 'warn',
      });
      for (const [phase, frame] of [
        ['early', Math.min(15, composition.durationInFrames - 1)],
        ['middle', Math.floor(composition.durationInFrames / 2)],
        ['complete', Math.max(0, composition.durationInFrames - 16)],
      ] as const) {
        const output = resolve(
          outputDirectory,
          `${clip.template}-${profile.aspectRatio.replace(':', 'x')}-${phase}.png`,
        );
        await renderStill({
          serveUrl,
          composition,
          inputProps,
          output,
          frame,
          imageFormat: 'png',
          browserExecutable,
          logLevel: 'warn',
        });
        rendered += 1;
      }
    }
  }
  console.log(`Rendered ${rendered} layout fixture stills to ${outputDirectory}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
