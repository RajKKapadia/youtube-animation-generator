import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {draftNarratedPlanSchema} from './types.js';
import {estimateDraftNarrationTiming} from './narration-planner.js';
import {ANIMATION_PINS, createAnimationAsset, renderAnimationAsset, toolAvailability} from './animation-tools.js';
import {animationToolsRoot, applicationRoot, atomicJson, sha256, runLocalProcess} from './animation-runtime.js';
import {browserExecutable} from './animation-tools.js';
import {defaultAnimationRecipe} from './animation-recipes.js';
import {animationToolSchema, type AnimationTool} from './animation-contract.js';

export const animationProofPlan = () => estimateDraftNarrationTiming(draftNarratedPlanSchema.parse({
  version: 8, kind: 'narrated-video', stage: 'draft', sourceText: 'A customer asks a clerk. The clerk answers the customer.',
  generatedAt: '2026-10-26T00:00:00Z', model: 'offline-fixture', targetDurationSeconds: 12, language: 'en', title: 'Animation adapter proof', palette: 'violet', mediaAssets: [],
  scenes: ['hyperframes', 'lottie', 'stykanimate'].map((tool, i) => ({
    id: tool, template: 'process-flow', title: ['Show each idea', 'Reveal the next step', 'Take turns speaking'][i], primaryItems: ['A customer asks a clerk.', 'The clerk answers the customer.'], secondaryItems: [], leftLabel: '', rightLabel: '', reason: 'Offline adapter export verification.', backgroundPrompt: 'A plain transparent stage.', icons: {focal: null, primary: [], secondary: []},
    visual: tool === 'stykanimate' ? {kind: 'character-scene', assetId: null, sourceEvidence: 'A customer asks a clerk.', cast: [{id: 'customer', position: 'left'}, {id: 'clerk', position: 'right'}], speakers: [{primaryItemIndex: 0, castId: 'customer'}, {primaryItemIndex: 1, castId: 'clerk'}]}
      : {kind: tool === 'hyperframes' ? 'kinetic-text' : 'icon-spotlight', motion: tool === 'hyperframes' ? 'reveal' : 'pulse', motif: 'message', assetId: null},
    beats: [0, 1].map(index => ({id: `${tool}-${index}`, expression: 'none', phrases: [{id: `${tool}-phrase-${index}`, text: index ? 'The clerk answers the customer.' : 'A customer asks a clerk.'}], primaryItemIndices: [index], secondaryItemIndices: []})),
  })),
}));

export const verifyAnimationTools = async (tools: AnimationTool[] = [...animationToolSchema.options], directory = resolve(animationToolsRoot(), 'verification')) => {
  const plan = animationProofPlan();
  for (const tool of tools) {
    const unavailable = await toolAvailability(tool, false); if (unavailable) throw new Error(unavailable);
    const scene = plan.scenes.find(scene => scene.id === tool)!;
    const options = {projectDirectory: directory, aspectRatio: 'both' as const, fps: 15, palette: plan.palette};
    let asset = await createAnimationAsset(scene, tool, defaultAnimationRecipe(scene, tool), options);
    asset = await renderAnimationAsset(asset, scene, scene, options);
    const sequence = asset.renders['16:9']!;
    const first = await readFile(resolve(directory, sequence.directory, 'frame-000000.png'));
    const last = await readFile(resolve(directory, sequence.directory, `frame-${String(sequence.frameCount - 1).padStart(6, '0')}.png`));
    if (sha256(first) === sha256(last)) throw new Error(`${tool} exported an unchanging sequence; no proof was saved.`);
    await atomicJson(resolve(directory, `${tool}.asset.json`), asset);
    if (tool === 'lottie') {
      const job = resolve(directory, 'official-player-job.json');
      await atomicJson(job, {action: 'verify-player', toolsRoot: animationToolsRoot(), sourceDirectory: resolve(directory, 'animations', asset.id, '16x9'), browser: browserExecutable(), output: resolve(directory, 'lottie-official-player.png'), frame: sequence.frameCount - 1});
      await runLocalProcess(process.execPath, [resolve(applicationRoot, 'scripts/animation-tool-worker.mjs'), job]);
    }
    await atomicJson(resolve(animationToolsRoot(), `proofs/${tool}.json`), {version: ANIMATION_PINS[tool], mcp: ANIMATION_PINS.mcp, directory, verifiedAt: new Date().toISOString()});
    console.log(`Verified ${tool}: editable source reopened/exported in both orientations (${sequence.frameCount} frames).`);
  }
};
if (process.argv[1]?.endsWith('verify-animation-tools.ts') || process.argv[1]?.endsWith('verify-animation-tools.js')) {
  await verifyAnimationTools(process.argv.slice(2).map(value => animationToolSchema.parse(value)));
}
