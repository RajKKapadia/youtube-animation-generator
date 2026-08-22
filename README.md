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
├── 00h04m12s-01-process-flow.mov
├── 00h07m32s-02-comparison.mov
└── 00h11m48s-03-callout.mov
```

The timestamps in the filenames and manifest identify where each clip belongs in the editor.

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

The default output is an `animations/` directory beside the subtitle file. Each selected clip is rendered as a transparent ProRes 4444 `.mov`.

You can also build and execute the compiled CLI:

```bash
pnpm build
node dist/cli.js /absolute/path/to/episode-12.srt
```

## Output formats

Transparent ProRes 4444 is the default and best choice for conventional editors:

```bash
pnpm animations -- episode.srt --format prores
```

Transparent WebM:

```bash
pnpm animations -- episode.srt --format webm
```

Green-background H.264 MP4 fallback:

```bash
pnpm animations -- episode.srt --format green
```

The transparent render settings follow Remotion's [transparent video guidance](https://www.remotion.dev/docs/transparent-videos).

## Review before rendering

Create only the structured animation plan:

```bash
pnpm animations -- episode.srt --plan-only
```

Review or edit `animations/episode.animation-plan.json`, then render it without another OpenAI request:

```bash
pnpm animations -- --render-plan animations/episode.animation-plan.json
```

This is useful when you want to adjust labels, timing, templates, or selected transcript ranges before creating media files.

## Options

```text
--format <prores|webm|green>  Output format (default: prores)
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
