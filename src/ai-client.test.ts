import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  createAIClient,
  defaultModelForProvider,
  resolveAIProvider,
  withTransientRetries,
} from './ai-client.js';

describe('ai-client provider resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to openai when OPENAI_API_KEY is set even if other keys are present', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', 'AIzaTest');
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');

    expect(resolveAIProvider()).toBe('openai');
    expect(defaultModelForProvider('openai')).toBe('gpt-5.6');
  });

  it('resolves gemini when GOOGLE_GEMINI_API_KEY is present without OPENAI_API_KEY', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    delete process.env.OPENAI_API_KEY;
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', 'AIzaTest');

    expect(resolveAIProvider()).toBe('gemini');
    expect(defaultModelForProvider('gemini')).toBe('gemini-3.5-flash');
  });

  it('resolves groq when GROQ_API_KEY is present without others', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', '');
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_GEMINI_API_KEY;
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');

    expect(resolveAIProvider()).toBe('groq');
    expect(defaultModelForProvider('groq')).toBe('llama-3.3-70b-versatile');
  });

  it('respects AI_PROVIDER override from environment even when multiple keys exist', () => {
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', 'AIzaTest');

    expect(resolveAIProvider()).toBe('gemini');
  });

  it('creates OpenAI client instance with Gemini baseURL when provider is gemini', () => {
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', 'AIzaTest');
    const info = createAIClient({provider: 'gemini'});

    expect(info.provider).toBe('gemini');
    expect(info.model).toBe('gemini-3.5-flash');
    expect(info.client.baseURL).toBe('https://generativelanguage.googleapis.com/v1beta/openai/');
  });

  it('creates OpenAI client instance with Groq baseURL when provider is groq', () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');
    const info = createAIClient({provider: 'groq'});

    expect(info.provider).toBe('groq');
    expect(info.model).toBe('llama-3.3-70b-versatile');
    expect(info.client.baseURL).toBe('https://api.groq.com/openai/v1');
  });
});

describe('withTransientRetries', () => {
  it('returns value immediately when operation succeeds on first attempt', async () => {
    const mockWait = vi.fn().mockResolvedValue(undefined);
    const operation = vi.fn().mockResolvedValue('success');

    const result = await withTransientRetries(operation, 3, mockWait);
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(mockWait).not.toHaveBeenCalled();
  });

  it('retries on status 429 and succeeds on subsequent attempt', async () => {
    const mockWait = vi.fn().mockResolvedValue(undefined);
    const error429 = Object.assign(new Error('Rate limit exceeded'), {status: 429});
    const operation = vi.fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce('recovered');

    const result = await withTransientRetries(operation, 3, mockWait);
    expect(result).toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(mockWait).toHaveBeenCalledTimes(1);
    expect(mockWait).toHaveBeenCalledWith(1500); // 1500 * 2^0
  });

  it('extracts retry delay from "retry in Xs" message pattern', async () => {
    const mockWait = vi.fn().mockResolvedValue(undefined);
    const rateLimitError = new Error('Resource exhausted. Please retry in 4.5s.');
    const operation = vi.fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce('ok');

    const result = await withTransientRetries(operation, 3, mockWait);
    expect(result).toBe('ok');
    expect(mockWait).toHaveBeenCalledWith(4500 + 1500); // 6000ms
  });

  it('does not retry non-transient errors (e.g. 400 Bad Request)', async () => {
    const mockWait = vi.fn().mockResolvedValue(undefined);
    const clientError = Object.assign(new Error('Bad request'), {status: 400});
    const operation = vi.fn().mockRejectedValue(clientError);

    await expect(withTransientRetries(operation, 3, mockWait)).rejects.toThrow('Bad request');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(mockWait).not.toHaveBeenCalled();
  });

  it('throws when all retries are exhausted', async () => {
    const mockWait = vi.fn().mockResolvedValue(undefined);
    const error503 = Object.assign(new Error('Service Unavailable'), {status: 503});
    const operation = vi.fn().mockRejectedValue(error503);

    await expect(withTransientRetries(operation, 3, mockWait)).rejects.toThrow('Service Unavailable');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(mockWait).toHaveBeenCalledTimes(2);
  });
});
