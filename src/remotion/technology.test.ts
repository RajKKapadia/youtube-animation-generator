import {describe, expect, it} from 'vitest';
import {
  exactTechnologyBrandIconFor,
  resolveTechnologyBrandIcons,
} from '../technology-catalog.js';
import {technologyBadgeSourceFor} from './TechnologyBadge.js';
import {technologyIconKindFor} from './technology.js';

describe('technologyIconKindFor', () => {
  it.each([
    ['Generate answer with LLM', 'ai'],
    ['Retrieve relevant information', 'search'],
    ['Deploy service to AWS', 'cloud'],
    ['Start the container service', 'server'],
    ['Open the frontend UI', 'web'],
    ['Authenticate with OAuth credentials', 'auth'],
    ['Encrypt secrets with TLS', 'security'],
    ['Cache the response in Redis', 'cache'],
    ['Email the invoice document', 'email'],
    ['Observe service health', 'monitoring'],
    ['Retry the failed webhook', 'webhook'],
    ['Recover with bounded retries', 'retry'],
    ['Schedule a nightly export', 'schedule'],
    ['Upload the source artifact', 'upload'],
    ['Charge a card at checkout', 'payment'],
  ] as const)('matches %s to the %s visual', (label, expected) => {
    expect(technologyIconKindFor(label)).toBe(expected);
  });

  it('uses a generic system glyph for unknown labels', () => {
    expect(technologyIconKindFor('Validate the result')).toBe('generic');
    expect(technologyIconKindFor('Immediate coupling')).toBe('generic');
  });

  it('uses a resolved product brand before the semantic fallback', () => {
    const label = 'Build the React interface';
    expect(technologyIconKindFor(label)).toBe('generic');
    expect(technologyBadgeSourceFor(label, resolveTechnologyBrandIcons([label])))
      .toBe('brand');
  });

  it('keeps brand-showcase matching exact or explicitly aliased', () => {
    expect(exactTechnologyBrandIconFor('React')?.slug).toBe('react');
    expect(exactTechnologyBrandIconFor('React platform')).toBeUndefined();
    expect(exactTechnologyBrandIconFor('Postgres')?.slug).toBe('postgresql');
  });
});
