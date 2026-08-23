import {writeFile} from 'node:fs/promises';

export const encodePcm16Wav = (
  audioData: ArrayLike<number>,
  sampleRate: number,
): Buffer => {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error('WAV sample rate must be a positive integer.');
  }

  const dataSize = audioData.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < audioData.length; index++) {
    const sample = Math.max(-1, Math.min(1, audioData[index] ?? 0));
    const integer = sample < 0
      ? Math.round(sample * 32_768)
      : Math.round(sample * 32_767);
    buffer.writeInt16LE(integer, 44 + index * 2);
  }
  return buffer;
};

export const writePcm16Wav = async (
  filePath: string,
  audioData: ArrayLike<number>,
  sampleRate: number,
): Promise<void> => {
  await writeFile(filePath, encodePcm16Wav(audioData, sampleRate));
};

export const trimSynthesizedWaveform = (
  audioData: ArrayLike<number>,
  durationSeconds: number,
  sampleRate: number,
): Float32Array => {
  const requestedSamples = Math.round(durationSeconds * sampleRate);
  if (!Number.isFinite(durationSeconds) || requestedSamples <= 0) {
    throw new Error('Supertonic returned an invalid audio duration.');
  }
  if (requestedSamples > audioData.length) {
    throw new Error(
      `Supertonic reported ${requestedSamples} samples but returned ${audioData.length}.`,
    );
  }
  return Float32Array.from(
    Array.from({length: requestedSamples}, (_, index) => audioData[index] ?? 0),
  );
};
