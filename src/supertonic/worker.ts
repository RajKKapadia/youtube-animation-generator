import {chunkText, loadTextToSpeech, loadVoiceStyle} from './upstream-helper.js';
import {validateSupertonicAssets} from './assets.js';
import {supertonicJobSchema} from './protocol.js';
import {synthesizeJob} from './synthesis.js';

const main = async () => {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  const job = supertonicJobSchema.parse(JSON.parse(input));
  const assets = await validateSupertonicAssets(job.assetsDirectory, job.voice);

  // The protocol reserves stdout for its single JSON response.
  console.log = (...values: unknown[]) => {
    process.stderr.write(`${values.map(String).join(' ')}\n`);
  };

  const tts = await loadTextToSpeech(assets.onnxDirectory, false) as unknown as {
    sampleRate: number;
    call: (
      text: string,
      language: string,
      style: unknown,
      steps: number,
      speed: number,
      silenceDuration?: number,
    ) => Promise<{wav: number[]; duration: number[]}>;
  };
  const style = loadVoiceStyle([assets.voiceStylePath]);
  const result = await synthesizeJob(job, {
    sampleRate: tts.sampleRate,
    synthesize: async (text, language, steps, speed) => {
      const chunks = chunkText(
        text,
        language === 'ko' || language === 'ja' ? 120 : 300,
      ) as string[];
      const parts: Float32Array[] = [];
      const silenceSamples = Math.round(tts.sampleRate * 0.15);
      let totalSamples = 0;
      for (const [chunkIndex, chunk] of chunks.entries()) {
        if (chunkIndex > 0) {
          parts.push(new Float32Array(silenceSamples));
          totalSamples += silenceSamples;
        }
        const synthesis = await tts.call(chunk, language, style, steps, speed, 0);
        const durationSeconds = synthesis.duration[0];
        if (durationSeconds === undefined) {
          throw new Error('Supertonic did not return a duration.');
        }
        const sampleCount = Math.round(durationSeconds * tts.sampleRate);
        if (sampleCount > synthesis.wav.length) {
          throw new Error('Supertonic returned fewer PCM samples than its duration.');
        }
        const part = Float32Array.from(synthesis.wav.slice(0, sampleCount));
        parts.push(part);
        totalSamples += part.length;
      }
      const audio = new Float32Array(totalSamples);
      let offset = 0;
      for (const part of parts) {
        audio.set(part, offset);
        offset += part.length;
      }
      return {audio, durationSeconds: totalSamples / tts.sampleRate};
    },
  });

  process.stdout.write(`${JSON.stringify(result)}\n`);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`Supertonic worker failed: ${message}\n`);
  process.exitCode = 1;
});
