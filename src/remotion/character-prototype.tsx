import {Composition, registerRoot} from 'remotion';
import {CharacterScene, type CharacterSceneProps} from './CharacterScene.js';

// Three unrelated scenarios expressed purely as data. Nothing below is a new
// component: they differ in cast size, set piece, props and tone only, which
// is the test that the scene generalises past the topic it was built for.

export const CHARACTER_PROTOTYPE_FPS = 30;

export type ScenarioName = 'hotel' | 'clinic' | 'standup';

export interface Scenario {
  durationMs: number;
  props: CharacterSceneProps;
}

export const SCENARIOS: Record<ScenarioName, Scenario> = {
  // Two-hander across a counter, resolving to a positive verdict.
  hotel: {
    durationMs: 10_000,
    props: {
      title: 'Checking in without handing over your ID',
      sign: 'RECEPTION',
      set: 'counter',
      palette: 'cyan',
      vertical: false,
      cast: [
        {id: 'guest', position: 'left', outfit: 'casual', behindSet: false, prop: 'mobile', propAtMs: 6_600},
        {id: 'front-desk', position: 'right', outfit: 'uniform', behindSet: true, prop: null, propAtMs: 0},
      ],
      beats: [
        {speakerId: 'guest', startMs: 400, durationMs: 2_800, caption: 'You arrive at the hotel to confirm your reservation.'},
        {speakerId: 'front-desk', startMs: 3_500, durationMs: 2_800, caption: 'The front desk needs to check that you are over eighteen.'},
        {speakerId: 'guest', startMs: 6_600, durationMs: 3_200, caption: 'Your wallet proves the claim — and nothing else.'},
      ],
      callout: {icon: 'security', eyebrow: 'Zero-knowledge proof', headline: 'Over 18 — verified', atMs: 7_900, tone: 'positive'},
    },
  },

  // Two-hander on an open stage, resolving to a warning. No set, no sign.
  clinic: {
    durationMs: 9_000,
    props: {
      title: 'What your pharmacy actually needs to know',
      sign: null,
      set: 'none',
      palette: 'emerald',
      vertical: false,
      cast: [
        {id: 'patient', position: 'left', outfit: 'casual', behindSet: false, prop: 'document', propAtMs: 3_200, traits: {age: 'senior'}},
        {id: 'pharmacist', position: 'right', outfit: 'uniform', behindSet: false, prop: null, propAtMs: 0},
      ],
      beats: [
        {speakerId: 'pharmacist', startMs: 300, durationMs: 2_600, caption: 'A prescription needs one fact about you.'},
        {speakerId: 'patient', startMs: 3_200, durationMs: 2_600, caption: 'Handing over a full record gives away far more.'},
        {speakerId: null, startMs: 6_100, durationMs: 2_700, caption: 'Everything beyond that fact is exposure without purpose.'},
      ],
      callout: {icon: 'error-warning', eyebrow: 'Over-disclosure', headline: 'Whole record shared', atMs: 6_100, tone: 'warning'},
    },
  },

  // Three-hander, mixed props, neutral tone: exercises the wider stage layout.
  standup: {
    durationMs: 11_000,
    props: {
      title: 'Where a deploy actually goes wrong',
      sign: null,
      set: 'none',
      palette: 'violet',
      vertical: false,
      cast: [
        {id: 'developer', position: 'left', outfit: 'casual', behindSet: false, prop: 'code', propAtMs: 500},
        {id: 'reviewer', position: 'center', outfit: 'casual', behindSet: false, prop: null, propAtMs: 0},
        {id: 'operator', position: 'right', outfit: 'uniform', behindSet: false, prop: 'monitoring', propAtMs: 7_200},
      ],
      beats: [
        {speakerId: 'developer', startMs: 400, durationMs: 2_800, caption: 'The change passes every test on the branch.'},
        {speakerId: 'reviewer', startMs: 3_600, durationMs: 2_900, caption: 'Review signs off on what the diff shows.'},
        {speakerId: 'operator', startMs: 7_200, durationMs: 3_400, caption: 'Production is the first place the real traffic appears.'},
      ],
      callout: {icon: 'monitoring', eyebrow: 'Gap', headline: 'No signal until release', atMs: 8_400, tone: 'neutral'},
    },
  },
};

// Both orientations are registered so 9:16 staging is inspectable without a
// provider key; vertical is not a scaled 16:9 frame and needs its own check.
export const CharacterPrototypeRoot = () => (
  <>
    {Object.entries(SCENARIOS).flatMap(([name, scenario]) =>
      ([false, true] as const).map((vertical) => (
        <Composition
          key={`${name}-${vertical ? 'vertical' : 'wide'}`}
          id={`CharacterScene-${name}${vertical ? '-vertical' : ''}`}
          component={CharacterScene}
          durationInFrames={Math.round((scenario.durationMs / 1_000) * CHARACTER_PROTOTYPE_FPS)}
          fps={CHARACTER_PROTOTYPE_FPS}
          width={vertical ? 1_080 : 1_920}
          height={vertical ? 1_920 : 1_080}
          defaultProps={{...scenario.props, vertical}}
        />
      )),
    )}
  </>
);

registerRoot(CharacterPrototypeRoot);
