import {mkdir, writeFile, readFile, mkdtemp, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {timedNarratedPlanSchema, subtitleAnimationClipSchema, type TimedNarratedPlan} from './types.js';
import {makeStoryMotionDraft, makeStoryMotionPreview} from './story-motion-fixtures.js';
import {renderNarratedVideo} from './narrated-render.js';
import {synthesizeNarration} from './narration-audio.js';
import {assertDraftNarrationDuration} from './narration-duration.js';
import {storyTimingWarnings} from './speech-alignment.js';
import {compileStoryMotion, chooseStorySpeechCues} from './story-motion.js';
import {RENDER_PROFILES} from './render-profile.js';
import {applicationRoot} from './animation-runtime.js';

const args = process.argv.slice(2).filter(arg => arg !== '--');
const output = resolve(args.find(arg => !arg.startsWith('--')) ?? '/tmp/story-motion-gallery');
const draft = makeStoryMotionDraft();
assertDraftNarrationDuration(draft);
await mkdir(output, {recursive: true});
await writeFile(resolve(output, 'story.narration-plan.json'), JSON.stringify(draft, null, 2));

const subtitleStills = async (plan: TimedNarratedPlan) => {
  const publicDir = await mkdtemp(resolve(tmpdir(), 'story-subtitles-'));
  try {
    const serveUrl = await bundle({
      entryPoint: resolve(applicationRoot, 'src/remotion/index.tsx'), publicDir,
      webpackOverride: config => ({...config, resolve: {...config.resolve, extensionAlias: {...config.resolve?.extensionAlias, '.js': ['.js', '.ts', '.tsx']}}}),
    });
    const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE ?? ['/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(existsSync);
    const common = {serveUrl, logLevel: 'warn' as const, ...(browserExecutable ? {browserExecutable} : {})};
    for (const profile of Object.values(RENDER_PROFILES)) for (const scene of plan.scenes) {
      const clip = subtitleAnimationClipSchema.parse({
        ...scene, startCue: 1, endCue: scene.beats.length,
        sourceStartMs: scene.startMs, sourceEndMs: scene.startMs + scene.durationMs,
        transcript: scene.beats.flatMap(beat => beat.phrases.map(phrase => phrase.text)).join(' '),
        captionCues: scene.beats.flatMap((beat,index) => beat.phrases.map(phrase => ({...phrase,cueIndex:index+1}))),
        primaryItemTimings: scene.primaryItemTimings.map(item => ({startMs:item.startMs,cueIndex:scene.beats.findIndex(beat=>beat.id===item.beatId)+1})),
        secondaryItemTimings: [],
      });
      for (const background of ['transparent', 'green'] as const) for (const captions of ['on', 'off'] as const) {
        const inputProps = {background,captions,sceneBackground:'off' as const,clip,profile,palette:'cyan' as const,fps:24,foregroundAssets:{},localBrandAssets:{},localIconAssets:{},motionAssets:{},technologyIcons:{}};
        const composition = await selectComposition({...common,id:'SubtitleClip',inputProps});
        await renderStill({...common,composition,inputProps,frame:Math.floor(scene.durationMs*.85/1000*24),output:resolve(output,`${scene.id}-${profile.aspectRatio.replace(':','x')}-${background}-captions-${captions}.png`),imageFormat:'png'});
      }
    }
    console.log('Rendered 24 subtitle stills across orientations, backgrounds and caption modes.');
  } finally {await rm(publicDir,{recursive:true,force:true});}
};

if (!args.includes('--plans-only')) {
  const previous = args.includes('--reuse-audio')
    ? timedNarratedPlanSchema.parse(JSON.parse(await readFile(resolve(output, 'story.narration-timed.json'), 'utf8')))
    : null;
  const script = (plan: Pick<typeof draft, 'scenes'>) => JSON.stringify(plan.scenes.map(scene => ({
    id: scene.id, beats: scene.beats.map(beat => ({id: beat.id, phrases: beat.phrases.map(phrase => ({id: phrase.id, text: phrase.text}))})),
  })));
  if (previous && script(previous) !== script(draft)) throw new Error('Fixture narration changed; regenerate audio with --audio.');
  const plan = previous
    ? timedNarratedPlanSchema.parse({...previous, scenes: previous.scenes.map((scene,index) => ({...scene,visual:draft.scenes[index]!.visual,title:draft.scenes[index]!.title}))})
    : args.includes('--audio')
      ? await synthesizeNarration({assetsDirectory:resolve('models/supertonic-3'),audioDirectoryName:'story.audio',draft,force:true,outputDirectory:output,speed:1.05,steps:5,voice:'M3'})
      : makeStoryMotionPreview();
  plan.planningWarnings = [
    ...(plan.planningWarnings ?? []).filter(warning => !plan.scenes.some(scene => warning.startsWith(`${scene.id}: `))),
    ...storyTimingWarnings(plan),
  ];
  await writeFile(resolve(output, 'story.narration-timed.json'), JSON.stringify(plan, null, 2));
  const scenes = plan.scenes.flatMap(scene => scene.visual.kind === 'story-motion' ? [{
    scene: scene.id,
    ...compileStoryMotion(scene.visual, chooseStorySpeechCues(scene.visual,scene.wordTimings,scene.beats.flatMap(beat=>beat.phrases)),scene.durationMs),
  }] : []);
  await writeFile(resolve(output, 'motion-review.json'), JSON.stringify({warnings:storyTimingWarnings(plan),scenes},null,2));
  if (args.includes('--subtitle-stills')) await subtitleStills(plan);
  else await renderNarratedVideo({
    aspectRatio:args.includes('--portrait')?'9:16':'both',captions:'on',force:true,fps:24,
    outputDirectory:output,plan,sceneBackground:'ambient',stem:'story',voiceoverBaseDirectory:output,
    stillsOnly:args.includes('--stills-only'),
  });
  console.log(`Story motion review: ${resolve(output, 'motion-review.json')}`);
}
console.log(`Validated benchmark plan: ${resolve(output, 'story.narration-plan.json')}`);
