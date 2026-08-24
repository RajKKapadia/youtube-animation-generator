# YouTube Animations CLI

Create either editor-ready animation overlays from subtitles or a complete narrated video from a text/Markdown source. Planning uses OpenAI Structured Outputs, local voice synthesis uses the embedded Supertonic 3 Node worker, and Remotion renders native 16:9, 9:16, or both. Narrated videos include sample-derived phrase captions, speech-aligned visual reveals, animated scene backgrounds, and optional subtle voice expressions.

The current CLI supports two workflows:

| Input | Command | Result |
| --- | --- | --- |
| `.srt` or `.vtt` subtitles | `youtube-animations episode.srt` | Separate editor-ready overlay clips plus a placement manifest |
| `.txt` or `.md` source text | `youtube-animations create summary.md` | A planned, voiced, captioned, and rendered narrated video |

Commands in this README use `pnpm run animations` to execute the TypeScript source from the repository. After `pnpm build`, the same arguments can be passed to `node dist/cli.js` or the configured `youtube-animations` binary.

## What it creates

Narrated input:

```text
/videos/summary.md
```

Default output:

```text
/videos/summary-video/
├── summary.narration-script.md
├── summary.narration-plan.json
├── summary.narration-timed.json
├── summary.audio/
│   ├── voiceover.wav
│   └── beats/
│       ├── 001-hook.wav
│       └── ...
└── summary.mp4
```

With generated scene backgrounds, a reusable cache is added beside those files:

```text
summary-video/summary.backgrounds/
├── manifest.json
├── hook-16x9-0de4c0ffee12.jpg
└── hook-9x16-91a20cafe123.jpg
```

With `--aspect-ratio both`, `summary-9x16.mp4` is rendered from the same narration, voiceover, and sample-derived timeline.

Subtitle input keeps its existing editor-oriented output names. Vertical files insert `-9x16` before the extension, and manifests are version 2:

```text
/videos/animations/
├── episode.animation-plan.json
├── episode.animations.json
├── episode.animations-9x16.json
├── 00h04m12s-01-process-flow.mp4
└── 00h04m12s-01-process-flow-9x16.mp4
```

## Requirements

- Node.js 22.13 or newer and pnpm 11.22
- an OpenAI API key when creating a new plan or generating an uncached scene image
- Google Chrome or Chromium when rendering video
- Git LFS and the local Supertonic 3 model when synthesizing narrated audio

Planning-only and saved-plan workflows skip the dependencies they do not use. For example, `--plan-only` does not need Chrome or Supertonic, and a timed narrated plan with ambient backgrounds can be rerendered without OpenAI or Supertonic.

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

The planning request creates a faithful hook, explanation, and conclusion using at most six scenes. Every visible item is anchored to exactly one semantic narration beat, and every beat contains short ordered subtitle phrases. The complete spoken copy is also saved as `summary.narration-script.md` for review, including any nonverbal voice direction as an italic cue such as `*[breath]*`.

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

Create only the script and draft storyboard—including editable subtitle phrases and scene background prompts. No voice or image assets are required for this step:

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

### Subtle voice expressions

Narrated plans support `none`, `laugh`, `breath`, and `sigh` at the semantic-beat level. The planner defaults to `none`, never places expressions on consecutive beats, and allows at most one non-neutral expression per roughly 30 seconds, capped at three for longer videos. `laugh` and `sigh` are reserved for source-supported emotional moments; `breath` can emphasize a hook, pivot, or conclusion.

Expression metadata stays separate from spoken text and captions. The Supertonic tag is added only at synthesis time, before the first phrase in its beat, so plan editing and on-screen captions remain clean.

After creating a draft with `--plan-only`, you can change a beat's `expression` in `summary.narration-plan.json` before synthesis. Use one of the supported values instead of adding `<laugh>`, `<breath>`, or `<sigh>` to phrase text.

## Exact voice-derived timing

Supertonic returns float PCM and a predicted voiced duration for each phrase. The worker trims each waveform to that duration, combines phrases into the existing per-beat WAV files, writes mono 44.1 kHz PCM16 audio, and records the exact number of written samples. The combined voiceover adds:

- 300 ms before each scene
- 50 ms between phrases
- 150 ms between semantic beats
- 300 ms after each scene

Scene boundaries, phrase-caption windows, and item reveal timestamps are calculated from those integer sample offsets—not estimated from word counts. Captions show one active phrase at a time and reserve a safe lower lane in both orientations. The aspect-independent timed plan is passed unchanged to both orientations, so their audio, captions, and reveal timeline are identical within one render frame.

Audio is staged in a temporary directory and promoted only after all beats and the combined voiceover succeed.

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

New overlay plans speech-align visible items to subtitle cues. Saved version-1 plans remain compatible and fall back to evenly distributed reveals when item timings are absent. Version-2 output manifests add `aspectRatio`, `width`, and `height` while landscape filenames remain unchanged.

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
--format <prores|webm|green>      Output format (default: green)
--max-suggestions <number>        Maximum overlays (default: 6; max: 12)

Narrated videos:
--supertonic-assets-dir <path>    Default: models/supertonic-3
--voice <M1..M5|F1..F5>          Default: M1
--language <code>                 Default: en; use na for language-agnostic
--tts-speed <number>              0.7-2.0 (default: 1.05)
--tts-steps <number>              1-20 (default: 8)
--target-duration <seconds>       Default: 60
--captions <on|off>               Default: on
--scene-background <mode>         ambient or generated; default: ambient
--image-model <model>             Default: OPENAI_IMAGE_MODEL or gpt-image-2
--image-quality <quality>         low, medium, or high; default: medium
--regenerate-backgrounds          Refresh cached assets; requires generated mode
```

Subtitle inputs default to an adjacent `animations/` directory. Narrated source inputs default to `<source-stem>-video/`, while a loaded plan defaults to its own directory. Every requested output is checked before rendering, and existing generated files are never replaced unless `--force` is supplied. Matching generated-background cache entries remain reusable unless `--regenerate-backgrounds` is also supplied.

## Templates and visual behavior

- `process-flow` — ordered systems or request flows
- `comparison` — two labelled groups
- `timeline` — ordered stages or events
- `callout` — definitions, concepts, and important statistics

Titles and labels are measured and fitted into their bounds. Larger technology badges come from the installed Simple Icons catalog when a product brand is recognized, then fall back to Lucide icons across authentication, security, users, documents, messaging, email, cache, storage, analytics, monitoring, payments, mobile, networking, webhooks, events, retries, scheduling, transforms, uploads/downloads, errors, and the existing technical concepts.

Narrated plan files are version 3. Version-2 narrated plans remain loadable with neutral expressions. Version-1 narrated draft and timed plans also remain loadable: each legacy beat becomes one timed phrase, receives a neutral expression, and gets a deterministic ambient background prompt. Subtitle animation plans remain version 1, and subtitle output manifests remain version 2.

Ambient backgrounds are generated entirely in Remotion from deterministic gradients, moving light fields, a subtle grid, and a vignette. Generated backgrounds use native `2048×1152` and `1152×2048` JPEG assets, add a slow pan/zoom plus readability overlays, and never silently fall back to ambient when generation was requested.

The OpenAI Responses API uses Zod Structured Outputs with response storage disabled (`store: false`). OpenAI selects and fills these templates; it does not generate arbitrary React code.

Optional scene imagery uses the OpenAI Image API. GPT Image access can depend on account and organization availability; see the [official image-generation guide](https://developers.openai.com/api/docs/guides/image-generation).

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
```

The fixture uses six long primary and secondary items. Inspect the rendered PNGs or assemble them into contact sheets to catch clipping and unsafe positioning.

Render narrated MP4 fixtures with captions in both orientations. The second command uses local mock artwork to exercise the generated-image rendering path without an API call:

```bash
pnpm fixtures:narrated -- /tmp/youtube-animation-narrated ambient
pnpm fixtures:narrated -- /tmp/youtube-animation-narrated-generated generated
pnpm fixtures:voice-expressions -- /tmp/youtube-animation-voice-expressions
```

The voice-expression fixture renders plain, laugh, breath, and sigh WAVs from the same sentence for listening QA. Its JSON manifest records exact sample counts and durations; optional second and third arguments override the Supertonic assets directory and voice.

An offline overlay plan remains available for a full media render:

```bash
node dist/cli.js \
  --render-plan fixtures/sample.animation-plan.json \
  --output-dir /tmp/youtube-animations-render-check
```

If Chrome is installed in a nonstandard location, set `REMOTION_BROWSER_EXECUTABLE`.
