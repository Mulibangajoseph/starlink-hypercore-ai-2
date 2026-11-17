import { Hono } from 'hono';
import type { Env } from './env';
import statusRoutes from './routes/status';
import chatRoutes from './routes/chat';
import providersRoutes from './routes/providers';
import imageRoutes from './routes/image';
import { checkUsage, getUsage } from './usage';

const app = new Hono<{ Bindings: Env }>();

const DEFAULT_DAILY_LIMIT = 100;
const MAX_BODY_BYTES = 6_000_000;

function dailyLimit(env: Env): number {
  const raw = (env as unknown as Record<string, string | undefined>).DAILY_LIMIT;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
}

function deviceIdOf(req: Request): string {
  const header = req.headers.get('x-device-id') || req.headers.get('cf-connecting-ip') || 'anon';
  return header.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 64) || 'anon';
}

// Security headers on every response (API answers, 404s and errors included).
// The app stays embeddable by its host platform, so framing is limited with
// frame-ancestors for API responses rather than a blanket DENY.
app.use('*', async (c, next) => {
  await next();
  const h = c.res.headers;
  try {
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'no-referrer');
    h.set('Cross-Origin-Resource-Policy', 'same-origin');
    h.set('Permissions-Policy', 'geolocation=(), payment=(), usb=()');
    if (c.req.path.startsWith('/api')) {
      h.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self' https:");
      h.set('Cache-Control', 'no-store');
    }
  } catch {
    // Immutable headers (e.g. a proxied response): rebuild the response with the headers set.
    const headers = new Headers(c.res.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    headers.set('Permissions-Policy', 'geolocation=(), payment=(), usb=()');
    if (c.req.path.startsWith('/api')) {
      headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self' https:");
      headers.set('Cache-Control', 'no-store');
    }
    c.res = new Response(c.res.body, { status: c.res.status, statusText: c.res.statusText, headers });
  }
});

app.get('/api/health', (c) => c.json({ ok: true }));

// Secure routing: the AI routes are POST-only and guarded by a body-size check
// and a per-device daily quota that is enforced on the server.
const guard = async (
  c: import('hono').Context<{ Bindings: Env }>,
  next: () => Promise<void>
) => {
  if (c.req.method !== 'POST') return next();
  const length = parseInt(c.req.header('content-length') || '0', 10);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return c.json({ error: 'too_large', message: 'That request is too large. Send less text or a smaller file.' }, 413);
  }
  const limit = dailyLimit(c.env);
  const result = checkUsage(deviceIdOf(c.req.raw), limit);
  if (!result.ok) {
    return c.json(
      {
        error: 'limit_reached',
        message: `Daily limit reached: ${result.used} of ${result.limit} requests used on this device today. Try again tomorrow.`
      },
      429
    );
  }
  return next();
};

app.use('/api/chat', guard);
app.use('/api/image', guard);

app.get('/api/usage', (c) => {
  const usage = getUsage(deviceIdOf(c.req.raw), dailyLimit(c.env));
  return c.json({ used: usage.used, limit: usage.limit });
});

// The route modules may declare either relative ('/') or full ('/api/...') paths;
// mounting under both prefixes makes each endpoint resolve either way.
app.route('/api', statusRoutes);
app.route('/api', providersRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/image', imageRoutes);
app.route('/api', imageRoutes);
app.route('/', statusRoutes);
app.route('/', providersRoutes);
app.route('/', chatRoutes);
app.route('/', imageRoutes);

app.notFound((c) => c.json({ error: 'not_found', message: 'No such route.' }, 404));

app.onError((_err, c) => {
  // Never echo internals (or anything that could contain a key).
  return c.json({ error: 'server_error', message: 'Something went wrong on the server.' }, 500);
});

export default app;
