#!/usr/bin/env node
// Explicit, opt-in setup. Rendering never invokes this script or downloads tools.
import {spawnSync} from 'node:child_process';
import {mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(process.env.ANIMATION_TOOLS_DIR ?? resolve(fileURLToPath(new URL('..', import.meta.url)), '.animation-tools'));
const scriptDirectory = fileURLToPath(new URL('.', import.meta.url));
const pins = {
  hyperframes: '0.8.201',
  lottie: '3c72912fad543897f90045ed4d355813837927fc',
  stykanimate: 'def97214c2b491fbce82647f625a73f78416c6d8',
  mcp: '2ca2f1044bbfc1fd5ab09660662a8188456cd715',
};
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, {cwd, stdio: 'inherit'});
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.error?.message}).`);
};
mkdirSync(root, {recursive: true});
const selected = process.argv.slice(2);
const wants = name => selected.length === 0 || selected.includes(name);
for (const name of selected) if (!['hyperframes', 'lottie', 'stykanimate', 'alignment'].includes(name)) throw new Error(`Unknown tool: ${name}`);
const checkout = (name, repository, ref) => {
  const path = resolve(root, name);
  if (!existsSync(path)) {
    mkdirSync(path);
    run('git', ['init', '--quiet'], path);
    run('git', ['fetch', '--depth', '1', `https://github.com/${repository}.git`, ref], path);
    run('git', ['checkout', '--detach', 'FETCH_HEAD'], path);
  }
  const head = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: path, encoding: 'utf8'});
  if (head.stdout?.trim() !== ref) throw new Error(`Unexpected checkout in ${path}; expected ${ref}. Preserve it and use a fresh tools directory.`);
  return path;
};
const runtime = resolve(root, 'runtime');
mkdirSync(runtime, {recursive: true});
const runtimeLock = JSON.parse(readFileSync(resolve(scriptDirectory, 'animation-runtime.package-lock.json'), 'utf8'));
writeFileSync(resolve(runtime, 'package.json'), JSON.stringify({...runtimeLock.packages[''], private: true, type: 'module'}));
copyFileSync(resolve(scriptDirectory, 'animation-runtime.package-lock.json'), resolve(runtime, 'package-lock.json'));
// puppeteer-core ships with HyperFrames; Chrome is supplied by the operator.
run('npm', ['ci', '--ignore-scripts', '--omit=optional', '--no-audit', '--no-fund'], runtime);
if (wants('hyperframes') || wants('lottie')) checkout('lottie', 'diffusionstudio/lottie', pins.lottie);
if (wants('lottie')) {
  const path = checkout('lottie', 'diffusionstudio/lottie', pins.lottie);
  copyFileSync(resolve(scriptDirectory, 'lottie-player.package-lock.json'), resolve(path, 'package-lock.json'));
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], path);
  run('node', ['scripts/copy-canvaskit.mjs'], path);
}
if (wants('stykanimate')) {
  checkout('stykanimate', 'filippocalippo/StykAnimate-App', pins.stykanimate);
  const path = checkout('stykanimate-mcp', 'ghassenTn/stykanimate-mcp', pins.mcp);
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], path);
}
if (wants('alignment')) {
  run('python3', ['-m', 'venv', resolve(root, 'python')]);
  const python = resolve(root, 'python', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  run(python, ['-m', 'pip', 'install', '-r', resolve(scriptDirectory, 'alignment-requirements.txt')]);
  run(python, ['-c', 'from huggingface_hub import snapshot_download; import sys; snapshot_download("Systran/faster-whisper-small", revision="536b0662742c02347bc0e980a01041f333bce120", cache_dir=sys.argv[1])', resolve(root, 'models')]);
}
const previous = existsSync(resolve(root, 'versions.json')) ? JSON.parse(readFileSync(resolve(root, 'versions.json'), 'utf8')) : {};
writeFileSync(resolve(root, 'versions.json'), JSON.stringify({...previous, ...pins}, null, 2) + '\n');
console.log(`Animation tools installed in ${root}. Root pnpm build allowlist was unchanged.`);
