// Pure motion arithmetic for code-drawn characters. Kept free of React and
// Remotion so the timing rules stay unit-testable without a browser, matching
// the convention used by text-fit.ts and timing.ts.

export interface CharacterBeat {
  /** Character id that speaks this beat, or null for unattributed narration. */
  speakerId: string | null;
  startMs: number;
  durationMs: number;
  caption: string;
}

export type StagePosition = 'left' | 'center' | 'right';

export const msAt = (frame: number, fps: number): number => (frame / fps) * 1_000;

/**
 * The beat covering `timeMs`, or null in the gaps between beats. Beats are
 * assumed ordered; the plan schema already guarantees non-decreasing starts.
 */
export const beatAt = (
  beats: readonly CharacterBeat[],
  timeMs: number,
): CharacterBeat | null =>
  beats.find(({startMs, durationMs}) => timeMs >= startMs && timeMs < startMs + durationMs) ?? null;

export const speakerAt = (
  beats: readonly CharacterBeat[],
  timeMs: number,
): string | null => beatAt(beats, timeMs)?.speakerId ?? null;

/**
 * The caption to display at `timeMs`. The last spoken line is held through the
 * gaps between beats so text never flickers off between lines.
 */
export const captionAt = (
  beats: readonly CharacterBeat[],
  timeMs: number,
): string => {
  let caption = '';
  for (const beat of beats) {
    if (timeMs >= beat.startMs) caption = beat.caption;
  }
  return caption;
};

/**
 * Evenly spaced stage x-centres for a cast, in 1920-wide stage units. Keeping
 * this pure means a three-hander's spacing is checkable without a browser.
 */
export const stageSlots = (
  count: number,
  stageWidth = 1_920,
  marginFraction = 0.30,
): number[] => {
  if (count <= 0) return [];
  if (count === 1) return [stageWidth / 2];
  // Inset the outer slots so no figure crowds the frame edge. A two-hander
  // wants a large inset - at 0.23 it left a ~700px hole through the middle of
  // the frame and the pair read as two separate portraits - but a three-hander
  // in a 1080-wide vertical frame needs the opposite, or the figures collide.
  // The fraction therefore comes from the layout rather than being fixed here.
  const margin = stageWidth * marginFraction;
  const span = stageWidth - margin * 2;
  return Array.from({length: count}, (_, index) => margin + (span * index) / (count - 1));
};

/**
 * Which way a character should face, given where they stand. Everyone turns
 * toward the middle of the stage; a lone or central figure faces the viewer.
 */
export const facingFor = (position: StagePosition): 'forward' | 'left' | 'right' =>
  position === 'left' ? 'right' : position === 'right' ? 'left' : 'forward';

/**
 * Mouth openness in 0..1. Without phoneme data the honest approximation is a
 * quasi-periodic flap: two detuned sines so the jaw never lands in an obvious
 * loop.
 *
 * `rest` adds a slower envelope that closes the mouth between word groups.
 * Without it the floor of 0.18 held the jaw permanently open, which read as a
 * continuous gabble rather than speech. Off by default so existing callers and
 * their expectations are unchanged.
 */
export const mouthOpenAt = ({
  frame,
  fps,
  phase = 0,
  rest = false,
  speaking,
}: {
  frame: number;
  fps: number;
  phase?: number;
  rest?: boolean;
  speaking: boolean;
}): number => {
  if (!speaking) return 0;
  const seconds = frame / fps + phase;
  const fast = Math.sin(seconds * Math.PI * 2 * 3.1);
  const slow = Math.sin(seconds * Math.PI * 2 * 1.7 + 0.9);
  const flap = Math.min(1, Math.max(0.18, (fast * 0.5 + slow * 0.5 + 1) / 2));
  if (!rest) return flap;
  // ~0.55 Hz word-group envelope: fully open mid-phrase, shut in the pauses.
  const envelope = (Math.sin(seconds * Math.PI * 2 * 0.55) + 1) / 2;
  const gate = Math.max(0, Math.min(1, (envelope - 0.22) / 0.5));
  return flap * gate;
};

/**
 * Head turn in degrees, positive toward stage centre. A listening character who
 * only bobs and blinks reads as a frozen sprite beside the speaker, so
 * non-speakers angle toward whoever is talking.
 */
export const headTurnAt = ({
  attending,
  frame,
  fps,
  phase = 0,
}: {
  /** True when this character should look toward the current speaker. */
  attending: boolean;
  frame: number;
  fps: number;
  phase?: number;
}): number => {
  const drift = Math.sin((frame / fps) * Math.PI * 0.5 + phase) * 1.5;
  return (attending ? 7 : 0) + drift;
};

/**
 * Listening nod in SVG units, added to the idle bob. Brief and infrequent, so
 * it reads as acknowledgement rather than a tic.
 */
export const nodAt = ({
  attending,
  everySeconds = 4.3,
  frame,
  fps,
  phase = 0,
}: {
  attending: boolean;
  everySeconds?: number;
  frame: number;
  fps: number;
  phase?: number;
}): number => {
  if (!attending) return 0;
  const cycle = (frame / fps + phase) % everySeconds;
  const nodDuration = 0.5;
  if (cycle > nodDuration) return 0;
  return Math.sin((cycle / nodDuration) * Math.PI) * 4;
};

/** Slow vertical bob so an idle character never reads as a frozen sprite. */
export const idleBobAt = ({
  frame,
  fps,
  phase = 0,
}: {
  frame: number;
  fps: number;
  phase?: number;
}): number => Math.sin((frame / fps) * Math.PI * 0.8 + phase) * 3;

/**
 * Blink envelope in 0..1, where 1 is fully closed. Blinks are brief and spaced
 * by `everySeconds`; `phase` offsets each character so they never blink in sync.
 */
export const blinkAt = ({
  frame,
  fps,
  everySeconds = 3.7,
  phase = 0,
}: {
  frame: number;
  fps: number;
  everySeconds?: number;
  phase?: number;
}): number => {
  const cycle = (frame / fps + phase) % everySeconds;
  const blinkDuration = 0.16;
  if (cycle > blinkDuration) return 0;
  return Math.sin((cycle / blinkDuration) * Math.PI);
};

/**
 * Eased 0..1 progress for an element that enters at `startMs` over
 * `durationMs`. Clamped at both ends so held frames stay stable.
 */
export const revealAt = ({
  timeMs,
  startMs,
  durationMs,
}: {
  timeMs: number;
  startMs: number;
  durationMs: number;
}): number => {
  if (durationMs <= 0) return timeMs >= startMs ? 1 : 0;
  const raw = (timeMs - startMs) / durationMs;
  const clamped = Math.min(1, Math.max(0, raw));
  // Cubic ease-out: fast settle, no overshoot to re-render on a held frame.
  return 1 - (1 - clamped) ** 3;
};

/**
 * Bridges a planned character scene onto the timeline the rest of the pipeline
 * already uses. A character scene carries no clock of its own: every cue is
 * derived from primaryItemTimings, exactly as sequence messages and chart
 * points are, so TTS timing changes flow through without touching the visual.
 */
export const characterSceneTimeline = ({
  callout,
  durationMs,
  primaryItems,
  primaryItemTimings,
  speakers,
  cast,
}: {
  callout: {primaryItemIndex: number} | null;
  durationMs: number;
  primaryItems: readonly string[];
  primaryItemTimings: readonly {startMs: number}[];
  speakers: readonly {primaryItemIndex: number; castId: string}[];
  cast: readonly {id: string; propPrimaryItemIndex: number | null}[];
}): {
  beats: CharacterBeat[];
  calloutAtMs: number | null;
  propAtMs: Record<string, number>;
} => {
  const startOf = (index: number): number | null =>
    primaryItemTimings[index]?.startMs ?? null;

  const ordered = [...speakers]
    .filter(({primaryItemIndex}) => primaryItemIndex < primaryItems.length)
    .sort((left, right) => left.primaryItemIndex - right.primaryItemIndex);

  const beats = ordered.flatMap((speaker, position): CharacterBeat[] => {
    const startMs = startOf(speaker.primaryItemIndex);
    if (startMs === null) return [];
    // A turn runs until the next one begins, so a speaker's mouth stops the
    // moment the other character takes over rather than at an invented mark.
    const nextStart = ordered[position + 1]
      ? startOf(ordered[position + 1]!.primaryItemIndex)
      : null;
    const endMs = nextStart ?? durationMs;
    return endMs > startMs
      ? [{
          speakerId: speaker.castId,
          startMs,
          durationMs: endMs - startMs,
          caption: primaryItems[speaker.primaryItemIndex] ?? '',
        }]
      : [];
  });

  const propAtMs: Record<string, number> = {};
  for (const member of cast) {
    if (member.propPrimaryItemIndex === null) continue;
    const startMs = startOf(member.propPrimaryItemIndex);
    if (startMs !== null) propAtMs[member.id] = startMs;
  }

  return {
    beats,
    calloutAtMs: callout ? startOf(callout.primaryItemIndex) : null,
    propAtMs,
  };
};

/**
 * Index of the primary item on screen at `timeMs`, or null before the first
 * one lands. The steps of an exchange drive timing but were never drawn, so a
 * viewer saw people talking with no indication of which step they were on.
 * The last step is held to the end rather than disappearing.
 */
export const currentItemIndexAt = (
  timings: readonly {startMs: number}[],
  timeMs: number,
): number | null => {
  let current: number | null = null;
  for (const [index, timing] of timings.entries()) {
    if (timeMs >= timing.startMs) current = index;
  }
  return current;
};

export interface CharacterStageLayout {
  calloutTop: number;
  counterTop: number;
  /**
   * The floor the cast stands on, in stage units. Figures are positioned by
   * their feet against this line rather than by their heads: heightScale varies
   * per character, so top-aligning them left a child's feet floating ~150px
   * above an adult's with no shared ground plane.
   */
  figureBaseline: number;
  figureSize: number;
  signTop: number;
  /** Outer-slot inset as a fraction of stage width, for stageSlots. */
  slotMargin: number;
  stageHeight: number;
  stageWidth: number;
}

/** Aspect of the full-body figure drawing (viewBox 200 x 340). */
export const FIGURE_ASPECT = 340 / 200;
/** Aspect of the cropped upper-body drawing used behind a set piece. */
export const FIGURE_CROPPED_ASPECT = 240 / 200;
/** Feet sit at this fraction of the full-body viewBox height. */
export const FIGURE_FOOT_RATIO = 324 / 340;

/** Near shoulder pivot in figure viewBox units. */
export const NEAR_SHOULDER = {x: 131, y: 152} as const;
/** Far shoulder pivot in figure viewBox units. */
export const FAR_SHOULDER = {x: 69, y: 152} as const;
const UPPER_ARM = 38;
const FOREARM = 32;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Offset of a limb segment rotated `degrees` from hanging straight down. */
const limbSegment = (length: number, degrees: number): {dx: number; dy: number} => ({
  dx: -length * Math.sin(radians(degrees)),
  dy: length * Math.cos(radians(degrees)),
});

/**
 * Elbow and hand positions in viewBox units for a given arm angle. The forearm
 * bends back toward the body as the upper arm rises, so raising the arm brings
 * the hand up in front of the chest instead of swinging it straight out past
 * the edge of the drawing, which is where the old single-segment arm put it.
 */
export const armJointsFor = (
  armAngle: number,
  shoulder: {x: number; y: number} = NEAR_SHOULDER,
): {elbow: {x: number; y: number}; hand: {x: number; y: number}} => {
  const upper = limbSegment(UPPER_ARM, armAngle);
  const elbow = {x: shoulder.x + upper.dx, y: shoulder.y + upper.dy};
  const lower = limbSegment(FOREARM, armAngle * 0.25);
  return {elbow, hand: {x: elbow.x + lower.dx, y: elbow.y + lower.dy}};
};

/**
 * Where a held prop belongs, in viewBox units, mirrored to match `facing`.
 * The prop tile used to sit at a fixed fraction of the figure size, so the arm
 * moved and the prop stayed put, floating in mid-air beside an empty hand.
 */
export const propAnchorFor = ({
  armAngle,
  facing,
}: {
  armAngle: number;
  facing: 'forward' | 'left' | 'right';
}): {x: number; y: number} => {
  const {hand} = armJointsFor(armAngle);
  // Offset clear of the fist: centring the tile on the hand buried it.
  const x = hand.x + 16;
  return {x: facing === 'left' ? 200 - x : x, y: hand.y - 30};
};


/**
 * Where to place a figure's top edge so its feet land on the stage floor.
 * A cropped figure has no feet, so it is hung from the counter line instead.
 */
export const figureTopFor = ({
  cropped,
  layout,
  size,
}: {
  cropped: boolean;
  layout: Pick<CharacterStageLayout, 'counterTop' | 'figureBaseline'>;
  size: number;
}): number => cropped
  ? layout.counterTop - size * FIGURE_CROPPED_ASPECT * 0.78
  : layout.figureBaseline - size * FIGURE_ASPECT * FIGURE_FOOT_RATIO;

/** The y of a figure's feet (or the counter crop) in stage units. */
export const figureFootFor = ({
  cropped,
  layout,
  size,
}: {
  cropped: boolean;
  layout: Pick<CharacterStageLayout, 'counterTop' | 'figureBaseline'>;
  size: number;
}): number => cropped
  ? layout.counterTop
  : figureTopFor({cropped, layout, size}) + size * FIGURE_ASPECT * FIGURE_FOOT_RATIO;

/**
 * Stage geometry per orientation. A 9:16 frame is not a scaled 16:9 one: the
 * cast has to sit lower and smaller so the figures fill the narrow width
 * without colliding, and the callout moves above them because there is no room
 * beside them. Pure, so the vertical case is checkable without a browser.
 */
export const characterStageLayout = ({
  castSize,
  hasCenter,
  vertical,
}: {
  castSize: number;
  hasCenter: boolean;
  vertical: boolean;
}): CharacterStageLayout => {
  if (!vertical) {
    return {
      // A centre-stage figure stands where the callout would otherwise float.
      calloutTop: hasCenter ? 300 : 402,
      counterTop: 760,
      figureBaseline: 950,
      figureSize: castSize >= 3 ? 330 : 390,
      // On the counter front, not the wall: at 252 it collided with the scene
      // title the narrated view draws in the top band.
      signTop: 812,
      slotMargin: castSize >= 3 ? 0.26 : 0.30,
      stageHeight: 1_080,
      stageWidth: 1_920,
    };
  }
  // Vertical: the cast drops into the lower-middle band, leaving the top third
  // for the title and callout and the bottom for the caption lane.
  const figureSize = castSize >= 3 ? 250 : 330;
  return {
    calloutTop: 600,
    counterTop: 1_290,
    figureBaseline: 1_500,
    figureSize,
    signTop: 1_352,
    slotMargin: castSize >= 3 ? 0.17 : 0.30,
    stageHeight: 1_920,
    stageWidth: 1_080,
  };
};
