import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import type {SubtitleCue} from './types.js';
import {subtitleCueSchema} from './types.js';

const TIMESTAMP_LINE =
  /^(\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{3}(?:\s+.*)?$/;

const TIMESTAMP = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{3})$/;

const decodeEntities = (value: string): string =>
  value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");

const cleanSubtitleText = (lines: string[]): string =>
  decodeEntities(lines.join(' ').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

export const parseTimestamp = (value: string): number => {
  const match = TIMESTAMP.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid subtitle timestamp: ${value}`);
  }

  const [, hours = '0', minutes, seconds, milliseconds] = match;
  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1_000 +
    Number(milliseconds)
  );
};

export const parseSubtitles = (contents: string): SubtitleCue[] => {
  const normalized = contents
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();

  if (!normalized) {
    throw new Error('Subtitle file is empty.');
  }

  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const timestampIndex = lines.findIndex((line) => TIMESTAMP_LINE.test(line));
    if (timestampIndex === -1) {
      continue;
    }

    const timing = lines[timestampIndex];
    if (!timing) {
      continue;
    }

    const [rawStart, rawEndWithSettings] = timing.split(/\s*-->\s*/);
    const rawEnd = rawEndWithSettings?.split(/\s+/)[0];
    if (!rawStart || !rawEnd) {
      throw new Error(`Invalid subtitle timing line: ${timing}`);
    }

    const startMs = parseTimestamp(rawStart);
    const endMs = parseTimestamp(rawEnd);
    if (endMs <= startMs) {
      throw new Error(`Subtitle cue ends before it starts: ${timing}`);
    }

    const text = cleanSubtitleText(lines.slice(timestampIndex + 1));
    if (!text) {
      continue;
    }

    const precedingLine = lines[timestampIndex - 1];
    const sourceIndex =
      precedingLine && !TIMESTAMP_LINE.test(precedingLine)
        ? precedingLine
        : String(cues.length + 1);

    cues.push(
      subtitleCueSchema.parse({
        cueIndex: cues.length + 1,
        sourceIndex,
        startMs,
        endMs,
        text,
      }),
    );
  }

  if (cues.length === 0) {
    throw new Error('No SRT or WebVTT subtitle cues were found.');
  }

  for (let index = 1; index < cues.length; index += 1) {
    const previous = cues[index - 1];
    const current = cues[index];
    if (previous && current && current.startMs < previous.startMs) {
      throw new Error('Subtitle cues must be ordered by start time.');
    }
  }

  return cues;
};

export const readSubtitleFile = async (filePath: string): Promise<SubtitleCue[]> => {
  const extension = extname(filePath).toLowerCase();
  if (extension !== '.srt' && extension !== '.vtt') {
    throw new Error('Subtitle path must point to an .srt or .vtt file.');
  }

  return parseSubtitles(await readFile(filePath, 'utf8'));
};

export const formatTimestamp = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
};
