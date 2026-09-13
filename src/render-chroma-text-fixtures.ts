import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {makeExplainerTimedPlan} from './explainer-fixtures.js';
import {RENDER_PROFILES} from './render-profile.js';
import {subtitleAnimationClipSchema} from './types.js';

// Local, key-free regression samples for both subtitle renderer generations.
const output = resolve(process.argv.find((arg) => arg.startsWith('--output='))?.slice(9) ?? '/tmp/chroma-text-fixtures');
await mkdir(output, {recursive: true});
const plan = await makeExplainerTimedPlan();
const base = plan.scenes[0]!;
const scenes = [
  {...base, id: 'legacy', presentation: undefined, template: 'process-flow', title: 'Keep every label readable', primaryItems: ['Client', 'API', 'Queue', 'Worker'], visual: {kind: 'diagram', motion: 'reveal', motif: 'none', assetId: null}},
  {...base, id: 'directed', presentation: {composition: 'statement', reveal: 'build'}},
  {...plan.scenes[2]!, id: 'code', presentation: undefined},
];
const serveUrl = await bundle({entryPoint: resolve('src/remotion/index.tsx'), webpackOverride: (config) => ({...config, resolve: {...config.resolve, extensionAlias: {...config.resolve?.extensionAlias, '.js': ['.js', '.ts', '.tsx']}}})});
const common = {serveUrl, browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome-stable', logLevel: 'warn' as const};
for (const profile of [RENDER_PROFILES['16:9'], RENDER_PROFILES['9:16']]) {
  for (const scene of scenes) {
    const clip = subtitleAnimationClipSchema.parse({...scene, startCue: 1, endCue: 1, sourceStartMs: 0, sourceEndMs: scene.durationMs, transcript: plan.sourceText, captionCues: [], primaryItemTimings: scene.primaryItems.map((_, i) => ({startMs: 400 + i * 900, cueIndex: 1})), secondaryItemTimings: []});
    for (const background of ['green', 'dark'] as const) {
      const inputProps = {clip, profile, background, fps: 30, palette: 'emerald' as const, captions: 'off' as const, sceneBackground: 'off' as const, foregroundAssets: {}, localBrandAssets: {}, localIconAssets: {}, motionAssets: {}, technologyIcons: {}};
      const composition = await selectComposition({...common, id: 'SubtitleClip', inputProps});
      const stem = `${scene.id}-${profile.aspectRatio.replace(':', 'x')}-${background}`;
      for (const frame of [16, 120]) {
        await renderStill({...common, composition, inputProps, frame, output: resolve(output, `${stem}-${frame}.png`), imageFormat: 'png'});
      }
      if (process.argv.includes('--video') && background === 'green' && scene.id === 'directed') {
        await renderMedia({...common, composition, inputProps, outputLocation: resolve(output, `${stem}.mp4`), codec: 'h264', muted: true, concurrency: 2});
      }
    }
  }
}
console.log(`Chroma text fixtures: ${output}`);
