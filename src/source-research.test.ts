import {access, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError} from 'openai';
import {
  createOpenAIWebResearcher,
  enrichSourceWithResearch,
  extractWebResearchActivity,
  loadOrCreateWebResearch,
  materializeWebResearch,
  webResearchCacheKey,
  webResearchMarkdown,
  WebResearchUnavailableError,
  WEB_RESEARCH_TIMEOUT_MS,
  type WebResearchRequest,
} from './source-research.js';
import type {WebResearchBundle} from './types.js';
import {webResearchBundleSchema} from './types.js';

const {create, constructorOptions} = vi.hoisted(() => ({create: vi.fn(), constructorOptions: vi.fn()}));
vi.mock('openai', async (importOriginal) => ({
  ...await importOriginal<typeof import('openai')>(),
  default: class {
    constructor(options: unknown) { constructorOptions(options); }
    responses = {create};
  },
}));

beforeEach(() => vi.stubEnv('OPENAI_API_KEY', 'fixture-key'));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  create.mockReset();
  constructorOptions.mockReset();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true}),
    ),
  );
});

const activityOutput = [{
  type: 'web_search_call',
  status: 'completed',
  action: {
    type: 'search',
    queries: ['official queue documentation'],
    sources: [
      {type: 'url', url: 'https://example.com/queues'},
      {type: 'url', url: 'https://standards.example.org/spec'},
    ],
  },
}, {
  type: 'message',
  content: [{
    type: 'output_text',
    text: '{}',
    annotations: [{
      type: 'url_citation',
      url: 'https://example.com/queues',
      title: 'Queue documentation',
      start_index: 0,
      end_index: 2,
    }],
  }],
}];

const bundleFor = (request: WebResearchRequest): WebResearchBundle => ({
  version: 1,
  kind: 'web-research',
  sourceHash: request.sourceHash,
  researchedAt: request.researchedAt,
  model: request.model,
  mode: request.mode,
  searchContextSize: 'medium',
  maxToolCalls: 4,
  queries: ['queue reliability'],
  summary: 'Checked the main technical claim against primary documentation.',
  claims: [{
    claim: 'A durable queue retains pending work until a consumer can process it.',
    status: 'supported',
    sourceUrls: ['https://example.com/queues'],
  }, {
    claim: 'The source says queues guarantee instantaneous processing.',
    status: 'contested',
    sourceUrls: ['https://standards.example.org/spec'],
  }],
  sources: [{
    url: 'https://example.com/queues',
    title: 'Queue documentation',
  }, {
    url: 'https://standards.example.org/spec',
    title: 'Messaging standard',
  }],
});

describe('web research materialization', () => {
  it('collects queries, complete sources, and citation titles', () => {
    expect(extractWebResearchActivity(activityOutput)).toEqual({
      queries: ['official queue documentation'],
      warnings: [],
      sources: [{
        url: 'https://example.com/queues',
        title: 'Queue documentation',
      }, {
        url: 'https://standards.example.org/spec',
        title: 'standards.example.org',
      }],
    });
  });

  it('accepts only claim URLs returned by web search', () => {
    const bundle = materializeWebResearch({
      mode: 'required',
      model: 'fixture',
      output: activityOutput,
      parsed: {
        summary: 'Checked claims and found reliable supporting material.',
        claims: [{
          claim: 'Durable queues retain pending work.',
          status: 'supported',
          sourceUrls: ['https://example.com/queues'],
        }],
      },
      researchedAt: '2026-08-28T00:00:00.000Z',
      sourceHash: 'a'.repeat(64),
    });
    expect(bundle.sources).toHaveLength(2);
    expect(bundle.claims[0]?.sourceUrls).toEqual(['https://example.com/queues']);

    expect(() => materializeWebResearch({
      mode: 'required',
      model: 'fixture',
      output: activityOutput,
      parsed: {
        summary: 'Invalid citation test.',
        claims: [{
          claim: 'An unsupported claim.',
          status: 'context',
          sourceUrls: ['https://invented.example/fact'],
        }],
      },
      researchedAt: '2026-08-28T00:00:00.000Z',
      sourceHash: 'a'.repeat(64),
    })).toThrow('no claims with valid citations');
  });

  it('bounds oversized source lists while preserving all 96 possible citations at the end', () => {
    const urls = Array.from({length: 250}, (_, index) => `https://example.com/source-${index}`);
    const bundle = materializeWebResearch({
      mode: 'required', model: 'fixture', researchedAt: '2026-10-04', sourceHash: 'a'.repeat(64),
      output: [{type: 'web_search_call', status: 'completed', action: {
        type: 'search', sources: urls.map((url) => ({type: 'url', url})),
      }}],
      parsed: {summary: 'Checked sixteen claims.', claims: Array.from({length: 16}, (_, index) => ({
        claim: `Claim ${index + 1}`, status: 'supported', sourceUrls: urls.slice(154 + index * 6, 160 + index * 6),
      }))},
    });
    expect(bundle.sources).toHaveLength(100);
    const savedUrls = new Set(bundle.sources.map(({url}) => url));
    expect(bundle.claims.flatMap(({sourceUrls}) => sourceUrls).every((url) => savedUrls.has(url))).toBe(true);
    expect(savedUrls.has(urls[249]!)).toBe(true);
    expect(bundle.warnings).toContain('Kept 100 of 250 research sources, preserving every claim citation.');
    expect(webResearchBundleSchema.safeParse(bundle).success).toBe(true);
  });

  it('bounds decorative tool metadata and ignores malformed URLs without shortening them', () => {
    const output = structuredClone(activityOutput);
    output[0]!.action!.queries = Array.from({length: 30}, (_, index) => `${index} ${'q'.repeat(600)}`);
    output[0]!.action!.sources.push({type: 'url', url: `https://example.com/${'x'.repeat(2_048)}`});
    output[0]!.action!.sources.push({type: 'url', url: 'file:///private/source'});
    output[1]!.content![0]!.annotations[0]!.title = 't'.repeat(400);
    const bundle = materializeWebResearch({
      mode: 'required', model: 'fixture', output, researchedAt: '2026-10-04', sourceHash: 'a'.repeat(64),
      parsed: {summary: 'Checked sources.', claims: []},
    });
    expect(bundle.sources).toHaveLength(2);
    expect(bundle.sources[0]?.title).toHaveLength(300);
    expect(bundle.queries).toHaveLength(20);
    expect(bundle.queries.every((query) => query.length <= 500)).toBe(true);
    expect(webResearchBundleSchema.safeParse(bundle).success).toBe(true);
  });

  it('drops failed page URLs even when search results and annotations repeat them', () => {
    const output = [...activityOutput, {type: 'web_search_call', status: 'failed', action: {
      type: 'open_page', url: 'https://example.com/queues#failed',
    }}];
    const bundle = materializeWebResearch({
      mode: 'required', model: 'fixture', output, researchedAt: '2026-10-04', sourceHash: 'a'.repeat(64),
      parsed: {summary: 'One page was inaccessible.', claims: [{
        claim: 'Retained claim.', status: 'supported',
        sourceUrls: ['https://example.com/queues', 'https://standards.example.org/spec'],
      }, {
        claim: 'Unverified material from the failed page.', status: 'context',
        sourceUrls: ['https://example.com/queues'],
      }]},
    });
    expect(bundle.sources.map(({url}) => url)).toEqual(['https://standards.example.org/spec']);
    expect(bundle.claims).toHaveLength(1);
    expect(bundle.claims[0]?.sourceUrls).toEqual(['https://standards.example.org/spec']);
    expect(enrichSourceWithResearch('Original source.', bundle)).not.toContain('Unverified material');
    expect(bundle.warnings?.join(' ')).toContain('no valid citations remain');
    expect(webResearchMarkdown(bundle)).toContain('## Warnings');
  });

  it('ignores failed search results and permits a later successful page open', () => {
    const failed = {type: 'web_search_call', status: 'failed', action: {
      type: 'open_page', url: 'https://example.com/queues',
      sources: [{url: 'https://invented.example/not-evidence'}],
    }};
    const output = [...activityOutput, failed, {...failed, status: 'completed', action: {
      type: 'open_page', url: 'https://example.com/queues',
    }}];
    expect(extractWebResearchActivity(output).sources.map(({url}) => url))
      .toEqual(['https://example.com/queues', 'https://standards.example.org/spec']);
  });

  it('does not let annotations reintroduce sources from a failed search', () => {
    const output = structuredClone(activityOutput);
    output[0]!.status = 'failed';
    expect(extractWebResearchActivity(output).sources).toEqual([]);
  });

  it('canonicalizes duplicate citations without reconstructing source URLs', () => {
    const bundle = materializeWebResearch({
      mode: 'required', model: 'fixture', output: activityOutput, researchedAt: '2026-10-04', sourceHash: 'a'.repeat(64),
      parsed: {summary: 'Checked duplicate citations.', claims: [{claim: 'Retained claim.', status: 'supported',
        sourceUrls: ['https://EXAMPLE.com/queues#section', 'https://example.com/queues'],
      }]},
    });
    expect(bundle.claims[0]?.sourceUrls).toEqual(['https://example.com/queues']);
  });

  it('requires at least one returned source in required mode', () => {
    expect(() => materializeWebResearch({
      mode: 'required',
      model: 'fixture',
      output: [],
      parsed: {summary: 'No results.', claims: []},
      researchedAt: '2026-08-28T00:00:00.000Z',
      sourceHash: 'a'.repeat(64),
    })).toThrow('required but returned no sources');
  });

  it('adds supported context to grounding while excluding contested claims', () => {
    const request: WebResearchRequest = {
      mode: 'required',
      model: 'fixture',
      researchedAt: '2026-08-28T00:00:00.000Z',
      sourceHash: 'a'.repeat(64),
      sourceText: 'Queues decouple producers and consumers.',
    };
    const bundle = bundleFor(request);
    const enriched = enrichSourceWithResearch(request.sourceText, bundle);
    expect(enriched).toContain('A durable queue retains pending work');
    expect(enriched).not.toContain('instantaneous processing');
    expect(enriched).not.toContain('https://');

    const markdown = webResearchMarkdown(bundle);
    expect(markdown).toContain('[1](https://example.com/queues)');
    expect(markdown).toContain('[Queue documentation](https://example.com/queues)');
  });
});

describe('web research cache', () => {
  const optionsFor = async (mode: 'auto' | 'required' = 'auto') => {
    const directory = await mkdtemp(resolve(tmpdir(), 'web-research-'));
    temporaryDirectories.push(directory);
    return {mode, model: 'fixture', outputDirectory: directory, refresh: false,
      sourceText: 'Queues decouple producers and consumers.', stem: 'queues'};
  };

  it('falls back only in auto mode and never caches a failed research run', async () => {
    const options = await optionsFor();
    const researcher = vi.fn(async () => {throw new WebResearchUnavailableError('A URL did not respond.');});
    const loaded = await loadOrCreateWebResearch({...options, researcher});
    expect(loaded.bundle).toBeUndefined();
    expect(loaded.warnings.join(' ')).toContain('original source only; it has not been web-verified');
    await expect(access(loaded.paths.json)).rejects.toThrow();
    await expect(access(loaded.paths.markdown)).rejects.toThrow();
    const next = await loadOrCreateWebResearch({...options, researcher: async (request) => bundleFor(request)});
    expect(next.bundle?.claims).toHaveLength(2);
    expect(next.reused).toBe(false);
    await expect(loadOrCreateWebResearch({...options, refresh: true, mode: 'required', researcher}))
      .rejects.toThrow('A URL did not respond');
  });

  it('does not cache an entirely failed search as an intentional auto-mode skip', async () => {
    const options = await optionsFor();
    create.mockResolvedValue({status: 'completed', output: [{type: 'web_search_call', status: 'failed',
      action: {type: 'open_page', url: 'https://example.com/queues'},
    }], output_text: JSON.stringify({summary: 'The page did not respond.', claims: []})});
    const loaded = await loadOrCreateWebResearch(options);
    expect(loaded.bundle).toBeUndefined();
    expect(loaded.warnings.join(' ')).toContain('no usable sources after failed tool actions');
    await expect(access(loaded.paths.json)).rejects.toThrow();
  });

  it('keeps cache, configuration and unexpected errors fatal in auto mode', async () => {
    const options = await optionsFor();
    const researcher = vi.fn(async () => {throw new Error('Unexpected defect');});
    await expect(loadOrCreateWebResearch({...options, researcher})).rejects.toThrow('Unexpected defect');
    vi.stubEnv('OPENAI_API_KEY', '');
    await expect(loadOrCreateWebResearch(options)).rejects.toThrow('OPENAI_API_KEY is required');
    await writeFile(resolve(options.outputDirectory, 'queues.research.json'), '{');
    await expect(loadOrCreateWebResearch({...options, researcher})).rejects.toThrow('Cached research is invalid');
    expect(researcher).toHaveBeenCalledTimes(1);
  });

  it('persists recovery warnings and restores them when reusing research', async () => {
    const options = await optionsFor();
    const researcher = vi.fn(async (request: WebResearchRequest) => ({...bundleFor(request), warnings: ['One source was excluded.']}));
    const created = await loadOrCreateWebResearch({...options, researcher});
    const reused = await loadOrCreateWebResearch({...options, researcher});
    expect(reused.warnings).toEqual(created.warnings);
    expect(await readFile(created.paths.markdown, 'utf8')).toContain('One source was excluded.');
    expect(researcher).toHaveBeenCalledTimes(1);
  });

  it('reuses a matching bundle and refreshes only when requested', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'web-research-'));
    temporaryDirectories.push(directory);
    const sourceText = 'Queues decouple producers and consumers.';
    const researcher = vi.fn(async (request: WebResearchRequest) => bundleFor(request));
    const options = {
      mode: 'required' as const,
      model: 'fixture',
      outputDirectory: directory,
      refresh: false,
      sourceText,
      stem: 'queues',
      researcher,
    };

    const created = await loadOrCreateWebResearch(options);
    expect(created.reused).toBe(false);
    expect(researcher).toHaveBeenCalledTimes(1);
    expect(await readFile(created.paths.markdown, 'utf8')).toContain('## Sources');

    const reused = await loadOrCreateWebResearch({
      ...options,
      researcher: vi.fn(async () => {
        throw new Error('cache should have been reused');
      }),
    });
    expect(reused.reused).toBe(true);

    await expect(loadOrCreateWebResearch({
      ...options,
      model: 'different-model',
    })).rejects.toThrow('Use --refresh-research');

    const refreshedResearcher = vi.fn(async (request: WebResearchRequest) =>
      bundleFor(request),
    );
    const refreshed = await loadOrCreateWebResearch({
      ...options,
      model: 'different-model',
      refresh: true,
      researcher: refreshedResearcher,
    });
    expect(refreshed.reused).toBe(false);
    expect(refreshed.bundle?.sourceHash).toBe(webResearchCacheKey({
      mode: 'required',
      model: 'different-model',
      sourceText,
    }));
  });
});

describe('OpenAI web research response boundary', () => {
  const request: WebResearchRequest = {
    mode: 'required', model: 'fixture', researchedAt: '2026-10-04', sourceHash: 'a'.repeat(64),
    sourceText: 'Queues retain work.',
  };
  const valid = {summary: 'Checked queue documentation.', claims: [{claim: 'Queues retain work.',
    status: 'supported', sourceUrls: ['https://example.com/queues']} ]};

  it('uses strict output with local validation, four tool calls, one SDK retry and a shared deadline', async () => {
    create.mockResolvedValue({status: 'completed', output: activityOutput, output_text: JSON.stringify(valid)});
    const bundle = await createOpenAIWebResearcher()(request);
    expect(bundle.claims).toHaveLength(1);
    expect(constructorOptions).toHaveBeenCalledWith(expect.objectContaining({timeout: WEB_RESEARCH_TIMEOUT_MS, maxRetries: 1}));
    const [body, options] = create.mock.calls[0]!;
    expect(body).toMatchObject({store: false, max_tool_calls: 4, tool_choice: 'required',
      include: ['web_search_call.action.sources'], text: {format: {strict: true}}});
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(body.input[0].content).toContain('If a supplied URL cannot be opened');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('ends the entire operation at the deadline even when the transport does not settle on abort', async () => {
    vi.useFakeTimers();
    create.mockImplementation(() => new Promise(() => {}));
    const pending = createOpenAIWebResearcher()(request);
    const rejected = expect(pending).rejects.toThrow('exceeded its 120-second deadline');
    await vi.advanceTimersByTimeAsync(WEB_RESEARCH_TIMEOUT_MS);
    await rejected;
    expect(create.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    {status: 'incomplete', output: [], output_text: JSON.stringify(valid), incomplete_details: {reason: 'max_output_tokens'}},
    {status: 'failed', output: [], output_text: '', error: {code: 'server_error'}},
    {status: 'completed', output: [], output_text: ''},
    {status: 'completed', output: [], output_text: '{'},
    {status: 'completed', output: [], output_text: JSON.stringify({summary: 'Missing claims'})},
    {status: 'completed', output: [{type: 'message', content: [{type: 'refusal', refusal: 'Declined'}]}], output_text: ''},
  ])('turns unusable responses into an explicit research failure %#', async (response) => {
    create.mockResolvedValue(response);
    await expect(createOpenAIWebResearcher()(request)).rejects.toBeInstanceOf(WebResearchUnavailableError);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([
    new APIConnectionError({}), new APIConnectionTimeoutError(), new APIUserAbortError(),
    new APIError(429, {message: 'Rate limited'}, undefined, undefined),
    new APIError(503, {message: 'Unavailable'}, undefined, undefined),
  ])('classifies transient API failures for auto fallback %#', async (error) => {
    create.mockRejectedValue(error);
    await expect(createOpenAIWebResearcher()(request)).rejects.toBeInstanceOf(WebResearchUnavailableError);
  });

  it.each([400, 401, 403, 404])('keeps configuration or access HTTP %i errors fatal', async (status) => {
    const error = new APIError(status, {message: 'Check configuration'}, undefined, undefined);
    create.mockRejectedValue(error);
    await expect(createOpenAIWebResearcher()(request)).rejects.toBe(error);
  });
});
