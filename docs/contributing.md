# Contributing and Verification

← [AGENTS.md](../AGENTS.md) · Verified at commit `d1e65f3`

## Quality gates

Both must pass with **no API key, no model, and no browser**:

```bash
pnpm check     # tsc -p tsconfig.json --noEmit
pnpm test      # vitest run
```

Baseline after the multi-provider change: `check` exit 0; `test` 334 passed / 334, 39 files,
≈ 1.6 s.

`pnpm build` (`tsc -p tsconfig.json`) emits `dist/` and is the packaging step for the
`youtube-animations` bin entry.

**Test discipline.** No test touches the network, a browser, or the TTS model. Preserve this —
put rendering coverage in fixture scripts, not the unit suite.

If you changed rendering, also render the gallery and **visually inspect it**:

```bash
export REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
pnpm fixtures:explainers -- /tmp/gallery --stills-only
open /tmp/gallery/index.html
```

## Workflow

Conventions inferred from repository history (`git log`):

- **Branches:** `codex/<kebab-case-description>`
  (e.g. `codex/fix-text-color-for-non-narrative-animations`)
- **Integration:** GitHub pull requests merged to `main`; merge commits retained
- **Commit subjects:** imperative, sentence case, no Conventional Commits prefix —
  *"Make non-narrative green-screen text chroma-key safe"*,
  *"Prevent flashes in directed scene title lead-ins"*
- **Before opening a PR:** run the gates above; if rendering changed, inspect fixture output

## Verifying these docs

Every claim in `docs/` is mechanically re-derivable. Run these after code changes and update
whatever drifted:

```bash
# architecture.md — egress inventory (all billed network calls)
grep -rn "new OpenAI(\|createAIClient(\|fetch(" src/ --include='*.ts' | grep -v test

# providers.md — resolution order
sed -n '11,35p' src/ai-client.ts                 # script provider + model defaults
grep -n "createDefaultImageGenerator" -A 12 src/scene-backgrounds.ts | head -16
grep -n "createDefaultVisualValidator" -A 8 src/generated-visuals.ts | head -10

# providers.md — every planner must branch on provider (Responses API vs chat.completions)
grep -rn "aiInfo.provider === 'openai'" src/ --include='*.ts'

# architecture.md — scale (expect 77 / 39)
find src -name '*.ts*' -not -name '*.test.*' | wc -l
find src -name '*.test.ts*' | wc -l

# setup.md, commands.md, troubleshooting.md — browser resolution per module
grep -rn "REMOTION_BROWSER_EXECUTABLE\|google-chrome-stable" src/ --include='*.ts'

# plan-schema.md — current version and the legacy union
grep -n "narratedPlanSchema = z.union" src/types.ts
grep -n "version: z.literal(7)" src/types.ts

# plan-schema.md — enumerations
sed -n '20,26p' src/types.ts                     # templates
sed -n '3,10p' src/visual-palettes.ts            # palettes
sed -n '3,9p' src/supertonic/expressions.ts      # expressions

# setup.md — required model files
sed -n '5,12p' src/supertonic/assets.ts

# contributing.md — gates
pnpm check && pnpm test

# architecture.md — prove offline operation (must exit 0 with no provider keys)
env -u OPENAI_API_KEY -u GOOGLE_GEMINI_API_KEY -u GROQ_API_KEY -u CLOUDFLARE_AI_KEY pnpm test
```

## Documentation structure

[`AGENTS.md`](../AGENTS.md) is loaded into **every** agent session, so it stays small: what the
repo is, the plan-as-contract model, guardrails, and a routing table. Everything else lives
here and is read on demand.

**When adding docs:** put it in `docs/`, add one row to the AGENTS.md routing table, and keep
AGENTS.md itself under ~120 lines. Resist moving detail up into it — context budget is the
scarce resource.

**When adding a provider:** implement it in `src/ai-client.ts` (or `src/providers/` for a
non-chat API), branch every planner on `aiInfo.provider` if it lacks the Responses API, wrap
calls in `withTransientRetries`, add resolution tests to `src/ai-client.test.ts`, and update
[providers.md](providers.md) plus the egress inventory in
[architecture.md](architecture.md#egress-inventory).

## Glossary

| Term | Meaning |
|---|---|
| **Plan** | Validated JSON describing scenes, items, and spoken phrases. The contract between authoring and rendering. |
| **Draft plan** | A plan without timings, `stage: "draft"`. Hand-editable. |
| **Timed plan** | A plan with per-phrase `startMs`/`durationMs`/`sampleCount`, emitted after synthesis. |
| **Scene** | One visual unit: a template, a title, and up to 6 labelled items. |
| **Beat** | A unit of narration within a scene; carries phrases and the item indices lit while spoken. |
| **Phrase** | One spoken sentence fragment; the atom of timing. |
| **Template** | Layout family for a scene: `process-flow`, `comparison`, `timeline`, `callout`. |
| **Treatment** | An explainer visual style in `ExplainerVisuals.tsx`: kinetic-text, before-after, code-walkthrough, sequence-diagram, layered-architecture, line-chart. |
| **Publish kit** | Generated thumbnail covers plus channel metadata for a finished video. |
| **Ambient background** | Scene backdrop drawn in code — free, offline, the narrated default. |
| **Generated background/visual** | Scene imagery from the OpenAI Image API — **billed**. |
