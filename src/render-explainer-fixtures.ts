import {existsSync} from 'node:fs';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {EXPLAINER_FIXTURES, makeExplainerDraft, makeExplainerTimedPlan} from './explainer-fixtures.js';
import {RENDER_PROFILES} from './render-profile.js';
import {subtitleAnimationClipSchema, subtitleSavedPlanV3Schema} from './types.js';
import {codeHash} from './local-code.js';
import {writePcm16Wav} from './supertonic/wav.js';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const output = resolve(args.find((arg) => !arg.startsWith('--')) ?? '/tmp/youtube-animation-explainer-gallery');
const stillsOnly = args.includes('--stills-only');
const stressOnly = args.includes('--stress-only');
const here = dirname(fileURLToPath(import.meta.url));
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE ?? ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);

const main = async () => {
  await mkdir(output, {recursive: true});
  const publicDir = await mkdtemp(resolve(tmpdir(), 'explainer-fixture-'));
  try {
    const plan = await makeExplainerTimedPlan();
    const clips = plan.scenes.map((scene, index) => subtitleAnimationClipSchema.parse({
      ...scene, sourceStartMs: scene.startMs, sourceEndMs: scene.startMs + scene.durationMs,
      startCue: 1, endCue: scene.beats.length, transcript: EXPLAINER_FIXTURES[index]!.sourceText,
      captionCues: scene.beats.map((beat, cueIndex) => ({cueIndex: cueIndex + 1, startMs: beat.startMs, durationMs: beat.durationMs, text: beat.phrases.map(({text}) => text).join(' ')})),
      primaryItemTimings: scene.primaryItemTimings.map(({startMs, beatId}) => ({startMs, cueIndex: scene.beats.findIndex(({id}) => id === beatId) + 1})),
      secondaryItemTimings: scene.secondaryItemTimings.map(({startMs, beatId}) => ({startMs, cueIndex: scene.beats.findIndex(({id}) => id === beatId) + 1})),
    }));
    await writeFile(resolve(output, 'explainer.narration-plan.json'), JSON.stringify(await makeExplainerDraft(), null, 2));
    await writeFile(resolve(output, 'explainer.narration-timed.json'), JSON.stringify(plan, null, 2));
    await writeFile(resolve(output, 'explainer.animation-plan.json'), JSON.stringify(subtitleSavedPlanV3Schema.parse({version: 3, sourceSubtitle: 'explainer.srt', generatedAt: plan.generatedAt, model: 'offline-fixture', palette: 'cyan', clips}), null, 2));
    // A silent track tests narrated audio muxing without purchasing synthesis.
    await writePcm16Wav(resolve(publicDir, 'fixture.wav'), new Float32Array(36 * 24000), 24000);
    await writePcm16Wav(resolve(output, 'fixture.wav'), new Float32Array(36 * 24000), 24000);
    await writeFile(resolve(publicDir, 'backdrop.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1920"><rect width="1920" height="1920" fill="#172554"/><circle cx="1450" cy="300" r="600" fill="#312e81"/></svg>');
    const entryPoint = resolve(here, existsSync(resolve(here, 'remotion/index.js')) ? 'remotion/index.js' : 'remotion/index.tsx');
    const serveUrl = await bundle({entryPoint, publicDir, webpackOverride: (config) => ({...config, resolve: {...config.resolve, extensionAlias: {...config.resolve?.extensionAlias, '.js': ['.js', '.ts', '.tsx']}}})});
    const common = {serveUrl, ...(browserExecutable ? {browserExecutable} : {}), logLevel: 'warn' as const};
    const emptyAssets = {foregroundAssets: {}, localBrandAssets: {}, localIconAssets: {}, motionAssets: {}, technologyIcons: {}};
    if (stressOnly) {
      const codeClip = structuredClone(clips[2]!);
      if (codeClip.visual.kind !== 'code-walkthrough') throw new Error('Code fixture missing.');
      const code = ['def greet(name):', "    # Preserve spelling while trimming surrounding spaces.", '    clean_name = name.strip()', '    if not clean_name:', '        clean_name = "friend"', '', '    prefix = "Hello"', '    message = f"{prefix}, {clean_name}"', '    # Return the completed greeting to the caller.', '    result = message', '', '    return result'].join('\n');
      codeClip.visual.endLine = 12;
      codeClip.visual.highlights = [{primaryItemIndex: 0, startLine: 1, endLine: 5}, {primaryItemIndex: 1, startLine: 7, endLine: 10}, {primaryItemIndex: 2, startLine: 12, endLine: 12}];
      codeClip.visual.excerpt = {...codeClip.visual.excerpt, text: code, originalName: 'twelve-lines.py', sourceHash: codeHash(code), snippetHash: codeHash(code)};
      const sequenceClip = structuredClone(clips[3]!);
      if (sequenceClip.visual.kind !== 'sequence-diagram') throw new Error('Sequence fixture missing.');
      sequenceClip.visual.participants = ['Client', 'API', 'Cache', 'Database'].map((label) => ({id: label.toLowerCase(), label}));
      sequenceClip.primaryItems = ['Validate authentication and request parameters', 'Look for an existing cached response', 'Report that the cache contains no matching entry', 'Read the current records from persistent storage', 'Return the matching records to the application', 'Deliver the completed response to the caller'];
      sequenceClip.visual.messages = [['client', 'api'], ['api', 'cache'], ['cache', 'api'], ['api', 'database'], ['database', 'api'], ['api', 'client']].map(([from, to], index) => ({from: from!, to: to!, primaryItemIndex: index, sourceEvidence: `${sequenceClip.visual.kind === 'sequence-diagram' ? sequenceClip.visual.participants.find(({id}) => id === from)!.label : ''} sends ${sequenceClip.primaryItems[index]} to ${sequenceClip.visual.kind === 'sequence-diagram' ? sequenceClip.visual.participants.find(({id}) => id === to)!.label : ''}.`}));
      sequenceClip.transcript = sequenceClip.visual.messages.map(({sourceEvidence}) => sourceEvidence).join(' ');
      sequenceClip.icons = {focal: null, primary: [], secondary: []};
      sequenceClip.primaryItemTimings = sequenceClip.primaryItems.map(() => ({cueIndex: 1, startMs: 400}));
      const chartClip = structuredClone(clips[5]!);
      if (chartClip.visual.kind !== 'data-visualization' || chartClip.visual.chart.type !== 'line-chart') throw new Error('Chart fixture missing.');
      chartClip.visual.chart.data = [1, 1.01, 1.02, 100].flatMap((x, index) => [
        {id: `x-${index}`, label: String(x), value: x, unit: 'seconds', precision: 2, sourceToken: String(x), sourceEvidence: `At ${x} seconds, Throughput was -5 requests/s.`},
        {id: `y-${index}`, label: 'Throughput', value: -5, unit: 'requests/s', precision: 0, sourceToken: '-5', sourceEvidence: `At ${x} seconds, Throughput was -5 requests/s.`},
      ]);
      chartClip.transcript = chartClip.visual.chart.data.map(({sourceEvidence}) => sourceEvidence).join(' ');
      for (const profile of Object.values(RENDER_PROFILES)) {
        for (const clip of [codeClip, sequenceClip, chartClip]) {
          subtitleAnimationClipSchema.parse(clip);
          const inputProps = {...emptyAssets, background: 'transparent' as const, captions: 'on' as const, sceneBackground: 'ambient' as const, fps: 30, clip, palette: 'cyan' as const, profile};
          const composition = await selectComposition({...common, id: 'SubtitleClip', inputProps});
          for (const [phase, frame] of [['early', 24], ['middle', 60], ['complete', 164]] as const) await renderStill({...common, composition, inputProps, frame, output: resolve(output, `stress-${clip.id}-${profile.aspectRatio.replace(':', 'x')}-${phase}.png`), imageFormat: 'png'});
        }
      }
      console.log('Rendered 18 stress stills: 12-line code, four participants sharing a cue, and clustered x values with constant negative y.');
      return;
    }
    const gallery: Array<{id: string; aspect: string; images: string[]}> = [];
    for (const profile of Object.values(RENDER_PROFILES)) {
      const aspect = profile.aspectRatio.replace(':', 'x');
      const narratedProps = {...emptyAssets, audioFile: 'fixture.wav', backgroundAssets: {}, captions: 'on' as const, sceneBackground: 'ambient' as const, fps: 30, plan, profile};
      const narrated = await selectComposition({...common, id: 'NarratedVideo', inputProps: narratedProps});
      for (const [index, clip] of clips.entries()) {
        const inputProps = {...emptyAssets, background: 'transparent' as const, captions: 'on' as const, sceneBackground: 'ambient' as const, fps: 30, clip, palette: 'cyan' as const, profile};
        const composition = await selectComposition({...common, id: 'SubtitleClip', inputProps});
        const images: string[] = [];
        for (const [phase, frame] of [['early', 24], ['middle', 92], ['complete', 164]] as const) {
          for (const workflow of ['subtitle', 'narrated'] as const) {
            const file = `${clip.id}-${aspect}-${workflow}-${phase}.png`;
            await renderStill({...common, composition: workflow === 'subtitle' ? composition : narrated, inputProps: workflow === 'subtitle' ? inputProps : narratedProps, frame: workflow === 'subtitle' ? frame : index * 180 + frame, output: resolve(output, file), imageFormat: 'png'});
            images.push(file);
          }
        }
        for (const mode of ['green', 'transparent', 'generated'] as const) {
          const file = `${clip.id}-${aspect}-${mode}.png`;
          const props = {...inputProps, background: mode === 'green' ? 'green' as const : 'transparent' as const, captions: mode === 'generated' ? 'on' as const : 'off' as const, sceneBackground: mode === 'generated' ? 'generated' as const : 'off' as const, ...(mode === 'generated' ? {backgroundAsset: 'backdrop.svg'} : {})};
          await renderStill({...common, composition, inputProps: props, frame: 164, output: resolve(output, file), imageFormat: 'png'});
          images.push(file);
        }
        if (!stillsOnly) {
          const greenProps = {...inputProps, background: 'green' as const, captions: 'off' as const, sceneBackground: 'off' as const};
          await renderMedia({...common, composition, inputProps: greenProps, muted: true, outputLocation: resolve(output, `${clip.id}-${aspect}-subtitle.mp4`), codec: 'h264', crf: 23, concurrency: 2});
        }
        gallery.push({id: clip.id, aspect, images});
        console.log(`Rendered fixture: ${clip.id} ${profile.aspectRatio}`);
      }
      if (!stillsOnly) {
        await renderMedia({...common, composition: narrated, inputProps: narratedProps, outputLocation: resolve(output, `all-six-${aspect}-narrated.mp4`), codec: 'h264', crf: 23, concurrency: 2});
        const clip = clips[1]!;
        const inputProps = {...emptyAssets, background: 'transparent' as const, captions: 'off' as const, sceneBackground: 'off' as const, fps: 30, clip, palette: 'cyan' as const, profile};
        const composition = await selectComposition({...common, id: 'SubtitleClip', inputProps});
        await renderMedia({...common, composition, inputProps, outputLocation: resolve(output, `before-after-${aspect}-alpha.webm`), muted: true, codec: 'vp8', pixelFormat: 'yuva420p', imageFormat: 'png', concurrency: 2});
      }
    }
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Explainer animation gallery</title><style>body{background:#0b1220;color:#eef5ff;font:16px system-ui;margin:36px}h1{font-size:38px}section{margin:48px 0}article{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}img,video{width:100%;max-height:520px;object-fit:contain;background:#283445;border-radius:8px}a{color:#79d5ff}figure{margin:0}figcaption{font-size:13px;margin:8px 0}p{max-width:900px;line-height:1.6}</style><h1>Six ways to explain an idea</h1><p>Native 16:9 and 9:16. Each treatment includes early, middle, and completed states in both workflows, green and transparent overlays, and a supplied background fixture. Narrated preview videos use a silent timing track; subtitle exports contain no audio.</p>${!stillsOnly ? ['16x9', '9x16'].map((aspect) => `<section><h2>All six · ${aspect}</h2><video controls preload="metadata" src="all-six-${aspect}-narrated.mp4"></video></section>`).join('') : ''}${gallery.map(({id, aspect, images}) => `<section><h2>${id} · ${aspect}</h2>${!stillsOnly ? `<p><a href="${id}-${aspect}-subtitle.mp4">Audio-free green overlay</a></p>` : ''}<article>${images.map((file) => `<figure><a href="${file}"><img loading="lazy" src="${file}"></a><figcaption>${file}</figcaption></figure>`).join('')}</article></section>`).join('')}</html>`;
    await writeFile(resolve(output, 'index.html'), html);
    console.log(`Gallery: ${resolve(output, 'index.html')}`);
  } finally {await rm(publicDir, {recursive: true, force: true});}
};

main().catch((error: unknown) => {console.error(error instanceof Error ? error.message : error); process.exitCode = 1;});
