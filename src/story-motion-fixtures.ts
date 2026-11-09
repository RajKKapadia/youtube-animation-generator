import {storyMotionSchema, type StoryMotion, type StoryAction} from './story-motion.js';
import {draftNarratedPlanSchema} from './types.js';
import {estimateDraftNarrationTiming} from './narration-planner.js';

// Benchmark content only. No runtime module imports these stories.
const scene = (id:string,title:string,sentences:string[],objects:unknown[],relations:unknown[],actions:unknown[]) => {
  const source=sentences.join(' ');
  const visual=storyMotionSchema.parse({kind:'story-motion',objects:objects.map(object=>({...object as object,sourceEvidence:source})),relations:relations.map(relation=>({...relation as object,sourceEvidence:source})),actions:actions.map(action=>({...action as object,sourceEvidence:source}))});
  const subjects=visual.objects.filter(object=>object.role==='subject');
  return {source,scene:{id,title,template:'callout' as const,primaryItems:subjects.map(object=>object.label),secondaryItems:[],leftLabel:'',rightLabel:'',reason:'Explain source-backed changes using persistent objects and voice cues.',backgroundPrompt:'Quiet low-detail atmosphere.',icons:{focal:null,primary:subjects.map(()=>null),secondary:[]},visual:{...visual,assetId:null},beats:sentences.map((text,index)=>({id:`${id}-${index}`,expression:'none' as const,phrases:[{id:`${id}-phrase-${index}`,text}],primaryItemIndices:subjects.flatMap((object,item)=>sentences.findIndex(sentence=>sentence.includes(object.label))===index?[item]:[]),secondaryItemIndices:[]}))}};
};
const action = (id:string,kind:StoryAction['kind'],target:string,text:string,extra:{sync?:string;[key:string]:unknown}={}) => ({id,kind,target,cue:{text,edge:extra.sync==='finish'?'end':'start'},pace:'quick',...extra});

export const STORY_MOTION_FIXTURES = [
  scene('request-return','A request makes a round trip',[
    'The client sends a request to the server.',
    'The server returns a response to the client.',
    'The client keeps the response ready.',
  ],[
    {id:'client',label:'client',icon:'user',states:[{id:'ready',label:'ready',tone:'positive'}]},
    {id:'server',label:'server',icon:'server'},
    {id:'request',label:'request',role:'payload',icon:'document'},
    {id:'response',label:'response',role:'payload',icon:'document'},
  ],[
    {id:'outbound',from:'client',to:'server',label:'sends'},
    {id:'inbound',from:'server',to:'client',label:'returns'},
  ],[
    action('show-client','reveal','client','The client'),action('show-server','reveal','server','The client'),
    action('connect-outbound','connect','outbound','sends'),action('show-request','reveal','request','a request'),
    action('send-request','transfer','request','to the server',{relation:'outbound',sync:'finish',pace:'natural',after:'connect-outbound'}),
    action('retire-request','retire','request','returns'),action('disconnect-outbound','disconnect','outbound','returns'),action('connect-inbound','connect','inbound','returns'),action('show-response','reveal','response','a response'),
    action('return-response','transfer','response','to the client',{relation:'inbound',sync:'finish',pace:'natural',after:'connect-inbound'}),
    action('focus-client','focus','client','keeps'),action('client-ready','state','client','ready',{state:'ready'}),
  ]),
  scene('review','One object changes as the story develops',[
    'The draft is unreviewed.',
    'The editor checks the draft.',
    'The draft becomes approved.',
    'Approval does not guarantee accuracy.',
  ],[
    {id:'draft',label:'draft',icon:'document',states:[{id:'unreviewed',label:'unreviewed',tone:'warning'},{id:'approved',label:'approved',tone:'positive'}]},
    {id:'editor',label:'editor',icon:'user'},
    {id:'qualification',label:'does not guarantee accuracy',role:'note',icon:null},
  ],[{id:'review',from:'editor',to:'draft',label:'checks'}],[
    action('show-draft','reveal','draft','The draft'),action('draft-unreviewed','state','draft','unreviewed',{state:'unreviewed'}),
    action('show-editor','reveal','editor','The editor'),action('review-connection','connect','review','checks'),
    action('draft-approved','state','draft','approved',{state:'approved'}),action('focus-draft','focus','draft','becomes'),
    action('show-qualification','reveal','qualification','does not guarantee accuracy',{sync:'span'}),
  ]),
  scene('measurement','Follow the same measurement through a system',[
    'The sensor sends a measurement to the controller.',
    'The controller sends the measurement to the display.',
    'The display marks the measurement visible.',
  ],[
    {id:'sensor',label:'sensor',icon:null}, {id:'controller',label:'controller',icon:'server'},
    {id:'display',label:'display',icon:null},
    {id:'measurement',label:'measurement',role:'payload',icon:'document',states:[{id:'visible',label:'visible',tone:'positive'}]},
  ],[
    {id:'sense',from:'sensor',to:'controller',label:'sends'},
    {id:'present',from:'controller',to:'display',label:'sends'},
  ],[
    action('show-sensor','reveal','sensor','The sensor'),action('show-controller','reveal','controller','The sensor'),
    action('sensor-link','connect','sense','sends'),action('show-measurement','reveal','measurement','a measurement'),
    action('to-controller','transfer','measurement','to the controller',{relation:'sense',sync:'finish',pace:'natural',after:'sensor-link'}),
    action('show-display','reveal','display','The controller sends'),action('display-link','connect','present','sends',{cue:{text:'sends',occurrence:1},after:'show-display'}),
    action('to-display','transfer','measurement','to the display',{relation:'present',sync:'finish',pace:'natural',after:'display-link'}),
    action('focus-display','focus','display','marks'),action('measurement-visible','state','measurement','visible',{state:'visible'}),
  ]),
];

export const makeStoryMotionDraft = () => draftNarratedPlanSchema.parse({version:9,kind:'narrated-video',stage:'draft',sourceText:STORY_MOTION_FIXTURES.map(fixture=>fixture.source).join('\n'),generatedAt:'2026-11-09T00:00:00Z',model:'offline-story-motion-benchmark',targetDurationSeconds:60,language:'en',title:'Stories direct the motion',palette:'cyan',mediaAssets:[],scenes:STORY_MOTION_FIXTURES.map(fixture=>fixture.scene)});
export const makeStoryMotionPreview = () => estimateDraftNarrationTiming(makeStoryMotionDraft());
