import type {GenerateSceneImage} from './image-generation.js';

export const createGeminiImageGenerator = (): GenerateSceneImage => {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY is required for Gemini image generation.');
  }

  return async ({model, negativePrompt, prompt, size}) => {
    const [width = 0, height = 0] = size.split('x').map(Number);
    const aspectRatio = width === height ? '1:1' : width < height ? '9:16' : '16:9';
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Api-Revision': '2026-05-20',
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        model,
        input: negativePrompt ? `${prompt} Do not include: ${negativePrompt}.` : prompt,
        store: false,
        response_format: {
          type: 'image',
          mime_type: 'image/jpeg',
          aspect_ratio: aspectRatio,
          image_size: '2K',
        },
      }),
    });
    if (!response.ok) {
      throw Object.assign(new Error(`Gemini image generation failed (${response.status}): ${await response.text()}`), {
        status: response.status,
      });
    }

    const data = await response.json() as {
      steps?: Array<{type: string; content?: Array<{type: string; data?: string}>}>;
    };
    const image = data.steps
      ?.filter((step) => step.type === 'model_output')
      .flatMap((step) => step.content ?? [])
      .find((part) => part.type === 'image' && part.data);
    const bytes = Buffer.from(image?.data ?? '', 'base64');
    if (!bytes.length) {
      throw new Error('Gemini image generation returned no image data.');
    }
    return bytes;
  };
};
