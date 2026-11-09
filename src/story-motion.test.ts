import {materializeAnimations} from './animation-tools.js';
import {describe,it,expect} from 'vitest';
import {zodTextFormat} from 'openai/helpers/zod';
import {compileStoryMotion,layoutStoryMotion,resolveStoryCue,storyStateAt,storyMotionStructureIssue,storyMotionGroundingIssue,storyMotionSchema,chooseStorySpeechCues,reviewStoryMotion} from './story-motion.js';
import {makeStoryMotionDraft,makeStoryMotionPreview,STORY_MOTION_FIXTURES} from './story-motion-fixtures.js';
import {draftNarratedPlanSchema,narratedPlanSchema,subtitleSavedPlanV4Schema,subtitleSavedPlanV3Schema} from './types.js';
import {narrationResponseShapeFor} from './narration-planner.js';
import {materializeSubtitleVisualPlan} from './planner.js';

const motion=()=>structuredClone(STORY_MOTION_FIXTURES[0]!.scene.visual);
const cues=()=>makeStoryMotionPreview().scenes[0]!.beats.flatMap(beat=>beat.phrases);
describe('story-driven choreography',()=>{
  it('preserves source-backed graphs through saved draft and timed plans',()=>{
    const draft=makeStoryMotionDraft(),timed=makeStoryMotionPreview();
    expect(narratedPlanSchema.parse(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(narratedPlanSchema.parse(JSON.parse(JSON.stringify(timed)))).toEqual(timed);
    expect(()=>draftNarratedPlanSchema.parse({...draft,version:8})).toThrow('version 9');
    for(const fixture of STORY_MOTION_FIXTURES)expect(storyMotionGroundingIssue(fixture.scene.visual,fixture.source)).toBeNull();
  });
  it('resolves repeated phrases and spans across actual word cues',()=>{
    const words=[{text:'The',startMs:100,durationMs:100},{text:'client',startMs:200,durationMs:200},{text:'waits.',startMs:500,durationMs:200},{text:'The',startMs:4000,durationMs:100},{text:'client',startMs:4100,durationMs:200}].map(cue=>({...cue,provenance:'word' as const}));
    expect(resolveStoryCue({text:'The client',occurrence:1,edge:'start'},words)).toEqual({startMs:4000,endMs:4300,provenance:'word'});
    expect(()=>resolveStoryCue({text:'clients',occurrence:0,edge:'start'},words)).toThrow('absent');
  });
  it('retimes arrivals from speech rather than stretching the whole scene',()=>{
    const scene=makeStoryMotionPreview().scenes[0]!;
    const first=compileStoryMotion(motion(),cues(),scene.durationMs);
    const delayed=cues().map((cue,index)=>({...cue,startMs:cue.startMs+(index>0?10000:0)}));
    const second=compileStoryMotion(motion(),delayed,scene.durationMs+10000);
    expect(second.actions.find(item=>item.action.id==='return-response')!.endMs-first.actions.find(item=>item.action.id==='return-response')!.endMs).toBe(10000);
    expect(second.actions.find(item=>item.action.id==='send-request')!.endMs).toBe(first.actions.find(item=>item.action.id==='send-request')!.endMs);
  });
  it('evaluates repeated actions and backward seeks without mutable state',()=>{
    const scene=makeStoryMotionPreview().scenes[2]!;if(scene.visual.kind!=='story-motion')throw new Error();
    const timeline=compileStoryMotion(scene.visual,scene.beats.flatMap(beat=>beat.phrases),scene.durationMs),layout=layoutStoryMotion(scene.visual,936,1200);
    const early=storyStateAt(scene.visual,timeline,layout,1600);
    const final=storyStateAt(scene.visual,timeline,layout,scene.durationMs);
    expect(final.objects.measurement!.state).toBe('visible');
    expect(storyStateAt(scene.visual,timeline,layout,1600)).toEqual(early);
    expect(final.objects.measurement!.position).not.toEqual(early.objects.measurement!.position);
  });
  it('rejects missing identities, cycles, unsupported states and evidence',()=>{
    const missing=motion();missing.actions[0]!.target='missing';expect(storyMotionStructureIssue(missing)).toContain('client');
    const cycle=motion();cycle.actions[0]!.after=cycle.actions[1]!.id;cycle.actions[1]!.after=cycle.actions[0]!.id;expect(storyMotionStructureIssue(cycle)).toContain('cycle');
    const state=motion();const last=state.actions.at(-1)!;if(last.kind!=='state')throw new Error();last.state='invented';expect(storyMotionStructureIssue(state)).toContain('undeclared state');
    expect(storyMotionGroundingIssue(motion(),'Different story.')).toContain('evidence');
  });
  it('rejects concurrent writes and use before introduction',()=>{
    const conflict=motion();conflict.actions.push({...conflict.actions[0]!,id:'retire-client',kind:'retire'});expect(()=>compileStoryMotion(conflict,cues(),15000)).toThrow('Conflicting');
    const before=motion();before.actions.find(action=>action.id==='show-server')!.cue.text='ready';expect(()=>compileStoryMotion(before,cues(),15000)).toThrow(/before its introduction|no time/);
  });
  it('records estimated timing and uses aligned words only when all anchors match confidently',()=>{
    const scene=makeStoryMotionPreview().scenes[0]!;
    expect(compileStoryMotion(motion(),cues(),scene.durationMs).warnings.join()).toContain('estimated');
    expect(chooseStorySpeechCues(motion(),[{text:'wrong',startMs:0,durationMs:100,probability:1}],cues())[0]!.provenance).toBe('estimate');
  });
  it('reviews intermediate layout states and reports a displaced object',()=>{
    for(const scene of makeStoryMotionPreview().scenes){
      if(scene.visual.kind!=='story-motion')throw new Error();
      const timeline=compileStoryMotion(scene.visual,scene.beats.flatMap(beat=>beat.phrases),scene.durationMs);
      for(const [width,height]of [[936,1290],[1740,672]]){
        const layout=layoutStoryMotion(scene.visual,width!,height!);
        expect(reviewStoryMotion(scene.visual,timeline,layout)).toEqual([]);
        layout.positions[scene.visual.objects[0]!.id]={x:-100,y:100};
        expect(reviewStoryMotion(scene.visual,timeline,layout).some(finding=>finding.kind==='bounds')).toBe(true);
      }
    }
  });
  it('rejects simultaneous connection writes and implicit visibility cycles',()=>{
    const conflict=motion(),connect=conflict.actions.find(action=>action.kind==='connect')!;
    conflict.actions.push({...connect,id:'erase-connection',kind:'disconnect'});
    expect(()=>compileStoryMotion(conflict,cues(),15000)).toThrow('Conflicting');
    const cycle=motion();cycle.actions.find(action=>action.id==='show-server')!.after='connect-outbound';
    expect(()=>compileStoryMotion(cycle,cues(),15000)).toThrow('cyclic');
  });
  it('keeps choreography in the built-in compositor and rejects a lossy forced adapter before execution',async()=>{
    const plan=makeStoryMotionPreview();
    const options={projectDirectory:'/tmp/story-adapter-test',aspectRatio:'both' as const,fps:24,tools:['hyperframes' as const],overrides:{},author:false};
    const result=await materializeAnimations(plan,options);
    expect(result.animationAssets).toEqual([]);expect(result.planningWarnings?.join()).toContain('retained built-in');
    await expect(materializeAnimations(plan,{...options,overrides:{'request-return':'hyperframes'}})).rejects.toThrow('cannot preserve');
  });
  it('offers choreography to both provider shapes without OpenAI strict defaults',()=>{
    const schema=zodTextFormat(storyMotionSchema,'story').schema;
    expect(JSON.stringify(schema)).not.toContain('"default":');
    expect(narrationResponseShapeFor({generatedVisuals:'off',hasCodeSources:false,hasLocalImages:false,sourceHasNumbers:false})).toContain('"story-motion"');
  });
  it('materializes the same graph in subtitle plans and requires v4 replay',async()=>{
    const fixture=STORY_MOTION_FIXTURES[0]!,scene=fixture.scene;
    const cue={cueIndex:1,sourceIndex:'1',startMs:0,endMs:16000,text:fixture.source};
    const plan=await materializeSubtitleVisualPlan({cues:[cue],sourceSubtitle:'story.srt',model:'offline',palette:'cyan',generatedVisuals:'off',localImages:[],warnings:[],suggestions:[{...scene,startCue:1,endCue:1,primaryItemStartCues:scene.primaryItems.map(()=>1),secondaryItemStartCues:[]}]});
    expect(plan.version).toBe(4);expect(plan.clips[0]!.visual.kind).toBe('story-motion');
    expect(subtitleSavedPlanV4Schema.parse(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    expect(()=>subtitleSavedPlanV3Schema.parse({...plan,version:3})).toThrow('version 4');
  });
});
