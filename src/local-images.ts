import {createHash} from 'node:crypto';
import {
  access,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename, dirname, extname, resolve} from 'node:path';
import type {DraftNarratedPlan, TimedNarratedPlan} from './types.js';

const MAX_LOCAL_IMAGE_BYTES = 20 * 1024 * 1024;

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const safeFilenamePart = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase() || 'image';

const mimeFromBytes = (bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | undefined => {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return undefined;
};

const extensionForMime = (mimeType: DiscoveredLocalImage['mimeType']): string =>
  mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';

const allowedExtensionMimes: Record<string, DiscoveredLocalImage['mimeType'][]> = {
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
};

export interface DiscoveredLocalImage {
  id: string;
  originalName: string;
  sourcePath: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  sha256: string;
  file: string;
  dataUrl: string;
}

export const discoverLocalImages = async ({
  sourcePath,
  stem,
}: {
  sourcePath: string;
  stem: string;
}): Promise<DiscoveredLocalImage[]> => {
  const imagesDirectory = resolve(dirname(sourcePath), 'images');
  let entries;
  try {
    entries = await readdir(imagesDirectory, {withFileTypes: true});
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const discovered: DiscoveredLocalImage[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    if (!entry.isFile()) continue;
    const extension = extname(entry.name).toLowerCase();
    if (!allowedExtensionMimes[extension]) continue;
    const sourceFile = resolve(imagesDirectory, entry.name);
    const bytes = await readFile(sourceFile);
    if (bytes.length > MAX_LOCAL_IMAGE_BYTES) {
      throw new Error(`Local image exceeds the 20 MB limit: ${sourceFile}`);
    }
    const mimeType = mimeFromBytes(bytes);
    if (!mimeType || !allowedExtensionMimes[extension]?.includes(mimeType)) {
      throw new Error(`Local image content does not match its PNG, JPEG, or WebP extension: ${sourceFile}`);
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const name = safeFilenamePart(basename(entry.name, extension));
    const id = `local-${name}-${sha256.slice(0, 12)}`;
    const mediaFile = `${name}-${sha256.slice(0, 12)}${extensionForMime(mimeType)}`;
    discovered.push({
      id,
      originalName: entry.name,
      sourcePath: sourceFile,
      mimeType,
      sha256,
      file: `${stem}.media/${mediaFile}`,
      dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
    });
  }
  return discovered;
};

export const stageSelectedLocalImages = async ({
  catalog,
  outputDirectory,
  plan,
  stem,
}: {
  catalog: DiscoveredLocalImage[];
  outputDirectory: string;
  plan: DraftNarratedPlan;
  stem: string;
}): Promise<void> => {
  const requested = plan.mediaAssets.filter((asset) => asset.source === 'local');
  if (requested.length === 0) return;
  const catalogById = new Map(catalog.map((image) => [image.id, image]));
  const finalDirectory = resolve(outputDirectory, `${stem}.media`);
  await mkdir(outputDirectory, {recursive: true});
  const stagingDirectory = await mkdtemp(resolve(outputDirectory, `.${stem}.media-staging-`));
  const backupDirectory = resolve(
    outputDirectory,
    `.${stem}.media-backup-${process.pid}-${Date.now()}`,
  );
  let movedExisting = false;
  try {
    if (await pathExists(finalDirectory)) {
      await cp(finalDirectory, stagingDirectory, {recursive: true});
    }
    for (const asset of requested) {
      const image = catalogById.get(asset.id);
      if (
        !image ||
        image.sha256 !== asset.sha256 ||
        image.mimeType !== asset.mimeType ||
        image.originalName !== asset.originalName
      ) {
        throw new Error(`Selected local image ${asset.id} no longer matches the planning input.`);
      }
      const destination = resolve(stagingDirectory, basename(asset.file));
      await copyFile(image.sourcePath, destination);
      const copiedHash = createHash('sha256').update(await readFile(destination)).digest('hex');
      if (copiedHash !== asset.sha256) {
        throw new Error(`Local image changed while it was being copied: ${image.sourcePath}`);
      }
    }
    if (await pathExists(finalDirectory)) {
      await rename(finalDirectory, backupDirectory);
      movedExisting = true;
    }
    await rename(stagingDirectory, finalDirectory);
    if (movedExisting) await rm(backupDirectory, {recursive: true, force: true});
  } catch (error) {
    await rm(stagingDirectory, {recursive: true, force: true});
    if (movedExisting && !await pathExists(finalDirectory)) {
      await rename(backupDirectory, finalDirectory);
    }
    throw new Error('Could not transactionally copy selected local narrated-video images.', {cause: error});
  }
};

const mirrorDirectoryTransactionally = async ({
  directoryName,
  sourceDirectory,
  targetDirectory,
}: {
  directoryName: string;
  sourceDirectory: string;
  targetDirectory: string;
}): Promise<void> => {
  const source = resolve(sourceDirectory, directoryName);
  const target = resolve(targetDirectory, directoryName);
  if (source === target || !await pathExists(source)) return;
  await mkdir(targetDirectory, {recursive: true});
  const staging = await mkdtemp(resolve(targetDirectory, `.${directoryName}-staging-`));
  const backup = resolve(targetDirectory, `.${directoryName}-backup-${process.pid}-${Date.now()}`);
  let movedExisting = false;
  try {
    if (await pathExists(target)) await cp(target, staging, {recursive: true});
    await cp(source, staging, {recursive: true});
    if (await pathExists(target)) {
      await rename(target, backup);
      movedExisting = true;
    }
    await rename(staging, target);
    if (movedExisting) await rm(backup, {recursive: true, force: true});
  } catch (error) {
    await rm(staging, {recursive: true, force: true});
    if (movedExisting && !await pathExists(target)) await rename(backup, target);
    throw error;
  }
};

export const mirrorNarratedMediaCaches = async ({
  plan,
  sourceDirectory,
  stem,
  targetDirectory,
}: {
  plan: DraftNarratedPlan | TimedNarratedPlan;
  sourceDirectory: string;
  stem: string;
  targetDirectory: string;
}): Promise<void> => {
  if (resolve(sourceDirectory) === resolve(targetDirectory)) return;
  await mirrorDirectoryTransactionally({
    directoryName: `${stem}.media`,
    sourceDirectory,
    targetDirectory,
  });
  await mirrorDirectoryTransactionally({
    directoryName: `${stem}.generated-visuals`,
    sourceDirectory,
    targetDirectory,
  });
  for (const asset of plan.mediaAssets.filter((candidate) => candidate.source === 'local')) {
    const target = resolve(targetDirectory, asset.file);
    if (!await pathExists(target)) {
      throw new Error(`Custom output is missing local media ${asset.file}.`);
    }
    const hash = createHash('sha256').update(await readFile(target)).digest('hex');
    if (hash !== asset.sha256) {
      throw new Error(`Custom-output local media hash does not match the saved plan: ${asset.file}`);
    }
  }
};
