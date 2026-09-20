import type {CSSProperties} from 'react';
import {keySafeFilter} from './chroma-key.js';
import type {Build, CharacterAppearance, HairStyle} from './character-appearance.js';
import {FAR_SHOULDER, NEAR_SHOULDER, armJointsFor} from './character-motion.js';

// One figure, fully described by data. Nothing here knows what the scene is
// about: appearance arrives from character-appearance.ts, pose arrives as
// numbers, and the outfit colour is whatever the caller passes. Follows the
// AnimatedVisualIcon approach in SemanticIcon.tsx, where motion is frame math
// over static SVG rather than an imported animation file.
//
// Limbs are stroked paths with round caps rather than rectangles: a stroke
// gives a jointed arm a real elbow and rounded shoulder for free, where the
// single rotated rect it replaced read as a stiff semaphore paddle.

const EYE = '#1E293B';
const SCLERA = '#F8FAFC';

/** Hair silhouettes over a head centred at (100, 70) with r=40. */
const HAIR_PATHS: Record<HairStyle, string | null> = {
  short: 'M60 68 q2 -44 40 -44 q38 0 40 44 q-8 -6 -14 -22 q-24 14 -52 8 q-8 8 -14 14 Z',
  cropped: 'M60 66 q4 -42 40 -42 q36 0 40 42 q-12 -18 -40 -18 q-28 0 -40 18 Z',
  bob: 'M56 74 q0 -50 44 -50 q44 0 44 50 l0 34 q-10 4 -14 -6 l0 -26 q-30 10 -60 0 l0 26 q-4 10 -14 6 Z',
  tied: 'M60 66 q4 -42 40 -42 q36 0 40 42 q-12 -18 -40 -18 q-28 0 -40 18 Z M138 48 a16 16 0 1 1 0.1 0 Z',
  curly: 'M58 70 q-4 -22 14 -30 q2 -18 28 -18 q26 0 28 18 q18 8 14 30 q-8 -14 -20 -12 q-10 -12 -22 -12 q-12 0 -22 12 q-12 -2 -20 12 Z',
  bald: null,
};

/** Half-widths at the shoulder and hem, in viewBox units, per build. */
const BUILD_SHAPE: Record<Build, {hemHalf: number; limb: number; shoulderHalf: number}> = {
  slim: {hemHalf: 34, limb: 17, shoulderHalf: 33},
  regular: {hemHalf: 38, limb: 19, shoulderHalf: 37},
  broad: {hemHalf: 44, limb: 22, shoulderHalf: 42},
};

const HEAD_RADIUS: Record<CharacterAppearance['age'], number> = {
  child: 42,
  adult: 40,
  senior: 39,
};

export type CharacterMood = 'neutral' | 'positive' | 'concerned';

export type CharacterFigureProps = {
  /** Garment colour; callers pass a palette accent. */
  accent: string;
  appearance: CharacterAppearance;
  /** Degrees. Negative raises the near arm, for presenting or gesturing. */
  armAngle: number;
  /** 0..1, where 1 is a fully closed eyelid. */
  blink: number;
  /** Vertical offset in SVG units, from idleBobAt. */
  bob: number;
  /** Draw upper body only, for a figure standing behind a set piece. */
  cropped: boolean;
  facing: 'forward' | 'left' | 'right';
  /** Listening nod in SVG units, from nodAt. Moves the head, not the body. */
  headNod?: number;
  /** Degrees of head turn toward stage centre, from headTurnAt. */
  headTurn?: number;
  /** Resting expression. Overridden by the jaw while speaking. */
  mood?: CharacterMood;
  /** 0..1 jaw openness from mouthOpenAt. */
  mouthOpen: number;
  outfit: 'casual' | 'uniform';
  size: number;
  style?: CSSProperties;
};

export const CharacterFigure = ({
  accent,
  appearance,
  armAngle,
  blink,
  bob,
  cropped,
  facing,
  headNod = 0,
  headTurn = 0,
  mood = 'neutral',
  mouthOpen,
  outfit,
  size,
  style,
}: CharacterFigureProps) => {
  const {accessory, age, build, hairColor, hairStyle, skin} = appearance;
  const shape = BUILD_SHAPE[build];
  const headR = HEAD_RADIUS[age];
  const eyeScale = Math.max(0.08, 1 - blink);
  const hair = HAIR_PATHS[hairStyle];
  const viewHeight = cropped ? 240 : 340;

  const {shoulderHalf, hemHalf, limb} = shape;
  const torso = `M${100 - shoulderHalf} 148 q0 -26 ${shoulderHalf} -26 q${shoulderHalf} 0 ${shoulderHalf} 26 l${hemHalf - shoulderHalf} 96 q${-hemHalf} 10 ${-hemHalf * 2} 0 Z`;

  const near = armJointsFor(armAngle, NEAR_SHOULDER);
  // The far arm trails the near one and stays close to the body, so it reads as
  // an arm behind the torso rather than a slab poking out of the shoulder.
  const far = armJointsFor(armAngle * 0.3, FAR_SHOULDER);

  // A mouth that only ever opens cannot look pleased, and a wide dark oval on
  // an otherwise blank face reads as alarm. So the jaw drives an ellipse while
  // speaking and a stroked curve carries the resting expression.
  const speaking = mouthOpen > 0.12;
  const curve = mood === 'positive' ? 7 : mood === 'concerned' ? -5 : 1.5;

  return (
    <svg
      viewBox={`0 0 200 ${viewHeight}`}
      width={size}
      height={size * (viewHeight / 200)}
      style={{
        filter: keySafeFilter('drop-shadow(0 18px 26px rgba(2, 6, 23, 0.55))'),
        overflow: 'visible',
        ...style,
      }}
    >
      {/* Mirroring turns the figure toward stage centre; the near arm swaps
          sides with it, which is what sells the change of orientation. */}
      <g transform={facing === 'left' ? 'translate(200 0) scale(-1 1)' : undefined}>
        <g transform={`translate(0, ${bob})`}>
          {cropped ? null : (
            <>
              <rect x={100 - limb - 2} y={236} width={limb + 1} height={84} rx={(limb + 1) / 2} fill="#1E293B" />
              <rect x={100 + 1} y={236} width={limb + 1} height={84} rx={(limb + 1) / 2} fill="#1E293B" />
              <rect x={100 - limb - 10} y={310} width={limb + 13} height={14} rx={7} fill="#0F172A" />
              <rect x={100 - 3} y={310} width={limb + 13} height={14} rx={7} fill="#0F172A" />
            </>
          )}

          {/* Far arm, behind the torso */}
          <path
            d={`M${FAR_SHOULDER.x} ${FAR_SHOULDER.y} L${far.elbow.x} ${far.elbow.y} L${far.hand.x} ${far.hand.y}`}
            stroke={accent}
            strokeWidth={limb - 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.6}
          />

          <path d={torso} fill={accent} />
          {outfit === 'uniform' ? (
            <>
              <rect x={96} y={126} width={8} height={112} rx={4} fill="#0F172A" opacity={0.35} />
              <rect x={100 + shoulderHalf - 22} y={158} width={18} height={12} rx={3} fill="#F8FAFC" opacity={0.9} />
            </>
          ) : null}

          {/* Neck */}
          <rect x={90} y={104} width={20} height={26} rx={10} fill={skin.shade} />

          {/* Head and face turn together, hinged at the neck. The nod is a
              head movement: folding it into the body bob sank a listener's
              feet through the floor the baseline had just aligned them to. */}
          <g transform={`translate(0 ${headNod}) rotate(${headTurn} 100 106)`}>
            <circle cx={100} cy={70} r={headR} fill={skin.fill} />
            {hair ? <path d={hair} fill={hairColor} /> : null}
            <circle cx={100 - headR - 2} cy={74} r={7} fill={skin.shade} />

            {/* Eyes: sclera, pupil and a highlight, scaled about their own
                centre so a blink closes the lid over the whole eye. */}
            {[86, 114].map((cx) => (
              <g key={cx} transform={`translate(${cx} 70) scale(1 ${eyeScale})`}>
                <ellipse cx={0} cy={0} rx={6.4} ry={5.6} fill={SCLERA} />
                <circle cx={0} cy={0.6} r={3.4} fill={EYE} />
                <circle cx={1.4} cy={-1.6} r={1.1} fill={SCLERA} opacity={0.9} />
              </g>
            ))}

            {/* Brows lift slightly as the jaw opens, which reads as animation */}
            <rect x={80} y={54 - mouthOpen * 2} width={13} height={3} rx={1.5} fill={hairColor} />
            <rect x={107} y={54 - mouthOpen * 2} width={13} height={3} rx={1.5} fill={hairColor} />

            <path
              d="M100 76 q-3 6 1 9"
              stroke={skin.shade}
              strokeWidth={2.4}
              strokeLinecap="round"
              fill="none"
            />

            {speaking ? (
              <ellipse cx={100} cy={92} rx={8} ry={1.5 + mouthOpen * 6.5} fill="#7F1D1D" />
            ) : (
              <path
                d={`M92 91 q8 ${curve} 16 0`}
                stroke="#7F1D1D"
                strokeWidth={2.8}
                strokeLinecap="round"
                fill="none"
              />
            )}

            {accessory === 'glasses' ? (
              <g fill="none" stroke={EYE} strokeWidth={3} opacity={0.85}>
                <circle cx={86} cy={70} r={12} />
                <circle cx={114} cy={70} r={12} />
                <path d="M98 70 h4" />
              </g>
            ) : null}
            {accessory === 'cap' ? (
              <g fill={hairColor}>
                <path d="M58 62 q6 -40 42 -40 q36 0 42 40 Z" />
                <rect x={92} y={58} width={70} height={10} rx={5} />
              </g>
            ) : null}
          </g>

          {/* Near arm, in front of the torso, jointed at the elbow. The rim
              behind it is what separates a same-coloured arm from the body. */}
          <path
            d={`M${NEAR_SHOULDER.x} ${NEAR_SHOULDER.y} L${near.elbow.x} ${near.elbow.y} L${near.hand.x} ${near.hand.y}`}
            stroke="rgba(2,6,23,0.30)"
            strokeWidth={limb + 7}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d={`M${NEAR_SHOULDER.x} ${NEAR_SHOULDER.y} L${near.elbow.x} ${near.elbow.y} L${near.hand.x} ${near.hand.y}`}
            stroke={accent}
            strokeWidth={limb}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <circle cx={near.hand.x} cy={near.hand.y} r={limb * 0.55} fill={skin.fill} />
        </g>
      </g>
    </svg>
  );
};
