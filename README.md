# YouTube Animations CLI

Create either editor-ready animation overlays from subtitles or a complete narrated video from a text/Markdown source. Planning uses OpenAI Structured Outputs, optional cited web research can enrich narrated sources, local voice synthesis uses the embedded Supertonic 3 Node worker, and Remotion renders native 16:9, 9:16, or both. Both video workflows support deterministic diagrams, agent workflows, brand showcases, network maps, metric focus scenes, icon spotlights, source-backed charts, relevant local images, opt-in grounded generated illustrations, curated local Lottie assets, coherent cinematic palettes, and optional scene backgrounds. Subtitle inputs remain separate editor-ready clips; they never synthesize or edit audio.

The current CLI supports three workflows:

| Input | Command | Result |
| --- | --- | --- |
| `.srt` or `.vtt` subtitles | `youtube-animations episode.srt` | Separate editor-ready overlay clips plus a placement manifest |
| `.txt` or `.md` source text | `youtube-animations create summary.md` | A planned, voiced, captioned, and rendered narrated video |
| Narrated plan JSON | `youtube-animations publish summary.narration-timed.json` | Copy-ready title, description, tags, thumbnail, and vertical cover |

Commands in this README use `pnpm run animations` to execute the TypeScript source from the repository. After `pnpm build`, the same arguments can be passed to `node dist/cli.js` or the configured `youtube-animations` binary.

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
├── summary.media/                 # selected files copied from sibling images/
├── summary.generated-visuals/     # optional foreground cache and manifest
├── summary.audio/
│   ├── voiceover.wav
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

Subtitle input keeps its existing editor-oriented output names. Vertical files insert `-9x16` before the extension, and enriched placement manifests are version 3:

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
- an OpenAI API key when creating a new narration/overlay plan, new publish metadata, or an uncached scene image
- Google Chrome or Chromium when rendering video
- Git LFS and the local Supertonic 3 model when synthesizing narrated audio

Planning-only and saved-plan workflows skip the dependencies they do not use. For example, `--plan-only` does not need Chrome or Supertonic, and a timed narrated plan with ambient backgrounds can be rerendered without OpenAI or Supertonic.

Saved-plan rendering never downloads a logo or animation. It validates checked-in asset manifests and hashes for selected local images, copies only referenced files into Remotion's temporary public directory, and removes that staging directory after the render. A timed plan also reuses cached generated foreground images without OpenAI; if one is missing, the CLI names the scene and asks for `--generated-visuals auto` instead of silently substituting unrelated art.

Publish metadata needs OpenAI only when creating a new publish plan. Rendering an edited publish plan needs Chrome but makes no OpenAI request. Publish covers use only Remotion typography, shapes, diagrams, Lucide icons, and the installed Simple Icons catalog; the publish workflow never calls the Image API.

Remotion has separate license terms. Confirm that your use qualifies for its free license or obtain the appropriate license: [Remotion license](https://www.remotion.dev/license).

## Setup

Install application dependencies and configure OpenAI:

```bash
pnpm install
cp .env.example .env
```

```dotenv
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.6
OPENAI_IMAGE_MODEL=gpt-image-2
```

Download Supertonic 3 once at the default location:

```bash
git lfs install
git clone https://huggingface.co/Supertone/supertonic-3 \
  models/supertonic-3
```

The model directory is ignored by Git. The CLI validates all four ONNX files, `tts.json`, `unicode_indexer.json`, and the requested preset voice before synthesis.

### No separate Supertonic server

You do not need Python, `supertonic serve`, an HTTP endpoint, or a separately managed background process. The CLI automatically starts a short-lived Node worker, sends one JSON job over stdin, loads the model and selected voice once, synthesizes every beat sequentially, returns exact sample counts, and exits before Remotion starts. This releases ONNX memory between voice generation and video rendering.

`onnxruntime-node` is pinned to `1.27.0`. The worker adapts Supertone's official MIT-licensed Node helper rather than executing its example CLI; attribution is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Create narrated videos

From the repository:

```bash
pnpm run animations create summary.md
pnpm run animations create summary.md --aspect-ratio 9:16
pnpm run animations create summary.md --aspect-ratio both
```

The planning request creates a faithful hook, explanation, and conclusion using at most six scenes. It also selects one dark cinematic palette—`cyan`, `violet`, `emerald`, `amber`, or `rose`—from the source's dominant subject and tone. The saved `palette` field drives every scene and makes rerenders deterministic; edit that field in the draft or timed plan to override the automatic choice.

Every visible item is anchored to exactly one semantic narration beat. A beat is one coherent utterance that can be spoken in a natural breath; its short ordered phrases are caption and reveal boundaries, not separate TTS calls. The complete spoken copy is also saved as `summary.narration-script.md` for review, including any nonverbal voice direction as an italic cue such as `*[breath]*`.

### Grounded web research

Web research is off by default. Enable an optional research pass before narrated planning:

```bash
pnpm run animations create summary.md --research auto
pnpm run animations create summary.md --research required
```

`auto` lets the model skip search when the supplied source is already sufficient. `required` forces at least one OpenAI hosted [`web_search`](https://developers.openai.com/api/docs/guides/tools-web-search) call. Both modes use medium search context, permit at most four tool calls, keep response storage disabled, and request the complete consulted-source list.

The research response is structured into `supported`, `context`, and `contested` claims. Every claim URL is checked against URLs actually returned by the search tool; an invented or unmatched citation aborts planning. Only supported and contextual claims are added to the planner's effective source. Contested claims remain reviewable in `summary.research.json` and `summary.research.md` but cannot ground narration, metrics, charts, or generated imagery.

Research-enriched plans retain the untouched input in `originalSourceText`, the effective grounded input in `sourceText`, and the complete citation bundle in `research`. The narration script ends with clickable research sources. Matching research is reused by source/configuration hash, including after a later planning failure. `--force` does not purchase fresh research; refresh it explicitly:

```bash
pnpm run animations create summary.md \
  --research required \
  --refresh-research \
  --force
```

Research options apply only while planning a new narrated video. Subtitle overlays, saved-plan rendering, image validation, and publish-kit generation do not run web searches.

Every version-6 scene persists a discriminated `visual` object plus explicit `icons` selections. `icons.focal` identifies the scene's central semantic symbol, while `icons.primary` and `icons.secondary` align one-for-one with visible items. `kind` chooses the treatment, `motion` chooses the restrained motion behavior, `motif` selects a controlled semantic category, and `assetId` either references a validated, subject-matched local Lottie asset or remains `null` for code-native icon motion. `image-focus` instead references a plan-level local/generated media id, while `data-visualization` stores its validated chart specification. Older version-6 files without icon selections load with conservative label fallbacks; versions 1–5 still normalize with their original diagram/default behavior and no new foreground media. For videos with at least four scenes the planner targets three treatments and avoids adjacent repetition when the source supports it. If truthful source material cannot support that variety, the saved plan receives a warning instead of being rejected or padded with invented content.

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

### Grounded generated foreground illustrations

Generated foreground visuals are off by default. Enable the planner and materializer explicitly:

```bash
pnpm run animations create summary.md \
  --aspect-ratio both \
  --generated-visuals auto
```

`auto` permits at most two scenes and may generate zero. Each selected scene saves exact source evidence, 2–5 exact source anchors, its narration beat, literal subject/action/environment/framing, and exclusions. Generic decoration, values, charts, quotes, text, logos, interfaces, named-person likenesses, and fabricated documentary evidence are forbidden. Literal editorial depiction is preferred; a metaphor must save its exact relationship to the source.

The CLI uses the [OpenAI Image API](https://developers.openai.com/api/docs/guides/image-generation) to create separate opaque JPEGs at 2048×1152 and 1152×2048. A structured high-detail vision check then requires a strong subject/action match, no unsupported content, no text/logos/charts/UI, and orientation-safe composition. One failed check gets one corrective regeneration; a second failure aborts before voice synthesis or rendering.

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
  --generated-visuals auto
```

Phrase captions are enabled by default and can be disabled for a clean export:

```bash
pnpm run animations create summary.md --captions off
```

The former black canvas is replaced by a deterministic animated ambient background. To generate and cache a separate OpenAI image for every scene and requested orientation:

```bash
pnpm run animations create summary.md \
  --aspect-ratio both \
  --scene-background generated
```

Generated images use `gpt-image-2` at medium quality by default. Change the model or quality with `--image-model` and `--image-quality`. `--regenerate-backgrounds` refreshes matching cached images; `--force` replaces videos and plans without purchasing new images. All requested images are staged before the cache is promoted, and a failed image request stops before voice synthesis or rendering.

Create only the script and draft storyboard—including editable subtitle phrases, chart evidence, generated foreground directions, and scene background prompts. Selected local images are copied for deterministic rerenders, but no voice or generated image assets are purchased in this step:

```bash
pnpm run animations create summary.md --plan-only
```

After reviewing or editing the draft, synthesize and render without another OpenAI request:

```bash
pnpm run animations create \
  --render-plan summary-video/summary.narration-plan.json \
  --aspect-ratio both
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

The first command uses the default deterministic ambient background and makes no OpenAI call. The second reuses matching images from `summary.backgrounds/` and requests only missing generated assets.

Narrated output is H.264 video with AAC voiceover audio. Planning and TTS happen once; `both` performs two independent Remotion render passes.

## Create a narrated-video publish kit

Create copy-ready YouTube metadata and both cover orientations from a draft or timed narration plan:

```bash
pnpm run animations publish \
  summary-video/summary.narration-timed.json
```

The command makes one source-grounded Structured Outputs request, then saves:

- `summary.publish.json` — editable metadata and cover direction
- `summary.publish.md` — copy-ready recommended title, alternatives, description, tags, and hashtags
- `summary.thumbnail.png` — 1280×720 YouTube thumbnail
- `summary.cover-9x16.png` — 1080×1920 vertical cover

The metadata contains one recommended title, two alternatives, 15–20 tags, a concise description, separate hashtags, a short cover headline, and the narration scene used for the supporting diagram. Newly generated covers inherit the narration plan's palette, while an existing edited publish JSON can still override its saved `thumbnail.accent`. The prompt receives the original source and final narration, rejects invented links or claims, and treats source text as content rather than instructions.

Generate only the editable sidecars without starting Chrome:

```bash
pnpm run animations publish \
  summary-video/summary.narration-plan.json \
  --metadata-only
```

After editing `summary.publish.json`, render its covers without another OpenAI request:

```bash
pnpm run animations publish \
  summary-video/summary.narration-plan.json \
  --render-publish summary-video/summary.publish.json
```

Use `--cover-aspect 16:9` or `--cover-aspect 9:16` to render one orientation. The default is `both`. Existing metadata and images are protected unless `--force` is supplied. `--output-dir` moves the complete publish-kit output when generating new metadata and moves cover output when rerendering an edited publish plan.

### Automatic Supertonic voice selection

Narrated videos default to `--voice auto`. After planning, the CLI scores the final title, scene titles, narration, visual motifs, and source text against Supertone's documented use cases for its ten included presets. For example, investor and finance material favors M3, educational walkthroughs favor M4, news-style reports favor F3, and technical training favors F4. The selected voice and a short source-signal reason are printed before synthesis, and the concrete voice ID is persisted in the timed plan for deterministic rerendering.

Selection is local and deterministic: it adds no OpenAI request, cloud voice charge, or ten-voice audition pass. Content without a strong profile signal falls back to the general-purpose M1 preset. Pass an explicit voice such as `--voice F1` to override automatic selection. The profile descriptions follow the official [Supertonic built-in voice guide](https://supertone-inc.github.io/supertonic-py/voices/).

### Subtle voice expressions

Narrated plans support `none`, `laugh`, `breath`, and `sigh` at the semantic-beat level. The planner defaults to `none`, never places expressions on consecutive beats, and allows at most one non-neutral expression per roughly 30 seconds, capped at three for longer videos. `laugh` and `sigh` are reserved for source-supported emotional moments; `breath` is reserved for a deliberately audible inhale and is not added merely because a beat is a hook, pivot, or conclusion.

Expression metadata stays separate from spoken text and captions. The Supertonic tag is added only at synthesis time, before the beat's complete utterance, so plan editing and on-screen captions remain clean.

After creating a draft with `--plan-only`, you can change a beat's `expression` in `summary.narration-plan.json` before synthesis. Use one of the supported values instead of adding `<laugh>`, `<breath>`, or `<sigh>` to phrase text.

## Voice-derived timing

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

New overlay plans speech-align visible items to subtitle cues. Saved version-1 plans remain compatible and fall back to evenly distributed reveals when item timings are absent. Version-3 output manifests retain `aspectRatio`, `width`, and `height` and add palette, captions, scene background, and asset-credit metadata while landscape filenames remain unchanged.

Version-2 subtitle plans select one palette and can use all narrated visual treatments. Put relevant PNG, JPEG, or WebP files in an `images/` directory beside the subtitle file; each selected image is copied once into the plan output for deterministic rerenders. Exact chart values, brand names, metrics, and generated-image evidence must occur in the selected cue range. An unsupported optional treatment falls back to a diagram with a saved warning instead of rendering invented information.

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

Both background modes imply `--format h264` when no format is supplied. Explicit `green`, `prores`, and `webm` remain background-off editor-overlay formats. Generated foreground illustrations are independently opt-in with `--generated-visuals auto`, limited to two clips, relevance-validated, and reusable from cache.

## Native vertical layouts

Vertical output is 1080×1920 rather than a scaled or cropped landscape frame. It uses safe margins of 72 px horizontally, 120 px at the top, and 220 px at the bottom.

- `process-flow` stacks cards with downward animated connectors.
- `comparison` stacks the labelled panels and switches six-item panels to compact two-column grids.
- `timeline` uses a vertical spine with alternating stage cards.
- `callout` uses a tall centered panel and wider text bounds.

Landscape remains 1920×1080 and preserves the original layouts.

## Options

```text
--aspect-ratio <16:9|9:16|both>  Output orientation (default: 16:9)
--output-dir <path>               Override the output directory
--model <model>                   Default: OPENAI_MODEL or gpt-5.6
--fps <number>                    Frames per second (default: 30)
--plan-only                       Save or validate without synthesis/rendering
--render-plan <path>              Load a saved plan without text planning
--force                           Replace existing generated outputs
--help                            Show CLI help
--version                         Show the CLI version

Subtitle overlays:
--format <prores|webm|green|h264> Output format (green by default; h264 for scene backgrounds)
--max-suggestions <number>        Maximum overlays (default: 6; max: 12)
--captions <on|off>               Exact cue captions; default: off
--scene-background <mode>         off, ambient, or generated; default: off
--generated-visuals <off|auto>    Grounded foreground generation; default: off
--regenerate-visuals              Refresh generated foreground assets; requires auto
--regenerate-backgrounds          Refresh generated backdrops; requires generated mode
--image-model <model>             Default: OPENAI_IMAGE_MODEL or gpt-image-2
--image-quality <quality>         low, medium, or high; default: medium

Narrated videos:
--supertonic-assets-dir <path>    Default: models/supertonic-3
--voice <auto|M1..M5|F1..F5>     Default: auto
--language <code>                 Default: en; use na for language-agnostic
--tts-speed <number>              0.7-2.0 (default: 1.05)
--tts-steps <number>              1-20 (default: 8)
--target-duration <seconds>       Default: 60
--captions <on|off>               Default: on
--scene-background <mode>         ambient or generated; default: ambient
--image-model <model>             Default: OPENAI_IMAGE_MODEL or gpt-image-2
--image-quality <quality>         low, medium, or high; default: medium
--research <off|auto|required>    Web research before planning; default: off
--refresh-research                Replace the matching research cache
--regenerate-backgrounds          Refresh cached assets; requires generated mode

Publish kits:
--cover-aspect <16:9|9:16|both>   Default: both
--metadata-only                   Save or validate metadata without rendering covers
--render-publish <publish.json>   Render edited metadata without calling OpenAI
```

Subtitle inputs default to an adjacent `animations/` directory. Narrated source inputs default to `<source-stem>-video/`, while a loaded plan defaults to its own directory. Every requested output is checked before rendering, and existing generated files are never replaced unless `--force` is supplied. Matching generated-background cache entries remain reusable unless `--regenerate-backgrounds` is also supplied.

## Templates and visual behavior

- `process-flow` — ordered systems or request flows
- `comparison` — two labelled groups
- `timeline` — ordered stages or events
- `callout` — definitions, concepts, and important statistics

These four layouts remain available under `visual.kind: "diagram"`. Narrated videos and version-2 subtitle plans also support:

- `agent-workflow` — one central agent, surrounding tools, and beat-driven request/result activity
- `brand-showcase` — exact product or company marks with staggered entrances and very slow drift
- `network-map` — hub-and-spoke relationships, drawn edges, and one traveling pulse
- `metric-focus` — an exact source-backed number or claim with count-up and supporting context
- `icon-spotlight` — one dominant semantic, brand, or local Lottie visual with supporting chips
- `image-focus` — one relevant local or grounded generated foreground image with cinematic pan, drift, or push-in
- `data-visualization` — exact grouped bars or metric cards with renderer-computed derived annotations

All treatments use the same motion grammar: narration-beat or subtitle-cue entrances, stable hold frames, small ambient movement, and one dominant moving element. They do not use random motion, constant bouncing, rapid spinning, or effects behind the protected caption lane.

Titles and labels are measured and fitted into their bounds. Icon resolution is deterministic: an explicit, relevance-checked scene icon is tried first; an exact Simple Icons name or explicit brand alias is tried second; an exact entry from `assets/brands/manifest.json` is tried third; and a conservative Lucide label fallback is used last. The built-in catalog includes standards/protocols, compatibility, CPUs, accelerators, memory, circuits, AI models, and the existing software-system concepts. Brand showcases do not use fuzzy matching. Missing or ambiguous logos produce a planning warning; brand names absent from the source and source-unsupported metric numbers are rejected before the plan is saved. The renderer never fabricates a mark or silently substitutes another company. Original logo colors are preserved unless a curated manifest explicitly allows monochrome use.

Narrated plan files remain version 6. New subtitle animation plans are version 2 and persist the same palette, treatment, icons, media, captions, background prompts, warnings, and required asset credits; subtitle output manifests are version 3 and record the render-time caption/background settings. Version-1 subtitle plans normalize to cyan diagrams and render unchanged with the default caption/background-off options. Captions require regeneration because legacy files do not contain original per-cue timing.

Ambient backgrounds are generated entirely in Remotion from palette-driven deterministic gradients, moving light fields, a subtle grid, and a vignette. The same palette drives diagram accents and new publish covers. Generated backgrounds use native `2048×1152` and `1152×2048` JPEG assets, receive the stored palette direction in their prompt, add a slow pan/zoom plus neutral readability overlays, and never silently fall back to ambient when generation was requested. Changing the palette changes the prompt hash, so cached images cannot silently retain the previous color family.

The OpenAI Responses API uses Zod Structured Outputs with response storage disabled (`store: false`). Optional source research uses the hosted `web_search` tool, bounds it to four calls, saves complete source metadata, and verifies structured claim URLs against tool-returned URLs. OpenAI selects and fills the planning templates; it does not generate arbitrary React code.

## Local icon, motion, and brand assets

The built-in semantic icon catalog lives in `src/icon-catalog.ts`; curated external SVG icons live in `assets/icons/manifest.json`; the motion registry lives at `assets/motion/manifest.json`; and the exact-logo registry lives at `assets/brands/manifest.json`. Icon entries record semantic keywords, local SVG path, original source, creator, license, attribution requirement, credit line, and color policy. Motion entries record the local JSON path, motif keywords, original source, creator, license, attribution requirement, credit line, loop behavior, playback rate, priority, and optional palette-token mapping. Brand entries record the canonical company name, exact aliases, local SVG path, official source, brand-guideline reference, license, and color policy.

Motion selection requires both a compatible motif and a keyword match against the actual scene title, labels, reason, or narration. A broad `automation` motif therefore cannot silently attach an agent/chat animation to an unrelated hardware-standard scene. When no animation clears that relevance gate, Remotion animates the selected SVG icon with code-native reveal, pulse, scan, or drift behavior.

Version 1 accepts pure-vector Lottie JSON only. Validation rejects external image/file references, font or text layers, unsafe paths, duplicate IDs or aliases, missing files, and incomplete provenance. Expression-driven Lotties are flagged for a manual flicker review. Remotion playback uses scene-relative frames, explicit loop behavior, and local `staticFile()` URLs.

Asset intake workflow:

1. Obtain a logo SVG from the company's official brand or press kit, or obtain an SVG/Lottie from an approved source under a license that covers the intended video use. Never use an AI-generated company logo.
2. Put the selected file under `assets/brands/`, `assets/icons/`, or `assets/motion/`. For a custom animation, Jitter, Lottielab, or SVGator can export Lottie from controlled SVG artwork.
3. Add complete provenance, semantic keywords, attribution, and playback/color metadata to the matching manifest. Mark external icons that require per-video credit with `attributionRequired: true`; used credits are persisted in narrated plans and version-2 subtitle plans, copied into subtitle placement manifests, and appended to generated narrated publish Markdown. For third-party assets, also add any required notice to `THIRD_PARTY_NOTICES.md`.
4. Run `pnpm assets:validate`, `pnpm test`, `pnpm check`, and `pnpm fixtures:narrated-layouts -- /tmp/youtube-animation-narrated-layout-fixtures` before assigning the asset ID to a scene.
5. Inspect early, middle, and final frames in both orientations, then render the representative narrated MP4 fixture to check for flicker and caption collisions.

LottieFiles is an approved intake source when the individual asset's license and attribution are recorded. Flaticon, Lordicon, and IconScout are manual intake sources only; free Flaticon and Lordicon assets generally require attribution, while paid assets can be used when the user supplies the licensed file and records its terms. The planner and renderer never hotlink or automatically download search results. Rive remains deferred for state-driven character work. Brandfetch is intentionally not integrated because its hotlinking model conflicts with reproducible offline rendering.

Optional scene imagery uses the OpenAI Image API. This is separate from publish covers, which are always code-native and never use that API. GPT Image access can depend on account and organization availability; see the [official image-generation guide](https://developers.openai.com/api/docs/guides/image-generation).

## Supertonic terms and project notice

Supertone's sample code is MIT licensed, while the Supertonic 3 model is distributed under OpenRAIL-M. Review the [official model card and license](https://huggingface.co/Supertone/supertonic-3) before distributing model-derived output.

The official repository announced on July 23, 2026 that it will be archived and receive no further open-source model development or official support. This project therefore pins its runtime integration and vendors the small helper boundary rather than relying on a moving server API. See the [official repository notice](https://github.com/supertone-inc/supertonic).

## Development checks

```bash
pnpm check
pnpm test
pnpm build
```

Render early, middle, and completed stress-test frames for all four templates and both orientations:

```bash
pnpm fixtures:layouts -- /tmp/youtube-animation-layout-fixtures
pnpm fixtures:subtitle-visuals -- /tmp/youtube-animation-subtitle-visual-fixtures
pnpm fixtures:narrated-layouts -- /tmp/youtube-animation-narrated-layout-fixtures
```

Together, these commands cover the four diagram templates and all eight visual kinds with early, middle, and completed states in both orientations. The subtitle fixture also covers caption-off green output, caption-on ambient output, and a mock generated background without an API call. Inspect the rendered PNGs or assemble them into contact sheets to catch clipping, logo distortion, Lottie flicker, chart readability, and unsafe positioning.

Render narrated MP4 fixtures with captions in both orientations. The second command uses local mock artwork to exercise the generated-image rendering path without an API call:

```bash
pnpm fixtures:narrated -- /tmp/youtube-animation-narrated ambient
pnpm fixtures:narrated -- /tmp/youtube-animation-narrated-generated generated
pnpm fixtures:publish -- /tmp/youtube-animation-publish
pnpm fixtures:voice-expressions -- /tmp/youtube-animation-voice-expressions
```

The narrated fixture contains six scenes and visibly exercises a legacy diagram, AI-agent workflow, exact company-logo scene, network map, metric focus, and Lottie spotlight. It accepts an optional palette after the background mode, for example `ambient emerald`. The publish fixture accepts an optional palette after its output directory. Run it once for each of `cyan`, `violet`, `emerald`, `amber`, and `rose` to compare both cover orientations without an API call. These fixtures make typography, safe areas, treatment variety, color consistency, and mobile readability inspectable directly.

The voice-expression fixture renders plain, laugh, breath, and sigh WAVs from the same sentence for listening QA. Its JSON manifest records exact sample counts and durations; optional second and third arguments override the Supertonic assets directory and voice.

An offline overlay plan remains available for a full media render:

```bash
node dist/cli.js \
  --render-plan fixtures/sample.animation-plan.json \
  --output-dir /tmp/youtube-animations-render-check
```

If Chrome is installed in a nonstandard location, set `REMOTION_BROWSER_EXECUTABLE`.
