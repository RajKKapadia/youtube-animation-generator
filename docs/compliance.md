# Security, Licensing, and Compliance

← [AGENTS.md](../AGENTS.md) · `THIRD_PARTY_NOTICES.md` is authoritative · Verified at `d1e65f3`

Read this before shipping output externally or changing dependencies.

## Credential handling

- `OPENAI_API_KEY` is read from the environment only. `.env` is gitignored; `.env.example`
  carries empty placeholders.
- **Never commit a key, echo one into logs, or embed one in a plan file.**
- Plans, timed plans, and scripts are plain JSON/Markdown and may be committed. They contain
  source text — apply normal data-classification judgement before committing customer content.

## Third-party obligations

| Component | Licence | Obligation |
|---|---|---|
| **Remotion 4.0.515** | **Eligibility-based free / company licence** | ⚠️ **Not unconditionally free.** Commercial or company use may require a paid licence. Confirm eligibility at <https://www.remotion.dev/license> before shipping output commercially. |
| **Supertonic 3 model** | **OpenRAIL-M** | ⚠️ Carries **use restrictions that follow model-derived output**. Review the model card before distributing generated audio. |
| Supertone helper (`src/supertonic/upstream-helper.ts`) | MIT | Retain copyright notice |
| `lottie-web` 5.13.0 | MIT | Retain notice |
| `lucide-react` | ISC | Retain notice |
| Simple Icons 16.28.0 | CC0 1.0 | ⚠️ **CC0 does not waive trademark rights.** Each brand mark needs review against the owner's current guidelines and the Simple Icons disclaimer. |
| Curated external icons | Per-asset | Recorded in `assets/icons/manifest.json`. Required credits are carried into generated publish descriptions and Markdown sidecars automatically. |
| `assets/motion/ai-agent-pulse.json` | Project-authored | Provenance and use policy in `assets/motion/manifest.json` |

> **Agent rule.** The Remotion and OpenRAIL-M items are the two that can create real legal
> exposure. Surface them to a human before any commercial or external distribution of output.
> Do not silently assume the free tier applies.

## Supply chain controls

`pnpm-workspace.yaml` allowlists post-install builds for exactly two packages — `esbuild` and
`onnxruntime-node` — and pins a `minimumReleaseAgeExclude` list for the Remotion 4.0.515 family.
**Do not broaden `allowBuilds` casually**; it is a deliberate control.

External icons and animations are **never fetched at runtime**. Saved-plan rendering validates
checked-in manifests and hashes, copies only referenced files into a temporary staging
directory, and removes it afterwards.

## Cost controls

Three flags bill the account. All default to off/free:

| Flag | Default | Cost |
|---|---|---|
| `--scene-background generated` | `ambient` (free, drawn in code) | **Image API**, per scene per aspect ratio |
| `--generated-visuals auto` | `off` | **Image API**, per visual |
| `--research auto\|required` | `off` | Tokens + billed web-search tool calls |

Require explicit human authorisation before enabling any of them.
