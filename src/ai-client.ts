import OpenAI from 'openai';

export type AIProvider = 'openai' | 'gemini' | 'groq';

export interface AIClientInfo {
  client: OpenAI;
  model: string;
  provider: AIProvider;
}

export const resolveAIProvider = (preferred?: string): AIProvider => {
  if (preferred === 'gemini' || preferred === 'groq' || preferred === 'openai') {
    return preferred;
  }
  const fromEnv = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (fromEnv === 'gemini' || fromEnv === 'groq' || fromEnv === 'openai') {
    return fromEnv;
  }
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GOOGLE_GEMINI_API_KEY) return 'gemini';
  if (process.env.GROQ_API_KEY) return 'groq';
  return 'openai';
};

export const defaultModelForProvider = (provider: AIProvider): string => {
  switch (provider) {
    case 'gemini':
      return process.env.GOOGLE_GEMINI_MODEL ?? 'gemini-3.5-flash';
    case 'groq':
      return process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
    case 'openai':
    default:
      return process.env.OPENAI_MODEL ?? 'gpt-5.6';
  }
};

export const createAIClient = (options: {
  model?: string | undefined;
  provider?: string | undefined;
} = {}): AIClientInfo => {
  const provider = resolveAIProvider(options.provider);
  const model = options.model ?? defaultModelForProvider(provider);

  if (provider === 'gemini') {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GOOGLE_GEMINI_API_KEY is required for Gemini generation. Set it in your .env file.',
      );
    }
    return {
      client: new OpenAI({
        apiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      }),
      model,
      provider,
    };
  }

  if (provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is required for Groq generation. Set it in your .env file.');
    }
    return {
      client: new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      }),
      model,
      provider,
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required. Set it in your shell or in a local .env file.');
  }

  return {
    client: new OpenAI({apiKey: process.env.OPENAI_API_KEY}),
    model,
    provider: 'openai',
  };
};

const isTransientError = (error: unknown): boolean => {
  const status = (error as {status?: unknown})?.status;
  const message = String((error as {message?: unknown})?.message ?? '').toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    (typeof status === 'number' && status >= 500) ||
    message.includes('quota') ||
    message.includes('resource_exhausted') ||
    message.includes('resource exhausted') ||
    message.includes('rate limit') ||
    message.includes('rate_limit') ||
    message.includes('retry in')
  );
};

const extractRetryDelay = (error: unknown, attempt: number): number => {
  const message = String((error as {message?: unknown})?.message ?? '');
  const match = message.match(/retry in ([0-9.]+)s/i);
  if (match && match[1]) {
    return Math.ceil(parseFloat(match[1]) * 1000) + 1500;
  }
  return 1500 * 2 ** attempt;
};

export const withTransientRetries = async <T>(
  operation: () => Promise<T>,
  retries = 4,
  wait: (milliseconds: number) => Promise<void> = async (ms) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  },
): Promise<T> => {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientError(error) || attempt === retries - 1) throw error;
      const delay = extractRetryDelay(error, attempt);
      if (delay >= 2000) {
        console.log(`Rate limit reached; waiting ${(delay / 1000).toFixed(1)}s for quota window to reset...`);
      }
      await wait(delay);
    }
  }
  throw new Error('Transient retry loop ended unexpectedly.');
};

