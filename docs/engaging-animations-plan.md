# Plan: more engaging animation in every video workflow

Status: proposed implementation; no runtime changes in this document. Audited 2026-11-02.

For the broader story-driven direction requested on 2026-11-09, see
[Story-driven motion proposal](story-driven-motion-plan.md). It extends this proposal
from named choreography recipes to persistent objects, story events, and voice-aligned
actions. That document now records the locally implemented foundation and the remaining
work. The recipe-specific milestones below remain historical proposals.

## Goal and assessment

Produce coherent animated explanations like the supplied 30-second Rust reference:
concepts move around a focal subject, a diagram changes state while retaining its identity,
and a guide climbs a sequence of steps. Motion should explain relationships and outcomes.

The rendering foundation is strong. The main work is adding reusable choreography,
continuous scene composition, and reliable planner selection. This is a medium-sized
feature release. Matching one hand-authored reference is a smaller milestone than
reliably selecting good animations for unrelated sources.

Scope includes generated narration, recorded narration, subtitle-driven editor clips,
and finished silent explainers. Subtitle clips may accompany an existing human recording;
they need source cue timing even though this tool generates no narration for them.

Reference: `/home/logan/Desktop/YouTube-Videos/YouTube-Rust-Taking-Over-AI-Development/rust_explainer_animation.mp4`.
FFprobe measured 29.916667 seconds, 1280×720, 24 fps, and no audio stream. The assessment
uses frame sequences from the clip; it does not verify the video's factual claims.

## Current implementation, verified in source

| Reference capability | Existing foundation | Remaining gap |
|---|---|---|
| Cohesive graphics and eased motion | Four templates, 14 visual kinds, and shared spring/entrance/connector/chart constants (`src/types.ts:23`, `src/types.ts:314`, `src/remotion/cinematic-motion.ts:8`) | Design new choreography using these foundations; changing easing alone will not provide it. |
| Central subject with orbiting concepts | Agent-workflow positions tools around a focal subject and animates request/result motion; icon spotlight has a specialized orbiting marker (`src/remotion/NarratedVisualLayer.tsx:176`, `src/remotion/NarratedVisualLayer.tsx:275`, `src/remotion/NarratedVisualLayer.tsx:679`) | General concept orbit with moving satellites, controlled reveals, legible labels, and no requirement that the subject be an AI agent. |
| Source → processor → output | Process arrows and sequence messages already draw progressively (`src/remotion/AnimationClip.tsx:257`, `src/remotion/ExplainerVisuals.tsx:114`) | Persistent nodes that change state, payload movement, and a coordinated result annotation. |
| Transformation inside one object | Before/after reveals two comparison cards (`src/remotion/ExplainerVisuals.tsx:59`) | Keep one object's location and identity while its badge, color, and inner content change. |
| Character climbs learning steps | Code-drawn people support speech, blinking, nodding, held props, and grounded exchanges (`src/remotion/CharacterScene.tsx:147`) | Travel, hop/landing, and a symbolic solo guide. Current character scenes require 2–3 people and an actual source-described exchange (`src/explainer-visuals.ts:67`). |
| Question cards remain beside changing visuals | Narrated scenes render in separate sequences with a persistent segmented progress bar (`src/remotion/NarratedVideo.tsx:62`, `src/remotion/NarratedProgress.tsx:6`) | A semantic agenda and shared stage across a related group of scenes. |
| Same visual behavior in both main paths | Subtitle clips and narrated scenes already feed the same visual layer (`src/remotion/SubtitleClip.tsx:47`, `src/remotion/SubtitleClip.tsx:111`, `src/remotion/NarratedVideo.tsx:77`) | Preserve this sharing for actions, layout, and validation. |
| Speech-independent pacing | Silent audio metadata and silent project previews exist (`src/animation-contract.ts:37`, `src/project-workflow.ts:78`) | Preview duration currently derives from narration word count and evenly distributed beats (`src/narration-planner.ts:963`); finished silent output needs its own reading and action budget. |
| Editable external animations | HyperFrames, Lottie, and StykAnimate are integrated, with seven recipe treatments (`src/animation-contract.ts:10`) | Recipes are deliberately bounded: e.g. HyperFrames commonly reveals text rows and Lottie draws text plus focal rings (`src/animation-recipes.ts:42`, `src/animation-recipes.ts:86`). These adapters alone do not provide reference-level choreography. |

One routing detail matters: diagrams with presentation metadata use `DirectedScene`
(`src/remotion/DirectedScene.tsx:24`); its process composition currently reveals numbered
or icon-led text entries (`src/remotion/DirectedScene.tsx:99`). The existence of animated
arrows in the legacy renderer therefore does not mean a newly planned process uses them.
Give new recipes dedicated routing and retain connected geometry where it explains the source.

Planner parity needs particular attention. Narration supplies a schema-derived compact shape
to Gemini/Groq (`src/narration-planner.ts:752`), and animation recipe authoring does likewise
(`src/animation-tools.ts:49`). Subtitle planning uses a general JSON instruction on its
compatibility branch rather than the full schema-derived shape (`src/planner.ts:535`).
Correct that discrepancy as part of integrating richer treatments.

## Proposed architecture

Keep plan JSON as the contract and Remotion as the final compositor. Extend the existing
shared visual scene contract (`src/types.ts:951`) with a bounded choreography description.
Start with semantic recipes and controlled actions; model-authored arbitrary JavaScript,
SVG paths, coordinates, or a general animation editor are outside this release.

The authoring side chooses **what changes** and **which source cue explains it**.
A deterministic resolver supplies geometry, easing, action duration, and reading holds.
The renderer evaluates the resolved state directly from the requested frame, including
when frames are sought out of order or rendered concurrently.

Proposed action vocabulary: reveal, emphasize, connect, transfer, change-state, travel,
and annotate. Actions reference stable object IDs, named states, and semantic cue IDs.
Recipes may produce several actions from one cue, such as jump → land → highlight.
This must not require repeating an item's introduction or splitting natural speech.
Existing exact-once item anchoring remains the rule for first introduction.

Use three timing adapters feeding the same resolver:

| Workflow | Authoritative clock | Scheduling rule |
|---|---|---|
| TTS or recorded narration | Measured speech / aligned recording | Resolve actions within their semantic beat or phrase window; preserve recording pauses and playback speed. |
| SRT/VTT editor clips | Original subtitle cue times | Keep clip bounds and source offsets; simplify or omit decorative actions when the cue is too short. |
| Finished silent explainer | Explicit editorial cues, or deterministic reading/action estimates | Budget for newly visible text, animation completion, and a readable final hold. Allow a target duration; report when the requested content cannot fit. |

When time is constrained, preserve meaning and readable labels first. Remove secondary
motion before shortening essential actions; never silently overrun a cue, discard an
essential source point, or accelerate narration. An unsatisfiable silent duration needs
a clear validation error with the required budget.

## Implementation sequence

### 1. Establish a reusable visual benchmark

Create hand-authored plans covering the reference's three concepts using neutral,
source-backed examples. Produce a roughly 30-second landscape sequence and a native
portrait adaptation, with short motion previews as well as stills. Do not copy the
reference's claims into a factual benchmark without a supporting source.

The benchmark establishes visual quality before provider behavior is involved. Reuse
the same visual definitions for narrated, subtitle, and silent fixtures. Fixture speech
timings and silent audio can exercise the narrated composition offline; actual TTS and
recorded-audio timing receive separate end-to-end validation before release.

### 2. Add shared action scheduling and validation

Suggested new modules: `src/choreography.ts` for the Zod contract and semantic resolver,
and `src/remotion/choreography-motion.ts` for pure frame/pose calculations. Extend shared
types and both plan materializers so actions survive validation, saving, replay,
recording alignment, and timing conversion.

Keep IDs and cue references stable. Resolve timing once, retain its provenance, and
include choreography, layout, cue timing, and renderer version in affected cache keys.
Validate unknown targets/states/cues, dependencies, actions outside scene bounds, and
conflicting writes to one object property. Decorative defaults may use `.prefault`;
source evidence never does. Recover safe cross-field mistakes for every provider and
surface warnings; do not repair an unsupported semantic relationship into a new claim.

Introduce explicit backward-compatible readers and fixture coverage for the new saved
contracts. Current canonical versions are narrated v8 and subtitle v3
(`src/types.ts:1204`, `src/types.ts:904`); new choreography-aware contracts should use
narrated v9 and subtitle v4, with legacy plans retaining their established rendering.

### 3. Implement three reusable treatments

| Proposed treatment | Choreography | Reuse and grounding |
|---|---|---|
| `concept-orbit` | Focal logo/icon enters; concept satellites appear and move on bounded arcs; selected concepts receive emphasis. | Reuse badges, icons, and entrance math. Evidence must support the relationships; a list of names alone must not imply migration or integration. Keep labels upright and avoid collisions. |
| `pipeline-transform` | Source payload travels to a processor; the processor changes from a named before state to an after state; output travels onward; a supported result appears. | Reuse flow/sequence geometry. Stable processor identity across the change. Explicit evidence for direction, transformation, and any claimed outcome. |
| `step-journey` | Ordered steps appear; a solo guide travels/jumps to each step; landing triggers emphasis; a final supported takeaway appears. | Reuse character drawing and appearance. Treat the guide as an illustrative metaphor, separate from the existing grounded multi-person exchange. Require source support for step order; do not imply a guaranteed career outcome. |

Support a small action budget and quiet holds. Existing charts remain the route for
numeric evidence. Decorative bars must never look like measured adoption statistics;
use a non-data motif for general momentum when the source supplies no values.

### 4. Add continuity and reading-focused composition

Introduce an optional scene-group stage: a compact agenda and a visual viewport.
Stable group and object IDs allow the agenda and focal subject to remain while the
explanation advances. The agenda derives from the source outline and current cues.
Related scenes may opt into continuity; unrelated news topics remain separate.

Landscape may use a side agenda. Portrait needs a compact top indicator or short
chapter transition, with the main animation below. Pass actual viewport dimensions
and caption exclusions to treatments; existing full-frame geometry cannot simply be
squeezed into a side panel. Fit labels without shrinking them into unreadable text.
Honor transparent and green-screen output via the existing chroma-safe helpers.

Transitions must retain a legible focal object or perform a clean cut. Avoid overlapping
outgoing and incoming labels. Do not force a persistent agenda onto short standalone
editor clips; those can use a local step indicator or no agenda.

### 5. Wire authoring and adapters into all workflows

Update `src/narration-planner.ts` and `src/planner.ts`, their schema-derived provider
shapes, recovery/materialization, source evidence checks, and planner fixtures together.
Provide short source-to-recipe examples and choose motion for a relationship: change,
dependency, transfer, ordered progress, or emphasis. Visual variety remains subordinate
to source coverage and factual correctness.

The director may choose a recipe and cue anchors; it should not invent a second clock.
Keep the provider shape compact and test its discriminators and size in both planners.

Deliver the first complete treatments through the built-in shared renderer. External
selection must become capability-aware: an adapter may replace a treatment only when
it preserves its structure, actions, timing, and layout. Automatic selection otherwise
keeps the built-in version with an explanation; forcing an unsupported adapter fails
clearly. Then extend native export recipes where there is a concrete editing benefit.
Update retiming, manifests, cache signatures, and `ExternalAnimation` placement together.

Add a deliberate silent-output option to the existing CLI workflow and record it in the
project manifest. Its final render must use the silent timing adapter and must not
enter TTS or require a recording. Keep `--render-plan` as the free offline development
route, and preserve existing subtitle export behavior.

### 6. Validate motion, timing, and generated choices

Meaningful unit tests: frame-order independence, short/dense cue windows, dependencies,
unknown references, repeated emphasis after first reveal, landing alignment, source
grounding, legacy upgrades, and cache invalidation after a choreography/timing edit.
Exercise mocked OpenAI and compatibility-provider responses for both planners.

Render and inspect landscape/portrait; captions on/off; dark, transparent, and green
backgrounds; TTS-shaped timings, recording pauses, subtitle bounds, and silent pacing.
Inspect short MP4s and frames immediately before/after each semantic action, including
boundaries and final holds. Existing production stills capture 50% and 88% only
(`src/narrated-render.ts:264`), which is insufficient to establish smooth choreography.

Release acceptance:

- The reference-like benchmark works through narrated, subtitle, and finished-silent paths.
- Focal subjects remain stable during transformations; guide feet meet their landing surface.
- Every essential label has a readable hold; no clipped labels or caption collisions.
- Speech/cue anchors and source coverage survive richer motion and recorded retiming.
- Unsupported treatments produce a truthful fallback with a visible warning or a clear forced-mode error.
- Legacy fixture behavior remains covered; `pnpm check` and `pnpm test` pass.
- Rendering existing plans requires no billed provider call or generated image.

## Milestones and uncertainty

1. **Visual proof:** hand-authored three-treatment benchmark using the shared renderer.
2. **Workflow parity:** timing adapters, native portrait composition, overlays, and saved-plan replay.
3. **Automatic direction:** both planners select and ground recipes on varied sources; adapter capability checks pass.
4. **Release polish:** continuity, transitions, motion review, documentation, and full gates.

The largest uncertainty is automatic visual choice across varied sources, followed by
portrait readability and dense speech windows. A successful Rust-style benchmark alone
does not establish general authoring quality. Validate with several unrelated source
families, including cases where existing treatments remain the appropriate choice.

## Audit verification

- `pnpm check`: passed.
- `pnpm test`: 615 tests passed across 50 files.
- Generated a hand-authored fixture draft through `makeExplainerDraft`, then validated
  it with `create --render-plan ... --plan-only`.
- Rendered and inspected twelve fresh 16:9 stills of the six explainer fixtures with
  provider keys removed. Output: `/tmp/engaging-animation-audit/current-stills/current.stills/`.
- Rendering required a sandbox exception for Remotion's local server/Chrome startup;
  no source workaround was applied. This audit did not render a new full-motion baseline
  or run billed authoring, TTS, or recorded-audio assembly.
