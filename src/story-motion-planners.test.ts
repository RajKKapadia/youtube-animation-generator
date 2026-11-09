import {afterEach,describe,it,expect,vi} from 'vitest';
import {STORY_MOTION_FIXTURES} from './story-motion-fixtures.js';
import {planNarratedVideo} from './narration-planner.js';
import {planAnimations} from './planner.js';

const mocks=vi.hoisted(()=>({provider:'openai',create:vi.fn(),parse:vi.fn(),chat:vi.fn()}));
vi.mock('./ai-client.js',()=>({createAIClient:()=>({provider:mocks.provider,model:'fixture',client:{responses:{create:mocks.create,parse:mocks.parse},chat:{completions:{create:mocks.chat}}}}),withTransientRetries:(fn:()=>unknown)=>fn()}));
afterEach(()=>{mocks.create.mockReset();mocks.parse.mockReset();mocks.chat.mockReset();});
describe('story direction provider parity',()=>{
  it.each(['openai','gemini','groq'])('preserves an automatically authored motion graph from %s narration',async(provider)=>{
    mocks.provider=provider;const fixture=STORY_MOTION_FIXTURES[0]!;
    const response={title:'Request round trip',palette:'cyan',scenes:[fixture.scene]};
    mocks.create.mockResolvedValue({status:'completed',output:[],output_text:JSON.stringify(response)});
    mocks.chat.mockResolvedValue({choices:[{message:{content:JSON.stringify(response)}}]});
    const plan=await planNarratedVideo({model:'fixture',sourceText:fixture.source,language:'en',targetDurationSeconds:30,generatedVisuals:'off'});
    expect(plan.version).toBe(9);expect(plan.scenes[0]!.visual).toEqual(fixture.scene.visual);
    expect(plan.planningWarnings?.join()??'').not.toContain('fallback');
    if(provider!=='openai')expect(mocks.chat.mock.calls[0]![0].messages[0].content).toContain('"story-motion"');
  });
  it.each(['openai','gemini','groq'])('preserves choreography and source cue bounds from %s subtitles',async(provider)=>{
    mocks.provider=provider;const fixture=STORY_MOTION_FIXTURES[0]!,scene=fixture.scene;
    const response={palette:'cyan',animations:[{...scene,startCue:1,endCue:1,primaryItemStartCues:scene.primaryItems.map(()=>1),secondaryItemStartCues:[]}]};
    mocks.parse.mockResolvedValue({output_parsed:response});mocks.chat.mockResolvedValue({choices:[{message:{content:JSON.stringify(response)}}]});
    const plan=await planAnimations([{cueIndex:1,sourceIndex:'1',startMs:2000,endMs:18000,text:fixture.source}],{model:'fixture',sourceSubtitle:'fixture.srt',maxSuggestions:3});
    expect(plan.version).toBe(4);expect(plan.clips[0]!.visual.kind).toBe('story-motion');expect(plan.clips[0]!.sourceStartMs).toBe(2000);
    if(provider!=='openai')expect(mocks.chat.mock.calls[0]![0].messages[0].content).toContain('"story-motion"');
  });
});
