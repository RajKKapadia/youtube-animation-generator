import {access, mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  createGeminiVisualValidator,
  createOpenAIVisualValidator,
  generatedVisualCacheKey,
  generatedVisualPrompt,
  generatedVisualRelevanceSchema,
  materializeGeneratedVisuals,
  type GeneratedVisualRelevance,
} from './generated-visuals.js';
import {draftNarratedPlanSchema, type DraftNarratedPlan} from './types.js';

const {parse, create} = vi.hoisted(() => ({parse: vi.fn(), create: vi.fn()}));
vi.mock('openai', () => ({default: class {
  responses = {parse};
  chat = {completions: {create}};
}}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  parse.mockReset();
  create.mockReset();
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, {recursive: true, force: true}),
  ));
});

const makeOutputDirectory = async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'generated-visuals-'));
  temporaryDirectories.push(directory);
  return directory;
};

const direction = {
  sourceEvidence: 'Warehouse robots move sealed packages through a sorting hall.',
  sourceAnchors: ['Warehouse robots', 'sorting hall'],
  narrationBeat: 'Warehouse robots move sealed packages.',
  subject: 'warehouse robots and sealed packages',
  action: 'moving packages along a physical sorting path',
  environment: 'a real industrial sorting hall',
  framing: 'wide editorial cutaway with clear foreground action',
  exclusions: ['text', 'logos', 'interface panels'],
  depiction: 'literal' as const,
  metaphorRelationship: null,
};

const makePlan = (palette: DraftNarratedPlan['palette'] = 'amber') =>
  draftNarratedPlanSchema.parse({
    version: 7,
    kind: 'narrated-video',
    stage: 'draft',
    sourceText: direction.sourceEvidence,
    generatedAt: '2026-08-27T00:00:00.000Z',
    model: 'gpt-5.6',
    targetDurationSeconds: 5,
    language: 'en',
    title: 'Warehouse automation',
    palette,
    mediaAssets: [{id: 'generated-warehouse', source: 'generated', direction}],
    scenes: [{
      id: 'warehouse',
      backgroundPrompt: 'Industrial spatial rhythm.',
      template: 'callout',
      title: 'Warehouse automation',
      primaryItems: ['Warehouse robots'],
      secondaryItems: [],
      leftLabel: '',
      rightLabel: '',
      reason: 'Shows the source-backed physical action.',
      visual: {kind: 'image-focus', motion: 'push-in', motif: 'automation', assetId: null, source: 'generated', mediaId: 'generated-warehouse', fit: 'cover', focalPosition: 'center'},
      beats: [{id: 'warehouse-beat', expression: 'none', phrases: [{id: 'warehouse-phrase', text: 'Warehouse robots move sealed packages.'}], primaryItemIndices: [0], secondaryItemIndices: []}],
    }],
  });

const passed: GeneratedVisualRelevance = {
  passed: true,
  subjectActionMatch: 'strong',
  unsupportedObjectsOrClaims: [],
  prohibitedContent: [],
  orientationSuitable: true,
  issues: [],
};

const failed: GeneratedVisualRelevance = {
  passed: false,
  subjectActionMatch: 'weak',
  unsupportedObjectsOrClaims: ['A delivery drone is unsupported.'],
  prohibitedContent: [],
  orientationSuitable: true,
  issues: ['Show only warehouse robots and sealed packages.'],
};

describe('grounded generated foreground visuals', () => {
  it.each(['openai', 'gemini'] as const)('sends the complete metaphor direction to the %s validator', async (provider) => {
    vi.stubEnv('OPENAI_API_KEY', 'fixture-key');
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', 'fixture-key');
    parse.mockResolvedValue({output_parsed: passed});
    create.mockResolvedValue({choices: [{message: {content: JSON.stringify(passed)}}]});
    const metaphor = {
      ...direction,
      sourceEvidence: 'The two films tell different stories.',
      sourceAnchors: ['two films', 'different stories'],
      narrationBeat: 'The two films tell different stories.',
      subject: 'Two unmarked bundles of story pages',
      action: 'The bundles follow separate paths without merging',
      depiction: 'metaphor' as const,
      metaphorRelationship: 'The separate paths represent the films telling different stories.',
    };
    const validate = provider === 'openai' ? createOpenAIVisualValidator() : createGeminiVisualValidator();
    await expect(validate({aspectRatio: '9:16', bytes: Buffer.from('fixture-image'), direction: metaphor, model: 'fixture-model'})).resolves.toEqual(passed);
    const request = (provider === 'openai' ? parse : create).mock.calls[0]![0];
    const messages = provider === 'openai' ? request.input : request.messages;
    expect(JSON.parse(messages[1].content[0].text)).toEqual({aspectRatio: '9:16', ...metaphor});
    expect(messages[0].content).toContain('Symbolic objects need not appear literally in the source');
    expect(messages[0].content).toContain('reject unsupported additional meaning');
    expect(messages[0].content).toContain('named-person likenesses');
    if (provider === 'openai') expect(request.store).toBe(false);
  });

  it('still rejects a pass containing unsupported content', () => {
    expect(generatedVisualRelevanceSchema.safeParse({
      ...passed, unsupportedObjectsOrClaims: ['An invented third story.'],
    }).success).toBe(false);
  });

  it('builds deterministic orientation-aware prompts and cache keys', () => {
    const landscape = generatedVisualPrompt({aspectRatio: '16:9', direction, palette: 'amber'});
    const portrait = generatedVisualPrompt({aspectRatio: '9:16', direction, palette: 'amber'});
    expect(landscape).toContain('wide 16:9 landscape');
    expect(portrait).toContain('tall 9:16 portrait');
    expect(landscape).toContain(direction.narrationBeat);
    expect(landscape).toContain('No text, letters, numbers');
    const key = (aspectRatio: '16:9' | '9:16', palette: 'amber' | 'violet') =>
      generatedVisualCacheKey({aspectRatio, direction, model: 'gpt-image-2', palette, quality: 'medium'});
    expect(key('16:9', 'amber')).not.toBe(key('9:16', 'amber'));
    expect(key('16:9', 'amber')).not.toBe(key('16:9', 'violet'));
  });

  it('generates separate native assets, persists relevance, and reuses them offline', async () => {
    const outputDirectory = await makeOutputDirectory();
    const calls: string[] = [];
    const assets = await materializeGeneratedVisuals({
      allowGeneration: true,
      aspectRatio: 'both',
      generateImage: async ({size}) => {
        calls.push(size);
        return Buffer.from(`image:${size}`);
      },
      model: 'gpt-image-2',
      outputDirectory,
      plan: makePlan(),
      quality: 'medium',
      regenerate: false,
      stem: 'summary',
      validateImage: async () => passed,
      validationModel: 'gpt-5.6',
    });
    expect(calls).toEqual(['2048x1152', '1152x2048']);
    await expect(access(assets!['16:9']['generated-warehouse']!)).resolves.toBeUndefined();
    await expect(access(assets!['9:16']['generated-warehouse']!)).resolves.toBeUndefined();
    const manifest = JSON.parse(await readFile(resolve(outputDirectory, 'summary.generated-visuals/manifest.json'), 'utf8')) as {entries: Array<{relevance: {passed: boolean}}>};
    expect(manifest.entries).toHaveLength(2);
    expect(manifest.entries.every(({relevance}) => relevance.passed)).toBe(true);

    const cached = await materializeGeneratedVisuals({
      allowGeneration: false,
      aspectRatio: 'both',
      generateImage: async () => { throw new Error('must not generate'); },
      model: 'gpt-image-2',
      outputDirectory,
      plan: makePlan(),
      quality: 'medium',
      regenerate: false,
      stem: 'summary',
      validateImage: async () => { throw new Error('must not validate'); },
      validationModel: 'gpt-5.6',
    });
    expect(cached).toEqual(assets);

    await materializeGeneratedVisuals({
      allowGeneration: true,
      aspectRatio: '16:9',
      generateImage: async ({size}) => {
        calls.push(`refresh:${size}`);
        return Buffer.from('refreshed');
      },
      model: 'gpt-image-2',
      outputDirectory,
      plan: makePlan(),
      quality: 'medium',
      regenerate: true,
      stem: 'summary',
      validateImage: async () => passed,
      validationModel: 'gpt-5.6',
    });
    expect(calls.at(-1)).toBe('refresh:2048x1152');
  });

  it('requires auto mode for a missing cache and retries one failed relevance check', async () => {
    const missingDirectory = await makeOutputDirectory();
    await expect(materializeGeneratedVisuals({
      allowGeneration: false,
      aspectRatio: '16:9',
      model: 'gpt-image-2',
      outputDirectory: missingDirectory,
      plan: makePlan(),
      quality: 'medium',
      regenerate: false,
      stem: 'summary',
      validationModel: 'gpt-5.6',
    })).rejects.toThrow('Rerun with --generated-visuals auto');

    const outputDirectory = await makeOutputDirectory();
    let generateCalls = 0;
    let validateCalls = 0;
    await materializeGeneratedVisuals({
      allowGeneration: true,
      aspectRatio: '16:9',
      generateImage: async ({prompt}) => {
        generateCalls += 1;
        if (generateCalls === 2) expect(prompt).toContain('Correct these validation problems exactly');
        return Buffer.from(`image-${generateCalls}`);
      },
      model: 'gpt-image-2',
      outputDirectory,
      plan: makePlan(),
      quality: 'medium',
      regenerate: false,
      stem: 'summary',
      validateImage: async () => {
        validateCalls += 1;
        return validateCalls === 1 ? failed : passed;
      },
      validationModel: 'gpt-5.6',
    });
    expect(generateCalls).toBe(2);
    expect(validateCalls).toBe(2);
  });

  it('rolls back when the corrective generation also fails', async () => {
    const outputDirectory = await makeOutputDirectory();
    await expect(materializeGeneratedVisuals({
      allowGeneration: true,
      aspectRatio: '16:9',
      generateImage: async () => Buffer.from('unrelated'),
      model: 'gpt-image-2',
      outputDirectory,
      plan: makePlan(),
      quality: 'medium',
      regenerate: false,
      stem: 'summary',
      validateImage: async () => failed,
      validationModel: 'gpt-5.6',
    })).rejects.toThrow('failed relevance validation twice. 16:9: Subject/action match is weak; show the requested subject performing the requested action.; Show only warehouse robots and sealed packages.; A delivery drone is unsupported.');
    await expect(access(resolve(outputDirectory, 'summary.generated-visuals'))).rejects.toThrow();
  });

  it('uses failed structured checks for correction and diagnostics even without written issues', async () => {
    const outputDirectory = await makeOutputDirectory();
    const prompts: string[] = [];
    await expect(materializeGeneratedVisuals({
      allowGeneration: true,
      aspectRatio: '9:16',
      generateImage: async ({prompt}) => {
        prompts.push(prompt);
        return Buffer.from('unrelated');
      },
      model: 'gpt-image-2',
      outputDirectory,
      plan: makePlan(),
      quality: 'medium',
      regenerate: false,
      stem: 'summary',
      validateImage: async () => ({...passed, passed: false, subjectActionMatch: 'failed', orientationSuitable: false}),
      validationModel: 'gpt-5.6',
    })).rejects.toThrow('Composition is unsuitable for the requested orientation.');
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('Correct these validation problems exactly: Subject/action match is failed');
    expect(prompts[1]).toContain('Composition is unsuitable for the requested orientation.');
  });
});
