# Architecture

← [AGENTS.md](../AGENTS.md) · Verified 2026-09-16 at commit `d1e65f3`

## Design intent

Three capabilities are deliberately decoupled so each runs independently:

| Capability | Implementation | External dependency |
|---|---|---|
| **Authoring** — what the video says and shows | OpenAI structured outputs | API key, network, billed |
| **Speech** — script into audio | Supertonic 3, ONNX, on-CPU | Local model files only |
| **Rendering** — plan into frames | Remotion → React → headless Chrome | Local Chrome only |

Speech and rendering are fully offline. Only authoring needs a key.

## Pipeline topology

```
                    ┌──────────────── requires OPENAI_API_KEY ──────────────┐
                    │                                                        │
  source.md ────────┼──► narration-planner.ts ──► draft plan (JSON) ◄────────┼─── hand-authored
  subtitle.srt ─────┼──► planner.ts          ──► draft plan (JSON)           │    or edited
                    │                                                        │
                    └────────────────────────────────────────────────────────┘
                                              │
                    ┌─────────────────────────┴──────── fully offline ───────┐
                    │                                                         │
                    ▼                                                         │
            narration-audio.ts                                                │
        (spawns supertonic/worker.ts)                                         │
                    │                                                         │
        ┌───────────┴────────────┐                                            │
        ▼                        ▼                                            │
  voiceover.wav          timed plan (JSON)                                    │
        │                        │                                            │
        └───────────┬────────────┘                                            │
                    ▼                                                         │
            narrated-render.ts ──► Remotion bundle ──► headless Chrome ──► .mp4
                    │                                                         │
                    └─────────────────────────────────────────────────────────┘
```

## Egress inventory

The OpenAI SDK is instantiated at **exactly six sites**. No other code path reaches the
network. Authoritative check:

```bash
grep -rn "new OpenAI(" src/ --include='*.ts' | grep -v test
```

| Site | Triggered by | Cost class |
|---|---|---|
| `src/narration-planner.ts:576` | `create <source.md>` | Tokens |
| `src/planner.ts:513` | `<subtitle.srt>` without `--render-plan` | Tokens |
| `src/publish.ts:165` | `publish <plan.json>` | Tokens |
| `src/source-research.ts:217` | `--research auto\|required` | Tokens + web search calls |
| `src/scene-backgrounds.ts:132` | `--scene-background generated` | **Image API — highest** |
| `src/generated-visuals.ts:180` | `--generated-visuals auto` | **Image API — highest** |

`new OpenAI({apiKey: process.env.OPENAI_API_KEY})` **throws** `OpenAIError: Missing
credentials` when unset. If a command exits 0 with no key set, it provably made no request.

## Repository layout

```
src/
  cli.ts                  Arg parsing and dispatch. Usage text at :70-140. Entry point.
  types.ts                ~2,000 lines of Zod schemas. Source of truth for all file formats.

  planner.ts              Subtitle-overlay authoring (OpenAI)
  narration-planner.ts    Narrated-video authoring (OpenAI)
  source-research.ts      Optional grounded web research (OpenAI)
  publish.ts              Publish-kit metadata authoring (OpenAI)
  scene-backgrounds.ts    Background image generation (OpenAI Image API)
  generated-visuals.ts    Foreground image generation (OpenAI Image API)

  narration-audio.ts      Orchestrates TTS: draft plan -> timed plan + voiceover.wav
  narration-speech.ts     Phrase and beat timing arithmetic
  subtitles.ts            SRT/VTT parsing

  render.ts               Subtitle-overlay render entry
  narrated-render.ts      Narrated-video render entry
  publish-render.ts       Publish-cover render entry

  asset-registry.ts       Manifest + hash validation for local assets
  icon-catalog.ts         Lucide + Simple Icons resolution
  technology-catalog.ts   Brand mark resolution
  local-images.ts         External image ingestion
  visual-palettes.ts      Palette enum and colour tokens

  remotion/               React components — the actual visuals
    Root.tsx              Registers 4 compositions: AnimationClip, SubtitleClip,
                          NarratedVideo, NarratedThumbnail
    NarratedVideo.tsx     Narrated composition root
    DirectedScene.tsx     Per-scene direction and transitions
    ExplainerVisuals.tsx  The six explainer treatments
    SubtitleClip.tsx      Overlay composition
    text-fit.ts  timing.ts  chroma-key.ts  publish-layout.ts   pure, unit-tested

  supertonic/             Local TTS subsystem
    assets.ts             Pre-flight validation of the model directory
    client.ts             Spawns the worker as a child process
    worker.ts             ONNX inference process
    synthesis.ts          Chunking and waveform assembly
    voice-selection.ts    Automatic voice choice from plan signals
    upstream-helper.ts    Vendored from Supertone (MIT)
    protocol.ts           Zod job/response schemas for worker IPC
    wav.ts                PCM16 WAV writer

fixtures/                 Checked-in plan JSONs for tests and fixture scripts
assets/                   brands/ icons/ motion/ — local catalogs with manifests
models/supertonic-3/      TTS model (gitignored, ~822 MB, Git LFS)
```

Ignored (`.gitignore`): `node_modules/`, `.env`, `dist/`, `.remotion/`, `models/supertonic-3/`.
Tests are colocated: `src/foo.ts` ↔ `src/foo.test.ts`. `tsconfig.json` excludes tests from the
build.

## Speech synthesis subsystem

`client.ts` **spawns `worker.ts` as a child process**, writes one JSON job to stdin, reads one
JSON response from stdout.

> ⚠️ **stdout is reserved for that single response.** The worker reassigns `console.log` to
> stderr at `worker.ts:16`. **Never write to stdout from worker code paths** — it corrupts the
> IPC channel.

The client prefers a compiled `worker.js` when present, else runs `worker.ts` via tsx
(`client.ts:15-21`). Inference is CPU-only (logs `Using CPU for inference`), roughly
real-time. Voice `auto` selection lives in `voice-selection.ts` and reports its rationale.

## Rendering subsystem

Remotion bundles `src/remotion/index.tsx` and drives headless Chrome. Four compositions are
registered in `Root.tsx`: `AnimationClip`, `SubtitleClip`, `NarratedVideo`,
`NarratedThumbnail`.

**Asset hygiene.** Saved-plan rendering never downloads a logo or animation. It validates
checked-in manifests and hashes, copies only referenced files into Remotion's temporary public
directory, and removes that staging directory afterwards. A timed plan reuses cached generated
images; if one is missing the CLI names the scene and requires an explicit
`--generated-visuals auto` rather than silently substituting unrelated art.

**Testability convention.** Pure logic lives in `text-fit.ts`, `timing.ts`, `chroma-key.ts`,
`publish-layout.ts` and is unit-tested without a browser. Put new rendering logic there, not
in components.

## Code conventions

- **ESM throughout** (`"type": "module"`). Relative imports need explicit `.js` extensions even
  from `.ts` sources — `module: NodeNext`.
- **Strict TS** plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. The latter
  forbids passing `{foo: undefined}` where `foo?: T` — hence the `...(x ? {x} : {})` spread
  pattern throughout the render modules.
- **Zod parses at every boundary.** Extend the schema; never hand-roll validation.

## Scale

~22,300 lines across 75 source modules and 37 test files (36 `.test.ts` + 1 `.test.tsx`),
314 tests, full suite ≈ 1.4 s.
