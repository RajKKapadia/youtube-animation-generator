# Command Reference

← [AGENTS.md](../AGENTS.md) · [`README.md`](../README.md) is authoritative for full flag
behaviour · Verified at commit `d1e65f3`

`pnpm run animations <args>` runs the CLI in development (`node --import tsx src/cli.ts`).
Full usage text lives at `src/cli.ts:70-140`.

Provider selection is environment-driven, not flag-driven — see [providers.md](providers.md).

## Invocations

| Invocation | Purpose | Provider key? |
|---|---|:--:|
| `<subtitle.srt\|.vtt>` | Author + render overlay | ✅ |
| `--render-plan <plan.json>` | Render an existing overlay plan | — |
| `create <source.md>` | Author + render narrated video | ✅ |
| `create --render-plan <plan.json>` | Render an existing narrated plan | — |
| `publish <plan.json>` | Author publish metadata + covers | ✅ |
| `publish --render-publish <publish.json>` | Render edited metadata | — |
| _any of the above_ `--plan-only` | Validate/save without rendering | — |

## Staged workflow

Rendering a full video is the expensive last step. Three flags let you inspect the pipeline
before paying for it:

| Flag | Produces | Needs Chrome | Needs TTS model |
|---|---|:--:|:--:|
| `--plan-only` | Script + storyboard JSON | — | — |
| `--stills-only` | Scene screenshots, no video | ✅ | — |
| `--audio-only` | Voiceover WAV + timed plan | — | ✅ |
| `--review` | All four stages, gated interactively | ✅ | ✅ |

`--stills-only` and `--audio-only` are mutually exclusive; passing both is a hard error.

### `--review`

Runs the whole pipeline but pauses between stages, printing the path to inspect and waiting
for **Enter**:

1. **Script & storyboard** — the plan is **re-read from disk** after the pause, so edits count
2. **Screenshots** — scene stills; the plan is re-read again after this pause
3. **Voiceover audio** — listen before committing to a render
4. **Final video**

In a non-TTY (CI, piped output) the prompts are skipped and all stages run straight through.

### How `--stills-only` avoids the TTS model

A draft plan has no timings, so `estimateDraftNarrationTiming`
(`src/narration-planner.ts`) synthesizes plausible ones from word counts —
roughly 350 ms per word, floored at 3 s per scene. `narrated-render.ts` writes a silent WAV in
place of the voiceover. Verified: `--stills-only` succeeds with
`--supertonic-assets-dir /nonexistent/model`.

> These timings are **estimates for preview only**. The real render uses measured speech, so
> final pacing will differ.

### Stills output

Two frames per scene per aspect ratio, written to `<stem>.stills/`:

| File | Frame | Purpose |
|---|---|---|
| `scene-N-<id>-mid-<aspect>.png` | 50% into the scene | Mid-animation state |
| `scene-N-<id>-final-<aspect>.png` | 88% (capped at end − 200 ms) | **Full reveal — all items visible** |
| `scene-N-<id>-<aspect>.png` | copy of `-final-` | Canonical path for tools |

Check the `-final-` frame for layout review: the midpoint frame will be missing any item that
a later beat reveals.

Stills bypass the `--force` preflight and overwrite in place, so a preview loop stays fast.

## Frequently used options

| Option | Default | Notes |
|---|---|---|
| `--aspect-ratio <16:9\|9:16\|both>` | `16:9` | |
| `--output-dir <path>` | derived (below) | |
| `--fps <n>` | `30` | |
| `--force` | — | Replace previously generated files |
| `--plan-only` | — | Save/validate a plan, render nothing |
| `--stills-only` | — | Scene screenshots only (no TTS model needed) |
| `--audio-only` | — | Voiceover only (no Chrome needed) |
| `--review` | — | Pause between all four stages |
| `--voice <auto\|M1-M5\|F1-F5>` | `auto` | Auto-selected from plan signals |
| `--language <code>` | `en` | |
| `--tts-speed <0.7-2.0>` | `1.05` | |
| `--tts-steps <1-20>` | `8` | Higher = slower, marginally better |
| `--target-duration <s>` | `60` | Planning hint only |
| `--captions <on\|off>` | `on` (narrated) / `off` (subtitle) | |
| `--supertonic-assets-dir <path>` | `models/supertonic-3` | |
| `--model <model>` | per provider (`gpt-5.6` / `gemini-3.5-flash` / `llama-3.3-70b-versatile`) | Script model |
| `--image-model <model>` | `@cf/…flux-1-schnell` when Cloudflare keys exist, else `gpt-image-2` | `cli.ts:1002` |
| `--scene-background <ambient\|generated\|image>` | `ambient` (narrated), `off` (subtitle) | `generated` **bills the image provider** |
| `--generated-visuals <off\|auto>` | `off` | `auto` **bills image + vision** |
| `--research <off\|auto\|required>` | `off` | Non-`off` **bills tokens + web search; OpenAI only** |
| `--format <prores\|webm\|green\|h264>` | `green` (subtitle) | Overlay output format |

## Output conventions

| Input | Output directory |
|---|---|
| `create <source.md>` | `<dir>/<stem>-video/` (`cli.ts:741`) |
| `--render-plan <plan>` | `dirname(plan)` (`cli.ts:708`) |
| `<subtitle.srt>` | `<dir>/animations/` (`cli.ts:512`) |

For `X.narration-plan.json` a render emits:

```
X.narration-timed.json      timed plan with per-phrase timings
X.narration-script.md       the spoken script, for review
X.audio/voiceover.wav       44.1 kHz mono PCM16
X.stills/                   scene screenshots (--stills-only / --review)
X.mp4                       H.264 video + AAC audio
```

## Fixture scripts

Render from checked-in plans — the fastest proof that rendering works with no key and no
model. **Not uniformly portable:**

| Script | Produces | Browser resolution | macOS |
|---|---|---|:--:|
| `fixtures:explainers` | Stills + MP4s, 6 treatments × 2 aspects, `index.html` | env var, then Linux probe (`:19`) | ✅ |
| `fixtures:presentation` | Stills | env var, then Linux probe (`:17`) | ✅ |
| `fixtures:chroma-text` | Stills | env var, then Linux literal (`:20`) | ✅ |
| `fixtures:narrated` | Audio + JSON | no browser | ✅ |
| `fixtures:narrated-v6-mixed` | Audio + JSON | no browser | ✅ |
| `fixtures:publish` | Audio + JSON | no browser | ✅ |
| `fixtures:voice-expressions` | Audio | no browser | ✅ |
| `fixtures:narrated-layouts` | Video | Linux probe only → `undefined` (`:313`) | ⚠️ |
| `fixtures:layouts` | Video | hardcoded literal (`:44`) | ❌ |
| `fixtures:subtitle-visuals` | Stills | hardcoded literal (`:108`) | ❌ |

See [troubleshooting.md](troubleshooting.md#hardcoded-linux-browser-paths) — ⚠️ is more
dangerous than ❌.

Recommended smoke test:

```bash
export REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
pnpm fixtures:explainers -- /tmp/gallery --stills-only   # fast
pnpm fixtures:explainers -- /tmp/gallery                 # full MP4s, several minutes
open /tmp/gallery/index.html
```

## Other scripts

| Script | Purpose |
|---|---|
| `pnpm check` | `tsc --noEmit` |
| `pnpm test` | `vitest run` |
| `pnpm build` | `tsc` → `dist/`, packaging for the `youtube-animations` bin |
| `pnpm assets:validate` | Validate asset manifests and hashes |
