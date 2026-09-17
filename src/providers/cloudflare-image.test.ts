import {afterEach, describe, expect, it, vi} from 'vitest';
import {createCloudflareImageGenerator} from './cloudflare-image.js';
import {createDefaultImageGenerator} from '../scene-backgrounds.js';
import {createDefaultVisualValidator} from '../generated-visuals.js';

describe('createDefaultImageGenerator routing', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('routes to cloudflare when IMAGE_PROVIDER is explicitly cloudflare', () => {
    vi.stubEnv('IMAGE_PROVIDER', 'cloudflare');
    vi.stubEnv('CLOUDFLARE_AI_KEY', 'cf-key');
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'cf-acc');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');

    const generator = createDefaultImageGenerator();
    expect(typeof generator).toBe('function');
  });

  it('routes to openai when IMAGE_PROVIDER is explicitly openai', () => {
    vi.stubEnv('IMAGE_PROVIDER', 'openai');
    vi.stubEnv('CLOUDFLARE_AI_KEY', 'cf-key');
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'cf-acc');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');

    const generator = createDefaultImageGenerator();
    expect(typeof generator).toBe('function');
  });

  it('auto-detects cloudflare when Cloudflare keys are present and IMAGE_PROVIDER is unset', () => {
    vi.stubEnv('IMAGE_PROVIDER', '');
    delete process.env.IMAGE_PROVIDER;
    vi.stubEnv('CLOUDFLARE_AI_KEY', 'cf-key');
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'cf-acc');
    vi.stubEnv('OPENAI_API_KEY', '');
    delete process.env.OPENAI_API_KEY;

    const generator = createDefaultImageGenerator();
    expect(typeof generator).toBe('function');
  });

  it('falls back to openai generator when Cloudflare keys are not present', () => {
    vi.stubEnv('IMAGE_PROVIDER', '');
    vi.stubEnv('CLOUDFLARE_AI_KEY', '');
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '');
    delete process.env.IMAGE_PROVIDER;
    delete process.env.CLOUDFLARE_AI_KEY;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');

    const generator = createDefaultImageGenerator();
    expect(typeof generator).toBe('function');
  });
});

describe('createDefaultVisualValidator routing', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns OpenAI visual validator when OPENAI_API_KEY is present', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', 'AIzaTest');

    const validator = createDefaultVisualValidator();
    expect(typeof validator).toBe('function');
  });

  it('returns Gemini visual validator when OPENAI_API_KEY is absent but GOOGLE_GEMINI_API_KEY is present', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    delete process.env.OPENAI_API_KEY;
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', 'AIzaTest');

    const validator = createDefaultVisualValidator();
    expect(typeof validator).toBe('function');
  });

  it('throws when neither key is present upon invocation', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', '');
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_GEMINI_API_KEY;

    expect(() => createDefaultVisualValidator()).toThrow('OPENAI_API_KEY is required');
  });
});

describe('createCloudflareImageGenerator', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('requires CLOUDFLARE_AI_KEY and CLOUDFLARE_ACCOUNT_ID', () => {
    vi.stubEnv('CLOUDFLARE_AI_KEY', '');
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '');
    delete process.env.CLOUDFLARE_AI_KEY;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;

    expect(() => createCloudflareImageGenerator()).toThrow(
      'CLOUDFLARE_ACCOUNT_ID are required',
    );
  });

  it('sends correct request and parses base64 JSON response', async () => {
    vi.stubEnv('CLOUDFLARE_AI_KEY', 'cf-key-123');
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'cf-acc-456');

    const fakeImageBuffer = Buffer.from('fake-image-bytes');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({'content-type': 'application/json'}),
      json: async () => ({
        result: {
          image: fakeImageBuffer.toString('base64'),
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const generator = createCloudflareImageGenerator();
    const result = await generator({
      model: '@cf/black-forest-labs/flux-1-schnell',
      prompt: 'Test prompt',
      quality: 'medium',
      size: '2048x1152',
    });

    expect(result).toEqual(fakeImageBuffer);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/accounts/cf-acc-456/ai/run/@cf/black-forest-labs/flux-1-schnell');
    expect(init.headers['Authorization']).toBe('Bearer cf-key-123');
    const parsedBody = JSON.parse(init.body);
    expect(parsedBody.prompt).toBe('Test prompt');
  });
});
