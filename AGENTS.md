# AGENTS.md

Operating guide for agents in this repo. Keep this file small — it loads into every session.
Detailed references live in [`docs/`](docs/) and are read **on demand**; the routing table
below says which one to open.

**Verified:** 2026-09-16 · `c47ea13` + multi-provider changes · darwin-arm64, Node 26.5.0, pnpm 11.22.0
**Owner:** _Unassigned — populate before using this for onboarding._

---

## What this is

A private TypeScript CLI (v0.9.0) that turns prose or subtitles into **narrated MP4s**,
**animated subtitle overlays**, and **publish kits** (covers + metadata).

No server, no database, no deployment. Every operation is a CLI call that reads files and
writes sibling files. There is **no CI in-repo** — quality gates are manual.

## The one thing to understand

> **A plan JSON is the contract between the AI half and the deterministic half.**

```
source.md ──(AI provider, billed)──► plan.json ──(Supertonic + Remotion, offline)──► .mp4
                                        ▲
                             hand-writable and editable
```

Authoring a plan needs a provider key. **Everything downstream of a plan is free, offline, and
reproducible.** So `--render-plan` is the primary development affordance — it skips authoring
entirely. Timing is *derived from measured speech*, never declared: a longer sentence
mechanically holds its shot longer.

**Providers are pluggable.** Script generation runs on OpenAI, Gemini, or Groq; image
generation on Cloudflare Workers AI or OpenAI. Both auto-detect from whichever keys are
present, and `AI_PROVIDER` / `IMAGE_PROVIDER` override. One exception: `--research` requires
`OPENAI_API_KEY` specifically — it uses OpenAI-hosted web search, which the other providers do
not expose. → [`docs/providers.md`](docs/providers.md)

## Quickstart

```bash
pnpm install
pnpm check && pnpm test          # both gates: no key, no model, no browser needed
```

Rendering additionally needs Chrome declared explicitly (macOS probes Linux paths only):

```bash
export REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Prove the render path works offline, then look at the output:

```bash
pnpm fixtures:explainers -- /tmp/gallery --stills-only && open /tmp/gallery/index.html
```

## Guardrails

These apply before you read anything else.

**Never, without explicit human authorisation**

1. Enable `--scene-background generated`, `--generated-visuals auto`, or
   `--research auto|required`. Each bills whichever provider is active; the first two generate
   images and are the most expensive thing in the repo. Narrated video defaults to `ambient`,
   drawn in code and free — keep it.
2. Commit `models/supertonic-3/`, `.env`, `dist/`, or `.remotion/`.
3. Broaden `allowBuilds` in `pnpm-workspace.yaml` (a deliberate supply-chain control).
4. Assume Remotion's licence is free for commercial output — it is **eligibility-based**. Same
   for the OpenRAIL-M TTS model, whose use restrictions follow generated audio.
   → [`docs/compliance.md`](docs/compliance.md)
5. Run `pnpm fixtures:layouts` or `pnpm fixtures:subtitle-visuals` on macOS — they hardcode a
   Linux Chrome path and cannot work. → [`docs/troubleshooting.md`](docs/troubleshooting.md)
6. Modify source purely to make your local environment work. Report the defect instead.

**Always**

1. Validate before rendering — seconds vs. minutes:
   `pnpm run animations create --render-plan <plan.json> --plan-only`
2. Run `pnpm check && pnpm test` before declaring work done.
3. Ground claims in `file:line`. Code moves; re-verify rather than trusting these docs blindly.
4. Prefer `--render-plan` / `--plan-only` over anything that authors a new plan.

**Useful invariant.** Every provider client throws when its key is unset (`ai-client.ts:44-77`),
and no other module reaches the network. So if a command exits 0 with no provider keys in the
environment, it provably made no billed API call.

## Where to find things

| You need to… | Read |
|---|---|
| Set up the machine, install the TTS model, fix Chrome | [`docs/setup.md`](docs/setup.md) |
| Understand the pipeline, subsystems, or where a module lives | [`docs/architecture.md`](docs/architecture.md) |
| Write or edit a plan JSON — schemas, enums, limits, versioning | [`docs/plan-schema.md`](docs/plan-schema.md) |
| Look up a CLI command, flag, fixture script, or output path | [`docs/commands.md`](docs/commands.md) |
| Diagnose an error, or check if it's a known defect | [`docs/troubleshooting.md`](docs/troubleshooting.md) |
| Configure or debug an AI / image provider | [`docs/providers.md`](docs/providers.md) |
| Ship output externally, or touch dependencies | [`docs/compliance.md`](docs/compliance.md) |
| Run the gates, branch, commit, or re-verify these docs | [`docs/contributing.md`](docs/contributing.md) |

[`README.md`](README.md) (~51 KB) remains the user-facing feature manual and is authoritative
for CLI behaviour. These docs cover what it doesn't: architecture, contracts, defects, and
compliance.

**Maintenance rule.** Every claim in `docs/` is grounded in a `file:line` or a reproducible
command. If you change referenced code, update the doc in the same change set.
