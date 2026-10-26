# Third-party notices

## Optional animation and recorded-audio runtimes

Setup keeps these checkouts and their license files in ignored `.animation-tools/`;
the application does not vendor the StykAnimate editor into its React bundle.
Distribution of a tool installation must retain its upstream notices and satisfy
that tool's license. Separate-process execution is an architecture choice, not a
claim that it removes license obligations.

- HyperFrames 0.8.201: Apache-2.0, https://github.com/heygen-com/hyperframes.
- Text-to-Lottie source/player: MIT, https://github.com/diffusionstudio/lottie.
- StykAnimate and its MCP: GPL-3.0-or-later, https://github.com/filippocalippo/StykAnimate-App and https://github.com/ghassenTn/stykanimate-mcp.
- GSAP 3.13.0: its Standard no-charge license, https://gsap.com/standard-license.
- Inter bundled with the player: SIL Open Font License; retain the upstream font notice when distributing native animation sources.
- CanvasKit/Skia and their dependencies retain the notices supplied with `canvaskit-wasm` and the upstream player.
- Faster-Whisper: MIT, https://github.com/SYSTRAN/faster-whisper. Whisper model files retain their upstream model license and provenance. PyAV/FFmpeg retain their separately supplied notices.
- Curated SVG outlines adapted from Lucide retain the existing Lucide ISC notice.

Recorded-voice acceptance uses the public `tests/jfk.flac` test fixture from
https://github.com/openai/whisper. Audio is downloaded only for verification and
is not committed to this repository. Recipe/provider tests use mocked authoring;
local fixture exports and assembly do not make paid API calls.

## Remotion and @remotion/lottie

Narrated rendering and synchronized Lottie playback use Remotion 4.0.515 and `@remotion/lottie` 4.0.515:

https://www.remotion.dev/license

Remotion uses eligibility-based free and company license terms. Confirm that the intended use qualifies or obtain the appropriate company license.

## Lottie-web

`lottie-web` 5.13.0 provides the vector animation runtime used by `@remotion/lottie`:

https://github.com/airbnb/lottie-web

MIT License

Copyright (c) 2015 Bodymovin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Simple Icons

Product marks are sourced from Simple Icons 16.28.0 under CC0 1.0. CC0 does not waive trademark rights. Every mark still needs review against the brand owner's current guidelines and any icon-specific disclaimer:

https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md

## Project-authored Lottie assets

`assets/motion/ai-agent-pulse.json` was authored for this repository. Its provenance, attribution, palette mapping, and use policy are recorded in `assets/motion/manifest.json`.

## Curated external icon assets

External SVG icons are not fetched at runtime. When present, their source, creator,
license, attribution requirement, and video-credit text are recorded per asset in
`assets/icons/manifest.json`. Required credits for icons actually used by a plan are
also carried into its generated publish description and Markdown sidecar.

## Lucide Icons

Semantic fallback icons are provided by `lucide-react`:

https://lucide.dev/

ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

## Supertone Supertonic Node helper

`src/supertonic/upstream-helper.ts` is adapted from Supertone Inc.'s `nodejs/helper.js`:

https://github.com/supertone-inc/supertonic/blob/main/nodejs/helper.js

MIT License

Copyright (c) 2025 Supertone Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Supertonic 3 model

The model files are not included in this repository. They are downloaded separately from Hugging Face and are licensed under OpenRAIL-M. Review the model repository's `LICENSE` before use:

https://huggingface.co/Supertone/supertonic-3
