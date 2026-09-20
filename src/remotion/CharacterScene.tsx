import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {CharacterFigure} from './CharacterFigure.js';
import {VisualIcon} from './SemanticIcon.js';
import {keySafeShadow} from './chroma-key.js';
import {castAppearances, type CharacterTraits} from './character-appearance.js';
import {
  blinkAt,
  captionAt,
  characterStageLayout,
  facingFor,
  figureFootFor,
  figureTopFor,
  headTurnAt,
  idleBobAt,
  mouthOpenAt,
  msAt,
  nodAt,
  propAnchorFor,
  revealAt,
  speakerAt,
  stageSlots,
  type CharacterBeat,
  type StagePosition,
} from './character-motion.js';
import {videoPaletteFor} from '../visual-palettes.js';
import type {VideoPalette} from '../types.js';

// A staging surface, not a story. Everything topic-specific — who is present,
// what they hold, what the scene concludes — arrives as data. Props and
// callout marks are ids from the existing semantic icon catalog, so no new
// asset registry is introduced.

export type CharacterCastMember = {
  id: string;
  /** Explicitly authored looks; anything omitted is derived from the id. */
  traits?: CharacterTraits;
  position: StagePosition;
  outfit: 'casual' | 'uniform';
  /** Stand behind the set piece, cropped at the waist. */
  behindSet: boolean;
  /** Semantic icon id raised by this character, or null for empty hands. */
  prop: string | null;
  propAtMs: number;
};

export type SceneCallout = {
  icon: string | null;
  eyebrow: string;
  headline: string;
  atMs: number;
  tone: 'neutral' | 'positive' | 'warning';
};

export type CharacterSceneProps = {
  backgroundImage?: string;
  beats: readonly CharacterBeat[];
  callout: SceneCallout | null;
  cast: readonly CharacterCastMember[];
  palette: VideoPalette;
  set: 'none' | 'counter';
  /** Wall sign text, e.g. RECEPTION or CLINIC. Null leaves the wall bare. */
  sign: string | null;
  title: string;
  /** 9:16 needs its own geometry, not a scaled-down 16:9 stage. */
  vertical: boolean;
};

const TONES = {
  neutral: {border: '#38BDF8', fill: '#082F49', text: '#E0F2FE'},
  positive: {border: '#34D399', fill: '#052E1B', text: '#ECFDF5'},
  warning: {border: '#FBBF24', fill: '#3A2606', text: '#FEF3C7'},
} as const;

export type CharacterStageProps = Omit<CharacterSceneProps, 'backgroundImage' | 'title'>;

/**
 * The staged people, props, set piece and callout, with no background, title
 * or caption of its own. The narrated pipeline supplies all three, so the
 * stage must not draw them; CharacterScene below adds them for standalone use.
 */
export const CharacterStage = ({
  beats,
  callout,
  cast,
  palette,
  set,
  sign,
  vertical,
}: CharacterStageProps) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const theme = videoPaletteFor(palette);
  const timeMs = msAt(frame, fps);
  const layout = characterStageLayout({
    castSize: cast.length,
    hasCenter: cast.some(({position}) => position === 'center'),
    vertical,
  });
  const scale = Math.min(width / layout.stageWidth, height / layout.stageHeight);

  const speaker = speakerAt(beats, timeMs);
  const appearances = castAppearances(cast.map(({id, traits}) => traits ? {id, traits} : {id}));
  const slots = stageSlots(cast.length, layout.stageWidth, layout.slotMargin);
  const calloutReveal = callout
    ? revealAt({timeMs, startMs: callout.atMs, durationMs: 620})
    : 0;
  const tone = TONES[callout?.tone ?? 'neutral'];

  // Outfits alternate across the cast so neighbours never share a colour.
  const accentFor = (index: number): string =>
    [theme.accents.primary, theme.accents.secondary, '#94A3B8'][index % 3] as string;

  const behind = cast.flatMap((member, index) => member.behindSet ? [slots[index] as number] : []);
  // Clamp to the stage: a character standing in the outermost slot puts the
  // counter's edge past the frame, which reads as a wall rather than a desk.
  const counterInset = layout.stageWidth * 0.06;
  const counterLeft = behind.length
    ? Math.max(counterInset, Math.min(...behind) - layout.figureSize * 0.86)
    : 0;
  const counterRight = behind.length
    ? Math.min(layout.stageWidth - counterInset, Math.max(...behind) + layout.figureSize * 0.86)
    : 0;

  return (
    <AbsoluteFill style={{fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden'}}>
      <div
        style={{
          height: layout.stageHeight,
          left: '50%',
          position: 'absolute',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${scale})`,
          width: layout.stageWidth,
        }}
      >
        <div
          style={{
            background: `linear-gradient(180deg, transparent 0%, ${theme.accents.primary}0D 38%, rgba(2,6,23,0.34) 100%)`,
            bottom: 0,
            left: 0,
            position: 'absolute',
            right: 0,
            top: layout.figureBaseline - layout.stageHeight * 0.06,
          }}
        />

        {cast.map((member, index) => {
          const slot = slots[index] as number;
          const appearance = appearances[member.id];
          if (!appearance) return null;
          const facing = facingFor(member.position);
          const size = layout.figureSize * appearance.heightScale;
          const propReveal = member.prop
            ? revealAt({timeMs, startMs: member.propAtMs, durationMs: 520})
            : 0;
          const armAngle = propReveal > 0 ? -17 - 45 * propReveal : -17;
          // Figures stand on a shared floor. heightScale varies per character,
          // so aligning their heads left a child's feet ~150px above an
          // adult's and the pair read as a composite rather than a scene.
          const top = figureTopFor({cropped: member.behindSet, layout, size});
          const speaking = speaker === member.id;
          // A listener who only bobs and blinks reads as a frozen sprite, so
          // non-speakers turn toward whoever is talking.
          const attending = !speaking && speaker !== null;
          // Scale from figure viewBox units (200 wide) to stage pixels.
          const unit = size / 200;
          const anchor = propAnchorFor({armAngle, facing});
          const propSize = size * 0.26;
          const footY = figureFootFor({cropped: member.behindSet, layout, size});
          return (
            <div key={member.id}>
              {member.behindSet ? null : (
                <div
                  style={{
                    background: `radial-gradient(ellipse at center, rgba(2,6,23,0.5) 0%, rgba(2,6,23,0.22) 55%, transparent 78%)`,
                    borderRadius: '50%',
                    height: size * 0.11,
                    left: slot - size * 0.3,
                    position: 'absolute',
                    top: footY - size * 0.055,
                    width: size * 0.6,
                  }}
                />
              )}
              <div style={{left: slot - size / 2, position: 'absolute', top}}>
                <CharacterFigure
                  accent={accentFor(index)}
                  appearance={appearance}
                  armAngle={armAngle}
                  blink={blinkAt({frame, fps, phase: index * 1.8})}
                  bob={idleBobAt({frame, fps, phase: index * 2.4})}
                  cropped={member.behindSet}
                  facing={facing}
                  headNod={nodAt({attending, frame, fps, phase: index * 1.3})}
                  headTurn={headTurnAt({attending, frame, fps, phase: index * 2.1})
                    * (facing === 'left' ? -1 : 1)}
                  mood={callout && calloutReveal > 0.5 && callout.tone === 'positive'
                    ? 'positive'
                    : callout && calloutReveal > 0.5 && callout.tone === 'warning'
                      ? 'concerned'
                      : 'neutral'}
                  mouthOpen={mouthOpenAt({frame, fps, phase: index * 0.7, rest: true, speaking})}
                  outfit={member.outfit}
                  size={size}
                />
              </div>

              {member.prop ? (
                <div
                  style={{
                    alignItems: 'center',
                    background: '#0F172A',
                    border: `3px solid ${theme.accents.primary}`,
                    borderRadius: 18,
                    boxShadow: keySafeShadow(`0 0 38px ${theme.accents.primary}88`),
                    display: 'flex',
                    height: propSize,
                    justifyContent: 'center',
                    // Anchored to the hand, so the arm and the prop move as one.
                    left: slot - size / 2 + anchor.x * unit - propSize / 2,
                    opacity: propReveal,
                    position: 'absolute',
                    top: top + anchor.y * unit - propSize / 2,
                    transform: `translateY(${(1 - propReveal) * 26}px) scale(${0.86 + propReveal * 0.14})`,
                    width: propSize,
                  }}
                >
                  <VisualIcon color={theme.accents.primary} id={member.prop} size="62%" />
                </div>
              ) : null}
            </div>
          );
        })}

        {callout ? (
          <div
            style={{
              alignItems: 'center',
              background: tone.fill,
              border: `4px solid ${tone.border}`,
              borderRadius: 18,
              boxShadow: keySafeShadow(`0 0 46px ${tone.border}99`),
              display: 'flex',
              gap: 18,
              left: '50%',
              maxWidth: 760,
              opacity: calloutReveal,
              padding: '20px 30px',
              position: 'absolute',
              top: layout.calloutTop,
              transform: `translateX(-50%) scale(${0.9 + calloutReveal * 0.1})`,
            }}
          >
            {callout.icon ? (
              <VisualIcon color={tone.border} id={callout.icon} size={46} />
            ) : null}
            <div>
              <div style={{color: '#94A3B8', fontSize: 17, letterSpacing: 2}}>
                {callout.eyebrow.toLocaleUpperCase('en-US')}
              </div>
              <div style={{color: tone.text, fontSize: 34, fontWeight: 700}}>
                {callout.headline}
              </div>
            </div>
          </div>
        ) : null}

        {set === 'counter' && behind.length ? (
          <>
            {/* Top surface, then front face. One flat gradient running to the
                frame edge read as a wall filling the corner rather than a
                desk standing in a room. */}
            <div
              style={{
                background: `linear-gradient(180deg, #46596F 0%, #2B3A4E 100%)`,
                borderRadius: 6,
                borderTop: `4px solid ${theme.accents.primary}`,
                boxShadow: keySafeShadow('0 -10px 30px rgba(2,6,23,0.6)'),
                height: 26,
                left: counterLeft,
                position: 'absolute',
                top: layout.counterTop,
                width: counterRight - counterLeft,
              }}
            />
            <div
              style={{
                background: 'linear-gradient(180deg, #1E293B 0%, #111C2E 100%)',
                height: Math.max(0, layout.figureBaseline - layout.counterTop - 26),
                left: counterLeft + 14,
                position: 'absolute',
                top: layout.counterTop + 26,
                width: Math.max(0, counterRight - counterLeft - 28),
              }}
            />
          </>
        ) : null}

        {sign ? (
          <div
            style={{
              border: `2px solid ${theme.accents.secondary}77`,
              borderRadius: 8,
              color: theme.accents.secondary,
              fontSize: 26,
              fontWeight: 600,
              left: (counterLeft + counterRight) / 2 || layout.stageWidth / 2,
              letterSpacing: 10,
              padding: '14px 30px',
              position: 'absolute',
              top: layout.signTop,
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {sign}
          </div>
        ) : null}

      </div>
    </AbsoluteFill>
  );
};

/**
 * Standalone framing: background, title and caption lane around a stage. Used
 * by the fixture script; the narrated pipeline renders CharacterStage directly
 * because it already draws its own background, title and captions.
 */
export const CharacterScene = ({
  backgroundImage,
  title,
  ...stage
}: CharacterSceneProps) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const theme = videoPaletteFor(stage.palette);
  const caption = captionAt(stage.beats, msAt(frame, fps));
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${theme.background.start} 0%, ${theme.background.middle} 52%, ${theme.background.end} 100%)`,
        fontFamily: 'Inter, system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      {backgroundImage ? (
        <>
          <Img
            src={staticFile(backgroundImage)}
            style={{height: '100%', inset: 0, objectFit: 'cover', position: 'absolute', width: '100%'}}
          />
          {/* Flat art needs a floor of contrast under it; a photographic plate
              can be any brightness, so darken it rather than hope. */}
          <div style={{background: 'rgba(2, 6, 23, 0.58)', inset: 0, position: 'absolute'}} />
        </>
      ) : null}
      <div
        style={{
          background: `radial-gradient(circle at 62% 24%, ${theme.accents.primary}22, transparent 58%)`,
          inset: 0,
          position: 'absolute',
        }}
      />
      <div style={{color: '#F8FAFC', fontSize: 62, fontWeight: 700, left: 120, letterSpacing: -1, maxWidth: 1_400, position: 'absolute', textShadow: keySafeShadow('0 4px 24px rgba(2,6,23,0.8)'), top: 84, zIndex: 3}}>
        {title}
      </div>
      <div style={{background: theme.accents.primary, borderRadius: 3, height: 6, left: 120, position: 'absolute', top: 178, width: 132, zIndex: 3}} />

      <CharacterStage {...stage} />

      <div style={{background: 'linear-gradient(180deg, rgba(2,6,23,0) 0%, rgba(2,6,23,0.88) 62%)', bottom: 0, height: 300, left: 0, position: 'absolute', right: 0, zIndex: 3}} />
      <div
        style={{
          bottom: 56,
          color: '#F8FAFC',
          fontSize: 44,
          fontWeight: 600,
          left: '50%',
          lineHeight: 1.28,
          maxWidth: 1_460,
          position: 'absolute',
          textAlign: 'center',
          textShadow: keySafeShadow('0 3px 18px rgba(2,6,23,0.95)'),
          transform: 'translateX(-50%)',
          width: '100%',
          zIndex: 3,
        }}
      >
        {caption}
      </div>
    </AbsoluteFill>
  );
};
