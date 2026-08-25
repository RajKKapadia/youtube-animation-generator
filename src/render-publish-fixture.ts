import {mkdir, readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderPublishCovers} from './publish-render.js';
import {
  narratedPlanSchema,
  narratedPublishPlanSchema,
  publishSceneSchema,
} from './types.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, '..');

const main = async () => {
  const outputDirectory = resolve(
    process.argv[2] ?? '/tmp/youtube-animation-publish-fixtures',
  );
  const narration = narratedPlanSchema.parse(JSON.parse(await readFile(
    resolve(repositoryRoot, 'fixtures/sample.narration-plan.json'),
    'utf8',
  )));
  const publish = narratedPublishPlanSchema.parse(JSON.parse(await readFile(
    resolve(repositoryRoot, 'fixtures/sample.publish.json'),
    'utf8',
  )));
  const selected = narration.scenes.find(({id}) => id === publish.thumbnail.sceneId);
  if (!selected) throw new Error('Fixture publish plan references a missing scene.');

  await mkdir(outputDirectory, {recursive: true});
  const outputs = await renderPublishCovers({
    aspectRatio: 'both',
    force: true,
    outputDirectory,
    publish,
    scene: publishSceneSchema.parse(selected),
    stem: 'sample',
  });
  console.log(`Rendered ${outputs.length} publish-cover fixtures to ${outputDirectory}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
