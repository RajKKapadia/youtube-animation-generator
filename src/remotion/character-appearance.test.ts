import {describe, expect, it} from 'vitest';
import {
  appearanceFor,
  castAppearances,
  hashCharacterId,
  BUILDS,
  GREY_HAIR,
  HAIR_STYLES,
  SKIN_TONES,
} from './character-appearance.js';

describe('hashCharacterId', () => {
  it('is stable for the same id', () => {
    expect(hashCharacterId('guest')).toBe(hashCharacterId('guest'));
  });

  it('separates ids that differ only slightly', () => {
    expect(hashCharacterId('guest')).not.toBe(hashCharacterId('guests'));
    expect(hashCharacterId('agent-1')).not.toBe(hashCharacterId('agent-2'));
  });

  it('stays a 32-bit unsigned integer', () => {
    for (const id of ['', 'a', 'front-desk', 'a-very-long-character-identifier']) {
      const hash = hashCharacterId(id);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xff_ff_ff_ff);
    }
  });
});

describe('appearanceFor', () => {
  it('always returns the same person for the same id', () => {
    expect(appearanceFor('pharmacist')).toEqual(appearanceFor('pharmacist'));
  });

  it('only ever picks values from the declared catalogs', () => {
    for (const id of ['guest', 'clerk', 'patient', 'operator', 'reviewer', 'x']) {
      const appearance = appearanceFor(id);
      expect(HAIR_STYLES).toContain(appearance.hairStyle);
      expect(SKIN_TONES.map(({fill}) => fill)).toContain(appearance.skin.fill);
      expect(appearance.heightScale).toBeGreaterThanOrEqual(0.94);
      expect(appearance.heightScale).toBeLessThanOrEqual(1.06);
    }
  });
});

describe('appearanceFor traits', () => {
  it('lets an explicit trait override what the id would have chosen', () => {
    const derived = appearanceFor('patient');
    const stated = appearanceFor('patient', {hairStyle: 'bald', skinTone: 5, accessory: 'glasses'});
    expect(stated.hairStyle).toBe('bald');
    expect(stated.skin.fill).toBe(SKIN_TONES[5]!.fill);
    expect(stated.accessory).toBe('glasses');
    // The id still drives anything left unstated.
    expect(stated.heightScale).toBe(derived.heightScale);
  });

  it('makes a senior read as senior and a child as a child', () => {
    expect(appearanceFor('patient', {age: 'senior'}).hairColor).toBe(GREY_HAIR);
    expect(appearanceFor('patient', {age: 'child'}).heightScale)
      .toBeLessThan(appearanceFor('patient', {age: 'adult'}).heightScale);
  });

  it('never picks grey hair for a non-senior, so grey always means age', () => {
    for (const id of ['a', 'b', 'c', 'guest', 'clerk', 'operator', 'x1', 'x2']) {
      expect(appearanceFor(id, {age: 'adult'}).hairColor).not.toBe(GREY_HAIR);
    }
  });

  it('accepts an explicit grey for a non-senior, since the author asked', () => {
    expect(appearanceFor('guest', {hairColor: GREY_HAIR}).hairColor).toBe(GREY_HAIR);
  });

  it('wraps an out-of-range skin tone index rather than throwing', () => {
    expect(appearanceFor('guest', {skinTone: 99}).skin).toBeDefined();
    expect(appearanceFor('guest', {skinTone: -1}).skin.fill).toBe(SKIN_TONES.at(-1)!.fill);
  });
});

describe('castAppearances', () => {
  it('gives every member of a cast a distinct hair style and skin tone', () => {
    const cast = [{id: 'developer'}, {id: 'reviewer'}, {id: 'operator'}];
    const appearances = castAppearances(cast);
    expect(new Set(cast.map(({id}) => appearances[id]!.hairStyle)).size).toBe(3);
    expect(new Set(cast.map(({id}) => appearances[id]!.skin.fill)).size).toBe(3);
  });

  it('never moves a character off a look its author stated', () => {
    const appearances = castAppearances([
      {id: 'one', traits: {hairStyle: 'bald', skinTone: 2}},
      {id: 'two', traits: {hairStyle: 'bald', skinTone: 2}},
    ]);
    // Both asked for the same look, so both keep it.
    expect(appearances.one!.hairStyle).toBe('bald');
    expect(appearances.two!.hairStyle).toBe('bald');
    expect(appearances.one!.skin.fill).toBe(appearances.two!.skin.fill);
  });

  it('steps a derived character around an authored one', () => {
    const authored = appearanceFor('derived').hairStyle;
    const appearances = castAppearances([
      {id: 'authored', traits: {hairStyle: authored}},
      {id: 'derived'},
    ]);
    expect(appearances.authored!.hairStyle).toBe(authored);
    expect(appearances.derived!.hairStyle).not.toBe(authored);
  });

  it('is deterministic across calls, including ordering effects', () => {
    const cast = [{id: 'guest'}, {id: 'front-desk'}];
    expect(castAppearances(cast)).toEqual(castAppearances(cast));
  });

  it('covers a cast larger than the catalogs without throwing', () => {
    const cast = Array.from({length: 9}, (_, index) => ({id: `member-${index}`}));
    expect(Object.keys(castAppearances(cast))).toHaveLength(9);
  });
});


describe('build', () => {
  // Hair and skin alone left every character on an identical silhouette, so a
  // cast read as one person in different wigs.
  it('spreads builds across a derived cast', () => {
    const cast = castAppearances([{id: 'guest'}, {id: 'front-desk'}, {id: 'manager'}]);
    const builds = Object.values(cast).map(({build}) => build);
    expect(new Set(builds).size).toBeGreaterThan(1);
    for (const build of builds) expect(BUILDS).toContain(build);
  });

  it('honours a stated build exactly', () => {
    const cast = castAppearances([
      {id: 'guest', traits: {build: 'broad'}},
      {id: 'front-desk'},
    ]);
    expect(cast['guest']?.build).toBe('broad');
  });

  it('never makes a child broad', () => {
    for (const id of ['a', 'b', 'child-patient', 'kid', 'zz']) {
      expect(appearanceFor(id, {age: 'child'}).build).toBe('slim');
    }
  });

  it('is stable for the same id', () => {
    expect(appearanceFor('guest').build).toBe(appearanceFor('guest').build);
  });

  // 'regular' appears twice in the catalogue, so a naive rotation could stall.
  it('terminates for a cast larger than the distinct builds available', () => {
    const cast = castAppearances(
      Array.from({length: 7}, (_, index) => ({id: `person-${index}`})),
    );
    expect(Object.keys(cast)).toHaveLength(7);
  });
});
