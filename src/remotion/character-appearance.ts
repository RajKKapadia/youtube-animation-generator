// How a character looks is resolved in two layers:
//
//   1. Traits the author (or planner) states explicitly always win. A senior
//      patient must look senior; that cannot be left to chance.
//   2. Anything left unstated falls back to a hash of the character id, so a
//      cast is visually varied without anyone having to choose a hairstyle,
//      and so the same character looks the same in every scene they appear in.
//
// The hash is a tiebreaker for what nobody cared about, never the authority on
// what the scene actually means.

export const HAIR_STYLES = ['short', 'cropped', 'bob', 'tied', 'curly', 'bald'] as const;
export type HairStyle = typeof HAIR_STYLES[number];

export const ACCESSORIES = ['none', 'none', 'glasses', 'cap'] as const;
export type Accessory = typeof ACCESSORIES[number];

export const AGES = ['child', 'adult', 'senior'] as const;
export type Age = typeof AGES[number];

/**
 * Body build. Hair and skin alone left every character on an identical
 * silhouette, so a cast read as one person in different wigs. Build changes the
 * outline, which is what the eye actually uses to tell people apart.
 */
export const BUILDS = ['slim', 'regular', 'regular', 'broad'] as const;
export type Build = typeof BUILDS[number];

/** Warm-to-deep range; indices carry no meaning beyond spreading the cast. */
export const SKIN_TONES = [
  {fill: '#F2C6A0', shade: '#D9A67E'},
  {fill: '#E8B48C', shade: '#CE9970'},
  {fill: '#D29A6E', shade: '#B27C53'},
  {fill: '#A9704A', shade: '#8A5636'},
  {fill: '#7D4B2E', shade: '#623721'},
  {fill: '#573222', shade: '#412417'},
] as const;

export const GREY_HAIR = '#8A8A8A';

/** Grey is reserved for age, so it is not in the general rotation. */
export const HAIR_COLORS = ['#241B14', '#0F0D0C', '#4A3323', '#6B4423', '#C2A05A'] as const;

export interface CharacterTraits {
  accessory?: Accessory;
  age?: Age;
  build?: Build;
  hairColor?: string;
  hairStyle?: HairStyle;
  /** Index into SKIN_TONES; out-of-range values wrap rather than throw. */
  skinTone?: number;
}

export interface CharacterAppearance {
  accessory: Accessory;
  age: Age;
  build: Build;
  hairColor: string;
  hairStyle: HairStyle;
  /** Height multiplier. A child reads as a child mainly through this. */
  heightScale: number;
  skin: {fill: string; shade: string};
}

/** FNV-1a. Small, stable across platforms, and good enough to spread ids. */
export const hashCharacterId = (id: string): number => {
  let hash = 0x81_1c_9d_c5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return hash >>> 0;
};

const pick = <T,>(items: readonly T[], hash: number, shift: number): T =>
  items[(hash >>> shift) % items.length] as T;

const BASE_HEIGHT: Record<Age, number> = {child: 0.74, adult: 1, senior: 0.96};

export const appearanceFor = (
  id: string,
  traits: CharacterTraits = {},
): CharacterAppearance => {
  const hash = hashCharacterId(id);
  const age = traits.age ?? 'adult';
  const skin = traits.skinTone === undefined
    ? pick(SKIN_TONES, hash, 7)
    : SKIN_TONES[
        ((Math.trunc(traits.skinTone) % SKIN_TONES.length) + SKIN_TONES.length) % SKIN_TONES.length
      ] as {fill: string; shade: string};
  return {
    accessory: traits.accessory ?? pick(ACCESSORIES, hash, 3),
    age,
    // A child is never 'broad': the build catalogue is adult-shaped.
    build: traits.build ?? (age === 'child' ? 'slim' : pick(BUILDS, hash, 5)),
    hairColor: traits.hairColor
      ?? (age === 'senior' ? GREY_HAIR : pick(HAIR_COLORS, hash, 11)),
    hairStyle: traits.hairStyle ?? pick(HAIR_STYLES, hash, 17),
    // ±0.06 spread on the age baseline, so a cast is not uniformly sized.
    heightScale: BASE_HEIGHT[age] + ((hash >>> 23) % 13) / 200 - 0.03,
    skin,
  };
};

export interface CharacterAppearanceRequest {
  id: string;
  traits?: CharacterTraits;
}

/**
 * Appearances for a whole cast. Members who did not state a hairstyle or skin
 * tone are nudged apart so no two share a silhouette; anything stated
 * explicitly is left exactly as the author asked, even if that means two
 * characters deliberately match.
 */
export const castAppearances = (
  members: readonly CharacterAppearanceRequest[],
): Record<string, CharacterAppearance> => {
  const result: Record<string, CharacterAppearance> = {};
  const usedHair = new Set<HairStyle>();
  const usedSkin = new Set<string>();
  const usedBuild = new Set<Build>();

  // Explicit choices are claimed first, so a derived character steps around
  // them rather than an authored character being pushed off its own choice.
  for (const {id, traits} of members) {
    const appearance = appearanceFor(id, traits);
    if (traits?.hairStyle) usedHair.add(appearance.hairStyle);
    if (traits?.skinTone !== undefined) usedSkin.add(appearance.skin.fill);
    if (traits?.build) usedBuild.add(appearance.build);
  }

  for (const {id, traits} of members) {
    const base = appearanceFor(id, traits);
    let {build, hairStyle, skin} = base;

    if (!traits?.hairStyle) {
      let guard = 0;
      while (usedHair.has(hairStyle) && guard < HAIR_STYLES.length) {
        hairStyle = HAIR_STYLES[
          (HAIR_STYLES.indexOf(hairStyle) + 1) % HAIR_STYLES.length
        ] as HairStyle;
        guard += 1;
      }
      usedHair.add(hairStyle);
    }

    // 'regular' appears twice in BUILDS, so a cast larger than the distinct
    // builds available keeps rotating rather than stalling on the duplicate.
    if (!traits?.build) {
      const distinct = [...new Set(BUILDS)];
      let guard = 0;
      while (usedBuild.has(build) && guard < distinct.length) {
        build = distinct[(distinct.indexOf(build) + 1) % distinct.length] as Build;
        guard += 1;
      }
      usedBuild.add(build);
    }

    if (traits?.skinTone === undefined) {
      let guard = 0;
      while (usedSkin.has(skin.fill) && guard < SKIN_TONES.length) {
        skin = SKIN_TONES[
          (SKIN_TONES.findIndex(({fill}) => fill === skin.fill) + 1) % SKIN_TONES.length
        ] as {fill: string; shade: string};
        guard += 1;
      }
      usedSkin.add(skin.fill);
    }

    result[id] = {...base, build, hairStyle, skin};
  }
  return result;
};
