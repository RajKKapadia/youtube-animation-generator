import {mkdir, readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderPublishCovers} from './publish-render.js';
import {validateImageBackground} from './image-background.js';
import {
  narratedPlanSchema,
  narratedPublishPlanSchema,
  publishSceneSchema,
  videoPaletteSchema,
} from './types.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, '..');

const main = async () => {
  const outputDirectory = resolve(
    process.argv[2] ?? '/tmp/youtube-animation-publish-fixtures',
  );
  const palette = videoPaletteSchema.parse(process.argv[3] ?? 'cyan');
  const fixture = process.argv[4] ?? 'sample';
  if (!['sample', 'financial', 'comparison'].includes(fixture)) {
    throw new Error('Publish fixture must be sample, financial, or comparison.');
  }
  const imageBackground = process.argv[5] ? await validateImageBackground(process.argv[5]) : undefined;
  const narration = narratedPlanSchema.parse(JSON.parse(await readFile(
    resolve(repositoryRoot, 'fixtures/sample.narration-plan.json'),
    'utf8',
  )));
  const savedPublish = narratedPublishPlanSchema.parse(JSON.parse(await readFile(
    resolve(repositoryRoot, 'fixtures/sample.publish.json'),
    'utf8',
  )));
  const publish = narratedPublishPlanSchema.parse({
    ...savedPublish,
    thumbnail: {
      ...savedPublish.thumbnail,
      accent: palette,
      ...(fixture === 'financial' ? {
        headline: 'Domestic Institutions Absorb Selling',
        eyebrow: 'Indian Market Flows',
      } : fixture === 'comparison' ? {
        headline: 'Reliable Distributed Systems Keep Critical Work Moving',
        eyebrow: 'Distributed Systems Architecture',
      } : {}),
    },
  });
  const selected = narration.scenes.find(({id}) => id === publish.thumbnail.sceneId);
  if (!selected) throw new Error('Fixture publish plan references a missing scene.');
  const scene = publishSceneSchema.parse({
    ...selected,
    ...(fixture === 'financial' ? {
      template: 'process-flow',
      title: 'Domestic institutions absorbed the selling',
      primaryItems: ['FII/FPI: 🔴 −₹3,111.94 Cr', 'DII: 🟢 +₹8,930.12 Cr', 'Combined: 🟢 +₹5,818.18 Cr'],
      secondaryItems: [],
      icons: {focal: null, primary: [], secondary: []},
    } : fixture === 'comparison' ? {
      template: 'comparison',
      title: 'Independent workers keep request processing reliable during traffic spikes',
      leftLabel: 'Request processing',
      rightLabel: 'Background processing',
      primaryItems: ['API endpoint', 'Request validation'],
      secondaryItems: ['Durable queue', 'Independent workers'],
      icons: {focal: null, primary: [], secondary: []},
    } : {}),
  });

  await mkdir(outputDirectory, {recursive: true});
  const outputs = await renderPublishCovers({
    aspectRatio: 'both',
    force: true,
    outputDirectory,
    publish,
    scene,
    stem: `${fixture}-${palette}`,
    ...(imageBackground ? {imageBackground} : {}),
  });
  console.log(`Rendered ${outputs.length} publish-cover fixtures to ${outputDirectory}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
