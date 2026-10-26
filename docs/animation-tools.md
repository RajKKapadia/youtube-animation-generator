# Animation tools and recorded voiceovers

The staged commands keep Remotion as the final compositor. HyperFrames supplies
HTML motion graphics, Text-to-Lottie supplies editable Skottie/Lottie animation,
and StykAnimate supplies editable character projects through a separate MCP
process. Recipes are bounded data, not arbitrary provider-authored programs.

Implementation: `src/animation-tools.ts:49` (both authoring providers),
`src/animation-tools.ts:67` (local export), `src/project-workflow.ts:61`
(preparation), `src/recording-alignment.ts:26` (matching). The fixture commands
below are reproducible verification, without paid authoring.

## One-time setup

Use Node 22.13+, local Chrome, FFmpeg/ffprobe, Git/npm, and Python 3.12 with venv.
Setup explicitly downloads optional tools and the transcription model; it never
runs as a side effect of rendering. Dependency locks and source revisions are in
`scripts/`; the root pnpm build allowlist is unchanged.

```bash
pnpm animations tools setup
pnpm animations tools verify
pnpm animations tools doctor
```

You can install individual tools, for example `tools setup lottie` or
`tools setup alignment`. Set `REMOTION_BROWSER_EXECUTABLE` when Chrome is not in
the standard Linux/macOS locations. `ANIMATION_TOOLS_DIR` overrides the ignored
`.animation-tools/` directory. StykAnimate is eligible for automatic selection
only after its local verification proof passes for the pinned version.

Pinned sources: HyperFrames 0.8.201; GSAP 3.13.0; Text-to-Lottie
`3c72912fad543897f90045ed4d355813837927fc`; StykAnimate
`def97214c2b491fbce82647f625a73f78416c6d8`; StykAnimate MCP
`2ca2f1044bbfc1fd5ab09660662a8188456cd715`. Faster-Whisper 1.2.1 uses
the multilingual `small` model at revision
`536b0662742c02347bc0e980a01041f333bce120`, CPU INT8. The Python lock
pins PyAV 16.0.1 because PyAV 19 removed an API Faster-Whisper 1.2.1 calls.

## Prepare, record, assemble, publish

```bash
pnpm animations prepare /absolute/path/summary.md --aspect-ratio both
```

Preparation writes `project.json`, `draft.narration-plan.json`, `script.md`,
`storyboard.json`, editable files under `animations/`, and silent
`draft.mp4` / `draft-9x16.mp4`. `--plan-only` omits MP4 and frame-sequence exports;
native-source authoring may still need the selected tools. Source/script and
recipe authoring use the configured AI provider and incur its normal costs.
Image generation and research retain their existing explicit opt-in flags.

Read `script.md` and record it. To revise wording, edit the canonical draft plan
and review its script before recording; editing the Markdown alone does not
change the plan. Put one WAV, MP3, M4A, FLAC, or OGG in `recording/`:

```bash
pnpm animations assemble /absolute/path/summary-video
```

Or provide `--voiceover /absolute/path/recording.wav`. Assembly preserves an
original copy, writes a PCM playback copy, transcribes locally, and matches words
monotonically to the script. It saves `alignment/words.json` and `report.json`,
retimes each beat, reexports native animations, and renders final MP4s. Pauses
are retained; the recording determines duration and is never sped up. The
existing TTS duration limit remains in effect for TTS videos.

Matching is conservative: at least 90% overall token coverage and 80% per phrase,
no conflicting content words, no uncertain word below 0.35 probability, and
chronological timestamps. Function-word differences and fillers are allowed.
Missing sections, repeated takes, changed quantities, and uncertain alignment
stop assembly with a reviewable report. This is lexical validation, not a claim
of perfect semantic understanding or acoustic timing accuracy.

After reviewing an ASR error, supply corrected word timestamps:

```bash
pnpm animations assemble /absolute/path/summary-video --alignment /absolute/path/words.json
```

The JSON is an array of `{word, startMs, endMs, probability}`; probability may be
omitted for a manually reviewed transcript. Assembly never downloads a model or
calls an AI provider. Native sources retain their named cue anchors when edited.
Unsupported edits or changed beat IDs require preparation again.

```bash
pnpm animations publish /absolute/path/summary-video
```

Publishing authors metadata separately, then renders covers using the selected
animation frame. Existing plan-file publishing still works. Use
`--render-publish /absolute/path/metadata.json` to render edited metadata offline.
Only generated outputs are replaced during staged resume; original recordings
and editable sources are retained. Input/content hashes invalidate later stages.

## Selection and compatibility

`prepare` defaults to `--animation-tools auto`; `create` keeps its original
behavior unless these options are supplied:

```bash
pnpm animations prepare /absolute/path/summary.md --animation-tools hyperframes,lottie
pnpm animations prepare /absolute/path/summary.md --animation-tools off
pnpm animations prepare /absolute/path/summary.md --scene-tool introduction=lottie --scene-tool conversation=stykanimate
pnpm animations create /absolute/path/summary.md --animation-tools auto
```

`--scene-tool id=builtin` retains an existing visual. Unknown scene IDs fail.
Automatic choices fall back with persisted warnings; forced choices fail visibly.
StykAnimate requires a grounded `character-scene`; sets, held props, and callouts retain the existing treatment through fallback, or fail when forced. Current recipes cover kinetic
text, comparisons, diagrams/charts, curated SVG icon reveals/pulses, and character
gestures. Code walkthroughs and unrelated treatments continue using built-in visuals. Use explicit prepare/assemble review for tool-enabled projects; legacy `create --review` remains available without animation-tool options.
Text-to-Lottie is adapted through its recipe guidance and official player; there
is no external coding-agent CLI dependency or claimed standalone upstream API.

Version 8 plans contain optional project-local `animationAssets`; timed recorded
plans carry original/playback hashes and recorded-audio metadata rather than
invented TTS settings. `narratedPlanSchema` reads versions 1–7 as version 8.
Saved-plan rendering validates hashes and frame count/FPS/profile; it never
regenerates missing animation sources. Reassemble to incorporate native edits.

## Verification

```bash
pnpm check && pnpm test
pnpm fixtures:animation-tools
```

The ordinary tests need no browser, provider, or model. Adapter verification
exports both orientations and checks the Lottie source in the official upstream
player. It writes source projects, frames, and a player screenshot under
`.animation-tools/verification/`.

If the local pnpm launcher stalls while switching versions, run the same scripts
with `env npm_config_manage_package_manager_versions=false pnpm <script>` using
the installed pnpm, or use `node --import tsx src/cli.ts <arguments>` for the CLI.
The verification run used that environment override; the repository's package
manager pin and build allowlist were preserved.

An included hand-authored plan matches the public human recording in
[OpenAI Whisper's JFK fixture](https://github.com/openai/whisper/blob/main/tests/jfk.flac):

```bash
curl -L https://raw.githubusercontent.com/openai/whisper/main/tests/jfk.flac -o /tmp/jfk.flac
pnpm animations prepare --render-plan fixtures/recording-jfk.narration-plan.json --output-dir samples/voice-proof --aspect-ratio both --fps 15 --scene-tool hyperframes=lottie --scene-tool lottie=hyperframes --scene-tool stykanimate=stykanimate
pnpm animations assemble samples/voice-proof --voiceover /tmp/jfk.flac
```

These commands exercise all three forced tools, local real-speech alignment,
and 1920×1080 / 1080×1920 final MP4s. Fixture scene IDs name their original
adapter-test slots; the explicit overrides intentionally select the listed tools.
Use your own recording for acceptance of your content and delivery.
