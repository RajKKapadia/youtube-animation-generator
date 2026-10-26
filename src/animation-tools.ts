import {existsSync} from 'node:fs';
import {copyFile, cp, mkdir, readFile, readdir, rm, mkdtemp} from 'node:fs/promises';
import {resolve, relative, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {zodTextFormat} from 'openai/helpers/zod';
import {z} from 'zod';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {semanticIconComponentFor} from './remotion/SemanticIcon.js';
import {animationRecipeSchema, type AnimationAsset, type AnimationRecipe, type AnimationTool} from './animation-contract.js';
import {animationToolsRoot, applicationRoot, atomicJson, fileHash, projectPath, runLocalProcess, sequenceHash, sha256} from './animation-runtime.js';
import {defaultAnimationRecipe, hyperframesSource, lottieSource, recipeSupportsTool, sceneCues, sourceTimeAt, suggestedAnimationTool, sceneSpeakerIds} from './animation-recipes.js';
import {createAIClient, withTransientRetries} from './ai-client.js';
import {compactSchemaText} from './schema-prompt.js';
import {profilesForSelection} from './render-profile.js';
import type {AspectRatioSelection, DraftNarratedPlan, TimedNarratedPlan, TimedNarrationScene} from './types.js';

export const ANIMATION_PINS = {hyperframes: '0.8.201', lottie: '3c72912fad543897f90045ed4d355813837927fc', stykanimate: 'def97214c2b491fbce82647f625a73f78416c6d8', mcp: '2ca2f1044bbfc1fd5ab09660662a8188456cd715'};
export const animationRecipeResponseShape = () => compactSchemaText(z.toJSONSchema(animationRecipeSchema));
export const browserExecutable = () => process.env.REMOTION_BROWSER_EXECUTABLE ?? ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
const worker = resolve(applicationRoot, 'scripts/animation-tool-worker.mjs');
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8')) as unknown;

export const toolAvailability = async (tool: AnimationTool, requireProof = true): Promise<string | null> => {
  const root = animationToolsRoot();
  try {
    const versions = await json(resolve(root, 'versions.json')) as Record<string, string>;
    if (versions[tool] !== ANIMATION_PINS[tool]) return `Run animation tool setup: ${tool} is not pinned to the supported version.`;
    if (tool === 'hyperframes') {
      const installed = await json(resolve(root, 'runtime/node_modules/hyperframes/package.json')) as {version?: string};
      if (installed.version !== ANIMATION_PINS.hyperframes) return 'Installed HyperFrames version differs from its pin.';
    } else {
      const head = (await runLocalProcess('git', ['-C', resolve(root, tool), 'rev-parse', 'HEAD'])).trim();
      if (head !== ANIMATION_PINS[tool]) return `Installed ${tool} checkout differs from its pin.`;
    }
    if (!browserExecutable()) return 'Set REMOTION_BROWSER_EXECUTABLE to a local Chrome executable.';
    const required = tool === 'hyperframes' ? ['runtime/node_modules/hyperframes/bin/hyperframes.mjs', 'runtime/node_modules/gsap/dist/gsap.min.js']
      : tool === 'lottie' ? ['lottie/public/canvaskit.wasm', 'lottie/src/assets/fonts/Inter-VariableFont_opsz,wght.ttf']
        : ['stykanimate/src/export-frame-renderer.mjs', 'stykanimate-mcp/src/index.js'];
    if (required.some(file => !existsSync(resolve(root, file)))) return `Missing ${tool} runtime; run setup.`;
    if (tool === 'stykanimate' && requireProof) {
      const proof = await json(resolve(root, 'proofs/stykanimate.json')) as {version?: string; mcp?: string};
      if (proof.version !== ANIMATION_PINS.stykanimate || proof.mcp !== ANIMATION_PINS.mcp) return 'Run tools verify before enabling StykAnimate.';
    }
    return null;
  } catch {return `${tool} is not installed or verified; run tools setup, then tools verify.`;}
};

export const authorAnimationRecipe = async (scene: TimedNarrationScene, tool: AnimationTool, model?: string): Promise<AnimationRecipe> => {
  const info = createAIClient({model});
  const system = 'Choose one bounded animation recipe. Do not write code, add facts or alter supplied labels. Return only JSON. StykAnimate requires character-exchange; Lottie requires icon-reveal or pulse; HyperFrames supports kinetic-text, comparison, diagram, chart.';
  const input = JSON.stringify({tool, visual: scene.visual, title: scene.title, primaryItems: scene.primaryItems, secondaryItems: scene.secondaryItems});
  let failure = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = info.provider === 'openai'
        ? (await withTransientRetries(() => info.client.responses.create({model: info.model, store: false, input: [{role: 'system', content: system}, {role: 'user', content: input + failure}], text: {format: zodTextFormat(animationRecipeSchema, 'animation_recipe')}}), 2)).output_text
        : (await withTransientRetries(() => info.client.chat.completions.create({model: info.model, response_format: {type: 'json_object'}, messages: [{role: 'system', content: `${system}\nShape: ${animationRecipeResponseShape()}`}, {role: 'user', content: input + failure}]}), 2)).choices[0]?.message.content;
      const recipe = animationRecipeSchema.parse(JSON.parse(content ?? ''));
      if (!recipeSupportsTool(recipe, tool)) throw new Error(`Recipe ${recipe.treatment} is not supported by ${tool}.`);
      return recipe;
    } catch (error) {failure = `\nCorrect this error: ${error instanceof Error ? error.message : String(error)}`;}
  }
  throw new Error(`Animation recipe authoring failed for ${scene.id}.${failure}`);
};

export const renderAnimationAsset = async (asset: AnimationAsset, sourceScene: TimedNarrationScene, scene: TimedNarrationScene, options: {projectDirectory: string; aspectRatio: AspectRatioSelection; fps: number; palette: DraftNarratedPlan['palette']}): Promise<AnimationAsset> => {
  const root = animationToolsRoot(), browser = browserExecutable();
  if (!browser) throw new Error('No Chrome executable found for animation export.');
  const updated: AnimationAsset = {...asset, renders: {...asset.renders}};
  for (const profile of profilesForSelection(options.aspectRatio)) {
    const aspect = profile.aspectRatio.replace(':', 'x');
    const sourceDirectory = projectPath(options.projectDirectory, `animations/${asset.id}/${aspect}`);
    const signature = sha256(JSON.stringify({sources: await Promise.all(asset.sources.map(async file => [file.file, await fileHash(projectPath(options.projectDirectory, file.file))])), cues: sceneCues(scene), duration: scene.durationMs, profile, fps: options.fps, version: asset.toolVersion})).slice(0,24);
    const directory = `animations/${asset.id}/renders/${aspect}-${signature}`;
    const outputDirectory = projectPath(options.projectDirectory, directory);
    const cached = asset.renders[profile.aspectRatio];
    if (cached?.directory === directory) {
      try {if ((await sequenceHash(outputDirectory, cached.frameCount)).sha256 === cached.sha256) continue;} catch { /* incomplete exports are regenerated */ }
    }
    const unavailable = await toolAvailability(asset.tool, false);
    if (unavailable || asset.toolVersion !== ANIMATION_PINS[asset.tool]) throw new Error(unavailable ?? `Unsupported saved ${asset.tool} version; prepare with the pinned runtime.`);
    await rm(outputDirectory, {recursive: true, force: true});
    await mkdir(outputDirectory, {recursive: true});
    const frameCount = Math.max(1, Math.ceil(scene.durationMs / 1000 * options.fps));
    const jobFile = resolve(sourceDirectory, 'export-job.json');
    if (asset.tool === 'hyperframes') {
      const stage = await mkdtemp(resolve(tmpdir(), 'animation-hyperframes-'));
      try {
        await cp(sourceDirectory, stage, {recursive: true});
        // Named anchors are substituted in a derived copy; editable source is retained.
        let html = await readFile(resolve(stage, 'native.html'), 'utf8');
        html = html.replace(/data-duration="[^"]+"/u, `data-duration="${scene.durationMs / 1000}"`);
        const original = sceneCues(sourceScene), target = sceneCues(scene);
        if (original.some((cue, index) => cue.id !== target[index]?.id)) throw new Error('Animation cue ids changed; prepare again.');
        for (const [index, cue] of original.entries()) {
          const marker = `/*cue:${encodeURIComponent(cue.id)}*/`;
          if (html.includes(marker)) html = html.split(marker).map((part, partIndex) => partIndex ? part.replace(/^[\d.]+/u, String(target[index]!.startMs / 1000)) : part).join(marker);
        }
        html = html.replace(/\/\*end\*\/[\d.]+/u, `/*end*/${Math.max(.001, scene.durationMs / 1000 - .001)}`);
        await import('node:fs/promises').then(fs => fs.writeFile(resolve(stage, 'index.html'), html));
        await rm(resolve(stage, 'native.html'));
        const cli = resolve(root, 'runtime/node_modules/hyperframes/bin/hyperframes.mjs');
        const env = {HYPERFRAMES_BROWSER_PATH: browser, HYPERFRAMES_NO_TELEMETRY: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1', DO_NOT_TRACK: '1', CI: '1', HYPERFRAMES_NO_ORPHAN_CLEANUP: '1'};
        await runLocalProcess(process.execPath, [cli, 'lint', stage], {env});
        await runLocalProcess(process.execPath, [cli, 'render', stage, '--format', 'png-sequence', '--fps', String(options.fps), '--workers', '1', '--output', outputDirectory, '--quiet'], {env});
        const files = (await readdir(outputDirectory)).filter(name => name.endsWith('.png')).sort();
        // Rename through a staging directory so upstream numbering never collides.
        const normalized = resolve(stage, 'normalized'); await mkdir(normalized);
        for (const [index, file] of files.entries()) await copyFile(resolve(outputDirectory, file), resolve(normalized, `frame-${String(index).padStart(6, '0')}.png`));
        await rm(outputDirectory, {recursive: true}); await cp(normalized, outputDirectory, {recursive: true});
      } finally {await rm(stage, {recursive: true, force: true});}
    } else {
      const sourceFrames = Array.from({length: frameCount}, (_, index) => sourceTimeAt(index * 1000 / options.fps, sceneCues(sourceScene), sceneCues(scene), sourceScene.durationMs, scene.durationMs) * options.fps / 1000);
      await atomicJson(jobFile, {tool: asset.tool, toolsRoot: root, sourceDirectory, outputDirectory, browser, width: profile.width, height: profile.height, sourceFrames});
      await runLocalProcess(process.execPath, [worker, jobFile]);
    }
    const digest = await sequenceHash(outputDirectory, frameCount);
    updated.renders[profile.aspectRatio] = {directory, ...digest, fps: options.fps, width: profile.width, height: profile.height};
  }
  return updated;
};

export const createAnimationAsset = async (scene: TimedNarrationScene, tool: AnimationTool, recipe: AnimationRecipe, options: {projectDirectory: string; aspectRatio: AspectRatioSelection; fps: number; palette: DraftNarratedPlan['palette']; forced?: boolean}): Promise<AnimationAsset> => {
  if (tool === 'stykanimate' && scene.visual.kind !== 'character-scene') throw new Error('StykAnimate requires a grounded character-scene.');
  if (tool === 'stykanimate' && scene.visual.kind === 'character-scene' && (scene.visual.set !== 'none' || scene.visual.callout || scene.visual.cast.some(character => character.prop))) throw new Error('This StykAnimate recipe does not support sets, props or callouts; retain the built-in character treatment.');
  if (!recipeSupportsTool(recipe, tool)) throw new Error('Animation recipe does not match its tool.');
  const id = `scene-${sha256(scene.id).slice(0,12)}`, root = animationToolsRoot(), sources = [];
  for (const profile of profilesForSelection(options.aspectRatio)) {
    const directory = `animations/${id}/${profile.aspectRatio.replace(':', 'x')}`;
    const path = projectPath(options.projectDirectory, directory); await mkdir(path, {recursive: true});
    await atomicJson(resolve(path, 'recipe.json'), {recipe, sceneId: scene.id, cues: sceneCues(scene), durationMs: scene.durationMs});
    const files = ['recipe.json'];
    if (tool === 'hyperframes') {
      await import('node:fs/promises').then(fs => fs.writeFile(resolve(path, 'native.html'), hyperframesSource(scene, profile.width, profile.height, options.palette, recipe)));
      await copyFile(resolve(root, 'runtime/node_modules/gsap/dist/gsap.min.js'), resolve(path, 'gsap.min.js'));
      files.push('native.html', 'gsap.min.js');
    } else if (tool === 'lottie') {
      await atomicJson(resolve(path, 'native.json'), lottieSource(scene, profile.width, profile.height, options.fps, options.palette, recipe));
      files.push('native.json');
      const icon = semanticIconComponentFor(scene.icons.focal ?? scene.icons.primary[0] ?? 'message-chat');
      if (icon) {
        await import('node:fs/promises').then(fs => fs.writeFile(resolve(path, 'icon.svg'), renderToStaticMarkup(createElement(icon, {size: 24}))));
        const jobFile = resolve(path, 'icon-job.json');
        await atomicJson(jobFile, {action: 'author-lottie', tool, toolsRoot: root, sourceDirectory: path, browser: browserExecutable(), width: profile.width, height: profile.height});
        await runLocalProcess(process.execPath, [worker, jobFile]);
        files.push('icon.svg');
      }
    } else {
      const visual = scene.visual;
      if (visual.kind !== 'character-scene') throw new Error('StykAnimate requires a character scene.');
      const jobFile = resolve(path, 'author-job.json');
      await atomicJson(jobFile, {action: 'author-styk', toolsRoot: root, sourceDirectory: path, width: profile.width, height: profile.height, fps: options.fps, cues: sceneCues(scene), durationMs: scene.durationMs, cast: [...visual.cast].sort((a, b) => ['left', 'center', 'right'].indexOf(a.position) - ['left', 'center', 'right'].indexOf(b.position)), speakers: sceneSpeakerIds(scene), recipe});
      await runLocalProcess(process.execPath, [worker, jobFile]);
      files.push('native.styk');
    }
    if (tool !== 'stykanimate') {
      await copyFile(resolve(root, 'lottie/src/assets/fonts/Inter-VariableFont_opsz,wght.ttf'), resolve(path, 'Inter.ttf'));
      files.push('Inter.ttf');
      await copyFile(resolve(applicationRoot, 'scripts/licenses/Inter-OFL.txt'), resolve(path, 'Inter-OFL.txt')); files.push('Inter-OFL.txt');
    }
    for (const file of files) sources.push({file: `${directory}/${file}`, sha256: await fileHash(resolve(path, file))});
  }
  return {id, sceneId: scene.id, tool, forced: options.forced ?? false, toolVersion: ANIMATION_PINS[tool], recipe, sources, renders: {}};
};

export const materializeAnimations = async (plan: TimedNarratedPlan, options: {projectDirectory: string; aspectRatio: AspectRatioSelection; fps: number; tools: AnimationTool[]; overrides: Record<string, AnimationTool | 'builtin'>; author: boolean; render?: boolean; model?: string}): Promise<TimedNarratedPlan> => {
  const warnings = [...(plan.planningWarnings ?? [])], assets: AnimationAsset[] = [];
  for (const id of Object.keys(options.overrides)) if (!plan.scenes.some(scene => scene.id === id)) throw new Error(`Unknown scene override: ${id}`);
  for (const scene of plan.scenes) {
    const override = options.overrides[scene.id];
    const selected = override === 'builtin' ? null : override ?? suggestedAnimationTool(scene);
    if (!selected || (!override && !options.tools.includes(selected))) continue;
    try {
      const unavailable = await toolAvailability(selected); if (unavailable) throw new Error(unavailable);
      const recipe = options.author ? await authorAnimationRecipe(scene, selected, options.model) : defaultAnimationRecipe(scene, selected);
      let asset = await createAnimationAsset(scene, selected, recipe, {...options, palette: plan.palette, forced: Boolean(override)});
      if (options.render !== false) asset = await renderAnimationAsset(asset, scene, scene, {...options, palette: plan.palette});
      assets.push(asset);
    } catch (error) {
      const message = `${scene.id}: ${selected} failed: ${error instanceof Error ? error.message : String(error)}`;
      if (override) throw new Error(message);
      warnings.push(`${message}. Used the built-in visual.`);
    }
  }
  return {...plan, animationAssets: assets, planningWarnings: warnings};
};
