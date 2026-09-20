import {z} from 'zod';
import {semanticIconDefinitionFor} from './icon-catalog.js';
import {characterSceneSuggestionSchema} from './explainer-visuals.js';
import {
  draftNarrationSceneSuggestionSchema,
  narratedVisualKindSchema,
  narratedVisualSuggestionSchema,
  videoPaletteSchema,
  type DraftNarrationSceneSuggestion,
} from './types.js';

export const narrationResponseSchema = z.object({
  title: z.string().min(1).max(100),
  palette: videoPaletteSchema,
  scenes: z.array(draftNarrationSceneSuggestionSchema).min(1).max(6),
});

// This intake schema is local only. The API still receives the full strict
// response schema, but optional visual errors must reach recovery before Zod's
// cross-field refinements run. Narration and item timing are never fabricated.
const responseIntakeSchema = z.object({
  ...narrationResponseSchema.shape,
  scenes: z.array(z.object({
    ...draftNarrationSceneSuggestionSchema.shape,
    visual: z.unknown(),
  })).min(1).max(6),
});

/**
 * A failed union reports one top-level `invalid_union` issue whose message is
 * just "Invalid input" — the real reason sits in per-branch sub-issues. Without
 * flattening, a scene rejected over one bad enum value is indistinguishable
 * from a scene rejected for having no recognisable shape at all, which makes
 * the warning useless for diagnosing a planner.
 */
const flattenIssues = (
  issues: readonly z.core.$ZodIssue[],
  depth = 0,
): z.core.$ZodIssue[] => {
  if (depth > 4) return [...issues];
  return issues.flatMap((issue) => {
    const branches = (issue as {errors?: unknown}).errors;
    if (!Array.isArray(branches)) return [issue];
    return branches.flatMap((branch) =>
      Array.isArray(branch) ? flattenIssues(branch as z.core.$ZodIssue[], depth + 1) : []);
  });
};

export const planningValidationSummary = (error: z.ZodError): string => {
  const flat = flattenIssues(error.issues);
  // Two kinds of noise drown the real reason. Every branch rejects the other
  // branches' discriminators ("this is not a sequence-diagram"), and every
  // branch reports its own required fields as missing, because the payload
  // belongs to a different treatment. What actually identifies the offending
  // field is a value that is present but wrong.
  const isBranchSelection = (issue: z.core.$ZodIssue): boolean => {
    const leaf = issue.path[issue.path.length - 1];
    // Literal branches report `expected "x"`; the legacy branch uses an enum
    // and reports `Invalid option`. Both are only saying "wrong treatment".
    return (leaf === 'kind' || leaf === 'motion') &&
      (/expected "/u.test(issue.message) || /invalid option/iu.test(issue.message));
  };
  const isMissingField = (issue: z.core.$ZodIssue): boolean =>
    /received undefined/u.test(issue.message);

  const informative = flat.filter((issue) => !isBranchSelection(issue) && !isMissingField(issue));
  const chosen = informative.length > 0
    ? informative
    : (flat.filter((issue) => !isBranchSelection(issue)).length > 0
        ? flat.filter((issue) => !isBranchSelection(issue))
        : flat);

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const issue of chosen) {
    const line = `${issue.path.join('.') || 'plan'}: ${issue.message}`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    if (lines.length === 12) break;
  }
  return lines.join('; ');
};


/**
 * Repairs a character scene against the scene it actually belongs to. Weaker
 * models get the cast and the dialogue right but miss the bookkeeping: a prop
 * cue or callout pointing past the last visible item, a speaker naming a
 * character that is not on stage, a counter with nobody behind it. Rejecting a
 * correctly-staged scene over a decorative prop index loses far more than it
 * protects, so these are normalised rather than failed.
 *
 * Grounding is deliberately NOT repaired here: an invented character or an
 * unsupported callout claim must still be rejected upstream.
 */
/**
 * Maps a loosely-written treatment name onto its canonical form. Models return
 * "Character-Scene" or " character_scene" often enough that an exact-match
 * check silently skips every downstream repair, and the union then fails on a
 * field the sanitizer would have fixed.
 */
/**
 * Item labels are capped at 80 characters by the schema. A model that writes
 * one long sentence fails the whole plan, and the repair loop tends to rewrite
 * it just as long, so three attempts burn without progress. Trimming at a word
 * boundary keeps the label readable and the plan alive.
 */
const fitItemLabel = (value: unknown, limit = 80): string => {
  const text = String(value).trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit - 1);
  const boundary = clipped.lastIndexOf(' ');
  return `${(boundary > limit * 0.6 ? clipped.slice(0, boundary) : clipped).trimEnd()}…`;
};

/**
 * Stand-in when a model returns no primary items at all. It keeps a scene alive
 * but carries no meaning, so it must never be drawn: exported so the render
 * path can recognise and skip it.
 */
export const PLACEHOLDER_ITEM = 'Key Concept';

const canonicalVisualKind = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLocaleLowerCase('en-US').replace(/[\s_]+/gu, '-');
  return narratedVisualKindSchema.options.find((kind) => kind === normalized);
};

export const repairCharacterScene = (
  visual: Record<string, unknown>,
  itemCount: number,
): Record<string, unknown> => {
  const inRange = (value: unknown): boolean =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < itemCount;

  const rawCast = Array.isArray(visual.cast) ? visual.cast : [];
  const seenIds = new Set<string>();
  const cast = rawCast.slice(0, 3).map((member, index) => {
    const entry = {...(member as Record<string, unknown>)};

    // Ids are identity, so they cannot be prefaulted, but a missing or
    // duplicated one is fatal at explainerStructureIssue and was never
    // repaired here - the sanitizer deduplicated positions and left ids alone.
    let id = String(entry.id ?? '').trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9-]+/gu, '-')
      .replace(/^-+|-+$/gu, '');
    if (!id) id = `cast-${index + 1}`;
    if (seenIds.has(id)) {
      let suffix = 2;
      while (seenIds.has(`${id}-${suffix}`)) suffix += 1;
      id = `${id}-${suffix}`;
    }
    seenIds.add(id);
    entry.id = id;

    // A prop whose cue points nowhere simply does not appear; empty hands are
    // a valid staging, an out-of-range index is not. `!= null` is false for
    // undefined, so a member with no prop key used to leave `prop` undefined
    // and fail `z.string().nullable()` on a field nobody asked for.
    const propId = entry.prop == null ? null : String(entry.prop);
    const propIsDrawable = propId !== null && semanticIconDefinitionFor(propId) !== undefined;
    if (!propIsDrawable || !inRange(entry.propPrimaryItemIndex)) {
      entry.prop = null;
      entry.propPrimaryItemIndex = null;
    }
    return entry;
  });

  const positions = ['left', 'center', 'right'];
  const seenPositions = new Set<string>();
  cast.forEach((member, index) => {
    const position = String(member.position ?? '');
    const taken = seenPositions.has(position) || !positions.includes(position);
    // Two characters cannot occupy one slot; fall back to stage order.
    member.position = taken
      ? (cast.length === 2 ? ['left', 'right'][index] : positions[index])
      : position;
    seenPositions.add(String(member.position));
  });

  const set = visual.set === 'counter' ? 'counter' : 'none';
  if (set === 'none') {
    for (const member of cast) member.behindSet = false;
  } else if (!cast.some((member) => member.behindSet === true)) {
    // A counter with nobody behind it reads as a wall, not a service desk.
    const last = cast[cast.length - 1];
    if (last) last.behindSet = true;
  }

  const castIds = cast.map((member) => String(member.id));
  // Speakers may still name a pre-repair id; fall back by cast order.
  const originalIds = rawCast.slice(0, 3).map((member) =>
    String((member as Record<string, unknown>)?.id ?? ''));
  const remapId = (value: string): string | undefined => {
    if (castIds.includes(value)) return value;
    const index = originalIds.indexOf(value);
    return index >= 0 ? castIds[index] : undefined;
  };
  const usedTurns = new Set<number>();
  const rawSpeakers = Array.isArray(visual.speakers) ? visual.speakers : [];
  const speakers = rawSpeakers.flatMap((speaker) => {
    const turn = (speaker as Record<string, unknown>).primaryItemIndex;
    if (!inRange(turn) || usedTurns.has(turn as number)) return [];
    usedTurns.add(turn as number);
    const castId = String((speaker as Record<string, unknown>).castId ?? '');
    return [{
      primaryItemIndex: turn as number,
      castId: remapId(castId) ?? castIds[0] ?? '',
    }];
  }).slice(0, 6);
  // Every scene needs at least one speaking turn for the mouths to animate.
  if (speakers.length === 0 && castIds[0]) {
    speakers.push({primaryItemIndex: 0, castId: castIds[0]});
  }

  let callout = visual.callout as Record<string, unknown> | null | undefined;
  if (callout && typeof callout === 'object') {
    const icon = callout.icon == null ? null : String(callout.icon);
    callout = {
      ...callout,
      icon: icon !== null && semanticIconDefinitionFor(icon) ? icon : null,
      primaryItemIndex: inRange(callout.primaryItemIndex)
        ? callout.primaryItemIndex
        : Math.max(0, itemCount - 1),
    };
  } else {
    callout = null;
  }

  return {
    ...visual,
    cast,
    set,
    sign: set === 'counter' && visual.sign ? String(visual.sign) : null,
    speakers,
    callout,
  };
};

export const sanitizeNarratedCandidate = (input: unknown): unknown => {
  if (!input || typeof input !== 'object') return input;
  const candidate = input as Record<string, unknown>;
  const validPalettes = ['cyan', 'violet', 'emerald', 'amber', 'rose'];
  const validTemplates = ['process-flow', 'comparison', 'timeline', 'callout'];
  const validExpressions = ['none', 'laugh', 'breath', 'sigh'];

  const rawScenes = Array.isArray(candidate.scenes) ? candidate.scenes : [];
  const scenes = rawScenes.slice(0, 6).map((rawScene: Record<string, unknown>, sIdx: number) => {
    const template = validTemplates.includes(String(rawScene.template))
      ? String(rawScene.template)
      : (Array.isArray(rawScene.secondaryItems) && rawScene.secondaryItems.length > 0 ? 'comparison' : 'callout');

    const rawPrimary = Array.isArray(rawScene.primaryItems) ? rawScene.primaryItems : [];
    const primaryItems = rawPrimary.slice(0, 6).map((item) => fitItemLabel(item));
    if (primaryItems.length === 0) primaryItems.push(PLACEHOLDER_ITEM);

    const isComparison = template === 'comparison';
    const rawSecondary = Array.isArray(rawScene.secondaryItems) ? rawScene.secondaryItems : [];
    const secondaryItems = isComparison ? rawSecondary.slice(0, 6).map((item) => fitItemLabel(item)) : [];

    const rawIcons = (rawScene.icons && typeof rawScene.icons === 'object') ? rawScene.icons as Record<string, unknown> : {};
    const primaryIcons = (Array.isArray(rawIcons.primary) ? rawIcons.primary : []).slice(0, primaryItems.length).map(String);
    while (primaryIcons.length < primaryItems.length) primaryIcons.push('code');

    const secondaryIcons = (Array.isArray(rawIcons.secondary) ? rawIcons.secondary : []).slice(0, secondaryItems.length).map(String);
    while (secondaryIcons.length < secondaryItems.length) secondaryIcons.push('code');

    const rawBeats = Array.isArray(rawScene.beats) ? rawScene.beats : [];
    let beats = rawBeats.map((rawBeat: Record<string, unknown>, bIdx: number) => {
      const rawPhrases = Array.isArray(rawBeat.phrases) ? rawBeat.phrases : [];
      const phrases = rawPhrases.map((rawPhrase: Record<string, unknown>, pIdx: number) => {
        let text = String(rawPhrase.text || 'Key takeaway.');
        if (text.length > 120) {
          text = text.slice(0, 117) + '...';
        }
        return {
          id: String(rawPhrase.id || `phrase-${sIdx}-${bIdx}-${pIdx}`),
          text,
        };
      });

      const expression = validExpressions.includes(String(rawBeat.expression))
        ? String(rawBeat.expression)
        : 'none';

      return {
        id: String(rawBeat.id || `beat-${sIdx}-${bIdx}`),
        expression,
        phrases: phrases.length > 0 ? phrases : [{id: `phrase-${sIdx}-${bIdx}-0`, text: 'Key takeaway.'}],
        primaryItemIndices: (Array.isArray(rawBeat.primaryItemIndices) ? rawBeat.primaryItemIndices : []).map(Number),
        secondaryItemIndices: (Array.isArray(rawBeat.secondaryItemIndices) ? rawBeat.secondaryItemIndices : []).map(Number),
      };
    });

    if (beats.length === 0) {
      beats = [{
        id: `beat-${sIdx}-0`,
        expression: 'none',
        phrases: [{id: `phrase-${sIdx}-0-0`, text: String(rawScene.reason || rawScene.title || 'Explanation.')}],
        primaryItemIndices: primaryItems.map((_, idx) => idx),
        secondaryItemIndices: secondaryItems.map((_, idx) => idx),
      }];
    }

    const allPrimary = beats.flatMap((b) => b.primaryItemIndices);
    const primaryMatches = allPrimary.length === primaryItems.length && allPrimary.every((v, idx) => v === idx);
    if (!primaryMatches) {
      beats.forEach((b) => { b.primaryItemIndices = []; });
      primaryItems.forEach((_, itemIdx) => {
        const targetBeat = beats[Math.min(itemIdx, beats.length - 1)];
        if (targetBeat) {
          targetBeat.primaryItemIndices.push(itemIdx);
        }
      });
    }

    const allSecondary = beats.flatMap((b) => b.secondaryItemIndices);
    const secondaryMatches = allSecondary.length === secondaryItems.length && allSecondary.every((v, idx) => v === idx);
    if (!secondaryMatches) {
      beats.forEach((b) => { b.secondaryItemIndices = []; });
      secondaryItems.forEach((_, itemIdx) => {
        const targetBeat = beats[Math.min(itemIdx, beats.length - 1)];
        if (targetBeat) {
          targetBeat.secondaryItemIndices.push(itemIdx);
        }
      });
    }

    const rawVisual = (rawScene.visual && typeof rawScene.visual === 'object')
      ? rawScene.visual as Record<string, unknown>
      : undefined;
    const kind = canonicalVisualKind(rawVisual?.kind);
    const namedVisual = rawVisual && kind ? {...rawVisual, kind} : rawVisual;
    const visual = namedVisual && kind === 'character-scene'
      ? repairCharacterScene(namedVisual, primaryItems.length)
      : namedVisual;

    return {
      ...rawScene,
      id: String(rawScene.id || `scene-${sIdx + 1}`),
      title: fitItemLabel(rawScene.title || `Scene ${sIdx + 1}`),
      template,
      primaryItems,
      secondaryItems,
      leftLabel: isComparison ? String(rawScene.leftLabel || 'Side A') : '',
      rightLabel: isComparison ? String(rawScene.rightLabel || 'Side B') : '',
      reason: String(rawScene.reason || 'Visual evidence for claim.'),
      backgroundPrompt: String(rawScene.backgroundPrompt || 'Abstract minimal tech backdrop.'),
      icons: {
        focal: rawIcons.focal ? String(rawIcons.focal) : null,
        primary: primaryIcons,
        secondary: secondaryIcons,
      },
      visual: visual ?? {kind: 'diagram', motion: 'reveal', motif: 'none'},
      beats,
    };
  });

  const palette = validPalettes.includes(String(candidate.palette)) ? String(candidate.palette) : 'emerald';

  return {
    ...candidate,
    title: String(candidate.title || 'Untitled Video'),
    palette,
    scenes,
  };
};

/**
 * A visual the model asked for and recovery had to discard. Reported
 * structurally as well as in prose: a lost character scene was previously a
 * silent success, so there was no way to tell how often it happened or why.
 */
export interface LostVisual {
  details: string;
  kind: string;
  reason: 'grounding' | 'shape';
  sceneId: string;
  title: string;
}

export const recoverNarrationResponse = (input: unknown): {
  title: string;
  palette: z.infer<typeof videoPaletteSchema>;
  lostVisuals: LostVisual[];
  scenes: DraftNarrationSceneSuggestion[];
  warnings: string[];
} => {
  const parsed = responseIntakeSchema.parse(input);
  const warnings: string[] = [];
  const lostVisuals: LostVisual[] = [];
  const scenes = parsed.scenes.map((scene): DraftNarrationSceneSuggestion => {
    // Cross-field bookkeeping is repaired for every provider here, not just on
    // the compat path: strict structured outputs guarantee the shape of a
    // character scene, never that its speakers name a character on stage.
    const named = scene.visual && typeof scene.visual === 'object'
      ? {...(scene.visual as Record<string, unknown>)}
      : scene.visual;
    const kind = canonicalVisualKind((named as Record<string, unknown>)?.['kind']);
    const candidate = kind === 'character-scene'
      ? repairCharacterScene({...(named as Record<string, unknown>), kind}, scene.primaryItems.length)
      : scene.visual;
    const visual = narratedVisualSuggestionSchema.safeParse(candidate);
    if (!visual.success) {
      // A union error lists missing fields from every other branch, and the
      // summary's own filter strips the "received undefined" issues that
      // actually matter. Re-parsing the single branch names the real fields.
      const focused = kind === 'character-scene'
        ? characterSceneSuggestionSchema.safeParse(candidate)
        : null;
      const details = planningValidationSummary(
        focused && !focused.success ? focused.error : visual.error,
      );
      warnings.push(
        `Scene "${scene.title}" (${scene.id}) uses a code-native fallback because its optional visual is invalid: ${details}`,
      );
      if (kind) lostVisuals.push({details, kind, reason: 'shape', sceneId: scene.id, title: scene.title});
    }
    const emptyComparison = scene.template === 'comparison' && scene.secondaryItems.length === 0;
    if (emptyComparison) {
      warnings.push(
        `Scene "${scene.title}" (${scene.id}) uses a callout because its comparison has no secondary items; existing text and narration were preserved.`,
      );
    }
    return {
      ...scene,
      template: emptyComparison ? 'callout' : scene.template,
      visual: visual.success ? visual.data : {kind: 'diagram', motion: 'reveal', motif: 'none'},
    };
  });
  return {...parsed, lostVisuals, scenes, warnings};
};
