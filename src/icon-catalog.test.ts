import {describe, expect, it} from 'vitest';
import {
  semanticIconIdForText,
  semanticIconRelevanceScore,
} from './icon-catalog.js';

describe('semantic icon catalog', () => {
  it('prefers a standard over chat or generic hardware for a hardware standard', () => {
    expect(semanticIconIdForText('Model Hardware Standard')).toBe('standard-protocol');
    expect(
      semanticIconRelevanceScore('standard-protocol', 'A common language for hardware'),
    ).toBeGreaterThan(0);
    expect(
      semanticIconRelevanceScore('message-chat', 'A common language for hardware'),
    ).toBe(0);
  });

  it.each([
    ['CPU execution', 'hardware-cpu'],
    ['GPU accelerator', 'hardware-accelerator'],
    ['Memory bandwidth', 'hardware-memory'],
    ['Message queue', 'queue'],
    ['AI model inference', 'ai-model'],
    ['Memory safety', 'security'],
    ['Near-C / C++ performance', 'hardware-cpu'],
    ['Single native executable', 'code'],
    ['Concurrency and system work', 'automation-workflow'],
    ['AI-assisted migration', 'ai-agent'],
    ['Tests, benchmarks, and review', 'analytics-chart'],
    ['Mixed-language product', 'standard-compatible'],
    ['Rust performance core', 'hardware-cpu'],
  ] as const)('maps %s to %s', (text, expected) => {
    expect(semanticIconIdForText(text)).toBe(expected);
  });
});
