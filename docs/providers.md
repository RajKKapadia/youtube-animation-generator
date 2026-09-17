# AI and Image Providers

← [AGENTS.md](../AGENTS.md) · Verified 2026-09-16

Script generation and image generation are independently pluggable. Both auto-detect from the
keys present in the environment; explicit env vars override.

## At a glance

| Concern | Providers | Selector | Implementation |
|---|---|---|---|
| Script / planning | OpenAI, Gemini, Groq | `AI_PROVIDER` | `src/ai-client.ts` |
| Image generation | Cloudflare Workers AI, OpenAI | `IMAGE_PROVIDER` | `src/scene-backgrounds.ts`, `src/providers/cloudflare-image.ts` |
| Visual validation | OpenAI, Gemini | _(follows available keys)_ | `src/generated-visuals.ts` |
| Web research | **OpenAI only** | — | `src/source-research.ts` |
| Speech | Supertonic 3, local | — | `src/supertonic/` |

Gemini and Groq are reached through their **OpenAI-compatible endpoints**, so the same `openai`
SDK object is reused with a different `baseURL` (`ai-client.ts:52-70`). No extra dependency.

## Provider resolution

### Script provider (`resolveAIProvider`, `ai-client.ts:11`)

First match wins:

1. Explicit `provider` argument passed by the caller
2. `AI_PROVIDER` env var — `openai` | `gemini` | `groq`
3. `OPENAI_API_KEY` present → `openai`
4. `GOOGLE_GEMINI_API_KEY` present → `gemini`
5. `GROQ_API_KEY` present → `groq`
6. Fallback → `openai` (which then throws for the missing key)

Verified behaviour:

| Keys present | Resolves to |
|---|---|
| OpenAI only | `openai` |
| OpenAI + Gemini | `openai` |
| Gemini only | `gemini` |
| Groq only | `groq` |
| Gemini + Groq | `gemini` |
| OpenAI + `AI_PROVIDER=groq` | `groq` |
| none | `openai` (then throws) |

> OpenAI wins ties. Set `AI_PROVIDER` explicitly to use a different provider when several keys
> are configured.

### Image provider (`createDefaultImageGenerator`, `scene-backgrounds.ts`)

1. `IMAGE_PROVIDER=cloudflare` → Cloudflare
2. `IMAGE_PROVIDER=openai` → OpenAI
3. `CLOUDFLARE_AI_KEY` **and** `CLOUDFLARE_ACCOUNT_ID` both present → Cloudflare
4. Fallback → OpenAI

> Note the inverted default: **Cloudflare wins ties here**, unlike the script provider.
> Set `IMAGE_PROVIDER=openai` to force OpenAI when Cloudflare keys exist.

### Visual validator (`createDefaultVisualValidator`, `generated-visuals.ts`)

`--generated-visuals auto` validates each generated image against the source evidence using a
vision model. `OPENAI_API_KEY` is preferred; otherwise `GOOGLE_GEMINI_API_KEY`.

## API surface differences

This is the subtlety that makes the abstraction non-trivial.

| Provider | API used | Schema enforcement |
|---|---|---|
| OpenAI | Responses API — `client.responses.parse` / `.create` with `zodTextFormat` | Strict, schema-enforced |
| Gemini / Groq | `client.chat.completions.create` with `response_format: {type: 'json_object'}` | JSON mode only — **not** schema-enforced |

The compat endpoints do **not** implement `/responses`, so every planner branches on
`aiInfo.provider` — `planner.ts:513`, `publish.ts:178`, `narration-planner.ts:586`.

Because JSON mode does not enforce a schema, non-OpenAI output is parsed with Zod and may fail.
Two compensations apply, **both only for non-OpenAI providers**:

1. **A 3-attempt repair loop** (`narration-planner.ts`) feeds validation errors back to the
   model and asks it to fix the plan.
2. **Coercion before validation** — `sanitizeNarratedCandidate`
   (`narration-plan-recovery.ts:31`), applied at `narration-planner.ts:672`.

The sanitizer silently repairs rather than rejects. It substitutes an invalid `template` with
`comparison` (when `secondaryItems` is non-empty) or `callout`, replaces empty `primaryItems`
with a literal `"Key Concept"`, drops `secondaryItems` on non-comparison templates, and
truncates every array to its schema cap.

> **Consequence:** an OpenAI plan that would fail validation instead *fails*, whereas the same
> malformed output from Gemini or Groq may be quietly reshaped into a valid-but-degraded plan.
> If a non-OpenAI video shows a `callout` you did not ask for, or an item labelled
> "Key Concept", the sanitizer ran. Inspect the saved plan JSON before assuming the model
> ignored the prompt.

## Environment variables

```bash
# Script provider: openai | gemini | groq (auto-detected when unset)
AI_PROVIDER=

# Image provider: cloudflare | openai (auto-detected when unset)
IMAGE_PROVIDER=

GOOGLE_GEMINI_API_KEY=
GOOGLE_GEMINI_MODEL=gemini-3.5-flash

GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile

CLOUDFLARE_AI_KEY=              # or CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_IMAGE_MODEL=@cf/black-forest-labs/flux-1-schnell

OPENAI_API_KEY=                 # also required for --research, regardless of AI_PROVIDER
OPENAI_MODEL=gpt-5.6
OPENAI_IMAGE_MODEL=gpt-image-2
```

`CLOUDFLARE_IMAGE_MODEL` is resolved at `cli.ts:1002`; the Cloudflare generator additionally
rejects any model not starting with `@cf/` and falls back to `flux-1-schnell`
(`providers/cloudflare-image.ts:15`).

## Transient-failure retries

`withTransientRetries` (`ai-client.ts`) wraps **every** provider call — both branches of all
three planners plus the visual validator. It retries up to 4 times on HTTP 429/503/5xx, or on
messages containing `quota`, `resource_exhausted`, `rate limit`, or `retry in`.

Backoff honours a server-suggested `retry in Ns` when present, otherwise doubles from 1.5 s. It
logs to stdout only when the wait exceeds 2 s.

> This matters most for Gemini free tiers, which return `RESOURCE_EXHAUSTED` aggressively.

## Known limitation — `--research` is OpenAI-only

`source-research.ts:217` uses OpenAI's **hosted `web_search` tool**, which has no equivalent in
the Gemini or Groq compatibility layers. `--research auto|required` therefore requires
`OPENAI_API_KEY` even when `AI_PROVIDER=gemini`. The error message says so explicitly. Use
`--research off` to avoid it.

## Choosing a combination

| Goal | Configuration |
|---|---|
| Cheapest working setup | `GOOGLE_GEMINI_API_KEY` + `CLOUDFLARE_AI_KEY`/`CLOUDFLARE_ACCOUNT_ID` |
| Highest plan fidelity | `OPENAI_API_KEY` alone — strict schema enforcement, no repair loop |
| Fastest script generation | `GROQ_API_KEY` |
| Web-grounded plans | `OPENAI_API_KEY` required |
| No API calls at all | `--render-plan` on an existing plan; no keys needed |
