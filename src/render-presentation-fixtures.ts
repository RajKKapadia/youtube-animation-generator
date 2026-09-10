import {existsSync} from 'node:fs';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {makeExplainerTimedPlan} from './explainer-fixtures.js';
import {directScenes} from './presentation.js';
import {selectCoverDirection} from './cover-direction.js';
import {RENDER_PROFILES} from './render-profile.js';
import {PUBLISH_COVER_PROFILES} from './publish-profile.js';
import {narratedPublishPlanSchema, publishSceneSchema, subtitleAnimationClipSchema, timedNarratedPlanSchema} from './types.js';
import {writePcm16Wav} from './supertonic/wav.js';

const output = resolve(process.argv.find((arg) => arg.startsWith('--output='))?.slice(9) ?? '/tmp/youtube-presentation-preview');
const stillsOnly = process.argv.includes('--stills-only');
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE ?? ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);

const main = async () => {
  await mkdir(output, {recursive: true});
  const publicDir = await mkdtemp(resolve(tmpdir(), 'presentation-preview-'));
  try {
    const original = await makeExplainerTimedPlan();
    // Reuse the verified text/timing fixture to exercise a focal composition.
    original.scenes[3] = {...original.scenes[0]!, id: 'focal-concept', startMs: 18000, visual: {kind: 'icon-spotlight', motion: 'reveal', motif: 'analytics', assetId: null}, icons: {focal: 'monitoring', primary: [null, null, null, null], secondary: []}};
    const plan = timedNarratedPlanSchema.parse({...original, scenes: directScenes(original.scenes, true)});
    await writeFile(resolve(output, 'preview.narration-timed.json'), JSON.stringify(plan, null, 2));
    await writePcm16Wav(resolve(publicDir, 'fixture.wav'), new Float32Array(36 * 24000), 24000);
    await writePcm16Wav(resolve(output, 'fixture.wav'), new Float32Array(36 * 24000), 24000);
    const serveUrl = await bundle({entryPoint: resolve('src/remotion/index.tsx'), publicDir, webpackOverride: (config) => ({...config, resolve: {...config.resolve, extensionAlias: {...config.resolve?.extensionAlias, '.js': ['.js', '.ts', '.tsx']}}})});
    const common = {serveUrl, ...(browserExecutable ? {browserExecutable} : {}), logLevel: 'warn' as const};
    const assets = {foregroundAssets: {}, localBrandAssets: {}, localIconAssets: {}, motionAssets: {}, technologyIcons: {}};
    const savedPublish = narratedPublishPlanSchema.parse({...JSON.parse(await readFile('fixtures/sample.publish.json', 'utf8')), sourcePlan: 'preview.narration-timed.json'});
    const images: string[] = [];
    for (const profile of [RENDER_PROFILES['9:16'], RENDER_PROFILES['16:9']]) {
      const aspect = profile.aspectRatio.replace(':', 'x');
      const props = {...assets, plan, profile, audioFile: 'fixture.wav', backgroundAssets: {}, captions: 'on' as const, sceneBackground: 'ambient' as const, fps: 30};
      const narrated = await selectComposition({...common, id: 'NarratedVideo', inputProps: props});
      for (const [index, scene] of plan.scenes.entries()) {
        const clip = subtitleAnimationClipSchema.parse({...scene, startCue: 1, endCue: 1, sourceStartMs: 0, sourceEndMs: scene.durationMs, transcript: plan.sourceText, captionCues: [], primaryItemTimings: scene.primaryItemTimings.map(({startMs}) => ({startMs, cueIndex: 1})), secondaryItemTimings: scene.secondaryItemTimings.map(({startMs}) => ({startMs, cueIndex: 1}))});
        const subProps = {...assets, clip, profile, fps: 30, palette: plan.palette, captions: 'off' as const, sceneBackground: 'off' as const, background: 'green' as const};
        const sub = await selectComposition({...common, id: 'SubtitleClip', inputProps: subProps});
        for (const [phase, frame] of [['opening', 6], ['early', 26], ['middle', 90], ['complete', 160]] as const) {
          const file = `${scene.presentation!.composition}-${index}-${aspect}-${phase}.png`;
          await renderStill({...common, composition: narrated, inputProps: props, frame: index * 180 + frame, output: resolve(output, file), imageFormat: 'png'});
          images.push(file);
        }
        const subFile = `subtitle-${index}-${aspect}.png`;
        await renderStill({...common, composition: sub, inputProps: subProps, frame: 90, output: resolve(output, subFile), imageFormat: 'png'});
        images.push(subFile);
        const coverScene = publishSceneSchema.parse(scene);
        const headline = ['Make Each Idea Count', 'A Clearer Workflow', 'Read One Step', 'Verify The Result', 'Build Layer By Layer', 'Throughput Over Time'][index]!;
        const publish = {...savedPublish, thumbnail: {...savedPublish.thumbnail, sceneId: scene.id, headline, ...selectCoverDirection(coverScene, headline)}};
        await writeFile(resolve(output, `cover-${index}.publish.json`), JSON.stringify(publish, null, 2));
        for (const mode of ['legacy', 'directed'] as const) {
          const coverProps = {...assets, publish: mode === 'directed' ? publish : {...savedPublish, thumbnail: {...savedPublish.thumbnail, headline, sceneId: scene.id}}, scene: coverScene, profile: PUBLISH_COVER_PROFILES[profile.aspectRatio]};
          const composition = await selectComposition({...common, id: 'NarratedThumbnail', inputProps: coverProps});
          const file = `cover-${index}-${aspect}-${mode}.png`;
          await renderStill({...common, composition, inputProps: coverProps, frame: 0, output: resolve(output, file), imageFormat: 'png'});
          images.push(file);
        }
        if (!stillsOnly && index === 0) await renderMedia({...common, composition: sub, inputProps: subProps, outputLocation: resolve(output, `subtitle-${aspect}.mp4`), codec: 'h264', muted: true, concurrency: 2});
      }
      if (!stillsOnly) await renderMedia({...common, composition: narrated, inputProps: props, outputLocation: resolve(output, `narrated-${aspect}.mp4`), codec: 'h264', crf: 23, concurrency: 2});
      const stressScene = {...plan.scenes[0]!, title: 'A longer title that still leaves room for a readable explanation',
        primaryItems: ['Preserve every important qualification in the selected source material', 'Show related information together when it shares the same speech cue', 'Keep the supporting explanation readable on a small mobile screen', 'Use consistent labels throughout the explanation and the final takeaway', 'Avoid hiding content before its associated spoken sentence has finished', 'Retain the relationships needed to understand the original process'],
        visual: {kind: 'diagram' as const, motion: 'reveal' as const, motif: 'none' as const, assetId: null},
        primaryItemTimings: Array.from({length: 6}, () => ({startMs: 400, cueIndex: 1})), secondaryItemTimings: [],
        presentation: {composition: 'statement' as const, reveal: 'focus' as const},
        startCue: 1, endCue: 1, sourceStartMs: 0, sourceEndMs: 6000, transcript: 'Layout stress fixture', captionCues: []};
      const stressProps = {...assets, clip: stressScene, profile, fps: 30, palette: plan.palette, captions: 'off' as const, sceneBackground: 'ambient' as const, background: 'transparent' as const};
      const stress = await selectComposition({...common, id: 'SubtitleClip', inputProps: stressProps});
      const stressFile = `stress-six-same-cue-${aspect}.png`;
      await renderStill({...common, composition: stress, inputProps: stressProps, frame: 90, output: resolve(output, stressFile), imageFormat: 'png'});
      images.push(stressFile);
      const comparisonStress = {...stressProps, clip: {...stressScene, template: 'comparison' as const,
        leftLabel: 'Source-supported first side', rightLabel: 'Source-supported second side',
        secondaryItems: stressScene.primaryItems, secondaryItemTimings: stressScene.primaryItemTimings,
        presentation: {composition: 'comparison' as const, reveal: 'focus' as const}}};
      const comparisonStressComposition = await selectComposition({...common, id: 'SubtitleClip', inputProps: comparisonStress});
      const comparisonStressFile = `stress-comparison-${aspect}.png`;
      await renderStill({...common, composition: comparisonStressComposition, inputProps: comparisonStress, frame: 90, output: resolve(output, comparisonStressFile), imageFormat: 'png'});
      images.push(comparisonStressFile);
      const agentItems = ['Search', 'API', 'Database', 'Document', 'Message', 'Security'];
      const agentProps = {...stressProps, clip: {...stressScene, title: 'One agent connects six tools',
        primaryItems: agentItems,
        icons: {focal: 'ai-agent' as const, primary: agentItems.map(() => null), secondary: []},
        visual: {kind: 'agent-workflow' as const, motion: 'orbit' as const, motif: 'ai-agent' as const, assetId: null},
        presentation: {composition: 'process' as const, reveal: 'build' as const}}};
      const agentComposition = await selectComposition({...common, id: 'SubtitleClip', inputProps: agentProps});
      for (const [phase, frame] of [['opening', 6], ['complete', 90]] as const) {
        const agentFile = `stress-agent-six-tools-${aspect}-${phase}.png`;
        await renderStill({...common, composition: agentComposition, inputProps: agentProps, frame, output: resolve(output, agentFile), imageFormat: 'png'});
        images.push(agentFile);
      }
      const comparison = publishSceneSchema.parse(plan.scenes[1]);
      const longHeadline = 'Reliable Systems Keep Important Background Work Moving';
      const coverProps = {...assets, scene: {...comparison, leftLabel: 'Independent request processing', rightLabel: 'Durable background processing', primaryItems: [stressScene.primaryItems[0]!], secondaryItems: [stressScene.primaryItems[1]!]},
        profile: PUBLISH_COVER_PROFILES[profile.aspectRatio], publish: {...savedPublish, thumbnail: {...savedPublish.thumbnail, headline: longHeadline, sceneId: comparison.id, composition: 'comparison' as const, primaryItemIndices: [0], secondaryItemIndices: [0]}}};
      const cover = await selectComposition({...common, id: 'NarratedThumbnail', inputProps: coverProps});
      const coverFile = `stress-cover-${aspect}.png`;
      await renderStill({...common, composition: cover, inputProps: coverProps, frame: 0, output: resolve(output, coverFile), imageFormat: 'png'});
      images.push(coverFile);
      console.log(`Completed presentation previews: ${aspect}`);
    }
    await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Shorts presentation previews</title><style>body{font:16px system-ui;background:#101827;color:#eef5ff;margin:32px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}figure{margin:0}img,video{width:100%;max-height:600px;object-fit:contain}figcaption{font-size:13px;margin:12px 0}a{color:#7dd3fc}</style><h1>One idea, distinct compositions</h1><p>Six fixtures across five composition families. Legacy and directed covers are paired. Narrated fixture videos use a silent timing track; subtitle exports have no audio.</p>${existsSync(resolve(output, 'narrated-9x16.mp4')) ? ['9x16','16x9'].map((aspect) => `<video controls src="narrated-${aspect}.mp4"></video>`).join('') : ''}<section>${images.map((file) => `<figure><a href="${file}"><img loading="lazy" src="${file}"></a><figcaption>${file}</figcaption></figure>`).join('')}</section></html>`);
    console.log(`Gallery: ${resolve(output, 'index.html')}`);
  } finally {await rm(publicDir, {recursive: true, force: true});}
};
main().catch((error: unknown) => {console.error(error); process.exitCode = 1;});
