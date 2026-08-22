import {describe, expect, it} from 'vitest';
import {technologyIconKindFor} from './technology.js';

describe('technologyIconKindFor', () => {
  it.each([
    ['Receive YouTube URL', 'youtube'],
    ['docker compose up --build', 'docker'],
    ['Run Python worker', 'python'],
    ['Save metadata to PostgreSQL', 'postgresql'],
    ['Queue background job in Redis', 'redis'],
    ['Start Qdrant', 'qdrant'],
    ['Run FastAPI application', 'fastapi'],
    ['Convert video to audio', 'ffmpeg'],
    ['Generate answer with LLM', 'ai'],
    ['Retrieve relevant information', 'search'],
  ] as const)('matches %s to the %s visual', (label, expected) => {
    expect(technologyIconKindFor(label)).toBe(expected);
  });

  it('uses a generic system glyph for unknown labels', () => {
    expect(technologyIconKindFor('Validate the result')).toBe('generic');
  });
});
