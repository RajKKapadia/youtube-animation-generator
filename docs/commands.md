# Command Reference

← [AGENTS.md](../AGENTS.md) · [`README.md`](../README.md) is authoritative for full flag
behaviour · Verified at commit `d1e65f3`

`pnpm run animations <args>` runs the CLI in development (`node --import tsx src/cli.ts`).
Full usage text lives at `src/cli.ts:70-140`.

## Invocations

| Invocation | Purpose | Key? |
|---|---|:--:|
| `<subtitle.srt\|.vtt>` | Author + render overlay | ✅ |
| `--render-plan <plan.json>` | Render an existing overlay plan | — |
| `create <source.md>` | Author + render narrated video | ✅ |
| `create --render-plan <plan.json>` | Render an existing narrated plan | — |
| `publish <plan.json>` | Author publish metadata + covers | ✅ |
| `publish --render-publish <publish.json>` | Render edited metadata | — |
| _any of the above_ `--plan-only` | Validate/save without rendering | — |

## Frequently used options

| Option | Default | Notes |
|---|---|---|
| `--aspect-ratio <16:9\|9:16\|both>` | `16:9` | |
| `--output-dir <path>` | derived (below) | |
| `--fps <n>` | `30` | |
| `--force` | — | Replace previously generated files |
| `--voice <auto\|M1-M5\|F1-F5>` | `auto` | Auto-selected from plan signals |
| `--language <code>` | `en` | |
| `--tts-speed <0.7-2.0>` | `1.05` | |
| `--tts-steps <1-20>` | `8` | Higher = slower, marginally better |
| `--target-duration <s>` | `60` | Planning hint only |
| `--captions <on\|off>` | `on` (narrated) / `off` (subtitle) | |
| `--supertonic-assets-dir <path>` | `models/supertonic-3` | |
| `--scene-background <ambient\|generated\|image>` | `ambient` (narrated), `off` (subtitle) | `generated` **bills the Image API** |
| `--generated-visuals <off\|auto>` | `off` | `auto` **bills the Image API** |
| `--research <off\|auto\|required>` | `off` | Non-`off` **bills tokens + web search** |
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
