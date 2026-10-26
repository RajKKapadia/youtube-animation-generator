import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {AnimationFrames} from '../animation-render-assets.js';
import type {RenderableVisualScene, RenderProfile} from '../types.js';
import {FittedText} from './FittedText.js';

export const ExternalAnimation = ({asset, scene, profile}: {asset: AnimationFrames; scene: RenderableVisualScene; profile: RenderProfile}) => {
  const frame = Math.max(0, Math.min(asset.frameCount - 1, useCurrentFrame()));
  const {fps} = useVideoConfig();
  const active = scene.primaryItemTimings.reduce((current, cue, index) => cue.startMs <= frame * 1000 / fps ? index : current, -1);
  const vertical = profile.height > profile.width;
  return <AbsoluteFill>
    <Img src={staticFile(`${asset.directory}/frame-${String(frame).padStart(6, '0')}.png`)} style={{width: '100%', height: '100%'}} />
    {asset.tool === 'stykanimate' ? <div style={{position: 'absolute', top: vertical ? 340 : 270, left: profile.safeArea.left, right: profile.safeArea.right, color: '#F8FAFC'}}>
      <FittedText text={scene.title} fontWeight={750} lineHeight={1.15} maxWidth={profile.width - profile.safeArea.left - profile.safeArea.right} maxHeight={vertical ? 220 : 160} maxFontSize={vertical ? 64 : 72} maxLines={3} align="left" />
    </div> : null}
    {asset.tool === 'stykanimate' && active >= 0 ? <div style={{position: 'absolute', top: vertical ? 600 : 450, left: profile.safeArea.left, right: profile.safeArea.right, color: '#CBD5E1'}}><FittedText text={scene.primaryItems[active]!} fontWeight={650} lineHeight={1.2} maxWidth={profile.width - profile.safeArea.left - profile.safeArea.right} maxHeight={vertical ? 250 : 160} maxFontSize={vertical ? 50 : 48} maxLines={3} align="left" /></div> : null}
  </AbsoluteFill>;
};
