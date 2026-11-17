import { Hono } from 'hono';
import type { Env } from '../env';

const imageRoutes = new Hono<{ Bindings: Env }>();

const MAX_PROMPT_CHARS = 1000;
const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';
const DEFAULT_IMAGE_MODEL = 'gpt-image-1';

type LooseEnv = Record<string, string | undefined>;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}


interface OpenAiImageResponse {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
}

imageRoutes.post('/api/image', async (c) => {
  const env = c.env as unknown as LooseEnv;
  const key = env.OPENAI_API_KEY;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_request', message: 'Send a JSON body with a prompt.' }, 400);
  }
  const prompt =
    body && typeof body === 'object' && typeof (body as { prompt?: unknown }).prompt === 'string'
      ? ((body as { prompt: string }).prompt).trim()
      : '';
  if (!prompt) {
    return c.json({ error: 'bad_request', message: 'Describe the image you want to create.' }, 400);
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return c.json(
      { error: 'too_long', message: `Image prompts can be at most ${MAX_PROMPT_CHARS} characters.` },
      413
    );
  }

  if (!key) {
    return c.json(
      {
        error: 'needs_setup',
        missing: ['OPENAI_API_KEY'],
        message:
          'Image generation needs OPENAI_API_KEY on the server. It is a paid service billed by OpenAI per image.'
      },
      503
    );
  }


  const model = env.IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  let res: Response;
  try {
    res = await fetch(OPENAI_IMAGES_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024' }),
      signal: AbortSignal.timeout(90000)
    });
  } catch {
    return c.json(
      { error: 'upstream_unreachable', message: 'Could not reach OpenAI for image generation. Try again.' },
      502
    );
  }

  let data: OpenAiImageResponse = {};
  try {
    data = (await res.json()) as OpenAiImageResponse;
  } catch {
    data = {};
  }

  if (!res.ok) {
    if (res.status === 401) {
      return c.json(
        { error: 'upstream_auth', message: 'OpenAI rejected OPENAI_API_KEY. Check the key on the server.' },
        502
      );
    }
    if (res.status === 429) {
      return c.json(
        { error: 'upstream_rate', message: 'OpenAI is rate limiting or out of credit for images. Check billing.' },
        502
      );
    }
    const detail = data.error?.message ? ` ${data.error.message.slice(0, 200)}` : '';
    return c.json(
      { error: 'upstream_error', message: `OpenAI could not create the image (status ${res.status}).${detail}` },
      502
    );
  }

  const item = data.data?.[0];
  let image = '';
  if (item?.b64_json) {
    image = `data:image/png;base64,${item.b64_json}`;
  } else if (item?.url) {
    try {
      const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(60000) });
      if (!imgRes.ok) throw new Error('fetch failed');
      const type = imgRes.headers.get('content-type') || 'image/png';
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      image = `data:${type};base64,${bytesToBase64(bytes)}`;
    } catch {
      return c.json({ error: 'upstream_error', message: 'The image was created but could not be downloaded.' }, 502);
    }
  }

  if (!image) {
    return c.json({ error: 'upstream_error', message: 'OpenAI returned no image. Try a different prompt.' }, 502);
  }

  return c.json({ image, model, reply: '' });
});

export default imageRoutes;
