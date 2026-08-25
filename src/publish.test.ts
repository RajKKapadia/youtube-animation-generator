import {describe, expect, it, vi} from 'vitest';
import {
  materializePublishPlan,
  narratedTranscript,
  normalizeGeneratedPublishScene,
  publishKitMarkdown,
} from './publish.js';
import {publishCoverOutputPaths} from './publish-render.js';
import {narratedPlanSchema, narratedPublishPlanSchema} from './types.js';

const narration = narratedPlanSchema.parse({
  version: 3,
  kind: 'narrated-video',
  stage: 'draft',
  sourceText: 'Queues let producers and consumers work independently.',
  generatedAt: '2026-08-25T00:00:00.000Z',
  model: 'fixture',
  targetDurationSeconds: 30,
  language: 'en',
  title: 'Why queues help',
  scenes: [{
    id: 'queue-flow',
    backgroundPrompt: 'Abstract queue flow.',
    template: 'process-flow',
    title: 'A queue decouples work',
    primaryItems: ['Producer', 'Queue', 'Consumer'],
    secondaryItems: [],
    leftLabel: '',
    rightLabel: '',
    reason: 'Shows the work flow.',
    beats: [{
      id: 'queue-beat',
      expression: 'none',
      phrases: [
        {id: 'queue-a', text: 'A queue lets producers'},
        {id: 'queue-b', text: 'and consumers work independently.'},
      ],
      primaryItemIndices: [0, 1, 2],
      secondaryItemIndices: [],
    }],
  }],
});

const response = {
  youtube: {
    title: 'Message Queues Explained with One Practical Visual Flow',
    alternateTitles: [
      'How Queues Keep Producers and Consumers Independent',
      'Understand Message Queues Through a Simple System Design',
    ],
    description:
      'See how a queue separates producers from consumers.\n\n' +
      "What you'll learn:\n- Why queues decouple work\n- How messages flow\n- Where consumers fit",
    tags: [
      'programming',
      'technology',
      'software tutorial',
      'message queues',
      'queue architecture',
      'system design',
      'backend development',
      'producer consumer pattern',
      'asynchronous processing',
      'distributed systems',
      'software architecture',
      'queue tutorial',
      'message broker basics',
      'decouple application services',
      'learn system design visually',
    ],
    hashtags: ['#Queues', 'SystemDesign', 'BackendDevelopment'],
  },
  thumbnail: {
    headline: 'Queues Make Systems Flow',
    eyebrow: 'System Design',
    sceneId: 'queue-flow',
    accent: 'cyan' as const,
  },
};

describe('narrated publish metadata', () => {
  it('materializes copy-ready metadata and strips leading hashtag markers', () => {
    const plan = materializePublishPlan({
      generatedAt: '2026-08-25T00:00:00.000Z',
      language: 'en',
      model: 'fixture',
      response,
      sourcePlan: '/videos/queue.narration-plan.json',
    });

    expect(plan.sourcePlan).toBe('queue.narration-plan.json');
    expect(plan.youtube.tags).toHaveLength(15);
    expect(plan.youtube.hashtags).toEqual([
      'Queues',
      'SystemDesign',
      'BackendDevelopment',
    ]);
    expect(plan.youtube.description).toContain(
      '#Queues #SystemDesign #BackendDevelopment',
    );
    expect(narratedPublishPlanSchema.parse(plan)).toEqual(plan);
  });

  it('writes a readable copy-and-paste Markdown sidecar', () => {
    const plan = materializePublishPlan({
      generatedAt: '2026-08-25T00:00:00.000Z',
      language: 'en',
      model: 'fixture',
      response,
      sourcePlan: 'queue.narration-plan.json',
    });
    const markdown = publishKitMarkdown(plan);
    expect(markdown).toContain('## Recommended YouTube title');
    expect(markdown).toContain('message queues, queue architecture');
    expect(markdown).toContain('- Headline: Queues Make Systems Flow');
  });

  it('keeps the narration transcript grouped by selectable scene id', () => {
    expect(narratedTranscript(narration)).toContain(
      'Scene 1 (queue-flow) — A queue decouples work',
    );
    expect(narratedTranscript(narration)).toContain(
      'A queue lets producers and consumers work independently.',
    );
  });

  it('normalizes an unknown model-selected scene and reports the fallback', () => {
    const publish = materializePublishPlan({
      generatedAt: '2026-08-25T00:00:00.000Z',
      language: 'en',
      model: 'fixture',
      response: {
        ...response,
        thumbnail: {...response.thumbnail, sceneId: 'invented-scene'},
      },
      sourcePlan: 'queue.narration-plan.json',
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(normalizeGeneratedPublishScene(narration, publish).thumbnail.sceneId)
      .toBe('queue-flow');
    expect(warning).toHaveBeenCalledWith(
      'Publish metadata selected unknown scene invented-scene; using queue-flow for the cover.',
    );
    warning.mockRestore();
  });

  it('names both code-native cover formats without touching video outputs', () => {
    expect(publishCoverOutputPaths({
      aspectRatio: 'both',
      outputDirectory: '/tmp/publish',
      stem: 'queue',
    }).map(({file, profile}) => [file, profile.width, profile.height])).toEqual([
      ['queue.thumbnail.png', 1280, 720],
      ['queue.cover-9x16.png', 1080, 1920],
    ]);
  });
});
