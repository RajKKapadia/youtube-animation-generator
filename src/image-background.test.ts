import {mkdir, mkdtemp, readFile, readdir, rm, truncate, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {relative, resolve} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {stageImageBackground, validateImageBackground} from './image-background.js';

const directories: string[] = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0mQAAAAASUVORK5CYII=', 'base64');
const directory = async () => {
  const path = await mkdtemp(resolve(tmpdir(), 'image-background-'));
  directories.push(path);
  return path;
};
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, {recursive: true, force: true})));
});

describe('custom image backgrounds', () => {
  it('resolves relative paths with spaces and stages unchanged bytes under a content-hashed name', async () => {
    const dir = await directory();
    const file = resolve(dir, 'My background.PNG');
    await writeFile(file, png);
    const image = await validateImageBackground(relative(process.cwd(), file));
    expect(image.filePath).toBe(file);
    const publicDirectory = resolve(dir, 'public');
    await mkdir(publicDirectory);
    const name = await stageImageBackground(image, publicDirectory);
    expect(name).toMatch(/^background-image-[a-f0-9]{64}\.png$/u);
    expect(await readFile(resolve(publicDirectory, name))).toEqual(png);
    expect(await readdir(publicDirectory)).toEqual([name]);
  });

  it.each([
    ['photo.jpeg', Buffer.from([0xff, 0xd8, 0xff]), '.jpg'],
    ['photo.webp', Buffer.from('RIFFxxxxWEBP'), '.webp'],
  ])('accepts matching %s signatures', async (filename, bytes, extension) => {
    const dir = await directory();
    const file = resolve(dir, filename);
    await writeFile(file, bytes);
    const name = await stageImageBackground(await validateImageBackground(file), dir);
    expect(name.endsWith(extension)).toBe(true);
    expect(await readFile(resolve(dir, name))).toEqual(bytes);
  });

  it('rejects missing, oversized, unsupported, empty, directory, and spoofed inputs', async () => {
    const dir = await directory();
    await expect(validateImageBackground('')).rejects.toThrow('requires a local image path');
    await expect(validateImageBackground(resolve(dir, 'missing.png'))).rejects.toThrow('Invalid --background-image');
    await expect(validateImageBackground(resolve(dir, 'image.svg'))).rejects.toThrow('PNG, JPEG, or WebP');
    await mkdir(resolve(dir, 'directory.png'));
    await expect(validateImageBackground(resolve(dir, 'directory.png'))).rejects.toThrow('not a file');
    const file = resolve(dir, 'image.png');
    await writeFile(file, 'not an image');
    await expect(validateImageBackground(file)).rejects.toThrow('does not match');
    await truncate(file, 20 * 1024 * 1024 + 1);
    await expect(validateImageBackground(file)).rejects.toThrow('20 MB limit');
  });

  it('fails before staging if the original image changed or image metadata is missing', async () => {
    const dir = await directory();
    const file = resolve(dir, 'image.png');
    await writeFile(file, png);
    const image = await validateImageBackground(file);
    await writeFile(file, Buffer.concat([png, Buffer.from('changed')]));
    await expect(stageImageBackground(image, dir)).rejects.toThrow('changed after validation');
    await expect(stageImageBackground(undefined, dir)).rejects.toThrow('requires --background-image');
    expect(await readdir(dir)).toEqual(['image.png']);
  });
});
