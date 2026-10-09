import {useCurrentFrame} from 'remotion';
import type {RenderProfile, TimedNarratedPlan} from '../types.js';
import {videoPaletteFor} from '../visual-palettes.js';

/** Scene lengths stay proportional to measured speech, including videos over a minute. */
export const NarratedProgress = ({plan, profile, fps}: {
  plan: TimedNarratedPlan;
  profile: RenderProfile;
  fps: number;
}) => {
  const currentMs = useCurrentFrame() * 1000 / fps;
  const theme = videoPaletteFor(plan.palette);
  return <div style={{display: 'flex', gap: 6, height: 6, left: profile.safeArea.left, position: 'absolute', right: profile.safeArea.right, top: Math.max(16, profile.safeArea.top - 28), zIndex: 30}}>
    {plan.scenes.map((scene) => <div key={scene.id} style={{background: '#334155', borderRadius: 20, flex: scene.durationMs, overflow: 'hidden'}}>
      <div style={{background: theme.accents.primary, height: '100%', transform: `scaleX(${Math.max(0, Math.min(1, (currentMs - scene.startMs) / scene.durationMs))})`, transformOrigin: 'left', width: '100%'}} />
    </div>)}
  </div>;
};
