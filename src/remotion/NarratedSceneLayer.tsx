import type {CSSProperties} from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {
  CaptionMode,
  RenderProfile,
  SceneBackgroundMode,
  TimedNarrationScene,
  VideoPalette,
} from '../types.js';
import {isVerticalDimensions} from '../render-profile.js';
import {hexToRgba, videoPaletteFor} from '../visual-palettes.js';
import {FittedText, RENDER_FONT_FAMILY} from './FittedText.js';

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

const seedFor = (value: string): number => {
  let seed = 2166136261;
  for (const character of value) {
    seed ^= character.codePointAt(0) ?? 0;
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
};

export const sceneBackdropOpacity = (
  frame: number,
  durationInFrames: number,
  fps: number,
): number => {
  const fadeFrames = Math.min(
    Math.max(1, Math.round(fps * 0.35)),
    Math.max(1, Math.floor((durationInFrames - 1) / 3)),
  );
  return Math.min(
    interpolate(frame, [0, fadeFrames], [0, 1], clamp),
    interpolate(
      frame,
      [durationInFrames - fadeFrames - 1, durationInFrames - 1],
      [1, 0],
      clamp,
    ),
  );
};

const useSceneOpacity = (): number => {
  const frame = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  return sceneBackdropOpacity(frame, durationInFrames, fps);
};

const ambientOrbStyle = ({
  color,
  frame,
  phase,
  seed,
  size,
}: {
  color: string;
  frame: number;
  phase: number;
  seed: number;
  size: number;
}): CSSProperties => {
  const speed = 0.007 + (seed % 7) * 0.00035;
  const x = Math.sin(frame * speed + phase) * 80;
  const y = Math.cos(frame * speed * 0.81 + phase) * 54;
  return {
    background: color,
    borderRadius: '50%',
    filter: `blur(${Math.round(size * 0.26)}px)`,
    height: size,
    opacity: 0.28,
    position: 'absolute',
    transform: `translate(${x}px, ${y}px)`,
    width: size,
  };
};

export const SceneBackdrop = ({
  asset,
  mode,
  palette,
  scene,
}: {
  asset?: string | undefined;
  mode: SceneBackgroundMode;
  palette: VideoPalette;
  scene: TimedNarrationScene;
}) => {
  if (mode === 'generated' && !asset) {
    throw new Error(`Generated background asset is missing for scene ${scene.id}.`);
  }
  const frame = useCurrentFrame();
  const {durationInFrames, height, width} = useVideoConfig();
  const seed = seedFor(scene.id);
  const opacity = useSceneOpacity();
  const progress = frame / Math.max(1, durationInFrames - 1);
  const theme = videoPaletteFor(palette);
  const generatedScale = interpolate(progress, [0, 1], [1.055, 1.115], clamp);
  const generatedX = interpolate(
    progress,
    [0, 1],
    [seed % 2 === 0 ? -16 : 16, seed % 2 === 0 ? 16 : -16],
    clamp,
  );

  return (
    <AbsoluteFill style={{backgroundColor: theme.background.start, opacity}}>
      {mode === 'generated' && asset ? (
        <Img
          src={staticFile(asset)}
          style={{
            height,
            objectFit: 'cover',
            transform: `translateX(${generatedX}px) scale(${generatedScale})`,
            width,
          }}
        />
      ) : (
        <>
          <AbsoluteFill
            style={{
              background:
                `radial-gradient(circle at 50% 18%, ${hexToRgba(theme.accents.primary, 0.24)}, transparent 48%), linear-gradient(145deg, ${theme.background.start} 8%, ${theme.background.middle} 48%, ${theme.background.end} 100%)`,
            }}
          />
          <div
            style={{
              ...ambientOrbStyle({
                color: hexToRgba(theme.accents.primary, 0.74),
                frame,
                phase: 0.7,
                seed,
                size: Math.round(Math.min(width, height) * 0.62),
              }),
              left: '-10%',
              top: '-12%',
            }}
          />
          <div
            style={{
              ...ambientOrbStyle({
                color: hexToRgba(theme.accents.secondary, 0.74),
                frame,
                phase: 2.3,
                seed: seed >>> 3,
                size: Math.round(Math.min(width, height) * 0.68),
              }),
              bottom: '-18%',
              right: '-12%',
            }}
          />
        </>
      )}
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.045) 1px, transparent 1px)',
          backgroundSize: isVerticalDimensions(width, height) ? '72px 72px' : '84px 84px',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent 92%)',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            mode === 'generated'
              ? 'linear-gradient(180deg, rgba(2,6,23,0.66), rgba(2,6,23,0.78)), radial-gradient(circle at center, transparent 20%, rgba(2,6,23,0.72) 100%)'
              : 'radial-gradient(circle at center, transparent 30%, rgba(2,6,23,0.74) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

export const captionTopInset = (
  captions: CaptionMode,
  profile: RenderProfile,
): number => captions === 'off' ? 0 : profile.aspectRatio === '9:16' ? 180 : 190;

export const captionPhraseAtMs = (
  scene: TimedNarrationScene,
  currentMs: number,
) => scene.beats
  .flatMap((beat) => beat.phrases)
  .find((candidate) =>
    currentMs >= candidate.startMs &&
    currentMs < candidate.startMs + candidate.durationMs,
  );

export const PhraseCaption = ({
  captions,
  profile,
  scene,
}: {
  captions: CaptionMode;
  profile: RenderProfile;
  scene: TimedNarrationScene;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (captions === 'off') return null;

  const currentMs = (frame / fps) * 1_000;
  const phrase = captionPhraseAtMs(scene, currentMs);
  if (!phrase) return null;

  const phraseFrame = Math.round((phrase.startMs / 1_000) * fps);
  const phraseEndFrame = Math.max(
    phraseFrame + 1,
    Math.round(((phrase.startMs + phrase.durationMs) / 1_000) * fps),
  );
  const transitionFrames = Math.max(
    1,
    Math.min(Math.round(fps * 0.16), Math.floor((phraseEndFrame - phraseFrame) / 3)),
  );
  const opacity = Math.min(
    interpolate(frame, [phraseFrame, phraseFrame + transitionFrames], [0, 1], clamp),
    interpolate(
      frame,
      [phraseEndFrame - transitionFrames, phraseEndFrame],
      [1, 0],
      clamp,
    ),
  );
  const entrance = interpolate(
    frame,
    [phraseFrame, phraseFrame + transitionFrames],
    [0, 1],
    {...clamp, easing: Easing.out(Easing.cubic)},
  );
  const vertical = profile.aspectRatio === '9:16';

  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'center',
        left: profile.safeArea.left,
        opacity,
        position: 'absolute',
        right: profile.safeArea.right,
        top: profile.safeArea.top,
        transform: `translateY(${(1 - entrance) * -14}px) scale(${0.97 + entrance * 0.03})`,
        zIndex: 20,
      }}
    >
      <div
        style={{
          alignItems: 'center',
          background: 'rgba(2, 6, 23, 0.86)',
          border: '2px solid rgba(255,255,255,0.24)',
          borderRadius: vertical ? 24 : 22,
          boxShadow: '0 18px 48px rgba(0,0,0,0.5)',
          color: '#F8FAFC',
          display: 'flex',
          fontFamily: RENDER_FONT_FAMILY,
          justifyContent: 'center',
          minHeight: vertical ? 116 : 92,
          padding: vertical ? '20px 34px 24px' : '14px 34px 18px',
        }}
      >
        <FittedText
          fontWeight={800}
          letterSpacing={vertical ? -0.4 : -0.7}
          lineHeight={1.12}
          maxFontSize={vertical ? 48 : 46}
          maxHeight={vertical ? 104 : 80}
          maxLines={2}
          maxWidth={vertical ? 840 : 1420}
          text={phrase.text}
        />
      </div>
    </div>
  );
};
