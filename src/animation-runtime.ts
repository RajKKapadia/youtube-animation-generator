import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, rename, readdir, lstat} from 'node:fs/promises';
import {resolve, dirname, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectFileSchema} from './animation-contract.js';

export const applicationRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const animationToolsRoot = () => resolve(process.env.ANIMATION_TOOLS_DIR ?? resolve(applicationRoot, '.animation-tools'));
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const fileHash = async (file: string) => sha256(await readFile(file));
export const projectPath = (root: string, file: string): string => {
  projectFileSchema.parse(file);
  const target = resolve(root, file);
  if (relative(resolve(root), target).startsWith(`..${sep}`)) throw new Error('Project path escaped its root.');
  return target;
};
export const atomicJson = async (file: string, value: unknown) => {
  await mkdir(dirname(file), {recursive: true});
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
  await rename(temporary, file);
};
export const runLocalProcess = (command: string, args: string[], options: {cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; onOutput?: (text: string) => void} = {}): Promise<string> => new Promise((accept, reject) => {
  const env = {...process.env, ...options.env};
  for (const key of Object.keys(env)) if (/API_KEY|AI_KEY|TOKEN|SECRET|PASSWORD/iu.test(key)) delete env[key];
  const child = spawn(command, args, {cwd: options.cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32'});
  let output = '', errors = '';
  const stop = () => { try {if (child.pid) process.platform === 'win32' ? child.kill() : process.kill(-child.pid, 'SIGTERM');} catch { /* already exited */ } };
  const timer = setTimeout(() => {stop(); reject(new Error(`${command} timed out.`));}, options.timeoutMs ?? 600_000);
  const interrupt = () => {stop(); reject(new Error('Animation job interrupted.'));};
  process.once('SIGINT', interrupt);
  child.stdout.on('data', data => {output = (output + data).slice(-100_000); options.onOutput?.(String(data));});
  child.stderr.on('data', data => {errors = (errors + data).slice(-20_000); options.onOutput?.(String(data));});
  child.once('error', reject);
  child.once('close', code => {
    clearTimeout(timer); process.off('SIGINT', interrupt);
    code === 0 ? accept(output) : reject(new Error(`Local tool exited ${code}: ${errors || output}`));
  });
});
export const sequenceHash = async (directory: string, expected?: number): Promise<{sha256: string; frameCount: number}> => {
  const files = (await readdir(directory)).filter(file => /^frame-\d{6}\.png$/u.test(file)).sort();
  if (!files.length || (expected !== undefined && files.length !== expected)) throw new Error(`Incomplete frame sequence: ${directory}`);
  const digest = createHash('sha256');
  for (const [index, file] of files.entries()) {
    if (file !== `frame-${String(index).padStart(6, '0')}.png`) throw new Error(`Missing animation frame ${index}.`);
    if (!(await lstat(resolve(directory, file))).isFile()) throw new Error('Animation frames must be regular files.');
    const bytes = await readFile(resolve(directory, file));
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid PNG: ${file}`);
    digest.update(file).update(bytes);
  }
  return {sha256: digest.digest('hex'), frameCount: files.length};
};
