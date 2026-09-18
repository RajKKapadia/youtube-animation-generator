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

| Provider | API used | Schema enforcement | How the model learns the shape |
|---|---|---|---|
| OpenAI | Responses API — `client.responses.parse` / `.create` with `zodTextFormat` | Strict, schema-enforced | From Zod (`narration-planner.ts:713`) |
| Gemini / Groq | `client.chat.completions.create` with `response_format: {type: 'json_object'}` | JSON mode only — **not** schema-enforced | Compact shape in the prompt (`narration-planner.ts:728`) |

> ### Why Gemini cannot use `json_schema`
>
> Gemini's OpenAI-compatible endpoint does accept `response_format: {type: 'json_schema'}`, and
> every construct our schema uses works in isolation — `additionalProperties: false`, nested
> objects, `enum`, `const`, `anyOf` unions with `const` discriminators, nullable scalars and
> arrays of objects all pass. But the **full `narrationResponseSchema` (16,493 B) is rejected
> `400` on both `gemini-3.5-flash` and `gemini-2.5-flash`**:
>
> > The specified schema produces a constraint that has too many states for serving. Typical
> > causes are schemas with lots of text (for example, very long property or enum names),
> > schemas with long array length limits (especially when nested), or schemas using complex
> > value matchers (for example, integers or numbers with minimum/maximum bounds…).
>
> Measured ceiling: **6,282 B passes, 8,676 B fails** — a constrained-decoding state limit, not
> an unsupported keyword and not union-branch count. So Gemini stays on JSON mode for the plan
> call, and the `.prefault` defaults in `explainer-visuals.ts` are what carry it.
>
> A **character-only** schema is 1,928 B and *is* accepted, so a future scoped character call
> could be schema-enforced on Gemini even though the whole plan cannot.
>
> Two practical notes: **debug Gemini schema errors on 2.5-flash** — 3.5-flash hides the reason
> behind a generic `INVALID_ARGUMENT`. And the free-tier limit hit while probing was
> **per-minute**, recovering in ~65 s.

> ### The trap: the second copy can hide features
>
> Because the compat path teaches the model the shape *in the prompt*, that text is the entire
> universe of what those providers believe is possible. It was hand-maintained and drifted:
> treatments added after it was written (`data-visualization`, the five explainer kinds, and
> `character-scene`) were absent, so Gemini and Groq were silently restricted to the original
> seven. The failure is invisible — the model quietly picks a permitted treatment and the plan
> validates, so it reads as the model ignoring the prompt.
>
> It is now derived from the same Zod schema the OpenAI path enforces
> (`NARRATION_RESPONSE_SHAPE`, `narration-planner.ts`), with a regression test in
> `narration-planner.test.ts` asserting every member of `narratedVisualKindSchema` appears.
> **Do not reintroduce a hand-written copy.**

### The other half of the trap: token budget

Deriving the schema fixed correctness and immediately broke free-tier providers. Raw JSON
Schema is ~16 KB / ~4.1k tokens, and Groq's free `on_demand` tier caps a request at 6–8k
tokens depending on model — so every plan returned `413 Request too large`.

`compactSchemaText` (`schema-prompt.ts`) renders the same schema as a terse TypeScript-like
signature — ~4.2 KB / ~1k tokens, a 4x reduction with no loss of shape or allowed values. It
drops lengths and numeric bounds deliberately: on this path the schema is **guidance, not
enforcement**, and Zod plus the repair loop enforce the real constraints after parsing.

Two tests guard it. `narration-planner.test.ts` caps the rendered shape at 6,000 chars, so a
future treatment that blows the budget fails in CI rather than as a runtime 413. It also
asserts the text never contains `kind:string` — `z.literal()` emits `const`, not `enum`, and
mishandling that collapses the whole visual union into an unusable blob.

**Approximate free-tier budget** (planning request, short source): director instructions ~650,
presentation rules ~150, explainer rules ~975, icon catalog ~835, response shape ~1,045,
source text ~410. Long sources are what will push you over next; the shape is no longer the
dominant term.
>
> Diagnosing "the planner never picks treatment X": check the `model` field in the saved plan
> to see which provider ran, then confirm X is in the schema that provider received — before
> touching prompt wording.

The compat endpoints do **not** implement `/responses`, so every planner branches on
`aiInfo.provider` — `planner.ts:513`, `publish.ts:178`, `narration-planner.ts:606`.

Because JSON mode does not enforce a schema, non-OpenAI output is parsed with Zod and may fail.
Two compensations apply, **both only for non-OpenAI providers**:

1. **A 3-attempt repair loop** (`narration-planner.ts`) feeds validation errors back to the
   model and asks it to fix the plan.
2. **Coercion before validation** — `sanitizeNarratedCandidate`
   (`narration-plan-recovery.ts:240`), applied at `narration-planner.ts:785`.

A third compensation applies to **every** provider: `repairCharacterScene` also runs inside
`recoverNarrationResponse`, because strict structured outputs guarantee a character scene's
*shape* but never its cross-field consistency — a speaker naming a character who is not on
stage is still fatal on the OpenAI path.

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
GROQ_MODEL=qwen/qwen3.8-27b

CLOUDFLARE_AI_KEY=              # or CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_IMAGE_MODEL=@cf/stabilityai/stable-diffusion-xl-base-1.0

OPENAI_API_KEY=                 # also required for --research, regardless of AI_PROVIDER
OPENAI_MODEL=gpt-5.6
OPENAI_IMAGE_MODEL=gpt-image-2
```

`CLOUDFLARE_IMAGE_MODEL` is resolved at `cli.ts:1197`; the Cloudflare generator additionally
rejects any model not starting with `@cf/` and falls back to the SDXL default
(`providers/cloudflare-image.ts`).

### Workers AI models do not share a parameter set

Sending the wrong parameter is a `400`, not a warning, so `cloudflareImageBody` branches on the
model id:

| | `flux-1-schnell` | `stable-diffusion-xl-*` (**default**) |
|---|---|---|
| `width` / `height` | **not supported** | 256–2048 |
| `negative_prompt` | **not supported** | supported |
| steps | `steps`, max 8 (default 4) | `num_steps`, max 20 |
| prompt cap | 2048 chars | — |
| response | base64 inside JSON | **raw image stream** |

An unrecognised `@cf/` model keeps a conservative prompt-only body.

> **Why the default changed.** FLUX takes no size at all, so every generated background was a
> square that `objectFit: cover` cropped by ~42% of its height on the way into a 16:9 frame —
> and with the Ken Burns zoom on top, only a small centre patch survived. SDXL produces a real
> 1344×760 landscape plate. Because FLUX also has no negative prompt, the old prompt fed its
> list of forbidden nouns ("text, letters, logos, people") as **positive** conditioning, which
> invited exactly what it forbade. `sceneBackgroundPrompt` now returns the positive prompt and
> the exclusions separately, so each provider can place them correctly.
>
> Note that `sceneBackgroundCacheKey` hashes the prompt and model but **not** the pixel size,
> so a parameter-only change needs `--regenerate-backgrounds` to take effect.

## Free-tier token budgets

Groq's `on_demand` tier counts **input and output against one per-minute budget** (8,000 TPM
for `openai/gpt-oss-120b`). Four things keep planning inside it:

1. **Compact shape, not JSON Schema** — `schema-prompt.ts`, ~4x smaller.
2. **Per-run pruning** — `narrationResponseShapeFor` drops treatments the run cannot use
   (no code sources, images disabled, no numbers in the source). Measured: 6,695 → 4,946
   prompt tokens on a short source.
3. **`reasoning_effort: 'low'`** on Groq — gpt-oss spends a large share of the completion
   budget on reasoning tokens. Scoped to Groq because other compat endpoints reject unknown
   fields; override with `AI_REASONING_EFFORT`.
4. **The repair loop no longer echoes the rejected plan back.** Re-sending it roughly doubled
   the request, so every retry returned 413 — the loop could never recover from the failure it
   exists to fix.
5. **The `character-scene` prompt rules were cut from 1,794 to 1,208 chars** (~146 tokens)
   without dropping a rule, by moving the bookkeeping the sanitizer already repairs out of the
   prompt.

A lost character scene triggers **at most one** extra planning attempt per run
(`narration-planner.ts`). On Groq that retry is a second full-prompt request inside the same
per-minute window and can itself return 413, which is why the prompt savings above matter more
here than they look.

A working run measures ~4,946 prompt + ~1,964 completion = ~6,910 of 8,000. Headroom is real
but thin: a source much longer than ~400 tokens will need a paid tier or a provider with a
larger budget.

> **Groq reports a window overrun as `413`, not `429`.** The message contains
> `on tokens per minute (TPM)`. `isTransientError` (`ai-client.ts:87`) treats that specific
> 413 as retryable and waits out the window; a genuine `Request Entity Too Large` stays fatal,
> since waiting cannot shrink a payload.

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
