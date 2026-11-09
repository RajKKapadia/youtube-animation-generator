import {useMemo} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {RenderableVisualScene, RenderProfile, VideoPalette} from '../types.js';
import {compileStoryMotion, layoutStoryMotion, storyStateAt, storyConnectionPoints, storyObjectSize} from '../story-motion.js';
import {videoPaletteFor, hexToRgba} from '../visual-palettes.js';
import {FittedText} from './FittedText.js';
import {VisualIcon} from './SemanticIcon.js';
import {keySafeOpacity, keySafeShadow, keySafeSurface} from './chroma-key.js';

/** The frame renderer has no topic knowledge, timers, or accumulated state. */
export const StoryMotionView = ({scene,profile,palette,contentTopInset,chromaKey=false}:{scene:RenderableVisualScene;profile:RenderProfile;palette:VideoPalette;contentTopInset:number;chromaKey?:boolean}) => {
  const frame=useCurrentFrame(), {fps}=useVideoConfig();
  const motion=scene.visual; if (motion.kind!=='story-motion') throw new Error('Story renderer requires a story-motion scene.');
  const width=profile.width-profile.safeArea.left-profile.safeArea.right;
  const height=profile.height-profile.safeArea.top-profile.safeArea.bottom-contentTopInset-110;
  const cues=scene.speechCues ?? scene.activityCues.map((cue,index)=>({...cue,durationMs:(scene.activityCues[index+1]?.startMs??scene.durationMs)-cue.startMs,provenance:'estimate' as const}));
  const timeline=useMemo(()=>compileStoryMotion(motion,cues,scene.durationMs),[motion,scene.speechCues,scene.durationMs]);
  const layout=useMemo(()=>layoutStoryMotion(motion,width,height),[motion,width,height]);
  const state=storyStateAt(motion,timeline,layout,frame/fps*1000);
  const theme=videoPaletteFor(palette), accent=theme.accents.primary;
  return <div style={{height:'100%',display:'flex',flexDirection:'column',gap:22}}>
    <div style={{height:78,flexShrink:0,display:'flex',alignItems:'center',gap:18}}>
      <div style={{width:7,height:48,borderRadius:6,background:accent}} />
      <FittedText align="left" text={scene.title} maxWidth={width-28} maxHeight={76} maxLines={2} maxFontSize={profile.aspectRatio==='9:16'?46:43} fontWeight={800} lineHeight={1.08}/>
    </div>
    <div style={{position:'relative',height,flexShrink:0}}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{position:'absolute',inset:0,overflow:'visible'}}>
        <defs><marker id={`story-arrow-${scene.id}`} markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke={accent} strokeWidth="1.4" /></marker></defs>
        {motion.relations.map(link=>{
          const p=state.connections[link.id]??0;if(p<=0)return null;
          const {a,b,c,source,destination,label}=storyConnectionPoints(layout,link);
          const endpoints=Math.min(state.objects[link.from]!.opacity,state.objects[link.to]!.opacity);
          const path=`M${source.x} ${source.y} L${a.x} ${a.y} Q${c.x} ${c.y} ${b.x} ${b.y} L${destination.x} ${destination.y}`;
          return <g key={link.id} opacity={keySafeOpacity(endpoints)}>
            <path d={path} fill="none" stroke={hexToRgba(accent,.15)} strokeWidth={5}/>
            <path d={path} pathLength={1} fill="none" stroke={accent} strokeWidth={4} strokeDasharray={1} strokeDashoffset={1-p} markerEnd={p>.99?`url(#story-arrow-${scene.id})`:undefined}/>
            {link.label?<foreignObject x={label.x-150} y={label.y-23} width={300} height={52}><div style={{display:'flex',justifyContent:'center',opacity:keySafeOpacity(p)}}><span style={{background:keySafeSurface('#0B1324'),borderRadius:10,padding:'7px 14px',color:'#CBD5E1',fontSize:24,fontWeight:650}}>{link.label}</span></div></foreignObject>:null}
          </g>;
        })}
      </svg>
      {motion.objects.map(item=>{
        const current=state.objects[item.id]!;if(current.opacity<=0)return null;
        const status=item.states.find(status=>status.id===current.state);
        const color=status?.tone==='positive'?(chromaKey?'#C4B5FD':'#34D399'):status?.tone==='warning'?'#FBBF24':accent;
        const payload=item.role==='payload',note=item.role==='note';
        const size=storyObjectSize(item,layout,Boolean(status)),w=size.width,h=size.height;
        const focused=!state.focus||state.focus===item.id||item.role!=='subject';
        const iconSize=payload?34:note?40:58;
        return <div key={item.id} data-story-object={item.id} style={{position:'absolute',left:current.position.x,top:current.position.y,width:w,minHeight:h,boxSizing:'border-box',padding:payload?'14px 18px':note?'20px 26px':'22px 28px',borderRadius:payload?99:24,border:`${current.emphasis>.1?3:2}px solid ${hexToRgba(color,.5+current.emphasis*.5)}`,background:keySafeSurface(payload?'#16384A':'linear-gradient(125deg,rgba(17,29,49,.98),rgba(22,36,58,.98))'),boxShadow:keySafeShadow(`0 14px 36px rgba(0,0,0,.3),0 0 ${16+current.emphasis*30}px ${hexToRgba(color,.1+current.emphasis*.2)}`),opacity:keySafeOpacity(current.opacity*(focused?1:.55)),transform:`translate(-50%,-50%) scale(${current.scale})`,display:'flex',alignItems:'center',gap:payload?12:22,zIndex:payload?4:2}}>
          {item.icon?<div style={{flexShrink:0,width:iconSize,height:iconSize,color}}><VisualIcon id={item.icon} size={iconSize} color={color}/></div>:null}
          <div style={{flex:1,minWidth:0}}>
            <FittedText align="left" text={item.label} maxWidth={w-(item.icon?iconSize+22:0)-(payload?36:56)} maxHeight={payload?50:note?75:80} maxLines={2} maxFontSize={payload?27:note?31:37} fontWeight={780} lineHeight={1.08}/>
            {status?<div style={{marginTop:12,color,fontSize:25,fontWeight:760,display:'flex',alignItems:'center',gap:10}}><span style={{width:9,height:9,borderRadius:99,background:color,flexShrink:0}}/>{status.label}</div>:null}
          </div>
        </div>;
      })}
    </div>
  </div>;
};
