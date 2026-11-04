import OpenAI from 'openai';
import type {ImageQuality} from '../types.js';
import {createCloudflareImageGenerator, DEFAULT_CLOUDFLARE_IMAGE_MODEL} from './cloudflare-image.js';
import {createGeminiImageGenerator} from './gemini-image.js';

export interface GenerateSceneImageOptions {
  model: string;
  negativePrompt?: string | undefined;
  prompt: string;
  quality: ImageQuality;
  size: string;
}

export type GenerateSceneImage = (options: GenerateSceneImageOptions) => Promise<Buffer>;

const imageProviders = ['cloudflare', 'gemini', 'openai'] as const;
type ImageProvider = typeof imageProviders[number];

const providerOrder = (): ImageProvider[] => {
  const selected = process.env.IMAGE_PROVIDER?.trim().toLowerCase();
  if (selected === 'cloudflare' || selected === 'gemini' || selected === 'openai') {
    return [selected];
  }
  return imageProviders.filter((provider) => {
    switch (provider) {
      case 'cloudflare':
        return Boolean((process.env.CLOUDFLARE_AI_KEY || process.env.CLOUDFLARE_API_TOKEN)
          && process.env.CLOUDFLARE_ACCOUNT_ID);
      case 'gemini':
        return Boolean(process.env.GOOGLE_GEMINI_API_KEY);
      case 'openai':
        return Boolean(process.env.OPENAI_API_KEY);
    }
  });
};

const defaultModel = (provider: ImageProvider): string => {
  switch (provider) {
    case 'cloudflare':
      return process.env.CLOUDFLARE_IMAGE_MODEL || DEFAULT_CLOUDFLARE_IMAGE_MODEL;
    case 'gemini':
      return process.env.GOOGLE_GEMINI_IMAGE_MODEL || 'gemini-nano-banana-2.1';
    case 'openai':
      return process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  }
};

export const resolveDefaultImageModel = (): string => defaultModel(providerOrder()[0] ?? 'openai');

const imageErrorStatus = (error: unknown): number | undefined => {
  const status = (error as {status?: unknown})?.status;
  return typeof status === 'number' ? status : undefined;
};

const isRetryableStatus = (status: number | undefined): boolean =>
  status === 429 || (status !== undefined && status >= 500 && status !== 504);

const providerFailureReason = (error: unknown): string | undefined => {
  const status = imageErrorStatus(error);
  if (status === 401 || status === 403 || status === 404 || status === 408
    || status === 504 || isRetryableStatus(status)) {
    return `HTTP ${status}`;
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError
    || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))) {
    return 'request timed out';
  }
  if (error instanceof OpenAI.APIConnectionError
    || (error instanceof TypeError && ['fetch failed', 'terminated'].includes(error.message))) {
    return 'connection failed';
  }
  return undefined;
};

export const withTransientImageRetries = async <T>(
  operation: () => Promise<T>,
  wait: (milliseconds: number) => Promise<void> = async (milliseconds) => {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
  },
): Promise<T> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableStatus(imageErrorStatus(error)) || attempt === 2) throw error;
      await wait(500 * 2 ** attempt);
    }
  }
  throw new Error('Image generation retry loop ended unexpectedly.');
};

const createOpenAIImageGenerator = (): GenerateSceneImage => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for OpenAI image generation.');
  }
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 150_000,
  });
  return async ({model, negativePrompt, prompt, quality, size}) => {
    const response = await client.images.generate({
      background: 'opaque',
      model,
      n: 1,
      output_compression: 88,
      output_format: 'jpeg',
      prompt: negativePrompt ? `${prompt} Do not include: ${negativePrompt}.` : prompt,
      quality,
      size,
    });
    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) {
      throw new Error('OpenAI image generation returned no image data.');
    }
    return Buffer.from(encoded, 'base64');
  };
};

const factories: Record<ImageProvider, () => GenerateSceneImage> = {
  cloudflare: createCloudflareImageGenerator,
  gemini: createGeminiImageGenerator,
  openai: createOpenAIImageGenerator,
};

export const createDefaultImageGenerator = (): GenerateSceneImage => {
  const providers = providerOrder();
  if (!providers.length) {
    throw new Error('Set Cloudflare Workers AI credentials, GOOGLE_GEMINI_API_KEY, or OPENAI_API_KEY for uncached image generation.');
  }
  const candidates = providers.map((provider) => ({
    provider,
    model: defaultModel(provider),
    generate: factories[provider](),
  }));
  let activeIndex = 0;
  return async (options) => {
    const failures: string[] = [];
    for (let index = activeIndex; index < candidates.length; index += 1) {
      const {provider, model, generate} = candidates[index]!;
      try {
        return await withTransientImageRetries(() =>
          generate({...options, model: index === 0 ? options.model : model}));
      } catch (error) {
        const next = candidates[index + 1];
        const reason = providerFailureReason(error);
        if (!next || !reason) {
          if (!failures.length) throw error;
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`Image generation failed. ${[...failures, `${provider}: ${detail}`].join(' | ')}`, {cause: error});
        }
        failures.push(`${provider}: ${reason}`);
        if (activeIndex <= index) {
          activeIndex = index + 1;
          console.warn(`Image generation: ${provider} failed (${reason}). Switching to ${next.provider} (${next.model}).`);
        }
      }
    }
    throw new Error('Image generation provider loop ended unexpectedly.');
  };
};
