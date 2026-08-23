import {access, mkdir, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {runSupertonicWorker} from './supertonic/client.js';
import {
  supertonicVoiceSchema,
  type SupertonicVoice,
} from './supertonic/protocol.js';
import type {NarrationExpression} from './supertonic/expressions.js';

const outputDirectory = resolve(
  process.argv[2] ?? `/tmp/youtube-animation-voice-expressions-${Date.now()}`,
);
const assetsDirectory = resolve(process.argv[3] ?? 'models/supertonic-3');
const voice: SupertonicVoice = supertonicVoiceSchema.parse(
  process.argv[4] ?? 'M1',
);

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const expressions: NarrationExpression[] = [
  'none',
  'laugh',
  'breath',
  'sigh',
];

const main = async () => {
  if (await pathExists(outputDirectory)) {
    throw new Error(`Fixture output already exists: ${outputDirectory}`);
  }
  await mkdir(outputDirectory, {recursive: true});
  const result = await runSupertonicWorker({
    assetsDirectory,
    outputDirectory,
    voice,
    language: 'en',
    speed: 1.05,
    steps: 8,
    scenes: [{
      id: 'voice-expressions',
      beats: expressions.map((expression) => ({
        id: expression === 'none' ? 'plain' : expression,
        expression,
        phrases: [{
          id: `${expression === 'none' ? 'plain' : expression}-phrase`,
          text: 'That is the key idea.',
        }],
      })),
    }],
  });
  const beats = result.scenes[0]?.beats ?? [];
  if (beats.length !== expressions.length) {
    throw new Error('Supertonic result did not include every expression fixture beat.');
  }
  const manifest = {
    voice,
    sampleRate: result.sampleRate,
    voiceoverFile: result.voiceoverFile,
    beats: beats.map((beat, index) => ({
      expression: expressions[index],
      file: beat.file,
      durationMs: Math.round((beat.sampleCount / result.sampleRate) * 1_000),
      sampleCount: beat.sampleCount,
    })),
  };
  await writeFile(
    resolve(outputDirectory, 'voice-expression-fixture.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  console.log(`Rendered voice-expression fixture to ${outputDirectory}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
