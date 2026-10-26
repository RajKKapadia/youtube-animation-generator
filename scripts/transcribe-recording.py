"""Local-only worker. Model download belongs exclusively to setup-animation-tools.mjs."""
import json
import sys
import os
from faster_whisper import WhisperModel

with open(sys.argv[1], encoding="utf-8") as handle:
    job = json.load(handle)
model_path = os.path.join(job["models"], "models--Systran--faster-whisper-small", "snapshots", "536b0662742c02347bc0e980a01041f333bce120")
if not os.path.isdir(model_path):
    raise RuntimeError("Pinned small model is missing; run tools setup alignment.")
model = WhisperModel(model_path, device="cpu", compute_type="int8", local_files_only=True)
segments, info = model.transcribe(job["audio"], language=job["language"], word_timestamps=True, beam_size=5, vad_filter=True)
words = [{"word": word.word, "startMs": round(word.start * 1000), "endMs": round(word.end * 1000), "probability": word.probability} for segment in segments for word in (segment.words or [])]
with open(job["output"], "w", encoding="utf-8") as handle:
    json.dump(words, handle, ensure_ascii=False, indent=2)
