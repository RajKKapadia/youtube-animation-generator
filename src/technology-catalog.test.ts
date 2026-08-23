import {describe, expect, it} from 'vitest';
import {
  resolveTechnologyBrandIcons,
  technologyBrandIconFor,
} from './technology-catalog.js';

describe('technologyBrandIconFor', () => {
  it.each([
    ['Build the React interface', 'react'],
    ['Compile the TypeScript project', 'typescript'],
    ['Store records in MongoDB', 'mongodb'],
    ['Deploy workers to Kubernetes', 'kubernetes'],
    ['Publish messages through RabbitMQ', 'rabbitmq'],
    ['Style components with Tailwind CSS', 'tailwindcss'],
    ['Publish events to Kafka', 'apachekafka'],
    ['Generate content with Gemini', 'googlegemini'],
    ['Build components with Vue', 'vuedotjs'],
  ] as const)('resolves %s from the complete icon catalog', (label, slug) => {
    expect(technologyBrandIconFor(label)?.slug).toBe(slug);
  });

  it.each([
    ['Store embeddings with pgvector', 'postgresql'],
    ['Deploy the API to k8s', 'kubernetes'],
    ['Run the Node API', 'nodedotjs'],
    ['Build the service with Golang', 'go'],
  ] as const)('supports the common alias in %s', (label, slug) => {
    expect(technologyBrandIconFor(label)?.slug).toBe(slug);
  });

  it('does not treat ordinary workflow words as brands', () => {
    expect(technologyBrandIconFor('Generate the answer')).toBeUndefined();
    expect(technologyBrandIconFor('Make every operation idempotent')).toBeUndefined();
    expect(technologyBrandIconFor('Process the task')).toBeUndefined();
    expect(technologyBrandIconFor('Connect one node to another')).toBeUndefined();
  });
});

describe('resolveTechnologyBrandIcons', () => {
  it('returns a serializable lookup keyed by the original label', () => {
    const icons = resolveTechnologyBrandIcons([
      'Build the React interface',
      'Validate the result',
    ]);

    expect(icons['Build the React interface']).toMatchObject({
      slug: 'react',
      title: 'React',
      hex: '61DAFB',
    });
    expect(icons['Build the React interface']?.path).toBeTruthy();
    expect(icons['Validate the result']).toBeUndefined();
  });
});
