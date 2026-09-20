# YouTube Animations CLI

Turn text into narrated videos, subtitles into editor-ready animation overlays, and saved narration plans into publish kits. This private TypeScript CLI uses OpenAI, Gemini, or Groq for planning, local Supertonic 3 for speech, and Remotion for native 16:9 and 9:16 rendering. It runs locally with no application server or database.

Visuals include animated characters, typography, diagrams, charts, code walkthroughs, local images, icons, and Lottie assets. Generated images and cited web research are optional. Subtitle clips remain separate and audio-free.

The CLI provides four commands:

| Input | Command | Result |
| --- | --- | --- |
| Topic name | `youtube-animations topic "Passkeys"` | A Markdown source document for review |
| `.srt` or `.vtt` subtitles | `youtube-animations episode.srt` | Separate editor-ready overlay clips plus a placement manifest |
| `.txt` or `.md` source text | `youtube-animations create summary.md` | A planned, voiced, captioned, and rendered narrated video |
| Narrated plan JSON | `youtube-animations publish summary.narration-timed.json` | Copy-ready title, description, tags, thumbnail, and vertical cover |

Commands in this README use `pnpm run animations` to execute the TypeScript source from the repository. After `pnpm build`, the same arguments can be passed to `node dist/cli.js` or the configured `youtube-animations` binary.

The **plan JSON is the editable contract** between AI authoring and local rendering:

```text
topic → source.md → draft plan JSON → local speech → timed plan JSON → video
                      edit here                       reuse audio
```

Creating a source, plan, or publish metadata calls the selected AI provider. `--render-plan` skips AI planning; rendering can run offline once dependencies, the needed model, and referenced assets are available. Generated-image modes can still call their provider for missing assets.

Jump to [Setup](#setup), [Narrated videos](#create-narrated-videos), [Review stages](#review-before-rendering), [Animated characters](#animated-character-scenes), [Subtitle overlays](#subtitle-animation-overlays), [Publish kits](#create-a-narrated-video-publish-kit), [Options](#options), or [Development checks](#development-checks).

## What it creates

Narrated input:

```text
/videos/summary.md
```

Default output:

```text
/videos/summary-video/
├── summary.research.json          # optional cited research cache
├── summary.research.md            # optional clickable research report
├── summary.narration-script.md
├── summary.narration-plan.json
├── summary.narration-timed.json
├── summary.stills/                # scene previews with --stills-only or --review
├── summary.media/                 # selected files copied from sibling images/
├── summary.generated-visuals/     # optional foreground cache and manifest
├── summary.audio/
│   ├── voiceover.wav
│   ├── spoken-script.json         # exact text sent to speech synthesis
│   └── beats/
│       ├── 001-hook.wav
│       └── ...
└── summary.mp4
```

Running the optional `publish` workflow adds the following beside the narration plan:

```text
summary-video/
├── summary.publish.json
├── summary.publish.md
├── summary.thumbnail.png
└── summary.cover-9x16.png
```

With generated scene backgrounds, a reusable cache is added beside those files:

```text
summary-video/summary.backgrounds/
├── manifest.json
├── hook-16x9-0de4c0ffee12.jpg
└── hook-9x16-91a20cafe123.jpg
```

With `--aspect-ratio both`, `summary-9x16.mp4` is rendered from the same narration, voiceover, and sample-derived timeline.

Subtitle input keeps its existing editor-oriented output names. Vertical files insert `-9x16` before the extension, and enriched placement manifests are version 4:

```text
/videos/animations/
├── episode.animation-plan.json
├── episode.media/                 # selected files copied from sibling images/
├── episode.generated-visuals/     # optional foreground cache and manifest
├── episode.backgrounds/           # optional generated backdrop cache
├── episode.animations.json
├── episode.animations-9x16.json
├── 00h04m12s-01-process-flow.mp4
└── 00h04m12s-01-process-flow-9x16.mp4
```

## Requirements

- Node.js 22.13 or newer and pnpm 11.22
- an OpenAI, Gemini, or Groq API key when authoring a topic, narration/overlay plan, or publish metadata
- Google Chrome or Chromium when rendering video, scene stills, or publish covers
- Git LFS and the local Supertonic 3 model when synthesizing narrated audio
- image-provider credentials only for uncached generated images; an OpenAI or Gemini key is also needed to validate generated foreground visuals

Planning-only and saved-plan workflows skip the dependencies they do not use. For example, `--plan-only` does not need Chrome or Supertonic, and a timed narrated plan with its existing voiceover and ambient backgrounds can be rerendered without an AI key or the Supertonic model.

Saved-plan rendering never downloads a logo or animation. It validates checked-in asset manifests and hashes for selected local images, copies only referenced files into Remotion's temporary public directory, and removes that staging directory after the render. A timed plan also reuses cached generated foreground images without provider calls; if one is missing, the CLI names the scene and asks for `--generated-visuals auto` instead of silently substituting unrelated art.

Publish metadata needs an AI provider only when creating a new publish plan. Rendering an edited publish plan needs Chrome but makes no AI request. Publish covers use Remotion typography, shapes, diagrams, validated data/code, supplied local images, Lucide icons, and the installed Simple Icons catalog; the publish workflow never generates images.

Remotion has separate license terms. Confirm that your use qualifies for its free license or obtain the appropriate license: [Remotion license](https://www.remotion.dev/license).

## Setup

Install application dependencies and create a local configuration file:

```bash
pnpm install
cp .env.example .env
```

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.6
OPENAI_IMAGE_MODEL=gpt-image-2
```

The CLI reads `.env` from the current working directory. Configure only the providers you need; keep `.env` and model files out of version control.

### AI and image providers

`AI_PROVIDER` selects `openai`, `gemini`, or `groq` for topic authoring, both planners, and publish metadata. If unset, the first available key wins in the order OpenAI → Gemini → Groq. `--model` overrides the selected provider's model setting.

| Provider | Required key | Model environment variable | Code fallback when unset |
| --- | --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` | `gpt-5.6` |
| Gemini | `GOOGLE_GEMINI_API_KEY` | `GOOGLE_GEMINI_MODEL` | `gemini-3.5-flash` |
| Groq | `GROQ_API_KEY` | `GROQ_MODEL` | `qwen/qwen3.8-27b` |

These are the defaults in [`src/ai-client.ts`](src/ai-client.ts), not a guarantee of model availability on your account. The checked-in `.env.example` explicitly sets `GROQ_MODEL=llama-3.3-70b-versatile`, which overrides the code fallback when copied; edit or remove that setting to choose a different model.

For example, to use Gemini, set these values in `.env`:

```dotenv
AI_PROVIDER=gemini
GOOGLE_GEMINI_API_KEY=your_key_here
GOOGLE_GEMINI_MODEL=gemini-3.5-flash
```

Image generation is selected separately with `IMAGE_PROVIDER=cloudflare|openai`. With no selector, Cloudflare wins when both `CLOUDFLARE_AI_KEY` and `CLOUDFLARE_ACCOUNT_ID` are present; otherwise OpenAI is used. Cloudflare setup:

```dotenv
IMAGE_PROVIDER=cloudflare
CLOUDFLARE_AI_KEY=your_token_here
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_IMAGE_MODEL=@cf/stabilityai/stable-diffusion-xl-base-1.0
```

The code defaults to SDXL for Cloudflare, but `.env.example` currently sets `@cf/black-forest-labs/flux-1-schnell`; replace that value to use SDXL. The adapter requests landscape/portrait dimensions for SDXL, while its FLUX path omits size parameters. `--image-quality` is forwarded to OpenAI; the Cloudflare adapter uses its own model-specific parameters.

When forcing OpenAI images while Cloudflare credentials are also present, pass `--image-model gpt-image-2` (or your chosen OpenAI image model): the CLI's automatic model choice checks for `CLOUDFLARE_AI_KEY` independently of `IMAGE_PROVIDER`. Foreground-image validation prefers OpenAI, then Gemini; Groq alone cannot validate generated images.

`--research auto|required` uses OpenAI-hosted search. Use `AI_PROVIDER=openai` and an OpenAI model for research runs: the same model argument is passed to research and planning. Ambient backgrounds, local images, and character animation need no image-generation credentials. See [provider details](docs/providers.md).

### Browser and local speech

Set the browser path explicitly when it is outside the probed Linux locations. On macOS:

```bash
export REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

For narrated audio, download Supertonic 3 once at the default location:

```bash
git lfs install
git clone https://huggingface.co/Supertone/supertonic-3 \
  models/supertonic-3
```

The model directory is ignored by Git. The CLI validates all four ONNX files, `tts.json`, `unicode_indexer.json`, and the requested preset voice before synthesis.

Validate a checked-in draft without a key, model, or browser:

```bash
pnpm run animations create --render-plan fixtures/sample.narration-plan.json --plan-only
```

For a browser-only preview without speech synthesis or provider calls:

```bash
pnpm run animations create --render-plan fixtures/sample.narration-plan.json \
  --stills-only --output-dir /tmp/youtube-animation-preview
```

Use `--force` to replace existing previews. See [setup](docs/setup.md) and [troubleshooting](docs/troubleshooting.md) for model and browser diagnostics.

### No separate Supertonic server

You do not need Python, `supertonic serve`, an HTTP endpoint, or a separately managed background process. The CLI automatically starts a short-lived Node worker, sends one JSON job over stdin, loads the model and selected voice once, synthesizes every beat sequentially, returns exact sample counts, and exits before Remotion starts. This releases ONNX memory between voice generation and video rendering.

`onnxruntime-node` is pinned to `1.27.0`. The worker adapts Supertone's official MIT-licensed Node helper rather than executing its example CLI; attribution is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Create narrated videos

### Quickstart

Write a `.txt` or `.md` source yourself, or ask the selected provider to draft one:

```bash
pnpm run animations topic "Passkeys" --output-dir samples/topic.md
```

Review the source, then choose an output orientation. These commands use the default code-drawn ambient background:

```bash
pnpm run animations create samples/topic.md
pnpm run animations create samples/topic.md --aspect-ratio 9:16
pnpm run animations create samples/topic.md --aspect-ratio both
```

Each line is an alternative invocation. Existing outputs require `--force`; use the saved-plan workflow below to reuse planning and audio. The output directory is `samples/topic-video/`: landscape video is `topic.mp4`, portrait video is `topic-9x16.mp4`, and both share `topic.audio/voiceover.wav` and `topic.narration-timed.json`.

Add `--scene-background generated` only when you want provider-generated background images. That mode can make billed image requests; it is independent of orientation and character animation.

### Review before rendering

Use separate stages to inspect the script, visuals, and audio:

| Flag | Output | Browser needed? | Supertonic model needed? |
| --- | --- | --- | --- |
| `--plan-only` | New script + draft JSON, or validation of a saved plan | No | No |
| `--stills-only` | Scene PNG previews | Yes | No |
| `--audio-only` | Voiceover + timed JSON from a draft | No | Yes |
| `--review` | Interactive script → stills → audio → video workflow | Yes | Yes |

These stage flags apply to narrated videos; subtitle overlays support `--plan-only`. `--stills-only` and `--audio-only` cannot be combined. New planning still calls the selected AI provider. Generated-image options can request images during still or audio stages; `--plan-only` saves directions without generating images.

```bash
# 1. Author the script and storyboard.
pnpm run animations create samples/topic.md --plan-only

# Edit samples/topic-video/topic.narration-plan.json, then validate it.
pnpm run animations create --render-plan samples/topic-video/topic.narration-plan.json --plan-only

# 2. Preview each scene without synthesizing speech.
pnpm run animations create --render-plan samples/topic-video/topic.narration-plan.json \
  --stills-only --force

# 3. Synthesize and review topic.audio/voiceover.wav.
pnpm run animations create --render-plan samples/topic-video/topic.narration-plan.json \
  --audio-only --force

# 4. Render using the reviewed audio and its measured timeline.
pnpm run animations create --render-plan samples/topic-video/topic.narration-timed.json --force

# Optional: generate metadata and both publish covers.
pnpm run animations publish samples/topic-video/topic.narration-timed.json
```

**Edit narration in the draft JSON's `scenes[].beats[].phrases[].text`.** The script Markdown is a readable export; changes to it are not read back into the plan. Regenerate audio from the draft after changing narration. Timed-plan renders reuse existing audio, and `--audio-only` on a timed plan simply exits.

Draft previews estimate timing from word counts. Final pacing comes from measured speech. Each scene gets `scene-N-<id>-mid-<aspect>.png` at its midpoint, `scene-N-<id>-final-<aspect>.png` near its end, and a canonical `scene-N-<id>-<aspect>.png` copy of that late frame. Inspect both states; the late frame is sampled at 88%, so it is not proof that every possible late cue has appeared. Existing stills require `--force`.

For an interactive run in a terminal:

```bash
pnpm run animations create samples/topic.md --review --aspect-ratio 9:16
```

The CLI pauses for Enter after the script, scene screenshots, and voiceover. It reloads the draft JSON after the first two pauses. If you change visual or asset directions after inspecting stills, restart from the edited draft to regenerate previews and assets. The final video renders the animated scene components using the timed plan and voiceover; preview PNGs are not stitched into the video.

With non-interactive stdin, review prompts are skipped and execution continues. Use individual stages when you need the process to stop reliably. Repeat render-time options such as `--aspect-ratio`, `--captions`, `--scene-background`, and `--background-image` across separate commands; they are not restored automatically from the draft.

### Author a topic source

```bash
pnpm run animations topic "Zero-knowledge proofs at the airport"
pnpm run animations topic "Passkeys" --guidance "aim at small business owners"
pnpm run animations topic "Digital rupee" --output-dir samples/rupee.md --force
```

Everything the planner can show is bounded by what the source document says, so this command writes
one shaped for the pipeline rather than generic prose. The rules it follows:

- **One concrete scene naming two people, both in a single sentence.** This is what makes animated
  characters possible: a character scene must quote an exact excerpt describing the interaction,
  so the source has to contain one. (The excerpt is checked; the cast's role *labels* are not —
  they are internal and never drawn, so the planner may call someone "Customer" where the source
  says "an individual".) Other visual treatments remain available for sources without a human exchange.
- **220–400 words**, to keep the source compact when it travels inside the planning request.
- **Short declarative sentences**, since every treatment is grounded by quoting the source exactly.
- **No invented numbers, dates, or organisations** — a guessed figure becomes a false on-screen claim.
- **Consistent third person**, and a closing line that returns to the occasion when the topic is a
  day of observance.

The model also returns the participant roles and the sentence in which they interact. The file is
written only after that sentence is confirmed to appear in the document, allowing normalized whitespace and case, and to name every
participant. This supplies material for character staging; the planner still chooses the treatment. Up to three
attempts are made, resending only the list of problems.

Topic authoring does not run web research or fact-check the draft. The checks validate document structure and participant references; review factual claims before treating the generated document as your source.

Options: `--guidance <text>` for extra direction, `--output-dir <path>` for a different destination
(default `samples/<slug>.md`), `--force` to replace an existing file, and `--model` / `AI_PROVIDER`
exactly as for `create`.

### Planning and narration

```bash
pnpm run animations create summary.md
pnpm run animations create summary.md --aspect-ratio 9:16
pnpm run animations create summary.md --aspect-ratio both
```

The planning request creates a faithful hook, explanation, and conclusion using at most six scenes. It also selects one dark cinematic palette—`cyan`, `violet`, `emerald`, `amber`, or `rose`—from the source's dominant subject and tone. The saved `palette` field drives every scene and makes rerenders deterministic; edit that field in the draft or timed plan to override the automatic choice.

Every visible item is anchored to exactly one semantic narration beat. A beat is one coherent utterance that can be spoken in a natural breath; its short ordered phrases are caption and reveal boundaries, not separate TTS calls. The complete spoken copy is also saved as `summary.narration-script.md` for review, including any nonverbal voice direction as an italic cue such as `*[breath]*`.

English narration converts supported numbers to explicit spoken words before synthesis, while captions and visual labels retain their original notation. For example, `₹8,930.12 crore` becomes “eight thousand nine hundred and thirty point one two crore rupees.” Conversion preserves signs and all decimal digits, supports Indian and Western comma grouping, lakh/crore and thousand/million/billion magnitudes, ₹/$/€/£ currencies and INR/USD/EUR/GBP/Rs prefixes, percentages, and FII/DII/FPI initialisms. Long amounts get separate sentences during new planning; caption timing weights use the expanded speech text. Beat timings still come from the actual audio; phrase timings remain estimates, not word alignment.

The exact text sent for each synthesis call is saved in `summary.audio/spoken-script.json`. Other languages and ambiguous literals (dates, times, ranges, fractions, software versions, identifiers, URLs, and scientific notation) retain their existing handling. Review or spell out those literals in the draft narration when their pronunciation matters. To regenerate existing audio with this conversion, render the **draft** `summary.narration-plan.json` with `--force`; rendering a timed plan reuses its saved audio. Preserve your chosen `--voice`, `--tts-speed`, and `--tts-steps` when regenerating.

### Grounded web research

Web research is off by default. Enable an optional research pass before narrated planning:

```bash
pnpm run animations create summary.md --research auto
pnpm run animations create summary.md --research required
```

These commands require `OPENAI_API_KEY` and an OpenAI model; set `AI_PROVIDER=openai` if another provider is selected. `auto` lets the model skip search when the supplied source is already sufficient. `required` forces at least one OpenAI hosted [`web_search`](https://developers.openai.com/api/docs/guides/tools-web-search) call. Both modes use medium search context, permit at most four tool calls, keep response storage disabled, and request the complete consulted-source list.

The research response is structured into `supported`, `context`, and `contested` claims. Every claim URL is checked against URLs actually returned by the search tool; an invented or unmatched citation aborts planning. Only supported and contextual claims are added to the planner's effective source. Contested claims remain reviewable in `summary.research.json` and `summary.research.md` but cannot ground narration, metrics, charts, or generated imagery.

Research-enriched plans retain the untouched input in `originalSourceText`, the effective grounded input in `sourceText`, and the complete citation bundle in `research`. The narration script ends with clickable research sources. Matching research is reused by source/configuration hash, including after a later planning failure. `--force` does not purchase fresh research; refresh it explicitly:

```bash
pnpm run animations create summary.md \
  --research required \
  --refresh-research \
  --force
```

Research options apply only while planning a new narrated video. Subtitle overlays, saved-plan rendering, image validation, and publish-kit generation do not run web searches.

### Visual selection

Every version-7 scene persists a discriminated `visual` object plus explicit `icons` selections. `icons.focal` identifies the scene's central semantic symbol, while `icons.primary` and `icons.secondary` align one-for-one with visible items. `kind` chooses the treatment, `motion` chooses the restrained motion behavior, `motif` selects a controlled semantic category, and `assetId` either references a validated, subject-matched local Lottie asset or remains `null` for code-native visuals. `image-focus` instead references a plan-level local/generated media id, while `data-visualization` stores its validated chart specification. Older version-6 files without icon selections load with conservative label fallbacks; versions 1–5 retain their supported legacy visuals without new foreground media. For videos with at least four scenes the planner targets three treatments and avoids adjacent repetition when the source supports it. A character exchange can continue across adjacent scenes. If truthful source material cannot support variety, the saved plan receives a warning instead of being rejected or padded with invented content.

### Animated character scenes

`character-scene` stages a source-described interaction between two or three people, such as a reception check-in, consultation, purchase, or handoff. Characters are drawn in code and animated with speaking turns, mouth movement, blinks, nods, held props, and optional outcome callouts. Both video workflows support the treatment in landscape and portrait using code-drawn figures.

Give the planner a concrete interaction in the source, for example: “The hotel guest hands a booking confirmation to the receptionist. The receptionist checks the reservation and gives the hotel guest a key.” The scene must preserve an exact evidence excerpt. It can use a counter, a short sign, casual or uniform outfits, semantic-icon props, and a source-backed callout. Appearance is derived deterministically from cast IDs and explicit age choices; retain the same IDs and cast when continuing an exchange.

Speaking turns reference primary-item cues, so gesture and mouth timing follow narration beats or subtitle cues. Narrated videos still use one selected Supertonic voice for the entire video; character staging does not synthesize separate voices or perform phoneme alignment. Subtitle character clips remain silent.

For new narrated plans, request an extra attempt when a detected human exchange is missing:

```bash
pnpm run animations create samples/topic.md --require-characters --plan-only
```

If attempted character scenes are rejected and none survives, this flag fails planning instead of accepting the fallback. It is not an unconditional cast guarantee: if the model never attempts the treatment, the extra attempt can still yield a valid plan without characters. Inspect `visual.kind` and `planningWarnings`. The flag currently affects new narrated planning only, even though CLI help lists it under subtitle options. It does not add characters to saved plans.

When editing a plan, use two cast positions (`left`, `right`) or three (`left`, `center`, `right`), distinct cast IDs, and speaker/prop/callout indices that reference existing primary items. Character scenes use no secondary items. See [`src/explainer-visuals.ts`](src/explainer-visuals.ts) for the schema and [plan documentation](docs/plan-schema.md).

### Local foreground images

Place optional PNG, JPEG, or WebP files directly in an `images/` folder beside the source file:

```text
/videos/
├── summary.md
└── images/
    ├── benchmark-chart.png
    └── warehouse-photo.webp
```

The planner receives each valid file as a high-detail Base64 image with a stable content-derived id. Pixels and embedded text are explicitly untrusted and can guide scene matching only; graph values must still come from the source text. A local file can appear in at most one scene. Selected files are hash-checked and transactionally copied into `summary.media/`, so saved plans rerender without the original sibling folder. Screenshots and diagrams normally use `contain` over a blurred backplate; photographs may use `cover`.

### Source-backed charts

When the source contains enough related values, the planner can select grouped comparison bars or 2–4 metric cards. Every datum preserves its stable id, exact label, numeric value, unit, precision, numeric token, and exact evidence excerpt. Ratios, differences, and percentage changes save operand ids only; the renderer computes and marks their deterministic rounded display with `≈`. Grouped bars are vertical in 16:9 and horizontal in 9:16. A single isolated fact continues to use `metric-focus`.

Markdown tables and wrapped source text are checked with normalized whitespace, so an otherwise exact row does not fail merely because its cells were separated by tabs or newlines. If a proposed chart, generated/local image reference, metric, or brand treatment still cannot be verified against the source, the planner preserves the narration and replaces only that optional treatment with a code-native diagram. The CLI prints the reason under `Planning warnings`, and the warning is saved in the draft plan for review; unsupported values are never rendered as a chart.

### Supplied code walkthroughs

Place optional source files directly in a `code/` folder beside either the Markdown/text source or subtitle file. Markdown fenced blocks are also available as code sources:

```text
/videos/
├── tutorial.srt
└── code/
    ├── endpoint.py
    └── request.js
```

```bash
pnpm run animations tutorial.srt --plan-only
pnpm run animations create tutorial.md --plan-only --aspect-ratio both
```

The planner sees numbered code lines and selects an exact source range relevant to the explanation. The materializer extracts it locally; code is never rewritten or executed. Saved plans embed the excerpt, language, filename, source line range, and checksums, so rerenders do not need the original folder. The supplied explanation remains the authority for what is narrated; code comments and strings are untrusted data.

Supported extensions are `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.json`, `.sql`, `.sh`, and `.txt`. Discovery is nonrecursive, excludes symlinks, and accepts at most 10 sources, 32 KiB each, and 128 KiB total including fenced blocks. Invalid or oversized inputs produce planning warnings. Selected excerpts contain at most 12 lines of 60 columns each; indentation is preserved and tabs display as four spaces. No eligible excerpt means the planner uses another treatment. Saved-plan edits with a mismatched snippet checksum must be regenerated from the supplied source.

### New explainer selection and saved-plan controls

Both planners choose animations automatically according to the explanation's structure. Edit a saved scene/clip's `visual` object to override the choice. New visual payloads reference existing primary/secondary item indices, so the same narration beats or subtitle cues still control the reveal timing:

| Treatment | Payload and compatible motion |
| --- | --- |
| `kinetic-text` | Existing primary items; `reveal` or `pulse` |
| `before-after` | `pairs` with primary/secondary item indices and exact source evidence; `reveal` |
| `code-walkthrough` | Source ID/range, embedded `excerpt`, and `highlights` linking primary items to absolute code line ranges; `scan` |
| `sequence-diagram` | Named `participants` and ordered `messages` with endpoints, primary item index, and evidence; `flow` |
| `layered-architecture` | `layerOrder` and evidence supporting all layers and their order; `reveal` |
| `character-scene` | `cast`, source evidence, item-linked `speakers`, optional counter/props/callout; `reveal` |
| `data-visualization`, chart type `line-chart` | `points` referencing x/y datum IDs and primary items; `reveal` |

Line charts use 2–6 observations with numeric x values in strictly increasing order, consistent units on each axis, proportional axes, and straight connecting segments. Both coordinates must preserve exact source values, tokens, and evidence. Dates and numeric coordinates are not inferred from categorical labels. Line-chart `series`, `categories`, `cards`, and `derivedAnnotations` are empty. Point readouts display exact values without count-up. Unsupported optional selections fall back to a diagram with a warning; invalid saved payloads fail validation.

New animations retain stable reading time, with transitions taking at most 40% of the next available reveal window. All are supported in native 16:9 and 9:16, including green and transparent subtitle exports. Subtitle clips remain audio-free.

### Grounded generated foreground illustrations

Generated foreground visuals are off by default. Enable the planner and materializer explicitly:

```bash
pnpm run animations create summary.md \
  --aspect-ratio both \
  --generated-visuals auto
```

`auto` permits at most two scenes and may generate zero. Each selected scene saves exact source evidence, 2–5 exact source anchors, its narration beat, literal subject/action/environment/framing, and exclusions. Generic decoration, values, charts, quotes, text, logos, interfaces, named-person likenesses, and fabricated documentary evidence are forbidden. Literal editorial depiction is preferred; a metaphor must save its exact relationship to the source.

The CLI uses the selected image provider for separate landscape and portrait assets. OpenAI requests JPEGs at 2048×1152 and 1152×2048; Cloudflare's SDXL adapter requests 1344×760 and 760×1344, while other Cloudflare models can return different dimensions or encodings. A vision check using OpenAI or Gemini then requires a strong subject/action match, no unsupported content, no text/logos/charts/UI, and orientation-safe composition. One failed check gets one corrective regeneration; a second failure aborts before voice synthesis or rendering.

Assets and their evidence, prompts, model, quality, aspect, cache hash, validation result, and attempt count live in `summary.generated-visuals/manifest.json`. Matching cache entries rerender with `--generated-visuals off`. `--force` does not refresh them; use both `--generated-visuals auto --regenerate-visuals` for an explicit paid refresh.

Planning saves grounded directions without purchasing images:

```bash
pnpm run animations create summary.md \
  --plan-only \
  --generated-visuals auto
```

Materialize those reviewed directions later:

```bash
pnpm run animations create \
  --render-plan summary-video/summary.narration-plan.json \
  --generated-visuals auto --force
```

Phrase captions are enabled by default and can be disabled for a clean export:

```bash
pnpm run animations create summary.md --captions off
```

### Scene backgrounds and saved-plan rendering

The default narrated background is a deterministic animated ambient scene. To generate and cache a separate image for every scene and requested orientation:

```bash
pnpm run animations create summary.md \
  --aspect-ratio both \
  --scene-background generated
```

Provider and model selection follow the [setup rules](#ai-and-image-providers), including overrides in `.env`. A scene staged with characters asks for a literal empty interior with a
visible floor instead of an abstract metaphor, and is composited with a lighter scrim and no
drift so the room the cast stands in stays readable. Change the model or quality with `--image-model` and `--image-quality`. `--regenerate-backgrounds` refreshes matching cached images; `--force` replaces videos and plans without purchasing new images. All requested images are staged before the cache is promoted, and a failed image request stops before voice synthesis or rendering.

Use your own background image in either video workflow, including saved-plan renders:

```bash
pnpm run animations create summary.md --background-image ./background.png --aspect-ratio both
pnpm run animations episode.srt --background-image "./images/My background.jpg"
pnpm run animations --render-plan summary-video/summary.narration-timed.json --background-image ./background.png
```

`--background-image <path>` selects `--scene-background image` automatically. One local PNG, JPEG, or WebP (up to 20 MB) is shared by all scenes or clips and both orientations. Paths are relative to the current working directory, or absolute. The image keeps its original brightness and colors, with no background motion, fading, dark overlay, grid, blur, or vignette. It is centered and scaled proportionally to show the whole image; mismatched aspect ratios produce black margins, and transparent areas show black. Narrated backgrounds remain visible between scenes. For an edge-to-edge result, supply an image with the same aspect ratio as the video.

Custom image backgrounds use no image-generation API and are validated before planning or synthesis. Rendering copies the unchanged bytes once to temporary assets and checks that the image has not changed since validation. This is a render-time option: repeat it when rendering a saved plan; `--plan-only` validates the image without copying it or saving the selection. Explicit ambient/generated/off modes and `--regenerate-backgrounds` cannot be combined with `--background-image`. The same option also supports publish thumbnails and vertical covers, as described below.

Create only the script and draft storyboard—including editable subtitle phrases, chart evidence, generated foreground directions, and scene background prompts. Selected local images are copied for deterministic rerenders, but no voice or generated image assets are purchased in this step:

```bash
pnpm run animations create summary.md --plan-only
```

Narrated planning automatically replaces malformed or unsupported optional visuals with a code-native diagram and saves a warning. An empty comparison becomes a callout without inventing another side. Other validation failures, such as missing or duplicate item anchors, get up to two corrective model requests with the validation details. The CLI reports these attempts and saves their warnings; the final plan must still pass strict timing, structure, and source-grounding checks. Saved-plan validation remains strict.

After reviewing or editing the draft, validate it before synthesis and rendering:

```bash
pnpm run animations create \
  --render-plan summary-video/summary.narration-plan.json \
  --plan-only

pnpm run animations create \
  --render-plan summary-video/summary.narration-plan.json \
  --aspect-ratio both --force
```

A timed plan can also be rendered again without planning or Supertonic. Use `--force` to replace an existing video, or choose a new `--output-dir` to preserve it:

```bash
pnpm run animations create \
  --render-plan summary-video/summary.narration-timed.json \
  --force

pnpm run animations create \
  --render-plan summary-video/summary.narration-timed.json \
  --scene-background generated \
  --force
```

The first command uses the default deterministic ambient background and makes no provider call when all referenced foreground assets are cached. The second reuses matching images from `summary.backgrounds/` and requests missing backgrounds from the selected image provider.

Narrated output is H.264 video with AAC voiceover audio. Planning and TTS happen once; `both` performs two independent Remotion render passes.

## Content-directed presentation

New narrated plans focus on one central takeaway: an immediate question or claim, a clear explanation, and a useful answer. Secondary details may be omitted; necessary qualifications and exact values stay intact. Three to five scenes are preferred within the requested duration. Subtitle planning keeps the supplied transcript and timing and chooses layouts for each selected passage.

Directed scenes show a standalone opening title only when the gap before the first item cue allows time for its fade-in and reading. Short gaps show the regular scene heading immediately, preventing a title flash while preserving speech and item timing. This also applies when rerendering saved plans with directed layouts.

Both workflows save scene `presentation` metadata separately from the visual treatment:

```json
{"composition": "process", "reveal": "build"}
```

The five compositions are `statement` (large phrases), `focal` (one dominant concept), `comparison` (two source-backed sides), `process` (a building structure), and `evidence` (validated data, code, or an image). Selection follows the verified content; equally suitable alternatives vary deterministically. `focus` replaces an earlier group when the next speech cue starts; all items sharing a cue remain visible together. `build` retains earlier context. Narrated scenes also save `storyRole`: `hook`, `explain`, `evidence`, or `takeaway`.

Saved plans without presentation metadata retain the legacy layout. New metadata is an additive extension of the current plan formats; there is no new CLI flag. Existing subtitle exports remain separate and audio-free. Caption clearance, exact source grounding, static custom backgrounds, and native 16:9/9:16 rendering still apply.

New publish kits save `thumbnail.composition`, `primaryItemIndices`, and `secondaryItemIndices` for their selected scene; chart covers also save a validated `datumId`. Covers use a short headline and a dominant visual instead of a reduced copy of every information card. You can edit these fields and use `--render-publish` without a new AI call. References, before/after pairings, and layout compatibility are validated. Directed covers show one focal item, one item per comparison side, or up to three process steps. Existing publish files without a composition retain the old cover. Local image covers verify the original saved image hash; generated foreground images are not requested by publishing, and those scenes receive a typography cover.

Render the comparison gallery (both orientations, speech-aligned states, old/new covers, and audio-free subtitle samples):

```bash
pnpm run fixtures:presentation --output=/tmp/youtube-presentation-preview
# Skip video encoding when inspecting layouts only:
node --import tsx src/render-presentation-fixtures.ts --stills-only --output=/tmp/youtube-presentation-preview
```

The fixture narration uses a silent timing track. Use the regular `create` command for a real narrated sample.

## Create a narrated-video publish kit

Create copy-ready YouTube metadata and both cover orientations from a draft or timed narration plan:

```bash
pnpm run animations publish \
  summary-video/summary.narration-timed.json
```

The command requests source-grounded metadata from the selected AI provider, then saves:

- `summary.publish.json` — editable metadata and cover direction
- `summary.publish.md` — copy-ready recommended title, alternatives, description, tags, and hashtags
- `summary.thumbnail.png` — 1280×720 YouTube thumbnail
- `summary.cover-9x16.png` — 1080×1920 vertical cover

The metadata contains one recommended title, two alternatives, 15–20 tags, a concise description, separate hashtags, a short cover headline, and the narration scene and composition used for the cover. Newly generated covers inherit the narration plan's palette, while an existing edited publish JSON can still override its saved `thumbnail.accent`. The prompt receives the original source and final narration, rejects invented links or claims, and treats source text as content rather than instructions.

Generate only the editable sidecars without starting Chrome:

```bash
pnpm run animations publish \
  summary-video/summary.narration-plan.json \
  --metadata-only
```

After editing `summary.publish.json`, render its covers without another AI request:

```bash
pnpm run animations publish \
  summary-video/summary.narration-plan.json \
  --render-publish summary-video/summary.publish.json --force
```

Use `--cover-aspect 16:9` or `--cover-aspect 9:16` to render one orientation. The default is `both`. Existing metadata and images are protected unless `--force` is supplied. `--output-dir` moves the complete publish-kit output when generating new metadata and moves cover output when rerendering an edited publish plan.

Supply one local background image for both the thumbnail and vertical summary cover:

```bash
pnpm run animations publish summary-video/summary.narration-timed.json \
  --background-image "./images/My background.png" --cover-aspect both

pnpm run animations publish summary-video/summary.narration-timed.json \
  --render-publish summary-video/summary.publish.json \
  --background-image "./images/My background.png" --cover-aspect both --force
```

Publish backgrounds follow the video image rules: PNG/JPEG/WebP up to 20 MB, relative to the current working directory or absolute. The image is centered and scaled proportionally to show the whole image in its original colors, with black margins or transparency backing. It replaces the palette backdrop without cropping, tinting, blurring, or adding a grid or vignette. Cover text and cards remain on top. Omit the option for the default palette backdrop; use an image matching the output aspect ratio for an edge-to-edge result.

The image selection is not saved in `publish.json`; repeat `--background-image` when rerendering. `--metadata-only` validates a supplied image without staging it or starting Chrome. To use different images for each orientation, run the command separately with `--cover-aspect 16:9` and `--cover-aspect 9:16`.

## Local narration

### Automatic Supertonic voice selection

Narrated videos default to `--voice auto`. After planning, the CLI scores the final title, scene titles, narration, visual motifs, and source text against Supertone's documented use cases for its ten included presets. For example, investor and finance material favors M3, educational walkthroughs favor M4, news-style reports favor F3, and technical training favors F4. The selected voice and a short source-signal reason are printed before synthesis, and the concrete voice ID is persisted in the timed plan for deterministic rerendering.

Selection is local and deterministic: it adds no OpenAI request, cloud voice charge, or ten-voice audition pass. Content without a strong profile signal falls back to the general-purpose M1 preset. Pass an explicit voice such as `--voice F1` to override automatic selection. The profile descriptions follow the official [Supertonic built-in voice guide](https://supertone-inc.github.io/supertonic-py/voices/).

### Subtle voice expressions

Narrated plans support `none`, `laugh`, `breath`, and `sigh` at the semantic-beat level. The planner defaults to `none`, never places expressions on consecutive beats, and allows at most one non-neutral expression per roughly 30 seconds, capped at three for longer videos. `laugh` and `sigh` are reserved for source-supported emotional moments; `breath` is reserved for a deliberately audible inhale and is not added merely because a beat is a hook, pivot, or conclusion.

Expression metadata stays separate from spoken text and captions. The Supertonic tag is added only at synthesis time, before the beat's complete utterance, so plan editing and on-screen captions remain clean.

After creating a draft with `--plan-only`, you can change a beat's `expression` in `summary.narration-plan.json` before synthesis. Use one of the supported values instead of adding `<laugh>`, `<breath>`, or `<sigh>` to phrase text.

### Voice-derived timing

The worker concatenates every beat's caption phrases into one natural utterance and calls Supertonic once for that complete beat. It trims the returned float PCM to Supertonic's predicted voiced duration, writes the existing per-beat mono 44.1 kHz PCM16 files, and records the exact number of written samples. There is no inserted silence or prosody reset at a caption boundary. The combined voiceover adds:

- 300 ms before each scene
- 150 ms between semantic beats
- 300 ms after each scene

Scene boundaries, beat boundaries, and item reveal timestamps are calculated from exact integer sample offsets. Because Supertonic does not expose word timestamps, caption phrases deterministically partition their beat's exact PCM interval using text-length and punctuation weights. These internal caption boundaries are estimates, but they are contiguous and never introduce audio gaps. Captions show one active phrase at a time and reserve a safe upper lane in both orientations. The aspect-independent timed plan is passed unchanged to both orientations, so their audio, captions, and reveal timeline are identical within one render frame.

Audio is staged in a temporary directory and promoted only after all beats and the combined voiceover succeed.

For requested speeds above `1.3`, synthesis is capped at `1.3` to keep
Supertonic's generation window from dropping or clipping phrase-final words.
Remotion applies the remaining speed-up with pitch-preserving playback, and all
scene, reveal, and caption timings are scaled from the original PCM offsets.
The timed plan records this as `voiceoverPlaybackRate`; older timed plans default
to `1` and render unchanged.

## Subtitle animation overlays

Generate green-background H.264 clips from `.srt` or `.vtt`:

```bash
pnpm run animations episode.srt
pnpm run animations episode.srt --aspect-ratio 9:16
pnpm run animations episode.srt --aspect-ratio both
```

Green-screen exports use solid white lettering with a dark outline and opaque label panels. Cyan/emerald foreground accents switch to violet/pink to keep them away from the green key. Text retains its reveal timing and movement, but appears at full opacity instead of fading through green. Other backgrounds and transparent exports keep their existing styling. Rerender saved plans to apply this to existing clips; already exported videos do not change.

Transparent ProRes 4444 and WebM remain available in either orientation:

```bash
pnpm run animations episode.srt --format prores --aspect-ratio both
pnpm run animations episode.srt --format webm --aspect-ratio 9:16
```

Create only the overlay plan, then render it later:

```bash
pnpm run animations episode.srt --plan-only
pnpm run animations --render-plan animations/episode.animation-plan.json
```

New overlay plans speech-align visible items to subtitle cues. Saved version-1 plans remain compatible and fall back to evenly distributed reveals when item timings are absent. Current version-4 output manifests record `aspectRatio`, `width`, `height`, palette, captions, scene background, and asset-credit metadata while landscape filenames remain unchanged.

Version-3 subtitle plans select one palette and can use all narrated visual treatments. Put relevant PNG, JPEG, or WebP files in an `images/` directory beside the subtitle file; each selected image is copied once into the plan output for deterministic rerenders. Exact chart values, brand names, metrics, and generated-image evidence must occur in the selected cue range. An unsupported optional treatment falls back to a diagram with a saved warning instead of rendering invented information.

Opt into exact cue captions and an opaque ambient H.264 clip:

```bash
pnpm run animations episode.srt \
  --captions on \
  --scene-background ambient
```

Generate and cache a background for every selected clip and orientation:

```bash
pnpm run animations episode.srt \
  --scene-background generated \
  --aspect-ratio both
```

Ambient, generated, and custom image backgrounds imply `--format h264` when no format is supplied. Explicit `green`, `prores`, and `webm` remain background-off editor-overlay formats. Subtitle clips remain separate and audio-free with every background mode. Generated foreground illustrations are independently opt-in with `--generated-visuals auto`, limited to two clips, relevance-validated, and reusable from cache.

## Native vertical layouts

Vertical output is 1080×1920 rather than a scaled or cropped landscape frame. It uses safe margins of 72 px horizontally, 120 px at the top, and 220 px at the bottom.

- `process-flow` stacks cards with downward animated connectors.
- `comparison` stacks the labelled panels and switches six-item panels to compact two-column grids.
- `timeline` uses a vertical spine with alternating stage cards.
- `callout` uses a tall centered panel and wider text bounds.

Landscape remains 1920×1080 and preserves the original layouts.

## Options

```text
Shared:
--aspect-ratio <16:9|9:16|both>   Output orientation (default: 16:9)
--output-dir <path>               Override the output directory
--model <model>                   Selected provider's model; see provider setup
--fps <number>                    Frames per second (default: 30)
--plan-only                       Save or validate without synthesis/rendering
--render-plan <path>              Load a saved plan without text planning
--force                           Replace existing generated outputs
--background-image <path>         Static PNG/JPEG/WebP for videos or publish covers; repeat for rerenders
--help                            Show CLI help
--version                         Show the CLI version

Visual options for both video workflows:
--captions <on|off>               Narrated default: on; subtitle default: off
--scene-background <mode>         Narrated: ambient (default), generated, image
                                  Subtitle: off (default), ambient, generated, image
--generated-visuals <off|auto>    Grounded foreground generation; default: off
--regenerate-visuals              Refresh generated foregrounds; requires auto
--regenerate-backgrounds          Refresh generated backdrops; requires generated
--image-model <model>             See provider setup for defaults and overrides
--image-quality <quality>         low, medium, high; default: medium (OpenAI)

Subtitle overlays:
--format <prores|webm|green|h264> Output format (green by default; h264 for scene backgrounds)
--max-suggestions <number>        Maximum overlays (default: 6; max: 12)

Narrated videos:
--stills-only                     Scene previews without speech synthesis or video
--audio-only                      Voiceover and timed plan without video rendering
--review                          Pause between script, stills, audio, and video
--require-characters              Retry missing character staging; see limitations above
--supertonic-assets-dir <path>    Default: models/supertonic-3
--voice <auto|M1..M5|F1..F5>      Default: auto
--language <code>                 Default: en; use na for language-agnostic
--tts-speed <number>              0.7-2.0 (default: 1.05)
--tts-steps <number>              1-20 (default: 8)
--target-duration <seconds>       Default: 60
--research <off|auto|required>    Web research before planning; default: off
--refresh-research                Replace the matching research cache

Topic authoring:
--guidance <text>                 Extra direction for the source document
--output-dir <path>               Destination FILE; default: samples/<slug>.md

Publish kits:
--cover-aspect <16:9|9:16|both>   Default: both
--metadata-only                   Save or validate metadata without rendering covers
--render-publish <publish.json>   Render edited metadata without AI generation
```

Subtitle inputs default to an adjacent `animations/` directory. Saved subtitle plans also default to `animations/` beside their recorded `sourceSubtitle` path; use `--output-dir` when relocating the plan. Narrated source inputs default to `<source-stem>-video/`, and saved narrated plans default to their own directory. Existing videos, plans, audio, and stills are protected unless `--force` is supplied. Matching generated-background cache entries remain reusable unless `--regenerate-backgrounds` is also supplied.

## Templates and visual behavior

- `process-flow` — ordered systems or request flows
- `comparison` — two labelled groups
- `timeline` — ordered stages or events
- `callout` — definitions, concepts, and important statistics

These four layouts remain available under `visual.kind: "diagram"`. Narrated videos and version-3 subtitle plans also support:

- `agent-workflow` — one central agent, surrounding tools, and beat-driven request/result activity
- `brand-showcase` — exact product or company marks with staggered entrances and very slow drift
- `network-map` — hub-and-spoke relationships, drawn edges, and one traveling pulse
- `metric-focus` — an exact source-backed number or claim with count-up and supporting context
- `icon-spotlight` — one dominant semantic, brand, or local Lottie visual with supporting chips
- `image-focus` — one relevant local or grounded generated foreground image with cinematic pan, drift, or push-in
- `data-visualization` — exact grouped bars, metric cards, or a single-series line chart; existing bars/cards support renderer-computed derived annotations
- `kinetic-text` — 1–4 large, exact source statements with timed reveal or emphasis
- `before-after` — 1–3 explicitly supported transformations with paired labels and controlled wipes
- `code-walkthrough` — a literal supplied code excerpt with speech-timed line highlights
- `sequence-diagram` — 2–4 participants exchanging 2–6 directed, source-supported messages
- `layered-architecture` — 2–6 source-ordered layers assembled progressively
- `character-scene` — 2–3 code-drawn people with cue-timed speaking turns, props, and optional counter/callout

All treatments use the same motion grammar: narration-beat or subtitle-cue entrances, stable hold frames, small ambient movement, and one dominant moving element. They do not use random motion, constant bouncing, rapid spinning, or effects behind the protected caption lane.

Titles and labels are measured and fitted into their bounds. Icon resolution is deterministic: an explicit, relevance-checked scene icon is tried first; an exact Simple Icons name or explicit brand alias is tried second; an exact entry from `assets/brands/manifest.json` is tried third; and a conservative Lucide label fallback is used last. The built-in catalog includes standards/protocols, compatibility, CPUs, accelerators, memory, circuits, AI models, and the existing software-system concepts. Brand showcases do not use fuzzy matching. Missing or ambiguous logos produce a planning warning; brand names absent from the source and source-unsupported metric numbers are rejected before the plan is saved. The renderer never fabricates a mark or silently substitutes another company. Original logo colors are preserved unless a curated manifest explicitly allows monochrome use.

Narrated plan files are version 7. New subtitle animation plans are version 3 and persist the same palette, treatment, icons, media, captions, background prompts, warnings, and required asset credits; subtitle output manifests are version 4 and record the render-time caption/background settings. Narrated versions 1–6, subtitle versions 1–2, and placement manifests 2–3 remain readable. Existing visuals and timing are preserved during normalization. Use the current plan formats when authoring new treatments. Version-1 subtitle plans normalize to cyan diagrams and render unchanged with the default caption/background-off options. Captions require regeneration because legacy files do not contain original per-cue timing.

Ambient backgrounds are generated entirely in Remotion from palette-driven deterministic gradients, moving light fields, a subtle grid, and a vignette. The same palette drives diagram accents and new publish covers. Generated-background dimensions depend on the provider. Prompts include the saved palette, and non-character scenes add slow pan/zoom with readability overlays; character settings stay still. Requested generation never silently falls back to ambient. Changing the palette changes the prompt hash, so cached images cannot silently retain the previous color family.

OpenAI narration, overlay, and publish planning use the Responses API with Zod Structured Outputs and `store: false`. Gemini and Groq use JSON mode through their OpenAI-compatible endpoints, followed by local validation. The narrated planner derives its compact prompt schema from the same Zod definitions so every provider sees the available treatments. Optional source research uses OpenAI-hosted `web_search`, bounds it to four calls, saves source metadata, and verifies claim URLs against tool-returned URLs. Models select and fill planning templates; they do not generate arbitrary React code.

## Local icon, motion, and brand assets

The built-in semantic icon catalog lives in `src/icon-catalog.ts`; curated external SVG icons live in `assets/icons/manifest.json`; the motion registry lives at `assets/motion/manifest.json`; and the exact-logo registry lives at `assets/brands/manifest.json`. Icon entries record semantic keywords, local SVG path, original source, creator, license, attribution requirement, credit line, and color policy. Motion entries record the local JSON path, motif keywords, original source, creator, license, attribution requirement, credit line, loop behavior, playback rate, priority, and optional palette-token mapping. Brand entries record the canonical company name, exact aliases, local SVG path, official source, brand-guideline reference, license, and color policy.

Motion selection requires both a compatible motif and a keyword match against the actual scene title, labels, reason, or narration. A broad `automation` motif therefore cannot silently attach an agent/chat animation to an unrelated hardware-standard scene. When no animation clears that relevance gate, Remotion animates the selected SVG icon with code-native reveal, pulse, scan, or drift behavior.

Version 1 accepts pure-vector Lottie JSON only. Validation rejects external image/file references, font or text layers, unsafe paths, duplicate IDs or aliases, missing files, and incomplete provenance. Expression-driven Lotties are flagged for a manual flicker review. Remotion playback uses scene-relative frames, explicit loop behavior, and local `staticFile()` URLs.

Asset intake workflow:

1. Obtain a logo SVG from the company's official brand or press kit, or obtain an SVG/Lottie from an approved source under a license that covers the intended video use. Never use an AI-generated company logo.
2. Put the selected file under `assets/brands/`, `assets/icons/`, or `assets/motion/`. For a custom animation, Jitter, Lottielab, or SVGator can export Lottie from controlled SVG artwork.
3. Add complete provenance, semantic keywords, attribution, and playback/color metadata to the matching manifest. Mark external icons that require per-video credit with `attributionRequired: true`; used credits are persisted in narrated plans and version-3 subtitle plans, copied into subtitle placement manifests, and appended to generated narrated publish Markdown. For third-party assets, also add any required notice to `THIRD_PARTY_NOTICES.md`.
4. Run `pnpm assets:validate`, `pnpm test`, and `pnpm check`, then render a relevant fixture before assigning the asset ID to a scene. Check [fixture portability](#development-checks) for your platform.
5. Inspect early, middle, and final frames in both orientations, then render the representative narrated MP4 fixture to check for flicker and caption collisions.

LottieFiles is an approved intake source when the individual asset's license and attribution are recorded. Flaticon, Lordicon, and IconScout are manual intake sources only; free Flaticon and Lordicon assets generally require attribution, while paid assets can be used when the user supplies the licensed file and records its terms. The planner and renderer never hotlink or automatically download search results. Rive remains deferred for state-driven character work. Brandfetch is intentionally not integrated because its hotlinking model conflicts with reproducible offline rendering.

Optional scene imagery uses Cloudflare Workers AI or the OpenAI Image API. Publish covers are code-native and never generate images. For OpenAI image setup, see the [official image-generation guide](https://developers.openai.com/api/docs/guides/image-generation).

## Supertonic terms and project notice

Supertone's sample code is MIT licensed, while the Supertonic 3 model is distributed under OpenRAIL-M. Review the [official model card and license](https://huggingface.co/Supertone/supertonic-3) before distributing model-derived output.

The official repository announced on July 23, 2026 that it will be archived and receive no further open-source model development or official support. This project therefore pins its runtime integration and vendors the small helper boundary rather than relying on a moving server API. See the [official repository notice](https://github.com/supertone-inc/supertonic).

## Development checks

Run the quality gates before submitting changes. These do not need a provider key, browser, or speech model:

```bash
pnpm check
pnpm test
pnpm assets:validate
pnpm build
```

If the package-manager launcher cannot start in your environment, use the already installed local tools to run the same checks without changing source or dependency policy:

```bash
./node_modules/.bin/tsc -p tsconfig.json --noEmit
./node_modules/.bin/vitest run
node --import tsx src/validate-assets.ts
./node_modules/.bin/tsc -p tsconfig.json
```

Fixture renders need Chrome. `fixtures:layouts` and `fixtures:subtitle-visuals` hardcode `/usr/bin/google-chrome-stable`; `fixtures:narrated-layouts` probes Linux paths and does not read the browser environment variable. On macOS, use `fixtures:explainers`, `fixtures:presentation`, or `fixtures:characters` with `REMOTION_BROWSER_EXECUTABLE` set. See [fixture portability](docs/commands.md#fixture-scripts).

Render early, middle, and completed stress-test frames for all four templates and both orientations:

```bash
pnpm run fixtures:layouts /tmp/youtube-animation-layout-fixtures
pnpm run fixtures:subtitle-visuals /tmp/youtube-animation-subtitle-visual-fixtures
pnpm run fixtures:narrated-layouts /tmp/youtube-animation-narrated-layout-fixtures
```

Together, these commands cover the four diagram templates and the original eight visual kinds with early, middle, and completed states in both orientations. The subtitle fixture also covers caption-off green output for legacy and modern visual paths, caption-on ambient output, and a mock generated background without an API call. Inspect the rendered PNGs or assemble them into contact sheets to catch clipping, logo distortion, chroma-key spill, Lottie flicker, chart readability, and unsafe positioning.

Render green-screen text regression samples (legacy labels, directed text, and code) in both orientations, with matching dark-background controls and optional H.264 videos:

```bash
pnpm run fixtures:chroma-text --output=/tmp/chroma-text-fixtures --video
```

Render the six chart and explainer treatments as an offline gallery:

```bash
pnpm run fixtures:explainers /tmp/youtube-animation-explainer-gallery
# Faster layout inspection, without video encoding:
pnpm run fixtures:explainers /tmp/youtube-animation-explainer-gallery --stills-only
# Edge cases: 12-line code, long messages sharing a cue, clustered/constant chart data:
pnpm run fixtures:explainers /tmp/youtube-animation-explainer-gallery --stress-only
```

Open the generated `index.html`. It includes early/middle/completed stills for both workflows, green and transparent overlays, and supplied-background fixtures. The full run also writes individual audio-free green MP4s, representative alpha WebMs, and two narrated montage MP4s. Narrated previews use a silent timing track; no provider call or speech synthesis is required. Editable draft/timed narration and subtitle plans are saved beside the gallery.

Render narrated MP4 fixtures with silent timing audio and captions in both orientations, or inspect publish covers and speech expressions. The second command uses local mock artwork to exercise generated backgrounds without an API call:

```bash
pnpm run fixtures:narrated /tmp/youtube-animation-narrated ambient
pnpm run fixtures:narrated /tmp/youtube-animation-narrated-generated generated
pnpm run fixtures:publish /tmp/youtube-animation-publish
pnpm run fixtures:voice-expressions /tmp/youtube-animation-voice-expressions
```

The narrated fixture contains six scenes and visibly exercises a legacy diagram, AI-agent workflow, exact company-logo scene, network map, metric focus, and Lottie spotlight. It accepts an optional palette after the background mode, for example `ambient emerald`. The publish fixture accepts an optional palette after its output directory. Run it once for each of `cyan`, `violet`, `emerald`, `amber`, and `rose` to compare both cover orientations without an API call. These fixtures make typography, safe areas, treatment variety, color consistency, and mobile readability inspectable directly.

The voice-expression fixture requires the local Supertonic model and renders plain, laugh, breath, and sigh WAVs from the same sentence for listening QA. Its JSON manifest records exact sample counts and durations; optional second and third arguments override the Supertonic assets directory and voice.

Preview all three standalone character scenarios without provider calls or a TTS model:

```bash
pnpm run fixtures:characters /tmp/youtube-character-preview all --stills-only
pnpm run fixtures:characters /tmp/youtube-character-preview all --stills-only --vertical
```

Omit `--stills-only` for silent MP4s. These are renderer prototypes; use a saved narrated plan to inspect character scenes in the full caption and voiceover pipeline.

An offline overlay plan remains available for a full media render:

```bash
node dist/cli.js \
  --render-plan fixtures/sample.animation-plan.json \
  --output-dir /tmp/youtube-animations-render-check
```

If Chrome is installed in a nonstandard location, set `REMOTION_BROWSER_EXECUTABLE`.

For implementation details, start with [architecture](docs/architecture.md), [plan schemas](docs/plan-schema.md), [commands](docs/commands.md), and [contributing](docs/contributing.md). Implementation entry points: [provider resolution](src/ai-client.ts#L11), [CLI options](src/cli.ts#L1044), [review stages](src/cli.ts#L898), [character retry behavior](src/narration-planner.ts#L795), [stills and overwrite checks](src/narrated-render.ts#L114), and [character schema](src/explainer-visuals.ts#L50).
