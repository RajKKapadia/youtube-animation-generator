# Setup and Environment

← [AGENTS.md](../AGENTS.md) · Verified 2026-09-16 on darwin-arm64, Node 26.5.0, pnpm 11.22.0

## Dependency matrix by task

Nothing needs everything. Check what your task actually requires:

| Task | Provider key | Chrome | TTS model | Git LFS |
|---|:--:|:--:|:--:|:--:|
| `pnpm check` / `pnpm test` | — | — | — | — |
| `--plan-only` validation | — | — | — | — |
| `--stills-only` preview | — | ✅ | — | — |
| `--audio-only` synthesis | — | — | ✅ | ✅ (once) |
| Authoring a new plan | ✅ any of OpenAI / Gemini / Groq | — | — | — |
| `--research auto\|required` | ✅ **OpenAI specifically** | — | — | — |
| `--scene-background generated` | ✅ Cloudflare or OpenAI | — | — | — |
| `--generated-visuals auto` | ✅ Cloudflare/OpenAI + a vision key | — | — | — |
| Narrated render from a plan | — | ✅ | ✅ | ✅ (once) |
| Subtitle overlay from a plan | — | ✅ | — | — |
| Publish covers from metadata | — | ✅ | — | — |

## Bootstrap

```bash
pnpm install     # builds onnxruntime-node + esbuild (allowlisted in pnpm-workspace.yaml)
pnpm check       # tsc --noEmit
pnpm test        # vitest run
```

Requirements: Node ≥ 22.13 (`engines`), pnpm 11.22.0 (pinned via `packageManager`).

## macOS / Apple Silicon

### corepack fails on Node ≥ 25

Corepack was unbundled from the Node distribution. If the pnpm on `PATH` already matches
`packageManager` in `package.json`, use it directly — do not install corepack solely to
re-derive a version you already have.

### Chrome must be declared explicitly

`findBrowserExecutable()` probes **Linux paths only** — `src/narrated-render.ts:31`,
`src/render.ts:27`, `src/publish-render.ts:34`:

```bash
export REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

This does **not** persist across shells. Re-export in every session that renders. Omitting it
does not always fail loudly — see [troubleshooting.md §Hardcoded browser paths](troubleshooting.md#hardcoded-linux-browser-paths).

Verify before rendering:

```bash
"$REMOTION_BROWSER_EXECUTABLE" --version
```

## TTS model acquisition

One-time, ~392 MB transferred, ~822 MB on disk including the LFS object cache. Already
gitignored.

```bash
git lfs install
git clone https://huggingface.co/Supertone/supertonic-3 models/supertonic-3
```

**The files are nested under `onnx/`, not at the top level.** `src/supertonic/assets.ts:5-12`
requires exactly:

```
models/supertonic-3/
  onnx/duration_predictor.onnx
  onnx/text_encoder.onnx
  onnx/vector_estimator.onnx
  onnx/vocoder.onnx
  onnx/tts.json
  onnx/unicode_indexer.json
  voice_styles/<VOICE>.json        # F1-F5, M1-M5; only the selected voice is checked
```

Any `.onnx` under 1 KB is rejected as *"looks like a Git LFS pointer"* — the canonical symptom
of cloning without Git LFS installed.

Validate the install without rendering:

```bash
node --import tsx -e "
import {validateSupertonicAssets} from './src/supertonic/assets.ts';
console.log(await validateSupertonicAssets('models/supertonic-3', 'F1'));
"
```

## Credentials

Keys are read from the environment only. `.env` is gitignored; copy `.env.example` and fill in
whichever providers you use — you do **not** need all of them.

```bash
cp .env.example .env
```

Minimum viable combinations:

| Goal | Set |
|---|---|
| Cheapest working setup | `GOOGLE_GEMINI_API_KEY` + `CLOUDFLARE_AI_KEY` + `CLOUDFLARE_ACCOUNT_ID` |
| Simplest | `OPENAI_API_KEY` alone |
| Render existing plans only | nothing |

Both providers auto-detect from the keys present; `AI_PROVIDER` and `IMAGE_PROVIDER` override.
Full resolution order and every variable: [providers.md](providers.md).

> `--research auto|required` needs `OPENAI_API_KEY` specifically, whatever `AI_PROVIDER` says —
> it uses OpenAI-hosted web search.

Most work needs no key at all — see the matrix above.
