# Proposal: story-driven animation and direction

Status: foundation implemented locally, 2026-11-09; the broader architecture below remains
the direction for subsequent work.

## Implemented foundation

The new `story-motion` treatment has persistent objects, source-backed directed
relationships, repeated cue-linked actions, word/phrase timing provenance, a pure
scheduler, graph-derived portrait/landscape geometry, and a shared deterministic renderer.
It is available to narrated and subtitle planning on OpenAI, Gemini and Groq; provider
parity is exercised with mocked responses (`src/story-motion-planners.test.ts`).

Generated story narration tries the existing local alignment worker. Recorded narration
preserves its word spans. Missing or rejected alignment produces explicit estimated-timing
diagnostics. New saved contracts are narrated v9 and subtitle v4; old plans retain their
existing contracts. External recipes cannot silently replace the graph with a text list.

Three hand-authored benchmark stories exercise a request/response, a changing document,
and one measurement transferred twice. A real local Supertonic benchmark produced about
26.5 seconds of video, and the installed aligner accepted the complete spoken script.
Reproduce with `pnpm fixtures:story-motion` and the staged commands in
[Plan Schema](plan-schema.md#story-motion-payload). Benchmark text is isolated in
`src/story-motion-fixtures.ts`; the renderer has no branches for these subjects.

Remaining work includes cross-scene continuity, a richer constraint/layout solver,
script-revision token anchors, automatic visual critique and targeted repair, compound
chart/image components, and evaluation with live-provider direction on unseen sources.
The implemented foundation is not evidence that automatic output consistently reaches the
quality of the supplied reference videos. Existing tests and the old explainer gallery
are also exercised; inspect short motion previews, not just final stills.

## Objective

Make animation emerge from the story and actual voiceover. An icon represents an actor
or object; its movement communicates an action, relationship, change, or consequence.
The same object remains recognizable when the narration revisits it. Quiet holds and
attention shifts are intentional parts of direction.

The user's constraint is central: do not encode individual topics, company names,
reference-video sequences, or fixed story schedules into renderers. Reusable rendering
code still defines supported graphic primitives, motion behavior, and layout rules.
Every video's object selection, relationships, staging, sequence, and timing belong in
its saved plan and derive from its content.

The references establish a visual target, not proof of the external platform's internal
architecture or measured word-level synchronization. This proposal does not assume
that platform used a particular model or that no human edited its output.

## Pre-implementation baseline and retained legacy behavior

| Current behavior | Consequence |
|---|---|
| Items are anchored exactly once, in increasing visual order (`src/types.ts:996`, `src/narration-planner.ts:175`). | Good first-introduction discipline, but no general contract for later actions on an existing item. |
| TTS items inherit the introducing beat's start (`src/narration-audio.ts:124`); phrase samples are allocated within a measured utterance (`src/supertonic/synthesis.ts:77`). | Beat synchronization exists; exact keyword arrival and repeated-reference actions need more information. |
| Renderable activity cues retain beat starts and text (`src/remotion/NarratedVideo.tsx:16`). | Richer event targets, semantic anchors, and action windows are not passed through this adapter. |
| The agent workflow moves a dot across a fixed horizontal path on each active beat (`src/remotion/NarratedVisualLayer.tsx:200`, `src/remotion/NarratedVisualLayer.tsx:308`). Its legacy supporting labels alternate Thinking/Working by beat index (`src/remotion/NarratedVisualLayer.tsx:333`). | Motion can coincide with speech while remaining unrelated to the actual action being described. |
| Directed process composition produces text rows (`src/remotion/DirectedScene.tsx:99`). | An explanation of movement or interaction can become an animated list. |
| Grouped bars and metric cards share a scene-start animation clock (`src/remotion/NarratedVisualLayer.tsx:937`). | Values can finish animating before the narration discusses them. |
| Animation authoring chooses one bounded recipe (`src/animation-tools.ts:49`, `src/animation-contract.ts:10`). HyperFrames commonly builds revealed rows; Lottie uses labels and focal rings (`src/animation-recipes.ts:42`, `src/animation-recipes.ts:86`). | External tools inherit the same limited expressive contract. Tool selection alone cannot supply expert direction. |

Existing sequence diagrams, charts, character scenes, icons, asset manifests, grounding,
recorded-audio alignment, and deterministic Remotion rendering are valuable foundations.
This work should reuse them. In particular, the exact-once rule should remain for
**first introduction**, while later actions use a separate event system.

## Proposed pipeline

```text
Source + available assets + editorial format
                 |
       Story structure and narration
                 |
       Objects, relationships, events
          /                     \
Voiceover + alignment     Visual direction
          \                     /
       Cue and layout compilation
                 |
     Deterministic motion timeline
                 |
     Preview, inspect, targeted repair
                 |
             Final render
```

These are logical stages with saved artifacts; they need not each require a model
call. Narration and semantic extraction can share authoring. A focused direction pass
can reuse their output. Alignment, scheduling, layout, rendering, and mechanical
checks should run locally. Additional model authoring remains an explicit cost-bearing
operation; saved-plan replay must never invoke it.

## 1. Represent the story before choosing animation

Introduce an intermediate story model containing:

- **Entities:** people, organizations, tools, documents, quantities, places, and concepts,
  each with a stable identity and source references.
- **Relationships:** who acts on what, direction of transfer, comparison, containment,
  sequence, and dependencies that the source actually supports.
- **Events:** an actor sends, receives, transforms, blocks, approves, increases,
  decreases, replaces, or changes state; also neutral explanation and qualification.
- **Narrative purpose:** introduce, explain, contrast, establish evidence, qualify,
  conclude. Record what the viewer should understand after the beat.
- **Continuity groups:** connected portions of the explanation that should share objects
  and context, even across several sentences.

Do not derive causality from a verb match alone. A direction, magnitude, safety state,
or causal relationship must have supporting evidence. Exact source excerpts are
necessary provenance, but substring matching alone does not establish entailment.
Use structural checks and a semantic review of the proposed relationship. When
uncertain, choose a truthful neutral representation and report the uncertainty.

Editorial formats influence attention and compression, not a fixed sequence of shots.
A roundup must preserve its contracted topic coverage. A tutorial may retain a process
stage across several instructions. Neither should acquire invented steps to satisfy a
format. Do not accelerate speech to accommodate an overambitious visual plan.

## 2. Let the director author a persistent visual world

Replace the new path's one-treatment-per-scene contract with a declarative object graph.
An object can use an existing icon, a brand asset, a text label, a geometric shape,
a chart, a supplied image, or an existing specialized visual as a compound component.

Objects have stable IDs, semantic roles, ports or attachment points, named states,
and visibility lifetimes. Relationships connect objects, not arbitrary screen pixels.
Evidence and qualification panels attach to their relevant claim or visual.

The director decides:

- Which things need to be visible, which can remain implicit, and which should persist.
- Which source-backed action an object should perform at each relevant cue.
- Where the viewer's attention should move and what background context should remain.
- Whether an explanation should build, transform, compare, zoom into detail, or hold.
- Which existing objects can carry the next thought without clearing the stage.

The code supplies general geometry and behavior. There must be no condition such as
`if topic is payments`, no special Cashfree scene, and no rule that every third beat
changes layout. Labels, actors, number values, and action sequences are data.

This is broader than adding more named recipes. Recipes can remain authoring examples
or conveniences that expand into the common graph; they must not define its expressive
ceiling. The common graph should support new combinations without a new renderer branch
for every story.

## 3. Give motion semantic actions and causal dependencies

Start with a small composable vocabulary:

| Action | Parameters chosen from the story |
|---|---|
| Introduce / retire | Target, first mention, semantic importance, visibility lifetime |
| Emphasize / de-emphasize | Target, attention cue, intensity, duration window |
| Connect / disconnect | Endpoints, supported relationship, direction, visible label |
| Transfer | Payload, source port, destination port, completion cue |
| Change state | Target, declared before/after states, source-backed event |
| Transform / replace | Identity-preserving change or explicit old/new identity |
| Update data | Grounded datum, baseline/final values, comparison context |
| Group / separate / rearrange | Semantic grouping, preserved identities, new constraints |
| Frame / focus | Subject set, detail level, caption exclusions, continuity |
| Annotate / hold | Relevant target, qualification or outcome, reading window |

Separate **story events** from **visual actions**. One event may require several
coordinated actions: draw connection → move payload → highlight receiver → show result.
A single object may participate in many events. A narrator saying “but” may shift
attention to a limitation without causing any physical movement.

Actions can reference dependencies such as “start after transfer completes.” Resolve
them within the authoritative speech/cue window. Do not invent a temporal or causal
ordering in the underlying claim merely because the visual needs staging.

Fixed easing and spring implementations are appropriate reusable primitives. Applying
the same pulse to every noun or moving a dot on every beat is not story direction.
Motion is allowed to stop: a complex fact often needs a quiet reading hold.

## 4. Align actions to the actual voiceover

Extend generated speech with an alignment artifact, reusing the recorded-audio path's
script matching concepts (`src/recording-alignment.ts:28`). An aligner must provide
word spans and confidence before the system can claim word-level synchronization.
Measure pauses from audio; retain timing provenance and uncertainty.

Define cues against a specific script revision using beat/phrase IDs and validated token
spans. Supply the tokenization to the director so it selects known IDs rather than
guessing indices. Repeated words need distinct occurrence IDs. Changing the narration
invalidates affected alignment and compiled actions; never silently bind to a different
occurrence of the same text.

The director asks for a temporal relationship, not a guessed millisecond timestamp:

- “Arrive at the destination on this word.”
- “Change state when this phrase names the result.”
- “Start after this clause; finish before the following clause.”
- “Retain the comparison through the qualification.”
- “Use the following pause to move attention to the next subject.”

The scheduler resolves lead time, travel duration, easing, settle time, and readable
hold from those anchors. Existing objects can anticipate an arrival through movement;
new factual labels still obey their first-introduction policy. Voice energy or emphasis
can modulate an appropriate action's intensity, but cannot decide its meaning or create
a new claim. Avoid arbitrary reactive bouncing to waveform peaks.

Low-confidence word alignment must fall back visibly to a reliable phrase/beat anchor
when safe. An essential action requiring exact synchronization should fail review if
the anchor cannot be established. Recorded audio retains its original pauses and speed.
Subtitle workflows retain source cue bounds; silent output uses reading/action budgets.

## 5. Compile layout and pacing from the evolving scene

Use semantic constraints such as “input before processor,” “result near receiver,”
“comparison shares a baseline,” and “qualification belongs beside this evidence.”
Solve positions and paths from actual text measurements, object bounds, aspect ratio,
caption exclusions, and the states visible over the entire timeline.

Evaluate intermediate states as well as final frames. A layout that fits after every
reveal may still overlap during a transfer or camera move. Preserve spatial anchors
where possible so the viewer can follow the same object. Reframe related objects as
a group; do not clear the whole screen between related sentences by default.

If the scene is too dense, first remove decoration, then simplify grouping or defer
secondary detail to another valid cue. Preserve required evidence and qualifications.
Do not automatically shrink text until it fits, overlap captions, or speed the voice.
If no honest readable schedule fits, return a concrete pacing/coverage problem.

## 6. Compile once and render deterministically

Keep two layers in saved output:

1. An authored motion plan: entities, relationships, events, visual objects, constraints,
   semantic cues, actions, and rationale.
2. A compiled timeline: resolved cue times, geometry, paths, action intervals, text layout,
   reading holds, and compilation diagnostics, keyed by source/script/audio/asset hashes,
   layout profile, and renderer/compiler version.

The renderer evaluates object state directly at the requested frame. It must produce
the same frame when seeking backward, rendering concurrently, or rendering out of order.
No model calls, runtime randomness, event-listener animation, or accumulated mutable
state in the frame renderer.

A slower recording should cause cue recompilation, not blanket stretching of every
animation. A long new pause can become a quiet hold while preserving the meaningful
arrival and state-change anchors.

## 7. Give the director feedback on its actual output

Extend review beyond midpoint/end stills (`src/narrated-render.ts:269`). Produce a short
motion preview and frames around each significant action, plus a compact report:

- Unresolved/uncertain anchors and actions missing their intended cue.
- Conflicting writes to an object's state, invalid references, impossible dependencies.
- Overlap, clipping, unreadable text, insufficient reading holds, lost qualifications.
- Empty periods, excessive simultaneous attention demands, unsupported visual claims.
- Generic or repeated actions with no declared explanatory purpose.

Mechanical checks should be local. A bounded optional visual-review pass can inspect
keyframes and a motion preview, propose changes to the authored plan, and recompile
only affected groups. Static keyframes alone cannot prove smooth or well-timed motion.
Persist rationale and diagnostics so a surprising result can be traced to a director
choice, failed alignment, layout repair, or adapter limitation.

## Example: content-derived direction

For the hypothetical narration “The agent sends a request. The customer approves it,”
supported by corresponding source material, a director could introduce an agent and
request object, send the request along a connection, retain it at the approval boundary,
then change its state on the customer's approval cue. An alternative source describing
automatic denial would produce a different event, state, and action sequence using the
same components.

For a source-backed financial comparison, the same graph can group two institutional
actors, bind exact values to a shared zero line, emphasize the actor being discussed,
and retain a source-method qualification. It need not imitate a traveling request.

The generalization is objects + relationships + events + cues. These examples are
benchmark inputs, not runtime dispatch rules or mandatory visual metaphors.

## Integration and compatibility

- Introduce optional choreography-aware narrated v9 and subtitle v4 saved contracts;
  current versions are narrated v8 (`src/types.ts:1204`) and subtitle v3
  (`src/types.ts:904`). Preserve old rendering for old plans and opt into the new path.
- Extend shared types, both planners, recovery, speech materialization, recorded
  alignment, subtitle conversion, silent scheduling, staging, and render inputs together.
  `materializeTimedNarration` explicitly constructs scenes (`src/narration-audio.ts:159`),
  so a new field must be deliberately carried through, not just accepted by Zod.
- Preserve exact source evidence. Default decorative fields with `.prefault`; validate
  cross-field references and action conflicts separately. Repairs may simplify motion,
  but cannot invent relationships or change facts.
- Keep provider shapes derived from the same schema. Narrated compatibility providers
  already receive a compact shape (`src/narration-planner.ts:752`); extend it. Bring
  subtitle compatibility planning (`src/planner.ts:536`) to equivalent coverage.
- Require adapters to declare supported object/action capabilities. The current
  `recipeSupportsTool` checks recipe names (`src/animation-recipes.ts:24`), which is
  insufficient to establish that an adapter preserves a rich scene. Use the built-in
  compositor if an automatic adapter cannot preserve the plan; explain the choice.
  A forced incompatible adapter should fail clearly.
- Saved-plan rendering remains local and reproducible. No new image generation or
  research call is required for this architecture.

## Implementation milestones and acceptance

### A. Shared object/action engine and visual proof

Add graph validation, pure action evaluation, constraint layout, and cue scheduling.
Build hand-authored benchmarks from the references' relationship types and from an
unrelated tutorial or explanation. Support repeated actions on one object, connected
transfers, a source-backed state change, and an attached qualification in one group.

Acceptance: coherent short portrait/landscape motion previews, readable intermediate
states, preserved identity, and deterministic frame-order-independent rendering.
The purpose is to prove the engine; hand-authored fixtures do not prove automatic direction.

### B. Actual speech timing and end-to-end persistence

Integrate TTS alignment and cue confidence, extend recorded alignment, preserve source
subtitle timing, and add the silent reading-budget adapter. Version contracts and cache
keys; carry fields through all materialization and replay paths.

Acceptance: changing speaker speed or inserting a pause retimes relevant arrivals and
holds without changing meaning. Ambiguous anchors produce truthful diagnostics. Legacy
plans retain established behavior and saved-plan renders make no billed call.

### C. Story extraction and generative direction

Author the story graph and object/action plan from source, narration, and available assets.
Select identities, relationships, composition, cue spans, action dependencies, and quiet
holds. Replace generic beat-driven behavior in the new path. Keep useful old components
as composable parts. Preserve source coverage and essential qualifications.

Acceptance: automatic output works across unrelated inputs without adding topic-specific
code. A claim with no motion-worthy relationship can remain a well-composed quiet shot.
The planner does not invent movement merely to satisfy a variety quota.

### D. Review, repair, and adapters

Add action-boundary capture, previews, diagnostic reports, targeted repair, and adapter
capability matching. Improve caption emphasis, pronunciation review, and audio finishing
alongside the shared cue system without making them substitutes for story direction.

Acceptance: unresolved important overlaps, weak anchors, missing holds, or semantic
downgrades are surfaced before final export. Optional adapters preserve actions and
meaning or give an explicit fallback explanation.

### E. Generalization release gate

Evaluate several unseen sources in each of news, finance, technical explanation,
tutorial, and human interaction. Include dense numbers, repeated entities, negation,
uncertainty, long pauses, and sentences with no physical action. Compare automatic
results to hand-authored benchmarks without tailoring renderer code per example.

Validate graph/reference integrity, source-supported states, dependency cycles,
conflicting object writes, word-cue confidence, short cue windows, intermediate layout,
caption collisions, reading holds, retiming, cache invalidation, legacy replay, and
provider parity. Run `pnpm check` and `pnpm test`, then visually inspect motion outputs.

This is a substantial feature release across planning, timing, contracts, layout,
rendering, and review. Its largest uncertainties are reliable semantic direction and
readable layout over time. A successful demo is the first milestone; varied automatic
outputs are the evidence required for completion.
