# Troubleshooting and Known Defects

← [AGENTS.md](../AGENTS.md) · Verified at commit `d1e65f3`

## Symptom matrix

| Symptom | Root cause | Resolution |
|---|---|---|
| `OpenAIError: Missing credentials` | A key-requiring path was reached | Usually intended. Use `--render-plan` / `--render-publish`. Only set a key if authoring is genuinely required. |
| `GOOGLE_GEMINI_API_KEY is required…` / `GROQ_API_KEY is required…` | `AI_PROVIDER` names a provider whose key is unset | Set that key, or change/unset `AI_PROVIDER` |
| `OPENAI_API_KEY is required for web research…` | `--research` is OpenAI-only | Set `OPENAI_API_KEY`, or use `--research off` |
| `sources: Too big: expected array to have <=100 items` | The hosted search returned more URLs than the saved bundle allows; four tool calls do not limit URL count | Fixed by validating citations against the complete results before retaining at most 100 sources, preserving every surviving citation (`source-research.ts:177`). Rerun with the updated code. |
| `Research warning: …` after a failed URL open or an unmatched citation | The tool reported an incomplete/failed action, or a claim cited a URL outside usable results | Failed URLs/citations are excluded; claims with no valid citations are omitted. Other supported claims can continue. Review warnings in the saved research and plan (`source-research.ts:80`, `source-research.ts:177`). |
| `Optional web research was unavailable…` | Research exceeded its 120-second deadline, the provider failed transiently, or output/citations were unusable | `auto` continues using the original source and saves an explicit warning that it has not been web-verified. Use `required` when research must succeed; it stops before planning on the same failure (`source-research.ts:313`, `source-research.ts:476`). |
| `Cached research does not match the current source or settings` | Source/model/mode or the versioned research prompt changed | Use `--refresh-research` to explicitly replace it; this purchases a new research pass. `--force` only controls output replacement (`source-research.ts:160`, `source-research.ts:476`). |
| `CLOUDFLARE_AI_KEY … and CLOUDFLARE_ACCOUNT_ID are required` | Only one Cloudflare var set | Both are needed; routing requires the pair |
| Wrong provider used unexpectedly | Auto-detection picked a key you forgot was set | OpenAI wins script ties, **Cloudflare wins image ties**. Set `AI_PROVIDER` / `IMAGE_PROVIDER` explicitly |
| `Cloudflare image generation failed (…)` | Workers AI rejected the request | Check account ID, token scope, and that the model starts with `@cf/` |
| Repeated plan validation failures on Gemini/Groq | JSON mode is not schema-enforced | Expected; the repair loop retries 3×. Prefer OpenAI for strict schema enforcement |
| `Rate limit reached; waiting …` | Provider quota (common on Gemini free tier) | Automatic — `withTransientRetries` backs off up to 4 times |
| `Supertonic assets are incomplete … (looks like a Git LFS pointer)` | Cloned without Git LFS | `git lfs install`, then re-clone `models/supertonic-3` |
| `Supertonic assets are incomplete … Missing: onnx/…` | Files placed at top level | Layout is nested under `onnx/` — see [setup.md](setup.md#tts-model-acquisition) |
| `spawn ENOENT` on `/usr/bin/google-chrome-stable` | Linux-only path on a macOS host | Export `REMOTION_BROWSER_EXECUTABLE`; if the script ignores it, see below |
| Render silently downloads a browser | Script ignores the env var, falls back to `undefined` | Expected for `fixtures:narrated-layouts`; it is **not** your configured Chrome |
| `corepack: command not found` | Node ≥ 25 unbundled corepack | Use the pnpm already on `PATH` if it matches `packageManager` |
| Plan rejected but "looks right" | Authored against the v4 fixture | Declare `version: 7`; check the limits in [plan-schema.md](plan-schema.md#cardinality-and-length-limits) |
| `comparison` template validation failure | `secondaryItems` is empty | Populate it, or use another template (`types.ts:946`) |
| Video longer than `targetDurationSeconds` | Duration is derived from measured speech | Expected. Shorten `phrases[].text` to shorten the video. |
| Garbled or truncated worker IPC | Something wrote to stdout in worker code | Route all worker logging to stderr (`worker.ts:16`) |
| `Choose either --stills-only or --audio-only, not both.` | Conflicting stage flags | Pick one; they gate different stages |
| A still is missing items the plan defines | You opened the `-mid-` frame | Use the `-final-` frame — the midpoint predates later beats |
| Preview pacing differs from the final video | `--stills-only` estimates timings from word counts | Expected; real renders use measured speech |
| `--review` never pauses | stdin is not a TTY (CI, piped output) | By design. Run it in an interactive terminal |
| Stills regenerate without `--force` | Stills deliberately bypass the overwrite preflight | Expected, so the preview loop stays fast |
| Missing generated image on a timed plan | Cache miss | CLI names the scene and requires explicit `--generated-visuals auto` (**billed**) rather than substituting art |
| `Generated visual for scene … failed relevance validation twice` | Both generated images failed the vision check | The error reports the orientation and rejection reasons (`generated-visuals.ts:413-415`). Check the saved `mediaAssets[].direction`, including the literal/metaphor relationship, framing, and exclusions supplied to both validators (`generated-visuals.ts:178-190`). Resume with `create --render-plan <draft-plan> --generated-visuals auto --force` to skip research and script planning; image generation and vision checks are still billed. |

---

## Known defects

### Hardcoded Linux browser paths

Three scripts do not honour `REMOTION_BROWSER_EXECUTABLE`. They fail in **two materially
different ways.**

**Hard failure (safe).** `src/render-layout-fixtures.ts:44` and
`src/render-subtitle-visual-fixtures.ts:108` assign
`const browserExecutable = '/usr/bin/google-chrome-stable'` unconditionally and pass it
through. On macOS these abort immediately. Unusable, but loudly so.

**Silent divergence (dangerous).** `src/render-narrated-layout-fixtures.ts:313` probes the
three Linux paths with `.find(existsSync)`, yields `undefined` on macOS, and spreads nothing
via `...(browserExecutable ? {browserExecutable} : {})`. Remotion then **downloads and uses its
own Chrome Headless Shell**. The script *succeeds* — while testing a different browser than the
one configured. Treat its output as non-authoritative for browser-specific rendering questions.

*Remediation, if authorised:* each site is a one-line change to the
`process.env.REMOTION_BROWSER_EXECUTABLE ?? [...]` pattern already used at
`render-explainer-fixtures.ts:19`. **Not applied — requires owner approval.**

### No continuous integration

No `.github/workflows`. The gates in [contributing.md](contributing.md#quality-gates) are manual
and therefore skippable. Both are hermetic and fast (≈1.4 s), so they are suitable for CI
adoption without secrets.

### No repository licence file

No `LICENSE` exists; `package.json` sets `private: true`. Distribution terms are undefined.
Resolve before any external distribution. See [compliance.md](compliance.md).

### Upstream TTS project archived

The Supertonic upstream repository announced on **2026-07-23** that it will be archived with no
further open-source model development or official support (README §Supertonic terms). This
project mitigates by pinning the runtime integration and vendoring the helper boundary
(`src/supertonic/upstream-helper.ts`) rather than depending on a moving API. Treat the TTS
subsystem as **frozen** — expect no upstream security patches.
