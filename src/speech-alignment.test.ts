import {describe,it,expect} from 'vitest';
import {applyGeneratedSpeechAlignment,storyTimingWarnings} from './speech-alignment.js';
import {alignRecording} from './recording-alignment.js';
import {makeStoryMotionDraft,makeStoryMotionPreview} from './story-motion-fixtures.js';
import {chooseStorySpeechCues,resolveStoryCue} from './story-motion.js';

const input=()=>{
  const plan=makeStoryMotionPreview();
  const words=plan.scenes.flatMap(scene=>scene.beats.flatMap(beat=>{
    const tokens=beat.phrases.flatMap(phrase=>phrase.text.split(/\s+/u));
    return tokens.map((word,index)=>({word,startMs:Math.round(scene.startMs+beat.startMs+index*beat.durationMs/tokens.length),endMs:Math.round(scene.startMs+beat.startMs+(index+.8)*beat.durationMs/tokens.length),probability:.99}));
  }));
  return {plan,report:alignRecording(makeStoryMotionDraft(),words,plan.durationMs)};
};
describe('generated speech word alignment',()=>{
  it('persists aligned words and retimes captions/item anchors while retaining the audio clock',()=>{
    const {plan,report}=input();expect(report.accepted).toBe(true);
    const aligned=applyGeneratedSpeechAlignment(plan,report);
    expect(aligned.durationMs).toBe(plan.durationMs);expect(aligned.voiceoverPlaybackRate).toBe(plan.voiceoverPlaybackRate);
    expect(aligned.scenes.every(scene=>scene.wordTimings!.length>0)).toBe(true);
    expect(storyTimingWarnings(aligned).join()).not.toContain('word synchronization is not verified');
    for(const scene of aligned.scenes)for(const item of scene.primaryItemTimings)expect(item.startMs).toBe(scene.beats.find(beat=>beat.id===item.beatId)!.startMs);
  });
  it('refuses an uncertain transcript without silently applying it',()=>{
    const {plan,report}=input();expect(()=>applyGeneratedSpeechAlignment(plan,{...report,accepted:false,problems:['Wrong quantity']})).toThrow('Wrong quantity');
  });
  it('matches compact numeric cues against spoken English quantities',()=>{
    const cue={text:'₹50',occurrence:0,edge:'end' as const};
    const words=[{text:'fifty',startMs:100,durationMs:200,provenance:'word' as const},{text:'rupees',startMs:300,durationMs:200,provenance:'word' as const}];
    expect(resolveStoryCue(cue,words)).toMatchObject({startMs:100,endMs:500,provenance:'word'});
  });
  it('marks low-confidence and spelling-mismatched word cues as estimated',()=>{
    const scene=makeStoryMotionPreview().scenes[0]!;if(scene.visual.kind!=='story-motion')throw new Error();
    const result=chooseStorySpeechCues(scene.visual,[{text:'client',startMs:100,durationMs:200,probability:.1}],scene.beats.flatMap(beat=>beat.phrases));
    expect(result.every(cue=>cue.provenance==='estimate')).toBe(true);
  });
});
