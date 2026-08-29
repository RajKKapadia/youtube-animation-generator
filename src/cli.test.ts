import {access, mkdtemp, rm, writeFile} from 'node:fs/promises';
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

  it('keeps generated foreground directions purchase-free in plan-only mode', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'narrated-generated-plan-only-'));
    temporaryDirectories.push(directory);
    const planPath = resolve(directory, 'summary.narration-plan.json');
    const evidence = 'Warehouse robots move sealed packages through a sorting hall.';
    await writeFile(planPath, JSON.stringify({
      version: 6,
      kind: 'narrated-video',
      stage: 'draft',
      sourceText: evidence,
      generatedAt: '2026-08-27T00:00:00.000Z',
      model: 'fixture',
      targetDurationSeconds: 5,
      language: 'en',
      title: 'Warehouse',
      palette: 'amber',
      mediaAssets: [{id: 'generated-warehouse', source: 'generated', direction: {
        sourceEvidence: evidence,
        sourceAnchors: ['Warehouse robots', 'sorting hall'],
        narrationBeat: 'Warehouse robots move sealed packages.',
        subject: 'warehouse robots and sealed packages',
        action: 'moving packages',
        environment: 'a sorting hall',
        framing: 'wide editorial view',
        exclusions: ['text'],
        depiction: 'literal',
        metaphorRelationship: null,
      }}],
      scenes: [{
        id: 'warehouse', backgroundPrompt: 'Abstract warehouse.', template: 'callout', title: 'Warehouse',
        primaryItems: ['Warehouse robots'], secondaryItems: [], leftLabel: '', rightLabel: '', reason: 'Source action.',
        visual: {kind: 'image-focus', motion: 'push-in', motif: 'automation', assetId: null, source: 'generated', mediaId: 'generated-warehouse', fit: 'cover', focalPosition: 'center'},
        beats: [{id: 'beat', expression: 'none', phrases: [{id: 'phrase', text: 'Warehouse robots move sealed packages.'}], primaryItemIndices: [0], secondaryItemIndices: []}],
      }],
    }));
    await runCli(['create', '--render-plan', planPath, '--plan-only', '--generated-visuals', 'auto']);
    await expect(access(resolve(directory, 'summary.generated-visuals'))).rejects.toThrow();
  });

  it('rejects unsupported aspect ratios before doing work', async () => {
    await expect(
      runCli(['create', 'missing.md', '--aspect-ratio', 'square']),
    ).rejects.toThrow('--aspect-ratio must be one of');
  });

  it('validates visual options and keeps research out of overlay workflows', async () => {
    await expect(
      runCli(['create', 'missing.md', '--captions', 'sometimes']),
    ).rejects.toThrow('--captions must be one of: on, off');
    await expect(
      runCli(['create', 'missing.md', '--regenerate-backgrounds']),
    ).rejects.toThrow('--regenerate-backgrounds requires');
    await expect(
      runCli(['create', 'missing.md', '--generated-visuals', 'sometimes']),
    ).rejects.toThrow('--generated-visuals must be one of');
    await expect(
      runCli(['create', 'missing.md', '--regenerate-visuals']),
    ).rejects.toThrow('--regenerate-visuals requires --generated-visuals auto');
    await expect(
      runCli(['create', 'missing.md', '--research', 'sometimes']),
    ).rejects.toThrow('--research must be one of: off, auto, required');
    await expect(
      runCli(['create', 'missing.md', '--refresh-research']),
    ).rejects.toThrow('--refresh-research requires --research auto or required');
    await expect(
      runCli(['missing.srt', '--scene-background', 'generated', '--format', 'green']),
    ).rejects.toThrow('Ambient and generated subtitle backgrounds require --format h264');
    await expect(
      runCli(['missing.srt', '--research', 'auto']),
    ).rejects.toThrow('Research options cannot be used with subtitle overlays');
  });

  it('requires regeneration before enabling captions on a version-1 overlay plan', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'legacy-overlay-captions-'));
    temporaryDirectories.push(directory);
    const planPath = resolve(directory, 'legacy.animation-plan.json');
    await writeFile(planPath, JSON.stringify({
      version: 1,
      sourceSubtitle: resolve(directory, 'legacy.srt'),
      generatedAt: '2026-08-22T00:00:00.000Z',
      model: 'fixture',
      clips: [{
        id: 'animation-01', startCue: 1, endCue: 1, sourceStartMs: 0,
        sourceEndMs: 2_000, durationMs: 2_000, transcript: 'Queue processing.',
        template: 'callout', title: 'Queue', primaryItems: ['Queue'], secondaryItems: [],
        leftLabel: '', rightLabel: '', reason: 'Legacy fixture.',
      }],
    }));
    await expect(runCli([
      '--render-plan', planPath, '--plan-only', '--captions', 'on',
    ])).rejects.toThrow('Regenerate it from the original SRT/VTT');
  });

  it('documents the v0.8.0 visual-parity and publish-kit options', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['--help']);
    const output = String(log.mock.calls[0]?.[0]);
    expect(output).toContain('youtube-animations 0.8.0');
    expect(output).toContain('--format <prores|webm|green|h264>');
    expect(output).toContain('off, ambient, or generated');
    expect(output).toContain('--voice <auto|M1..M5|F1..F5>');
    expect(output).toContain('--captions <on|off>');
    expect(output).toContain('--scene-background <mode>');
    expect(output).toContain('--image-quality <quality>');
    expect(output).toContain('--generated-visuals <off|auto>');
    expect(output).toContain('--research <off|auto|required>');
    expect(output).toContain('--refresh-research');
    expect(output).toContain('--regenerate-visuals');
    expect(output).toContain('publish <narrated-plan.json>');
    expect(output).toContain('--cover-aspect <16:9|9:16|both>');
    log.mockRestore();
  });

  it('rejects unknown automatic voice choices', async () => {
    await expect(runCli(['create', 'missing.md', '--voice', 'cinematic']))
      .rejects.toThrow('--voice must be auto or one of M1..M5 or F1..F5');
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
