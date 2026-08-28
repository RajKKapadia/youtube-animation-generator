import {access, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  discoverLocalImages,
  mirrorNarratedMediaCaches,
  stageSelectedLocalImages,
} from './local-images.js';
import {localImagePlanningInputParts} from './narration-planner.js';
import {draftNarratedPlanSchema} from './types.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, {recursive: true, force: true}),
  ));
});

const makeDirectory = async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'narrated-local-images-'));
  temporaryDirectories.push(directory);
  return directory;
};

const pngBytes = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.from('fixture-pixels'),
]);

describe('local narrated-video image discovery', () => {
  it('scans only direct PNG/JPEG/WebP files with stable ids, hashes, and Base64 inputs', async () => {
    const directory = await makeDirectory();
    const sourcePath = resolve(directory, 'summary.md');
    const imageDirectory = resolve(directory, 'images');
    await mkdir(resolve(imageDirectory, 'nested'), {recursive: true});
    await writeFile(sourcePath, 'Source');
    await writeFile(resolve(imageDirectory, 'Queue Diagram.png'), pngBytes);
    await writeFile(resolve(imageDirectory, 'notes.txt'), 'ignored');
    await writeFile(resolve(imageDirectory, 'nested/hidden.png'), pngBytes);

    const first = await discoverLocalImages({sourcePath, stem: 'summary'});
    const second = await discoverLocalImages({sourcePath, stem: 'summary'});
    expect(first).toHaveLength(1);
    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({
      mimeType: 'image/png',
      originalName: 'Queue Diagram.png',
      file: expect.stringMatching(/^summary\.media\/queue-diagram-[\da-f]{12}\.png$/u),
      id: expect.stringMatching(/^local-queue-diagram-[\da-f]{12}$/u),
      sha256: expect.stringMatching(/^[\da-f]{64}$/u),
      dataUrl: expect.stringMatching(/^data:image\/png;base64,/u),
    });
    expect(localImagePlanningInputParts(first)).toEqual([
      expect.objectContaining({type: 'input_text', text: expect.stringContaining(first[0]!.id)}),
      {type: 'input_image', image_url: first[0]!.dataUrl, detail: 'high'},
    ]);
  });

  it('returns an empty catalog without images/ and rejects extension spoofing', async () => {
    const directory = await makeDirectory();
    const sourcePath = resolve(directory, 'summary.md');
    await writeFile(sourcePath, 'Source');
    await expect(discoverLocalImages({sourcePath, stem: 'summary'})).resolves.toEqual([]);
    await mkdir(resolve(directory, 'images'));
    await writeFile(resolve(directory, 'images/fake.png'), 'not a png');
    await expect(discoverLocalImages({sourcePath, stem: 'summary'})).rejects.toThrow(
      'does not match its PNG, JPEG, or WebP extension',
    );
  });

  it('copies only selected images transactionally for deterministic offline rerenders', async () => {
    const directory = await makeDirectory();
    const sourcePath = resolve(directory, 'summary.md');
    await writeFile(sourcePath, 'A Queue Diagram explains the Queue.');
    await mkdir(resolve(directory, 'images'));
    await writeFile(resolve(directory, 'images/Queue Diagram.png'), pngBytes);
    await writeFile(resolve(directory, 'images/Unused.png'), Buffer.concat([pngBytes, Buffer.from('unused')]));
    const catalog = await discoverLocalImages({sourcePath, stem: 'summary'});
    const selected = catalog[0]!;
    const plan = draftNarratedPlanSchema.parse({
      version: 6,
      kind: 'narrated-video',
      stage: 'draft',
      sourceText: 'A Queue Diagram explains the Queue.',
      generatedAt: '2026-08-27T00:00:00.000Z',
      model: 'fixture',
      targetDurationSeconds: 5,
      language: 'en',
      title: 'Queue',
      palette: 'cyan',
      mediaAssets: [{
        id: selected.id,
        source: 'local',
        file: selected.file,
        sha256: selected.sha256,
        mimeType: selected.mimeType,
        originalName: selected.originalName,
      }],
      scenes: [{
        id: 'queue',
        backgroundPrompt: 'Abstract queue.',
        template: 'callout',
        title: 'Queue Diagram',
        primaryItems: ['Queue'],
        secondaryItems: [],
        leftLabel: '',
        rightLabel: '',
        reason: 'Shows the supplied diagram.',
        visual: {kind: 'image-focus', motion: 'push-in', motif: 'data', assetId: null, source: 'local', mediaId: selected.id, fit: 'contain', focalPosition: 'center'},
        beats: [{id: 'queue-beat', expression: 'none', phrases: [{id: 'queue-phrase', text: 'The Queue Diagram explains the Queue.'}], primaryItemIndices: [0], secondaryItemIndices: []}],
      }],
    });
    const outputDirectory = resolve(directory, 'summary-video');
    await stageSelectedLocalImages({catalog, outputDirectory, plan, stem: 'summary'});
    const copiedPath = resolve(outputDirectory, selected.file);
    await expect(access(copiedPath)).resolves.toBeUndefined();
    expect(await readFile(copiedPath)).toEqual(pngBytes);
    await expect(access(resolve(outputDirectory, catalog[1]!.file))).rejects.toThrow();

    const customOutput = resolve(directory, 'custom-output');
    await mirrorNarratedMediaCaches({
      plan,
      sourceDirectory: outputDirectory,
      stem: 'summary',
      targetDirectory: customOutput,
    });
    expect(await readFile(resolve(customOutput, selected.file))).toEqual(pngBytes);
  });
});
