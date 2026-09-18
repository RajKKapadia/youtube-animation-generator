import {describe, expect, it} from 'vitest';
import {
  armJointsFor,
  beatAt,
  blinkAt,
  captionAt,
  characterSceneTimeline,
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
  FIGURE_ASPECT,
  FIGURE_FOOT_RATIO,
  type CharacterBeat,
} from './character-motion.js';

const beats: CharacterBeat[] = [
  {speakerId: 'guest', startMs: 400, durationMs: 2_800, caption: 'first'},
  {speakerId: 'clerk', startMs: 3_500, durationMs: 2_800, caption: 'second'},
  {speakerId: 'guest', startMs: 6_600, durationMs: 3_200, caption: 'third'},
];

describe('msAt', () => {
  it('converts frames to milliseconds at the composition rate', () => {
    expect(msAt(0, 30)).toBe(0);
    expect(msAt(30, 30)).toBe(1_000);
    expect(msAt(45, 30)).toBe(1_500);
  });
});

describe('beatAt', () => {
  it('resolves the covering beat and returns null in the gaps', () => {
    expect(beatAt(beats, 1_000)?.speakerId).toBe('guest');
    expect(beatAt(beats, 4_000)?.speakerId).toBe('clerk');
    expect(beatAt(beats, 3_300)).toBeNull();
    expect(beatAt(beats, 0)).toBeNull();
    expect(beatAt(beats, 9_900)).toBeNull();
  });

  it('treats a beat as half-open so adjacent beats never both match', () => {
    expect(beatAt(beats, 400)?.speakerId).toBe('guest');
    expect(beatAt(beats, 3_200)).toBeNull();
  });
});

describe('speakerAt', () => {
  it('names the speaking character, or nobody between beats', () => {
    expect(speakerAt(beats, 1_000)).toBe('guest');
    expect(speakerAt(beats, 5_000)).toBe('clerk');
    expect(speakerAt(beats, 3_300)).toBeNull();
  });
});

describe('mouthOpenAt', () => {
  it('keeps a silent character fully closed', () => {
    for (const frame of [0, 7, 19, 44]) {
      expect(mouthOpenAt({frame, fps: 30, speaking: false})).toBe(0);
    }
  });

  it('holds a speaking mouth inside a readable open range', () => {
    for (let frame = 0; frame < 120; frame += 1) {
      const open = mouthOpenAt({frame, fps: 30, speaking: true});
      expect(open).toBeGreaterThanOrEqual(0.18);
      expect(open).toBeLessThanOrEqual(1);
    }
  });

  it('actually moves the jaw rather than holding one value', () => {
    const samples = new Set(
      Array.from({length: 40}, (_, frame) =>
        Math.round(mouthOpenAt({frame, fps: 30, speaking: true}) * 100),
      ),
    );
    expect(samples.size).toBeGreaterThan(8);
  });
});

describe('blinkAt', () => {
  it('stays open for most of the cycle and closes briefly', () => {
    expect(blinkAt({frame: 0, fps: 30})).toBe(0);
    expect(blinkAt({frame: 30, fps: 30})).toBe(0);
    // Peak closure sits mid-way through the 0.16s blink window.
    expect(blinkAt({frame: 2.4, fps: 30})).toBeGreaterThan(0.9);
  });

  it('offsets characters by phase so they never blink in unison', () => {
    const together = Array.from({length: 90}, (_, frame) =>
      blinkAt({frame, fps: 30, phase: 0}) > 0.5 &&
      blinkAt({frame, fps: 30, phase: 1.8}) > 0.5);
    expect(together.some(Boolean)).toBe(false);
  });
});

describe('idleBobAt', () => {
  it('stays within a few pixels so an idle pose never drifts', () => {
    for (let frame = 0; frame < 300; frame += 1) {
      expect(Math.abs(idleBobAt({frame, fps: 30}))).toBeLessThanOrEqual(3);
    }
  });
});

describe('revealAt', () => {
  it('clamps before the start and after the finish', () => {
    expect(revealAt({timeMs: 0, startMs: 1_000, durationMs: 500})).toBe(0);
    expect(revealAt({timeMs: 999, startMs: 1_000, durationMs: 500})).toBe(0);
    expect(revealAt({timeMs: 5_000, startMs: 1_000, durationMs: 500})).toBe(1);
  });

  it('eases out without overshooting, so held frames stay stable', () => {
    const mid = revealAt({timeMs: 1_250, startMs: 1_000, durationMs: 500});
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
  });

  it('treats a zero duration as an instant switch', () => {
    expect(revealAt({timeMs: 999, startMs: 1_000, durationMs: 0})).toBe(0);
    expect(revealAt({timeMs: 1_000, startMs: 1_000, durationMs: 0})).toBe(1);
  });
});

describe('captionAt', () => {
  it('holds the last spoken line through the gaps between beats', () => {
    expect(captionAt(beats, 0)).toBe('');
    expect(captionAt(beats, 1_000)).toBe('first');
    // 3_300 falls between beats; the previous line must stay on screen.
    expect(captionAt(beats, 3_300)).toBe('first');
    expect(captionAt(beats, 4_000)).toBe('second');
    expect(captionAt(beats, 99_000)).toBe('third');
  });
});

describe('stageSlots', () => {
  it('centres a single figure', () => {
    expect(stageSlots(1)).toEqual([960]);
  });

  it('spaces a cast evenly and symmetrically about the centre', () => {
    const pair = stageSlots(2);
    expect(pair).toHaveLength(2);
    expect((pair[0]! + pair[1]!) / 2).toBeCloseTo(960);

    const trio = stageSlots(3);
    expect(trio[1]).toBeCloseTo(960);
    expect(trio[1]! - trio[0]!).toBeCloseTo(trio[2]! - trio[1]!);
  });

  it('keeps every figure inside the frame', () => {
    for (const count of [1, 2, 3, 4]) {
      for (const slot of stageSlots(count)) {
        expect(slot).toBeGreaterThan(300);
        expect(slot).toBeLessThan(1_620);
      }
    }
  });

  it('returns nothing for an empty cast', () => {
    expect(stageSlots(0)).toEqual([]);
  });
});

describe('facingFor', () => {
  it('turns the outer characters toward the middle', () => {
    expect(facingFor('left')).toBe('right');
    expect(facingFor('right')).toBe('left');
    expect(facingFor('center')).toBe('forward');
  });
});

describe('characterSceneTimeline', () => {
  const base = {
    durationMs: 9_000,
    primaryItems: ['first step', 'second step', 'third step'],
    primaryItemTimings: [{startMs: 400}, {startMs: 3_500}, {startMs: 6_600}],
    speakers: [
      {primaryItemIndex: 0, castId: 'guest'},
      {primaryItemIndex: 1, castId: 'clerk'},
      {primaryItemIndex: 2, castId: 'guest'},
    ],
    cast: [
      {id: 'guest', propPrimaryItemIndex: 2},
      {id: 'clerk', propPrimaryItemIndex: null},
    ],
    callout: {primaryItemIndex: 2},
  };

  it('runs each turn until the next speaker takes over', () => {
    const {beats} = characterSceneTimeline(base);
    expect(beats.map(({speakerId}) => speakerId)).toEqual(['guest', 'clerk', 'guest']);
    expect(beats[0]).toMatchObject({startMs: 400, durationMs: 3_100});
    expect(beats[1]).toMatchObject({startMs: 3_500, durationMs: 3_100});
    // The final turn runs to the end of the scene.
    expect(beats[2]).toMatchObject({startMs: 6_600, durationMs: 2_400});
  });

  it('leaves no gap or overlap between consecutive turns', () => {
    const {beats} = characterSceneTimeline(base);
    for (let index = 1; index < beats.length; index += 1) {
      const previous = beats[index - 1]!;
      expect(previous.startMs + previous.durationMs).toBe(beats[index]!.startMs);
    }
  });

  it('derives prop and callout cues from the same item clock', () => {
    const {calloutAtMs, propAtMs} = characterSceneTimeline(base);
    expect(propAtMs.guest).toBe(6_600);
    expect(propAtMs.clerk).toBeUndefined();
    expect(calloutAtMs).toBe(6_600);
  });

  it('reorders speakers given out of sequence', () => {
    const {beats} = characterSceneTimeline({
      ...base,
      speakers: [
        {primaryItemIndex: 2, castId: 'guest'},
        {primaryItemIndex: 0, castId: 'guest'},
        {primaryItemIndex: 1, castId: 'clerk'},
      ],
    });
    expect(beats.map(({startMs}) => startMs)).toEqual([400, 3_500, 6_600]);
  });

  it('drops a speaker whose item has no timing rather than emitting NaN', () => {
    const {beats} = characterSceneTimeline({...base, primaryItemTimings: [{startMs: 400}]});
    expect(beats).toHaveLength(1);
    expect(beats[0]).toMatchObject({startMs: 400, durationMs: 8_600});
  });

  it('reports no callout cue when the scene has no callout', () => {
    expect(characterSceneTimeline({...base, callout: null}).calloutAtMs).toBeNull();
  });
});

describe('characterStageLayout', () => {
  it('gives 9:16 a portrait stage rather than a scaled 16:9 one', () => {
    const wide = characterStageLayout({castSize: 2, hasCenter: false, vertical: false});
    const tall = characterStageLayout({castSize: 2, hasCenter: false, vertical: true});
    expect(wide.stageWidth).toBeGreaterThan(wide.stageHeight);
    expect(tall.stageHeight).toBeGreaterThan(tall.stageWidth);
  });

  it('keeps every figure inside the narrow frame at both cast sizes', () => {
    for (const castSize of [2, 3]) {
      const layout = characterStageLayout({castSize, hasCenter: castSize === 3, vertical: true});
      for (const slot of stageSlots(castSize, layout.stageWidth, layout.slotMargin)) {
        expect(slot - layout.figureSize / 2).toBeGreaterThanOrEqual(0);
        expect(slot + layout.figureSize / 2).toBeLessThanOrEqual(layout.stageWidth);
      }
    }
  });

  it('never lets neighbouring figures overlap', () => {
    for (const vertical of [false, true]) {
      for (const castSize of [2, 3]) {
        const layout = characterStageLayout({castSize, hasCenter: castSize === 3, vertical});
        const slots = stageSlots(castSize, layout.stageWidth, layout.slotMargin);
        for (let index = 1; index < slots.length; index += 1) {
          expect(slots[index]! - slots[index - 1]!).toBeGreaterThanOrEqual(layout.figureSize);
        }
      }
    }
  });

  it('keeps the counter below the heads of the figures behind it', () => {
    for (const vertical of [false, true]) {
      const layout = characterStageLayout({castSize: 2, hasCenter: false, vertical});
      const head = figureTopFor({cropped: true, layout, size: layout.figureSize});
      expect(layout.counterTop).toBeGreaterThan(head);
      expect(layout.counterTop).toBeLessThan(layout.stageHeight);
    }
  });

  it('lifts the callout clear of a centre-stage figure', () => {
    const taken = characterStageLayout({castSize: 3, hasCenter: true, vertical: false});
    const free = characterStageLayout({castSize: 2, hasCenter: false, vertical: false});
    expect(taken.calloutTop).toBeLessThan(free.calloutTop);
    expect(taken.calloutTop)
      .toBeLessThan(figureTopFor({cropped: false, layout: taken, size: taken.figureSize}));
  });

  it('keeps the vertical callout above the cast', () => {
    const layout = characterStageLayout({castSize: 2, hasCenter: false, vertical: true});
    const head = figureTopFor({cropped: false, layout, size: layout.figureSize});
    expect(layout.calloutTop).toBeLessThan(head);
  });

  // The sign moved from the wall onto the counter front: on the wall it landed
  // in the same band as the scene title the narrated view now draws.
  it('puts the sign on the counter front, clear of the title band', () => {
    for (const vertical of [false, true]) {
      const layout = characterStageLayout({castSize: 2, hasCenter: false, vertical});
      expect(layout.signTop).toBeGreaterThan(layout.counterTop);
      expect(layout.signTop).toBeLessThan(layout.figureBaseline);
    }
  });

  // The narrated view now draws a scene title in the band above the callout,
  // so the callout must leave room for it rather than hugging the top.
  it('leaves a title band above the callout', () => {
    for (const hasCenter of [false, true]) {
      const layout = characterStageLayout({
        castSize: hasCenter ? 3 : 2, hasCenter, vertical: false,
      });
      expect(layout.calloutTop).toBeGreaterThanOrEqual(280);
    }
  });
});

describe('counter extent', () => {
  // The counter is derived from the slots of the characters behind it; an
  // outermost slot pushed its edge past the frame and read as a wall.
  const counterExtent = (castSize: number, behindIndex: number, vertical: boolean) => {
    const layout = characterStageLayout({castSize, hasCenter: castSize === 3, vertical});
    const slot = stageSlots(castSize, layout.stageWidth)[behindIndex]!;
    return {
      left: Math.max(0, slot - layout.figureSize * 0.86),
      right: Math.min(layout.stageWidth, slot + layout.figureSize * 0.86),
      stageWidth: layout.stageWidth,
    };
  };

  it('stays inside the frame wherever the character stands', () => {
    for (const vertical of [false, true]) {
      for (const castSize of [2, 3]) {
        for (let index = 0; index < castSize; index += 1) {
          const {left, right, stageWidth} = counterExtent(castSize, index, vertical);
          expect(left).toBeGreaterThanOrEqual(0);
          expect(right).toBeLessThanOrEqual(stageWidth);
          expect(right).toBeGreaterThan(left);
        }
      }
    }
  });
});


describe('figure placement on the floor', () => {
  const layout = characterStageLayout({castSize: 2, hasCenter: false, vertical: false});

  // Figures used to be aligned by their heads while heightScale varied per
  // character, so a child's feet floated ~150px above an adult's and the pair
  // read as a composite rather than two people in one room.
  it('stands characters of different heights on one floor', () => {
    const child = layout.figureSize * 0.74;
    const adult = layout.figureSize * 1.0;
    const footOf = (size: number) => figureTopFor({cropped: false, layout, size})
      + size * FIGURE_ASPECT * FIGURE_FOOT_RATIO;
    expect(footOf(child)).toBeCloseTo(layout.figureBaseline, 6);
    expect(footOf(adult)).toBeCloseTo(layout.figureBaseline, 6);
    expect(figureTopFor({cropped: false, layout, size: child}))
      .toBeGreaterThan(figureTopFor({cropped: false, layout, size: adult}));
  });

  it('reports the same floor through figureFootFor', () => {
    for (const scale of [0.74, 0.96, 1, 1.06]) {
      const size = layout.figureSize * scale;
      expect(figureFootFor({cropped: false, layout, size})).toBeCloseTo(layout.figureBaseline, 6);
    }
  });

  // A cropped figure has no feet, so it hangs from the counter instead.
  it('hangs a behind-set figure from the counter line', () => {
    const size = layout.figureSize;
    expect(figureTopFor({cropped: true, layout, size})).toBeLessThan(layout.counterTop);
    expect(figureFootFor({cropped: true, layout, size})).toBe(layout.counterTop);
  });
});

describe('arm joints and the prop anchor', () => {
  it('bends at the elbow rather than swinging one straight segment', () => {
    const {elbow, hand} = armJointsFor(-62);
    // A straight arm would put the elbow exactly on the shoulder-hand line.
    const straight = Math.hypot(hand.x - 131, hand.y - 152);
    const viaElbow = Math.hypot(elbow.x - 131, elbow.y - 152)
      + Math.hypot(hand.x - elbow.x, hand.y - elbow.y);
    expect(viaElbow).toBeGreaterThan(straight + 1);
  });

  it('keeps a raised hand inside the drawing', () => {
    for (const angle of [-17, -35, -62]) {
      const {hand} = armJointsFor(angle);
      expect(hand.x).toBeLessThan(200);
      expect(hand.x).toBeGreaterThan(100);
    }
  });

  // The prop tile used to sit at a fixed fraction of figure size, so the arm
  // rotated and the prop stayed put, floating beside an empty hand.
  it('moves the prop anchor with the arm', () => {
    const rest = propAnchorFor({armAngle: -17, facing: 'right'});
    const raised = propAnchorFor({armAngle: -62, facing: 'right'});
    expect(raised.y).toBeLessThan(rest.y - 10);
    expect(raised.x).toBeGreaterThan(rest.x + 10);
  });

  it('tracks the hand it is anchored to', () => {
    for (const angle of [-17, -40, -62]) {
      const {hand} = armJointsFor(angle);
      const anchor = propAnchorFor({armAngle: angle, facing: 'right'});
      expect(Math.hypot(anchor.x - hand.x, anchor.y - hand.y)).toBeLessThan(40);
    }
  });

  it('mirrors the anchor for a left-facing figure', () => {
    const right = propAnchorFor({armAngle: -62, facing: 'right'});
    const left = propAnchorFor({armAngle: -62, facing: 'left'});
    expect(left.x).toBeCloseTo(200 - right.x, 6);
    expect(left.y).toBeCloseTo(right.y, 6);
  });
});

describe('attention motion', () => {
  it('turns a listener toward the speaker and leaves a speaker facing out', () => {
    const listening = headTurnAt({attending: true, frame: 0, fps: 30});
    const speaking = headTurnAt({attending: false, frame: 0, fps: 30});
    expect(listening).toBeGreaterThan(speaking);
    expect(Math.abs(speaking)).toBeLessThan(2);
  });

  it('keeps every head turn small enough to stay a glance', () => {
    for (let frame = 0; frame < 300; frame += 1) {
      expect(Math.abs(headTurnAt({attending: true, frame, fps: 30}))).toBeLessThanOrEqual(9);
    }
  });

  it('nods only while listening, and only briefly', () => {
    expect(nodAt({attending: false, frame: 0, fps: 30})).toBe(0);
    let active = 0;
    for (let frame = 0; frame < 129; frame += 1) {
      if (nodAt({attending: true, frame, fps: 30}) > 0.01) active += 1;
    }
    expect(active).toBeGreaterThan(0);
    expect(active / 129).toBeLessThan(0.2);
  });
});

describe('mouthOpenAt resting', () => {
  it('closes the jaw between word groups when resting is enabled', () => {
    const samples = Array.from({length: 120}, (_, frame) =>
      mouthOpenAt({frame, fps: 30, rest: true, speaking: true}));
    expect(Math.min(...samples)).toBeLessThan(0.02);
    expect(Math.max(...samples)).toBeGreaterThan(0.5);
  });

  // Without the envelope the floor of 0.18 held the jaw permanently open.
  it('leaves the original flap unchanged by default', () => {
    for (let frame = 0; frame < 60; frame += 1) {
      expect(mouthOpenAt({frame, fps: 30, speaking: true})).toBeGreaterThanOrEqual(0.18);
    }
  });

  it('stays shut when not speaking regardless of resting', () => {
    for (const rest of [false, true]) {
      expect(mouthOpenAt({frame: 7, fps: 30, rest, speaking: false})).toBe(0);
    }
  });
});
