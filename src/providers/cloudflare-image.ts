import {withTransientImageRetries, type GenerateSceneImage} from '../scene-backgrounds.js';

export const createCloudflareImageGenerator = (): GenerateSceneImage => {
  const token = process.env.CLOUDFLARE_AI_KEY || process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!token || !accountId) {
    throw new Error(
      'CLOUDFLARE_AI_KEY (or CLOUDFLARE_API_TOKEN) and CLOUDFLARE_ACCOUNT_ID are required in your .env file for Cloudflare Workers AI image generation.',
    );
  }

  return async ({prompt, model}) => withTransientImageRetries(
    async () => {
      const activeModel = model && model.startsWith('@cf/')
        ? model
        : '@cf/black-forest-labs/flux-1-schnell';
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${activeModel}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({prompt}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudflare image generation failed (${response.status}): ${errorText}`);
      }

      const data = await response.json() as {
        result?: {image?: string};
        success?: boolean;
        errors?: Array<{message?: string}>;
      };

      if (!data.result?.image) {
        const message = data.errors?.[0]?.message ?? 'No image data returned';
        throw new Error(`Cloudflare image generation returned no image: ${message}`);
      }

      return Buffer.from(data.result.image, 'base64');
    },
  );
};
