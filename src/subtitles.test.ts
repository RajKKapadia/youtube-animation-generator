import {describe, expect, it} from 'vitest';
import {formatTimestamp, parseSubtitles, parseTimestamp} from './subtitles.js';

describe('parseTimestamp', () => {
  it('parses SRT and WebVTT timestamps', () => {
    expect(parseTimestamp('01:02:03,456')).toBe(3_723_456);
    expect(parseTimestamp('02:03.456')).toBe(123_456);
  });
});

describe('parseSubtitles', () => {
  it('parses multiline SRT cues and strips markup', () => {
    const cues = parseSubtitles(`1
00:00:01,000 --> 00:00:03,500
The request reaches <b>the API</b>.

2
00:00:03,500 --> 00:00:06,000
The API queues the job.
It runs later.`);

    expect(cues).toEqual([
      {
        cueIndex: 1,
        sourceIndex: '1',
        startMs: 1_000,
        endMs: 3_500,
        text: 'The request reaches the API.',
      },
      {
        cueIndex: 2,
        sourceIndex: '2',
        startMs: 3_500,
        endMs: 6_000,
        text: 'The API queues the job. It runs later.',
      },
    ]);
  });

  it('parses WebVTT cues with positioning settings', () => {
    const cues = parseSubtitles(`WEBVTT

intro
00:01.000 --> 00:03.000 position:50%
Hello &amp; welcome`);

    expect(cues[0]).toMatchObject({
      sourceIndex: 'intro',
      startMs: 1_000,
      endMs: 3_000,
      text: 'Hello & welcome',
    });
  });

  it('rejects files without cues', () => {
    expect(() => parseSubtitles('not subtitles')).toThrow(
      'No SRT or WebVTT subtitle cues were found.',
    );
  });
});

describe('formatTimestamp', () => {
  it('formats timestamps for prompts', () => {
    expect(formatTimestamp(3_723_456)).toBe('01:02:03');
  });
});
