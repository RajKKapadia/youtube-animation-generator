import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  enrichSourceWithResearch,
  extractWebResearchActivity,
  loadOrCreateWebResearch,
  materializeWebResearch,
  webResearchCacheKey,
  webResearchMarkdown,
  type WebResearchRequest,
} from './source-research.js';
import type {WebResearchBundle} from './types.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true}),
    ),
  );
});

const activityOutput = [{
  type: 'web_search_call',
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
    })).toThrow('was not returned by web search');
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
    expect(refreshed.bundle.sourceHash).toBe(webResearchCacheKey({
      mode: 'required',
      model: 'different-model',
      sourceText,
    }));
  });
});
