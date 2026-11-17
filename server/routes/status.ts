import { Hono } from 'hono';
import type { Env } from '../env';
import { PROVIDERS } from '../providers/config';

const statusRoutes = new Hono<{ Bindings: Env }>();

function present(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.host;
  } catch {
    return null;
  }
}

// Reports setup status only. Never returns, logs or echoes any secret value.
statusRoutes.get('/status', (c) => {
  const env = (c.env ?? {}) as Partial<Record<string, unknown>>;
  const missing: string[] = [];

  if (!present(env.AI_API_KEY)) missing.push('AI_API_KEY');

  let provider: string | null = null;
  if (!present(env.AI_BASE_URL)) {
    missing.push('AI_BASE_URL');
  } else {
    provider = hostOf(env.AI_BASE_URL);
    if (!provider) missing.push('AI_BASE_URL');
  }

  let model: string | null = null;
  if (!present(env.AI_MODEL)) missing.push('AI_MODEL');
  else model = env.AI_MODEL.trim();

  const configured = missing.length === 0;

  // Per-provider flags only: true or false, never the key itself.
  const providers: { id: string; configured: boolean }[] = PROVIDERS.map((p) => ({
    id: p.id,
    configured: present(env[p.envKey])
  }));
  providers.push({ id: 'default', configured });

  c.header('Cache-Control', 'no-store');
  return c.json({
    configured,
    provider: configured ? provider : null,
    model: configured ? model : null,
    video: present(env.VIDEO_API_KEY),
    missing,
    providers
  });
});

export default statusRoutes;
