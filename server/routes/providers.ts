import { Hono } from 'hono';
import type { Env } from '../env';
import { PROVIDERS } from '../providers/config';
import { getUsage } from '../usage';

interface ProviderOut {
  id: string;
  label: string;
  configured: boolean;
  paid: boolean;
  envKey: string;
  models: { id: string; label: string }[];
}

const DEFAULT_LIMIT = 100;

function readEnv(env: unknown, name: string): string {
  const value = (env as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value.trim() : '';
}

function dailyLimit(env: unknown): number {
  const n = parseInt(readEnv(env, 'DAILY_LIMIT'), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT;
}

const providersRoutes = new Hono<{ Bindings: Env }>();

// Only the presence of each key is reported — never a value.
providersRoutes.get('/api/providers', (c) => {
  const env = c.env;
  const providers: ProviderOut[] = PROVIDERS.map((def) => ({
    id: def.id,
    label: def.label,
    configured: readEnv(env, def.envKey).length > 0,
    paid: def.paid,
    envKey: def.envKey,
    models: def.models.map((m) => ({ id: m.id, label: m.label }))
  }));

  if (readEnv(env, 'AI_API_KEY')) {
    const model = readEnv(env, 'AI_MODEL');
    providers.push({
      id: 'default',
      label: 'Default',
      configured: true,
      paid: true,
      envKey: 'AI_API_KEY',
      models: [{ id: model || 'default', label: model || 'Server default' }]
    });
  }

  const limit = dailyLimit(env);
  const deviceId = (c.req.header('x-device-id') || '').slice(0, 80) || 'anonymous';
  let usage = { used: 0, limit };
  try {
    usage = getUsage(deviceId, limit);
  } catch {
    usage = { used: 0, limit };
  }

  c.header('Cache-Control', 'no-store');
  return c.json({ providers, usage });
});

export default providersRoutes;
