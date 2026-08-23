# YouTube Animations CLI

Generate separate, editor-ready animation clips from an `.srt` or `.vtt` subtitle file. The tool finds transcript sections that benefit from a visual explanation, creates a structured animation plan with OpenAI, and renders each selected animation with Remotion.

This is intentionally **not a video editor**. It never modifies the source video. You import the generated clips into Lightworks, DaVinci Resolve, Premiere, or another editor yourself.

## What it creates

Given:

```text
/videos/episode-12.srt
```

the default command creates:

```text
/videos/animations/
├── episode-12.animation-plan.json
├── episode-12.animations.json
├── 00h04m12s-01-process-flow.mp4
├── 00h07m32s-02-comparison.mp4
└── 00h11m48s-03-callout.mp4
```

The timestamps in the filenames and manifest identify where each clip belongs in the editor.

Each clip automatically:

- uses a dual-contrast title treatment that stays legible over light or dark footage
- measures and fits titles and labels into their available boxes without truncating the text
- reveals each part when its concept is spoken, using subtitle-cue anchors and a short fixed transition
- resolves technology badges from the full installed Simple Icons catalog, with aliases for common names such as `k8s`, `pgvector`, and `NodeJS`
- falls back to semantic icons for concepts such as APIs, queues, databases, cloud services, search, audio, video, and workers when no brand icon exists

Existing saved plans gain these enhancements when re-rendered; no new OpenAI request is required.

## Requirements

- Node.js 22.13 or newer
- pnpm 11.22
- An OpenAI API key
- Google Chrome or Chromium for Remotion rendering

Remotion has its own license terms. Confirm that your use qualifies for its free license or obtain the appropriate license before production use: [Remotion license](https://www.remotion.dev/license).

## Setup

```bash
pnpm install
cp .env.example .env
```

Add your key to `.env`:

```dotenv
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.6
```

The CLI uses the OpenAI Responses API with Zod Structured Outputs. Subtitle text is sent to OpenAI for analysis with response storage disabled (`store: false`). See the [official Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).

## Generate animations

From the repository:

```bash
pnpm animations -- /absolute/path/to/episode-12.srt
```

The default output is an `animations/` directory beside the subtitle file. Each selected clip is rendered as a green-background H.264 `.mp4` for chroma-keying in your editor.

You can also build and execute the compiled CLI:

```bash
pnpm build
node dist/cli.js /absolute/path/to/episode-12.srt
```

## Output formats

Green-background H.264 MP4 is the default:

```bash
pnpm animations -- episode.srt
```

Transparent ProRes 4444 remains available when needed:

```bash
pnpm animations -- episode.srt --format prores
```

Transparent WebM:

```bash
pnpm animations -- episode.srt --format webm
```

The transparent optional formats follow Remotion's [transparent video guidance](https://www.remotion.dev/docs/transparent-videos).

## Review before rendering

Create only the structured animation plan:

```bash
pnpm animations -- episode.srt --plan-only
```

Review or edit `animations/episode.animation-plan.json`, then render it without another OpenAI request:

```bash
pnpm animations -- --render-plan animations/episode.animation-plan.json
```

This is useful when you want to adjust labels, timing, templates, or selected transcript ranges before creating media files. New plans include `primaryItemTimings` and `secondaryItemTimings`; each `startMs` is relative to the beginning of that clip and can be fine-tuned before rendering.

## Options

```text
--format <prores|webm|green>  Output format (default: green)
--output-dir <path>           Override the output directory
--model <model>               Override OPENAI_MODEL
--max-suggestions <number>    Maximum animations (default: 6)
--fps <number>                Frames per second (default: 30)
--plan-only                   Analyze and save the plan without rendering
--render-plan <path>          Render an existing plan without OpenAI
--force                       Replace previously generated files
```

Generated files are not replaced unless `--force` is explicitly supplied.

## Initial animation templates

- `process-flow` — ordered systems or request flows
- `comparison` — two labelled columns
- `timeline` — ordered stages or events
- `callout` — definitions, concepts, and important statistics

The reusable template implementation lives in `src/remotion/`. OpenAI selects and fills these templates; it does not generate arbitrary React or animation code.

For new plans, OpenAI anchors every visible item to the subtitle cue where that concept is first spoken. The CLI resolves those cue indices into clip-relative `startMs` values, and Remotion converts them to reveal frames at the requested FPS. Cue indices remain in the plan as traceable provenance. Plans created by older versions remain valid and fall back to evenly distributed pacing computed from the clip's subtitle-derived `durationMs`.

If OpenAI returns overlapping animation ranges, planning no longer fails. The CLI deterministically keeps the largest possible non-overlapping set, writes a `planningWarnings` entry for every dropped suggestion, and prints those warnings before rendering. This preserves editor-safe output without spending another API request or silently discarding a conflict.

For example:

```json
"primaryItemTimings": [
  {"cueIndex": 42, "startMs": 0},
  {"cueIndex": 44, "startMs": 1800},
  {"cueIndex": 45, "startMs": 3100}
]
```

Timing arrays correspond by position to `primaryItems` or `secondaryItems`. Their lengths must match, cue indices must stay inside the clip's `startCue`/`endCue` range, and offsets must be chronological and earlier than `durationMs`. Brand badges are inferred deterministically from the generated item labels.

Technology matching does not require a hard-coded entry for every supported brand. Before rendering, the CLI searches the installed Simple Icons catalog by normalized brand title and passes only the matched SVG data into Remotion. This keeps the Remotion bundle small while allowing new catalog technologies to work without renderer changes. A short alias list covers common names that differ from official icon titles.

## Development checks

```bash
pnpm check
pnpm test
pnpm build
```

An offline fixture is included for renderer testing:

```bash
node dist/cli.js \
  --render-plan fixtures/sample.animation-plan.json \
  --output-dir /tmp/youtube-animations-render-check
```

If Chrome is installed in a nonstandard location, set:

```bash
REMOTION_BROWSER_EXECUTABLE=/path/to/chrome
```
