import type {TimedNarratedPlan} from './types.js';
import {normalizeNarrationSpeech} from './narration-speech.js';
import {z} from 'zod';
import {semanticIconDefinitionFor} from './icon-catalog.js';
import {sourceContainsGroundedText} from './source-grounding.js';

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const evidence = z.string().min(1).max(1200);
const tone = z.enum(['neutral', 'positive', 'warning']);
const object = z.object({
  id, label: z.string().min(1).max(48),
  role: z.enum(['subject', 'payload', 'note']).prefault('subject'),
  icon: id.nullable().prefault(null),
  states: z.array(z.object({id, label: z.string().min(1).max(48), tone: tone.prefault('neutral')})).max(4).prefault([]),
  sourceEvidence: evidence,
});
const relation = z.object({id, from: id, to: id, label: z.string().max(36).prefault(''), sourceEvidence: evidence});
const actionBase = {
  id, target: id,
  cue: z.object({text: z.string().min(1).max(160), occurrence: z.number().int().min(0).max(100).prefault(0), edge: z.enum(['start', 'end']).prefault('start')}),
  sync: z.enum(['start', 'finish', 'span']).prefault('start'),
  pace: z.enum(['quick', 'natural', 'deliberate']).prefault('natural'),
  after: id.nullable().prefault(null),
  sourceEvidence: evidence,
};
const ordinary = z.object({...actionBase, kind: z.enum(['reveal', 'retire', 'emphasize', 'focus', 'connect', 'disconnect'])});
const transfer = z.object({...actionBase, kind: z.literal('transfer'), relation: id});
const change = z.object({...actionBase, kind: z.literal('state'), state: id});
export const storyMotionSchema = z.object({
  kind: z.literal('story-motion'), motion: z.literal('flow').prefault('flow'), motif: z.literal('none').prefault('none'),
  objects: z.array(object).min(1).max(8), relations: z.array(relation).max(8).prefault([]),
  actions: z.array(z.union([ordinary, transfer, change])).min(1).max(32),
});
export type StoryMotion = z.infer<typeof storyMotionSchema>;
export type StoryAction = StoryMotion['actions'][number];
export interface SpeechCue {text: string; startMs: number; durationMs: number; provenance?: 'word' | 'phrase' | 'subtitle' | 'estimate'}
export interface CompiledAction {action: StoryAction; startMs: number; endMs: number; anchorMs: number; provenance: NonNullable<SpeechCue['provenance']>}
export interface MotionTimeline {actions: CompiledAction[]; warnings: string[]; durationMs: number}
const normalized = (text: string) => normalizeNarrationSpeech(text, 'en').normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Shape is separate from cross-field checks so all provider paths can diagnose it. */
export const storyMotionStructureIssue = (motion: StoryMotion): string | null => {
  const objects = new Map(motion.objects.map(item => [item.id, item]));
  const relations = new Map(motion.relations.map(item => [item.id, item]));
  const actions = new Map(motion.actions.map(item => [item.id, item]));
  if (objects.size !== motion.objects.length || relations.size !== motion.relations.length || actions.size !== motion.actions.length) return 'Story objects, relations and actions need unique ids within each namespace.';
  if ([...relations.keys()].some(key => objects.has(key))) return 'Story relation ids cannot collide with object ids.';
  if (motion.objects.filter(item => item.role === 'subject').length > 4 || motion.objects.filter(item => item.role === 'note').length > 2) return 'A story stage supports at most four subjects and two notes; split a dense explanation into related scenes.';
  if (motion.objects.filter(item => item.role === 'subject').length > 3 && motion.objects.some(item => item.role === 'payload')) return 'Payload choreography with four subjects is too dense; split the explanation into smaller stages.';
  if (!motion.objects.some(item => item.role === 'subject')) return 'A story stage needs a subject.';
  for (const item of motion.objects) {
    if (new Set(item.states.map(state => state.id)).size !== item.states.length) return `Duplicate state on ${item.id}.`;
    if (item.icon && !semanticIconDefinitionFor(item.icon)) return `Unknown story icon ${item.icon}.`;
    if (!motion.actions.some(action => action.target === item.id && action.kind === 'reveal')) return `Story object ${item.id} needs an explicit reveal action.`;
    if (motion.actions.filter(action => action.target === item.id && action.kind === 'reveal').length > 1) return `Story object ${item.id} must be introduced once; reuse it with actions.`;
  }
  for (const link of motion.relations) {
    if (link.from === link.to || !objects.has(link.from) || !objects.has(link.to)) return `Relation ${link.id} needs distinct declared endpoints.`;
    if (objects.get(link.from)!.role !== 'subject' || objects.get(link.to)!.role !== 'subject') return `Relation ${link.id} endpoints must be subjects.`;
  }
  for (const action of motion.actions) {
    if ((action.kind === 'connect' || action.kind === 'disconnect') ? !relations.has(action.target) : !objects.has(action.target)) return `Action ${action.id} has an unknown target.`;
    if (action.kind === 'transfer' && (!relations.has(action.relation) || objects.get(action.target)?.role !== 'payload')) return `Transfer ${action.id} needs a declared relation and payload object.`;
    if (action.kind === 'state' && !objects.get(action.target)!.states.some(state => state.id === action.state)) return `Action ${action.id} names an undeclared state.`;
    if (action.after !== null && (!actions.has(action.after) || action.after === action.id)) return `Action ${action.id} has an invalid dependency.`;
    const seen = new Set([action.id]); let dependency = action.after;
    while (dependency !== null) {
      if (seen.has(dependency)) return 'Story action dependencies contain a cycle.';
      seen.add(dependency); dependency = actions.get(dependency)?.after ?? null;
    }
  }
  return null;
};

export const storyMotionGroundingIssue = (motion: StoryMotion, source: string): string | null => {
  const structure = storyMotionStructureIssue(motion); if (structure) return structure;
  const objects = new Map(motion.objects.map(item => [item.id, item]));
  for (const item of motion.objects) {
    if (!sourceContainsGroundedText(source, item.sourceEvidence) || !sourceContainsGroundedText(item.sourceEvidence, item.label) || item.states.some(state => !sourceContainsGroundedText(item.sourceEvidence, state.label))) return `Story object ${item.id} and its states need exact source-backed labels and evidence.`;
  }
  for (const link of motion.relations) {
    if (!sourceContainsGroundedText(source, link.sourceEvidence) || ![objects.get(link.from)!.label, objects.get(link.to)!.label, link.label].filter(Boolean).every(label => sourceContainsGroundedText(link.sourceEvidence, label))) return `Relation ${link.id} needs exact evidence containing both endpoints and its label; evidence must support its direction.`;
  }
  for (const action of motion.actions) {
    if (!sourceContainsGroundedText(source, action.sourceEvidence)) return `Action ${action.id} needs exact source evidence.`;
  }
  return null;
};

/** Match a specific occurrence in the complete script, including spans crossing cues. */
export const resolveStoryCue = (anchor: StoryAction['cue'], cues: SpeechCue[]) => {
  const spans: Array<{start: number; end: number; cue: SpeechCue}> = []; let text = '';
  for (const cue of cues) {
    if (text) text += ' ';
    const start = text.length; text += normalized(cue.text); spans.push({start, end: text.length, cue});
  }
  const needle = normalized(anchor.text); if(!needle)throw new Error('Story cues need spoken words.'); let index = -1; let from = 0;
  for (let occurrence = 0; occurrence <= anchor.occurrence; occurrence++) {
    index = text.indexOf(needle, from);
    while (index >= 0 && ((index > 0 && /[\p{L}\p{N}]/u.test(text[index - 1]!)) || (index + needle.length < text.length && /[\p{L}\p{N}]/u.test(text[index + needle.length]!)))) index = text.indexOf(needle, index + 1);
    if (index < 0) throw new Error(`Story cue "${anchor.text}" occurrence ${anchor.occurrence} is absent from the narration.`);
    from = index + needle.length;
  }
  const first = spans.find(span => span.end > index)!;
  const last = spans.find(span => span.end >= index + needle.length)!;
  const position = (span: typeof first, offset: number) => span.cue.startMs + Math.max(0, Math.min(1, (offset - span.start) / Math.max(1, span.end - span.start))) * span.cue.durationMs;
  const wordAligned = first.cue.provenance === 'word' && last.cue.provenance === 'word';
  return {startMs: wordAligned ? first.cue.startMs : position(first, index), endMs: wordAligned ? last.cue.startMs + last.cue.durationMs : position(last, index + needle.length), provenance: wordAligned ? 'word' as const : first.cue.provenance ?? 'estimate'};
};

export const storyMotionCueIssue = (motion: StoryMotion, narration: string): string | null => {
  try { for (const action of motion.actions) resolveStoryCue(action.cue, [{text: narration, startMs: 0, durationMs: 1}]); return null; }
  catch (error) { return String(error instanceof Error ? error.message : error); }
};

/** Resolve once from the voice clock. All frame evaluation is stateless. */
export const compileStoryMotion = (motion: StoryMotion, cues: SpeechCue[], durationMs: number): MotionTimeline => {
  const issue = storyMotionStructureIssue(motion); if (issue) throw new Error(issue);
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Story duration must be positive.');
  const warnings: string[] = []; const compiled = new Map<string, CompiledAction>(); const visiting=new Set<string>();
  const schedule = (action: StoryAction): CompiledAction => {
    const existing = compiled.get(action.id); if (existing) return existing;
    if(visiting.has(action.id))throw new Error(`Action ${action.id} has a cyclic visibility/connection dependency.`);
    visiting.add(action.id);
    const cue = resolveStoryCue(action.cue, cues);
    const anchorMs = action.cue.edge === 'start' ? cue.startMs : cue.endMs;
    const preferred = {quick: 320, natural: 650, deliberate: 1000}[action.pace];
    let startMs = action.sync === 'finish' ? Math.max(0, anchorMs - preferred) : cue.startMs;
    let endMs = action.sync === 'span' ? cue.endMs : action.sync === 'finish' ? anchorMs : anchorMs + preferred;
    if (action.sync === 'start') startMs = anchorMs;
    const prerequisites:StoryAction[]=[];
    if(action.after)prerequisites.push(motion.actions.find(item=>item.id===action.after)!);
    if(action.kind==='connect'||action.kind==='transfer'){
      const relationId='relation' in action?action.relation:action.target;
      const link=motion.relations.find(link=>link.id===relationId)!;
      for(const target of [link.from,link.to,...(action.kind==='transfer'?[action.target]:[])])prerequisites.push(motion.actions.find(item=>item.kind==='reveal'&&item.target===target)!);
      if(action.kind==='transfer'){
        const connect=motion.actions.find(item=>item.kind==='connect'&&item.target===action.relation);
        if(!connect)throw new Error(`Transfer ${action.id} uses a relation before it is connected.`);
        prerequisites.push(connect);
      }
    }
    const dependencyEnd=Math.max(0,...prerequisites.map(item=>schedule(item).endMs));
    if (dependencyEnd > startMs) {
      if (action.sync === 'finish' || action.sync === 'span') startMs = dependencyEnd;
      else {startMs = dependencyEnd; endMs = startMs + preferred; warnings.push(`${action.id}: delayed by dependency; starts ${Math.round(startMs - anchorMs)}ms after its cue.`);}
    }
    endMs = Math.min(durationMs, endMs);
    if (endMs <= startMs || startMs >= durationMs) throw new Error(`Action ${action.id} has no time inside its cue/scene after dependencies.`);
    if (endMs - startMs < 180) warnings.push(`${action.id}: short ${Math.round(endMs - startMs)}ms action window.`);
    const result = {action, startMs, endMs, anchorMs, provenance: cue.provenance}; compiled.set(action.id, result); visiting.delete(action.id); return result;
  };
  const actions = motion.actions.map(schedule).sort((a,b) => a.startMs - b.startMs || a.action.id.localeCompare(b.action.id));
  const reveals = new Map(actions.filter(item => item.action.kind === 'reveal').map(item => [item.action.target, item.startMs]));
  for (const item of actions) {
    const targets = (item.action.kind === 'connect' || item.action.kind === 'disconnect')
      ? (() => {const link = motion.relations.find(link => link.id === item.action.target)!; return [link.from, link.to];})()
      : item.action.kind === 'transfer'
        ? (() => {const link = motion.relations.find(link => link.id === (item.action as Extract<StoryAction, {kind:'transfer'}>).relation)!; return [item.action.target, link.from, link.to];})()
        : item.action.kind === 'reveal' ? [] : [item.action.target];
    if (targets.some(target => (reveals.get(target) ?? Infinity) > item.startMs)) throw new Error(`Action ${item.action.id} uses an object before its introduction.`);
    if (item.action.kind === 'transfer') {
      const connect = actions.find(other => other.action.kind === 'connect' && other.action.target === (item.action as Extract<StoryAction,{kind:'transfer'}>).relation);
      const lastConnection = actions.filter(other => (other.action.kind === 'connect' || other.action.kind === 'disconnect') && other.action.target === (item.action as Extract<StoryAction,{kind:'transfer'}>).relation && other.startMs <= item.startMs).at(-1);
      if (!connect || connect.startMs > item.startMs || lastConnection?.action.kind === 'disconnect') throw new Error(`Transfer ${item.action.id} uses a relation before it is connected.`);
    }
    const channel=(action:StoryAction)=>action.kind==='connect'||action.kind==='disconnect'?'connection':action.kind==='reveal'||action.kind==='retire'?'visibility':action.kind==='transfer'?'position':action.kind==='state'?'state':action.kind==='focus'?'attention':'emphasis';
    if(actions.some(other=>other!==item&&channel(other.action)===channel(item.action)&&(item.action.kind==='focus'||other.action.target===item.action.target)&&other.startMs<item.endMs&&item.startMs<other.endMs))throw new Error(`Conflicting actions on ${item.action.target} near ${Math.round(item.startMs)}ms.`);

  }
  if (actions.some(item => item.provenance !== 'word')) warnings.push('Some story cues use estimated timing within phrases/subtitles; word synchronization is not verified.');
  return {actions, warnings: [...new Set(warnings)], durationMs};
};

export interface Point {x: number; y: number}
export interface StoryLayout {positions: Record<string, Point>; nodeWidth: number; nodeHeight: number; width: number; height: number}
/** Geometry follows graph connectivity and semantic role, never topic names. */
export const layoutStoryMotion = (motion: StoryMotion, width: number, height: number): StoryLayout => {
  const subjects = motion.objects.filter(item => item.role === 'subject');
  const incoming = new Set(motion.relations.map(link => link.to));
  const ordered: string[] = []; const visit = (key: string) => {if (ordered.includes(key)) return; ordered.push(key); for (const link of motion.relations.filter(link => link.from === key)) visit(link.to);};
  subjects.filter(item => !incoming.has(item.id)).forEach(item => visit(item.id)); subjects.forEach(item => visit(item.id));
  const notes = motion.objects.filter(item => item.role === 'note');
  const mainHeight = height - notes.length*150 - 60;
  const portrait = height > width; const nodeWidth = portrait ? Math.min(width * .76, 650) : Math.min(360, (width - 100) / Math.max(1, subjects.length) * .8);
  const nodeHeight = 170;
  const positions: Record<string, Point> = {};
  ordered.forEach((key,index) => {positions[key] = portrait ? {x: width/2, y: 120 + index * Math.min(520, (mainHeight - nodeHeight - 240) / Math.max(1, subjects.length-1))} : {x: (index+.5) * width / subjects.length, y: mainHeight * .46};});
  notes.forEach((item,index) => {positions[item.id] = {x: width/2, y: Math.min(height - (notes.length-index-.5)*140 - 30, Math.max(...Object.values(positions).map(point=>point.y))+nodeHeight/2+130+index*150)};});
  for (const item of motion.objects.filter(item => item.role === 'payload')) positions[item.id] = (()=>{const first=motion.actions.find(action=>action.kind==='transfer'&&action.target===item.id);if(first?.kind==='transfer'){const link=motion.relations.find(link=>link.id===first.relation)!;return storyConnectionPoints({positions,nodeWidth,nodeHeight,width,height},link).a;}return {x:width/2,y:mainHeight*.6};})();
  return {positions, nodeWidth, nodeHeight, width, height};
};
export const storyConnectionPoints = (layout:StoryLayout, link:StoryMotion['relations'][number]) => {
  const from=layout.positions[link.from]!, to=layout.positions[link.to]!;
  const dx=to.x-from.x,dy=to.y-from.y;
  if(Math.abs(dy)>Math.abs(dx)){
    const offset=Math.min(layout.nodeHeight/2+64,Math.abs(dy)*.45),direction=Math.sign(dy);
    const a={x:from.x,y:from.y+direction*offset},b={x:to.x,y:to.y-direction*offset};
    return {a,b,c:{x:(a.x+b.x)/2-direction*140,y:(a.y+b.y)/2},source:{x:from.x,y:from.y+direction*layout.nodeHeight/2},destination:{x:to.x,y:to.y-direction*layout.nodeHeight/2},label:{x:(a.x+b.x)/2+direction*220,y:(a.y+b.y)/2}};
  }
  const side=dx>=0?1:-1,offset=layout.nodeHeight/2+76;
  const a={x:from.x,y:from.y+side*offset},b={x:to.x,y:to.y+side*offset};
  return {a,b,c:{x:(a.x+b.x)/2,y:(a.y+b.y)/2+side*140},source:{x:from.x,y:from.y+side*layout.nodeHeight/2},destination:{x:to.x,y:to.y+side*layout.nodeHeight/2},label:{x:(a.x+b.x)/2,y:(a.y+b.y)/2-side*20}};
};
const progress = (timeMs:number, action:CompiledAction) => Math.max(0, Math.min(1,(timeMs-action.startMs)/(action.endMs-action.startMs)));
const ease = (p:number) => p < .5 ? 4*p*p*p : 1-Math.pow(-2*p+2,3)/2;
export const storyStateAt = (motion: StoryMotion, timeline: MotionTimeline, layout: StoryLayout, timeMs: number) => {
  let focus: string | null = null;
  const objects = Object.fromEntries(motion.objects.map(item => [item.id, {position:{...layout.positions[item.id]!}, opacity:0, scale:1, state:null as string|null, emphasis:0}]));
  const connections: Record<string,number> = {};
  for (const item of timeline.actions) {
    if (timeMs < item.startMs) continue;
    const p = ease(progress(timeMs,item)); const action = item.action;
    if (action.kind === 'connect' || action.kind === 'disconnect') {connections[action.target] = action.kind === 'connect' ? p : 1-p; continue;}
    const object = objects[action.target]!;
    if (action.kind === 'reveal') {object.opacity = p; object.scale = .92+.08*p;}
    if (action.kind === 'retire') object.opacity = 1-p;
    if (action.kind === 'emphasize') {object.emphasis = Math.sin(Math.PI*p); object.scale = 1+.06*object.emphasis;}
    if (action.kind === 'focus') {focus=action.target; object.emphasis = p;}
    if (action.kind === 'state') {object.state=action.state; object.emphasis=Math.sin(Math.PI*p);}
    if (action.kind === 'transfer') {
      const link = motion.relations.find(link => link.id === action.relation)!;
      const {a,b,c} = storyConnectionPoints(layout,link);
      object.position={x:(1-p)*(1-p)*a.x+2*(1-p)*p*c.x+p*p*b.x,y:(1-p)*(1-p)*a.y+2*(1-p)*p*c.y+p*p*b.y};
      object.opacity = Math.max(object.opacity,1); object.scale = .85+.15*Math.sin(Math.PI*p);
    }
  }
  return {objects,connections,focus};
};

export const STORY_MOTION_PROMPT = `Story-driven choreography: prefer story-motion when the source explains transfers, changing states, approval boundaries, or several actions involving the same objects. Design what happens from the source and narration, not a recurring animation pattern. Declare 1-4 subject objects, optional payloads and at most two notes, all with stable ids and short exact source-backed labels. Each object requires its own extractive sourceEvidence containing its label and any states. Pick literal relevant catalog icons or null. A relation declares from/to subject ids, an optional exact source-backed label, and evidence containing both subject labels and supporting direction. Actions are reveal, connect, disconnect, transfer, state, emphasize, focus and retire. Disconnect a relationship when its explanatory role ends; keep relevant context visible. Each object has exactly one reveal; reuse its identity with later actions. connect/disconnect target a relation id; transfer targets a payload and names the connected relation; state names a declared state. Each action has exact sourceEvidence and cue.text copied from the final narration (selected subtitle text for subtitle clips), occurrence=0 unless repeated, and cue.edge=start|end. sync=start begins at that cue, finish arrives on it (normally set cue.edge=end for a destination phrase), span acts across it. Leave readable travel windows; reveal a payload early enough for its arrival and retire spent payloads when their visual role ends. after optionally names an action dependency. Pace is quick, natural or deliberate. Never invent numeric transitions, causality, approval or outcomes. Preserve negation and qualifications. Keep context visible and use holds; do not move every object on every sentence. Introduce endpoints before connecting/transferring and finish essential actions before retiring a subject. Use callout fallback with concise primaryItems anchored once at first introduction; these fallback labels do not prescribe action order. Story actions have independent reusable cue anchors. All action cues must fit the voice/cue window; do not guess timestamps or author coordinates/code.`;

export const chooseStorySpeechCues = (motion:StoryMotion, words:Array<{text:string;startMs:number;durationMs:number;probability:number}>|undefined, phrases:SpeechCue[]):SpeechCue[]=>{
  if(words?.length && words.every(word=>word.probability>=.35)){
    const cues=words.map(word=>({...word,provenance:'word' as const}));
    try{for(const action of motion.actions)resolveStoryCue(action.cue,cues);return cues;}catch{/* The script remains authoritative if ASR spelling differs. */}
  }
  return phrases.map(phrase=>({...phrase,provenance:phrase.provenance??'estimate'}));
};

export const storyTimingWarnings = (plan: Pick<TimedNarratedPlan,'scenes'>): string[] => plan.scenes.flatMap(scene=>{
  if(scene.visual.kind!=='story-motion')return [];
  const cues=chooseStorySpeechCues(scene.visual,scene.wordTimings,scene.beats.flatMap(beat=>beat.phrases));
  return compileStoryMotion(scene.visual,cues,scene.durationMs).warnings.map(warning=>`${scene.id}: ${warning}`);
});

export const storyObjectSize = (object:StoryMotion['objects'][number],layout:StoryLayout,hasState=false) => ({
  width: object.role==='payload'?Math.min(320,layout.width*.4):object.role==='note'?Math.min(layout.width-12,900):layout.nodeWidth,
  height: object.role==='payload'?(hasState?124:84):object.role==='note'?(hasState?160:116):layout.nodeHeight,
});

/** Sample boundary states and motion intervals; these are diagnostics, not a visual quality score. */
export const reviewStoryMotion = (motion:StoryMotion,timeline:MotionTimeline,layout:StoryLayout) => {
  const findings:Array<{kind:'overlap'|'bounds';objects:string[];timeMs:number}>=[];
  const reported=new Set<string>();
  const samples=new Set([0,timeline.durationMs-1,...timeline.actions.flatMap(item=>[item.startMs,(item.startMs+item.endMs)/2,item.endMs])]);
  for(let time=0;time<timeline.durationMs;time+=100)samples.add(time);
  for(const time of [...samples].sort((a,b)=>a-b)){
    const state=storyStateAt(motion,timeline,layout,time);
    const boxes=motion.objects.flatMap(object=>{
      const current=state.objects[object.id]!;if(current.opacity<.2)return [];
      const size=storyObjectSize(object,layout,current.state!==null),w=size.width*current.scale,h=size.height*current.scale;
      return [{id:object.id,left:current.position.x-w/2,right:current.position.x+w/2,top:current.position.y-h/2,bottom:current.position.y+h/2}];
    });
    for(const box of boxes){
      if(box.left<0||box.right>layout.width||box.top<0||box.bottom>layout.height){
        const key=`bounds:${box.id}`;if(!reported.has(key)){reported.add(key);findings.push({kind:'bounds',objects:[box.id],timeMs:Math.round(time)});}
      }
      for(const other of boxes){
        if(box.id>=other.id)continue;
        if(Math.min(box.right,other.right)-Math.max(box.left,other.left)>8&&Math.min(box.bottom,other.bottom)-Math.max(box.top,other.top)>8){
          const key=`overlap:${box.id}:${other.id}`;if(!reported.has(key)){reported.add(key);findings.push({kind:'overlap',objects:[box.id,other.id],timeMs:Math.round(time)});}
        }
      }
    }
  }
  return findings;
};
