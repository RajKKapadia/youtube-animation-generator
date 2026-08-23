# YouTube Animations CLI

Create either editor-ready animation overlays from subtitles or a complete narrated video from a text/Markdown source. Planning uses OpenAI Structured Outputs, local voice synthesis uses the embedded Supertonic 3 Node worker, and Remotion renders native 16:9, 9:16, or both.

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

- Node.js 22.13 or newer
- pnpm 11.22
- an OpenAI API key for new plans
- Google Chrome or Chromium for Remotion rendering
- Git LFS for the one-time Supertonic model checkout

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

The planning request creates a faithful hook, explanation, and conclusion using at most six scenes. Every visible item is anchored to exactly one semantic narration beat. The complete spoken copy is also saved as `summary.narration-script.md` for review.

Create only the script and draft storyboard—no model assets are required for this step:

```bash
pnpm run animations create summary.md --plan-only
```

After reviewing or editing the draft, synthesize and render without another OpenAI request:

```bash
pnpm run animations create \
  --render-plan summary-video/summary.narration-plan.json \
  --aspect-ratio both
```

A timed plan can also be rendered again without OpenAI or Supertonic:

```bash
pnpm run animations create \
  --render-plan summary-video/summary.narration-timed.json
```

Narrated output is H.264 video with AAC voiceover audio. Planning and TTS happen once; `both` performs two independent Remotion render passes.

## Exact voice-derived timing

Supertonic returns float PCM and a predicted voiced duration for each beat. The worker trims the waveform to that duration, writes mono 44.1 kHz PCM16 WAV files, and records the exact number of written samples. The combined voiceover adds:

- 300 ms before each scene
- 150 ms between semantic beats
- 300 ms after each scene

Scene boundaries and item reveal timestamps are calculated from those integer sample offsets—not estimated from word counts. The aspect-independent timed plan is passed unchanged to both orientations, so their audio and reveal timeline are identical within one render frame.

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
--model <model>                   Override OPENAI_MODEL
--fps <number>                    Frames per second (default: 30)
--plan-only                       Save or validate without rendering
--render-plan <path>              Continue from a saved plan
--force                           Replace generated files

Subtitle overlays:
--format <prores|webm|green>      Output format (default: green)
--max-suggestions <number>        Maximum overlays (default: 6)

Narrated videos:
--supertonic-assets-dir <path>    Default: models/supertonic-3
--voice <M1..M5|F1..F5>          Default: M1
--language <code>                 Default: en; use na for language-agnostic
--tts-speed <number>              0.7-2.0 (default: 1.05)
--tts-steps <number>              1-20 (default: 8)
--target-duration <seconds>       Default: 60
```

Every requested output is checked before rendering. Existing generated files are never replaced unless `--force` is supplied.

## Templates and visual behavior

- `process-flow` — ordered systems or request flows
- `comparison` — two labelled groups
- `timeline` — ordered stages or events
- `callout` — definitions, concepts, and important statistics

Titles and labels are measured and fitted into their bounds. Technology badges come from the installed Simple Icons catalog, with aliases and semantic fallbacks for concepts such as APIs, queues, databases, search, audio, video, and workers.

The OpenAI Responses API uses Zod Structured Outputs with response storage disabled (`store: false`). OpenAI selects and fills these templates; it does not generate arbitrary React code.

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

An offline overlay plan remains available for a full media render:

```bash
node dist/cli.js \
  --render-plan fixtures/sample.animation-plan.json \
  --output-dir /tmp/youtube-animations-render-check
```

If Chrome is installed in a nonstandard location, set `REMOTION_BROWSER_EXECUTABLE`.
