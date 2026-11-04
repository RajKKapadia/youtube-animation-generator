import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {materializeSceneBackgrounds, type MaterializeSceneBackgroundsOptions} from '../scene-backgrounds.js';
import {createDefaultImageGenerator, resolveDefaultImageModel} from './image-generation.js';

const request = {
  model: '@cf/custom/background-model',
  negativePrompt: 'text',
  prompt: 'A quiet room',
  quality: 'medium',
  size: '1152x2048',
} as const;

const image = Buffer.from('image fixture');
const encoded = image.toString('base64');
const geminiImage = () => Response.json({
  steps: [
    {type: 'thought', summary: [{type: 'image', data: 'ignored'}]},
    {type: 'model_output', content: [{type: 'text'}, {type: 'image', data: encoded}]},
  ],
});

describe('image provider routing', () => {
  beforeEach(() => {
    vi.stubEnv('IMAGE_PROVIDER', 'auto');
    vi.stubEnv('CLOUDFLARE_AI_KEY', 'cf-key');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', '');
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'cf-account');
    vi.stubEnv('CLOUDFLARE_IMAGE_MODEL', '');
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', 'gemini-key');
    vi.stubEnv('GOOGLE_GEMINI_IMAGE_MODEL', 'gemini-test-image');
    vi.stubEnv('OPENAI_API_KEY', 'openai-key');
    vi.stubEnv('OPENAI_IMAGE_MODEL', 'gpt-image-2-test');
    vi.stubEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('switches to Gemini after a Cloudflare 408 and keeps it for the batch', async () => {
    vi.stubEnv('IMAGE_PROVIDER', '');
    const fetchImage = vi.fn()
      .mockResolvedValueOnce(Response.json({errors: [{code: 3046}]}, {status: 408}))
      .mockImplementation(async () => geminiImage());
    vi.stubGlobal('fetch', fetchImage);
    const generate = createDefaultImageGenerator();
    await expect(generate(request)).resolves.toEqual(image);
    await expect(generate({...request, size: '2048x1152'})).resolves.toEqual(image);

    expect(fetchImage).toHaveBeenCalledTimes(3);
    expect(fetchImage.mock.calls[0]?.[0]).toContain(`/ai/run/${request.model}`);
    const [geminiUrl, geminiOptions] = fetchImage.mock.calls[1]!;
    expect(geminiUrl).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(geminiOptions.headers['x-goog-api-key']).toBe('gemini-key');
    expect(JSON.parse(geminiOptions.body)).toEqual({
      model: 'gemini-test-image',
      input: 'A quiet room Do not include: text.',
      store: false,
      response_format: {type: 'image', mime_type: 'image/jpeg', aspect_ratio: '9:16', image_size: '2K'},
    });
    expect(JSON.parse(fetchImage.mock.calls[2]?.[1].body).response_format.aspect_ratio).toBe('16:9');
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Switching to gemini'));
  });

  it('falls through to OpenAI with its own model after a connection timeout and Gemini access failure', async () => {
    const fetchImage = vi.fn()
      .mockRejectedValueOnce(new DOMException('The operation timed out', 'TimeoutError'))
      .mockResolvedValueOnce(Response.json({error: {message: 'Permission denied'}}, {status: 403}))
      .mockResolvedValueOnce(Response.json({data: [{b64_json: encoded}]}));
    vi.stubGlobal('fetch', fetchImage);
    await expect(createDefaultImageGenerator()(request)).resolves.toEqual(image);

    expect(fetchImage).toHaveBeenCalledTimes(3);
    expect(fetchImage.mock.calls[1]?.[0]).toContain('generativelanguage.googleapis.com');
    const [openAIUrl, openAIOptions] = fetchImage.mock.calls[2]!;
    expect(String(openAIUrl)).toBe('https://api.openai.com/v1/images/generations');
    expect(JSON.parse(openAIOptions.body)).toMatchObject({
      model: 'gpt-image-2-test',
      size: request.size,
      quality: request.quality,
    });
  });

  it('skips providers with missing credentials and honors the Cloudflare token alias', () => {
    vi.stubEnv('CLOUDFLARE_AI_KEY', '');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'cf-token');
    vi.stubEnv('CLOUDFLARE_IMAGE_MODEL', request.model);
    expect(resolveDefaultImageModel()).toBe(request.model);
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '');
    expect(resolveDefaultImageModel()).toBe('gemini-test-image');
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', '');
    expect(resolveDefaultImageModel()).toBe('gpt-image-2-test');
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(() => createDefaultImageGenerator()).toThrow('for uncached image generation');
  });

  it('honors explicit provider selection and its model default', async () => {
    vi.stubEnv('IMAGE_PROVIDER', 'openai');
    expect(resolveDefaultImageModel()).toBe('gpt-image-2-test');
    vi.stubEnv('IMAGE_PROVIDER', 'gemini');
    expect(resolveDefaultImageModel()).toBe('gemini-test-image');
    vi.stubEnv('IMAGE_PROVIDER', 'cloudflare');
    const fetchImage = vi.fn().mockResolvedValue(Response.json({}, {status: 408}));
    vi.stubGlobal('fetch', fetchImage);
    await expect(createDefaultImageGenerator()(request)).rejects.toThrow('Cloudflare image generation failed (408)');
    expect(fetchImage).toHaveBeenCalledOnce();
  });

  it('surfaces invalid requests without switching providers', async () => {
    const fetchImage = vi.fn().mockResolvedValue(Response.json({}, {status: 400}));
    vi.stubGlobal('fetch', fetchImage);
    await expect(createDefaultImageGenerator()(request)).rejects.toThrow('Cloudflare image generation failed (400)');
    expect(fetchImage).toHaveBeenCalledOnce();
  });

  it('reports the providers attempted when the chain fails', async () => {
    const fetchImage = vi.fn()
      .mockResolvedValueOnce(Response.json({}, {status: 408}))
      .mockResolvedValueOnce(Response.json({}, {status: 504}))
      .mockResolvedValueOnce(Response.json({error: {message: 'Unavailable'}}, {status: 403}));
    vi.stubGlobal('fetch', fetchImage);
    await expect(createDefaultImageGenerator()(request)).rejects.toThrow(/cloudflare: HTTP 408.*gemini: HTTP 504.*openai:.*Unavailable/u);
  });

  it('caches scene backgrounds generated by the fallback under the requested model', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'image-fallback-'));
    const fetchImage = vi.fn()
      .mockResolvedValueOnce(Response.json({}, {status: 408}))
      .mockImplementation(async () => geminiImage());
    vi.stubGlobal('fetch', fetchImage);
    const options: MaterializeSceneBackgroundsOptions = {
      aspectRatio: 'both',
      model: resolveDefaultImageModel(),
      outputDirectory,
      palette: 'emerald',
      quality: 'medium',
      regenerate: false,
      scenes: [{id: 'room', title: 'Room', backgroundPrompt: request.prompt}],
      stem: 'video',
    };
    try {
      const assets = await materializeSceneBackgrounds(options);
      await expect(readFile(assets['16:9'].room!)).resolves.toEqual(image);
      await expect(readFile(assets['9:16'].room!)).resolves.toEqual(image);
      await expect(materializeSceneBackgrounds(options)).resolves.toEqual(assets);
      expect(fetchImage).toHaveBeenCalledTimes(3);
    } finally {
      await rm(outputDirectory, {recursive: true, force: true});
    }
  });
});
