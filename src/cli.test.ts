import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {runCli} from './cli.js';
const temporaryDirectories: string[] = [];

const draftPlan = {
  version: 1,
  kind: 'narrated-video',
  stage: 'draft',
  sourceText: 'A queue separates producers from consumers.',
  generatedAt: '2026-08-23T00:00:00.000Z',
  model: 'fixture',
  targetDurationSeconds: 10,
  language: 'en',
  title: 'Queues',
  scenes: [{
    id: 'queue',
    template: 'process-flow',
    title: 'Queue flow',
    primaryItems: ['Producer', 'Queue', 'Consumer'],
    secondaryItems: [],
    leftLabel: '',
    rightLabel: '',
    reason: 'Shows the flow.',
    beats: [{
      id: 'flow',
      text: 'A producer sends work through a queue to a consumer.',
      primaryItemIndices: [0, 1, 2],
      secondaryItemIndices: [],
    }],
  }],
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true}),
    ),
  );
});

describe('narrated CLI plan-only path', () => {
  it.each(['16:9', '9:16', 'both'])('accepts %s without requiring model assets', async (aspectRatio) => {
    const directory = await mkdtemp(resolve(tmpdir(), 'narrated-cli-'));
    temporaryDirectories.push(directory);
    const planPath = resolve(directory, 'summary.narration-plan.json');
    await writeFile(planPath, JSON.stringify(draftPlan));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(
      [
        'create',
        '--render-plan',
        planPath,
        '--plan-only',
        '--aspect-ratio',
        aspectRatio,
        '--scene-background',
        'generated',
        '--captions',
        'off',
      ],
    );
    expect(log).toHaveBeenCalledWith(
      'Draft narrated plan is valid; --plan-only skipped synthesis.',
    );
    log.mockRestore();
  });

  it('rejects unsupported aspect ratios before doing work', async () => {
    await expect(
      runCli(['create', 'missing.md', '--aspect-ratio', 'square']),
    ).rejects.toThrow('--aspect-ratio must be one of');
  });

  it('validates narrated visual options and keeps them out of overlay workflows', async () => {
    await expect(
      runCli(['create', 'missing.md', '--captions', 'sometimes']),
    ).rejects.toThrow('--captions must be one of: on, off');
    await expect(
      runCli(['create', 'missing.md', '--regenerate-backgrounds']),
    ).rejects.toThrow('--regenerate-backgrounds requires');
    await expect(
      runCli(['missing.srt', '--scene-background', 'generated']),
    ).rejects.toThrow('Narrated visual options cannot be used with subtitle overlays');
  });

  it('documents the v0.5 narrated and publish-kit options', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['--help']);
    const output = String(log.mock.calls[0]?.[0]);
    expect(output).toContain('youtube-animations 0.5.0');
    expect(output).toContain('--captions <on|off>');
    expect(output).toContain('--scene-background <mode>');
    expect(output).toContain('--image-quality <quality>');
    expect(output).toContain('publish <narrated-plan.json>');
    expect(output).toContain('--cover-aspect <16:9|9:16|both>');
    log.mockRestore();
  });

  it('validates an edited publish plan without OpenAI, Chrome, or model assets', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'narrated-publish-cli-'));
    temporaryDirectories.push(directory);
    const planPath = resolve(directory, 'summary.narration-plan.json');
    const publishPath = resolve(directory, 'summary.publish.json');
    await writeFile(planPath, JSON.stringify(draftPlan));
    await writeFile(publishPath, JSON.stringify({
      version: 1,
      kind: 'narrated-publish-kit',
      sourcePlan: 'summary.narration-plan.json',
      generatedAt: '2026-08-25T00:00:00.000Z',
      model: 'fixture',
      language: 'en',
      youtube: {
        title: 'Message Queues Explained with One Practical Visual Flow',
        alternateTitles: [
          'How Queues Keep Producers and Consumers Independent',
          'Understand Message Queues Through Simple System Design',
        ],
        description: 'A source-grounded description.\n\n#Queues #SystemDesign #Backend',
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
        hashtags: ['Queues', 'SystemDesign', 'Backend'],
      },
      thumbnail: {
        headline: 'Queues Make Systems Flow',
        eyebrow: 'System Design',
        sceneId: 'queue',
        accent: 'cyan',
      },
    }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli([
      'publish',
      planPath,
      '--render-publish',
      publishPath,
      '--metadata-only',
    ]);
    expect(log).toHaveBeenCalledWith(
      'Narrated publish plan is valid; --metadata-only skipped cover rendering.',
    );
    log.mockRestore();
  });

  it('keeps publish-kit flags scoped to the publish command', async () => {
    await expect(
      runCli(['publish', 'missing.json', '--cover-aspect', 'square']),
    ).rejects.toThrow('--cover-aspect must be one of');
    await expect(
      runCli(['missing.srt', '--metadata-only']),
    ).rejects.toThrow('Publish-kit options can only be used with the publish command');
  });
});
