import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../env';
import { PROVIDERS as CATALOGUE } from '../providers/config';
import type { ProviderDef, ProviderId } from '../providers/config';
import { ProviderError, completeOnce, streamCompletion } from '../providers/adapters';

/*
 * POST /api/chat
 *   body: { mode, messages, image?, provider?, model?, stream? }
 *   provider: openai | claude | gemini | deepseek  (omitted = legacy AI_API_KEY / AI_BASE_URL / AI_MODEL,
 *   or the first provider with a key)
 *
 * stream:false (default) -> 200 { reply, model, provider }
 * stream:true            -> 200 text/event-stream, each event is one line:  data: {json}\n\n
 *     {"type":"delta","delta":"text"}                         repeated
 *     {"type":"done","model":"...","provider":"..."}          last event on success
 *     {"type":"error","error":"code","message":"..."}         last event on a failure mid-stream
 * Failures before the first byte are plain JSON with a 4xx/5xx status:
 *     400 bad_*  | 413 too long | 502 provider_* | 503 needs_setup { missing: [...] }
 * The daily quota (429) is enforced by the guard in server/index.ts.
 *
 * Provider requests are built and parsed by the adapter layer (server/providers/adapters.ts);
 * models come from the catalogue (server/providers/config.ts).
 * Keys are read from c.env only and never sent anywhere except to their own provider.
 */

type Mode = 'general' | 'code' | 'writing' | 'image' | 'documents';
type Role = 'user' | 'assistant';
type Fail = 400 | 413 | 502 | 503;

const MODES: Mode[] = ['general', 'code', 'writing', 'image', 'documents'];
const MAX_CHARS = 8000;
const MAX_DOC_CHARS = 60_000;
const MAX_TOTAL_CHARS = 150_000;
const MAX_CONTEXT = 20;
const MAX_IMAGE_CHARS = 4_000_000;
const TIMEOUT_MS = 45_000;
const STREAM_TIMEOUT_MS = 120_000;
const MODEL_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;

const BASE_PROMPT =
  'You are STARLINK HYPERCORE AI, a helpful, honest and concise assistant. Use Markdown. Put code in fenced code blocks with a language tag. If you are unsure, say so instead of guessing.';

const MODE_PROMPT: Record<Mode, string> = {
  general: BASE_PROMPT,
  code:
    BASE_PROMPT +
    ' You are in coding-help mode: act as a senior software engineer. Explain errors step by step, give working, minimal code, mention edge cases, and review code for bugs and security issues. For any non-trivial request, begin with a brief plan (2-4 bullet points) before the code. After the code, list the important edge cases you handled or that remain, and suggest a few focused tests (or include a small test file when the person asks for tests). When reviewing code, group findings by severity (bug, security, performance, style) and show the fix for each. When asked to explain code, walk through it in order, then summarise what it does in one sentence. When asked to refactor, keep the behaviour identical and say what changed and why. When asked to build a website or landing page, answer with ONE complete, self-contained HTML file (inline CSS and JavaScript, no external scripts, fonts or images) in a single ```html code block, followed by a short note on how it is organised.',
  writing:
    BASE_PROMPT +
    " You are in writing-help mode: act as a careful editor and writer. Improve clarity, tone and structure, keep the author's voice, and when editing show the revised text first, then a short note on what changed.",
  image:
    BASE_PROMPT +
    ' You are in image-understanding mode: describe and analyse the image the person attached, read any visible text, and answer their question about it. If no image is attached, ask them to attach one.',
  documents:
    BASE_PROMPT +
    ' You are in document-analysis mode: the person shares text extracted from a file together with a question. Answer using only that text, refer to the file by name, quote short passages when useful, and say clearly when the document does not contain the answer.'
};

interface InMessage {
  role: Role;
  content: string;
}

interface Target {
  def: ProviderDef;
  key: string;
  model: string;
  publicId: string;
}

type Ctx = Context<{ Bindings: Env }>;

const chatRoutes = new Hono<{ Bindings: Env }>();

chatRoutes.onError((_err, c) => c.json({ error: 'server_error', message: 'Something went wrong on the server.' }, 500));

// ---------------------------------------------------------------- helpers

function envVal(c: Ctx, name: string): string {
  const env = c.env as unknown as Record<string, unknown> | undefined;
  const v = env?.[name];
  return typeof v === 'string' ? v.trim() : '';
}

function jsonFail(c: Ctx, status: Fail, error: string, message: string, extra?: Record<string, unknown>) {
  return c.json({ error, message, ...extra }, status);
}

function shortMessage(text: string, secrets: string[]): string {
  let out = text.replace(/\s+/g, ' ').trim();
  for (const s of secrets) {
    if (s && s.length > 3) out = out.split(s).join('[hidden]');
  }
  return out.length > 300 ? out.slice(0, 297) + '...' : out;
}

function isImageDataUrl(value: string): boolean {
  return /^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(value);
}

function normalize(ms: InMessage[]): InMessage[] {
  const out: InMessage[] = [];
  for (const m of ms) {
    if (out.length === 0 && m.role === 'assistant') continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

// ---------------------------------------------------------------- main handler

const handler = async (c: Ctx) => {
  // 1. Parse and validate input (4xx on anything wrong)
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return jsonFail(c, 400, 'bad_request', 'Send a JSON body.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return jsonFail(c, 400, 'bad_request', 'Send a JSON object.');
  }
  const body = raw as { mode?: unknown; messages?: unknown; image?: unknown; provider?: unknown; model?: unknown; stream?: unknown };

  if (body.mode === 'imagegen') {
    return jsonFail(c, 400, 'bad_mode', 'Image generation uses POST /api/image, not /api/chat.');
  }
  if (typeof body.mode !== 'string' || !MODES.includes(body.mode as Mode)) {
    return jsonFail(c, 400, 'bad_mode', 'mode must be one of: general, code, writing, image, documents.');
  }
  const mode = body.mode as Mode;
  const perMessageLimit = mode === 'documents' ? MAX_DOC_CHARS : MAX_CHARS;

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonFail(c, 400, 'bad_messages', 'messages must be a non-empty array.');
  }
  const messages: InMessage[] = [];
  for (const m of body.messages) {
    if (!m || typeof m !== 'object') {
      return jsonFail(c, 400, 'bad_messages', 'Each message needs a role and content.');
    }
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
      return jsonFail(c, 400, 'bad_messages', 'Each message needs a role (user or assistant) and text content.');
    }
    if (content.length > perMessageLimit) {
      return jsonFail(
        c,
        413,
        'message_too_long',
        `Messages are limited to ${perMessageLimit.toLocaleString('en-US')} characters${mode === 'documents' ? '. Try a shorter document or a part of it.' : '.'}`
      );
    }
    if (content.trim().length === 0) continue;
    messages.push({ role, content });
  }
  const context = normalize(messages.slice(-MAX_CONTEXT));
  if (context.length === 0 || context[context.length - 1].role !== 'user') {
    return jsonFail(c, 400, 'bad_messages', 'The last message must be a non-empty user message.');
  }
  if (context.reduce((n, m) => n + m.content.length, 0) > MAX_TOTAL_CHARS) {
    return jsonFail(c, 413, 'input_too_large', 'The conversation is too long. Start a new chat or shorten the text.');
  }

  let image: string | undefined;
  if (body.image !== undefined && body.image !== null && body.image !== '') {
    if (typeof body.image !== 'string') {
      return jsonFail(c, 400, 'bad_image', 'image must be a base64 data URL of an image.');
    }
    if (!isImageDataUrl(body.image)) {
      return jsonFail(c, 400, 'bad_image', 'image must be a base64 data URL of a JPEG, PNG, WebP or GIF image.');
    }
    if (body.image.length > MAX_IMAGE_CHARS) {
      return jsonFail(c, 413, 'image_too_large', 'The image is too large. Try a smaller photo.');
    }
    image = body.image;
  }

  const wantStream = body.stream === true;

  let providerId: ProviderId | null = null;
  if (body.provider !== undefined && body.provider !== null && body.provider !== '' && body.provider !== 'default') {
    if (typeof body.provider !== 'string' || !CATALOGUE.some((p) => p.id === body.provider)) {
      return jsonFail(c, 400, 'bad_provider', 'provider must be one of: openai, claude, gemini, deepseek.');
    }
    providerId = body.provider as ProviderId;
  }

  let requestedModel = '';
  if (body.model !== undefined && body.model !== null && body.model !== '') {
    if (typeof body.model !== 'string' || !MODEL_PATTERN.test(body.model.trim())) {
      return jsonFail(c, 400, 'bad_model', 'model is not a valid model id.');
    }
    requestedModel = body.model.trim();
  }

  // 2. Resolve provider, key and model from server secrets
  let target: Target | null = null;

  if (providerId === null) {
    // Legacy fallback: AI_API_KEY / AI_BASE_URL / AI_MODEL (OpenAI-compatible).
    const legacyKey = envVal(c, 'AI_API_KEY');
    const legacyBase = envVal(c, 'AI_BASE_URL');
    const legacyModel = envVal(c, 'AI_MODEL');
    if (legacyKey && legacyBase && legacyModel) {
      let https = false;
      try {
        https = new URL(legacyBase).protocol === 'https:';
      } catch {
        https = false;
      }
      if (!https) return jsonFail(c, 503, 'bad_config', 'AI_BASE_URL must be a valid https URL.');
      target = {
        def: { id: 'openai', label: 'The AI provider', envKey: 'AI_API_KEY', paid: true, models: [], baseUrl: legacyBase },
        key: legacyKey,
        model: legacyModel,
        publicId: 'default'
      };
    } else {
      const first = CATALOGUE.find((p) => envVal(c, p.envKey));
      if (!first) {
        return jsonFail(
          c,
          503,
          'needs_setup',
          `No AI provider is connected. Add ${CATALOGUE.map((p) => p.envKey).join(', ')} (any one) in the server settings.`,
          { missing: CATALOGUE.map((p) => p.envKey) }
        );
      }
      providerId = first.id;
    }
  }

  if (!target) {
    const pid = providerId as ProviderId;
    const def = CATALOGUE.find((p) => p.id === pid);
    if (!def) return jsonFail(c, 400, 'bad_provider', 'provider must be one of: openai, claude, gemini, deepseek.');
    const key = envVal(c, def.envKey);
    if (!key) {
      return jsonFail(c, 503, 'needs_setup', `${def.label} is not connected. Add ${def.envKey} in the server settings.`, {
        missing: [def.envKey],
        provider: def.id
      });
    }
    if (image && def.id === 'deepseek') {
      return jsonFail(c, 400, 'image_unsupported', 'DeepSeek cannot read images. Pick OpenAI, Claude or Gemini for image understanding.');
    }
    target = { def, key, model: requestedModel || def.models[0]?.id || '', publicId: def.id };
  }

  const { def, key, model, publicId } = target;
  const label = def.label;
  const system = MODE_PROMPT[mode];

  // 3. Call the provider through the adapter layer
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), wantStream ? STREAM_TIMEOUT_MS : TIMEOUT_MS);

  const failCode = (e: unknown) => (e instanceof ProviderError ? 'provider_error' : 'provider_unreachable');
  const failMessage = (e: unknown) => {
    if (e instanceof ProviderError) return shortMessage(e.message, [key]);
    return controller.signal.aborted ? `${label} took too long to answer.` : `Could not reach ${label}.`;
  };

  // 3a. Non-streaming
  if (!wantStream) {
    try {
      const reply = (await completeOnce(def, key, model, system, context, image, controller.signal)).trim();
      if (!reply) return jsonFail(c, 502, 'empty_reply', `${label} returned an empty answer.`, { provider: publicId });
      return c.json({ reply, model, provider: publicId });
    } catch (e) {
      return jsonFail(c, 502, failCode(e), failMessage(e), { provider: publicId });
    } finally {
      clearTimeout(timer);
    }
  }

  // 3b. Streaming: the adapter yields text deltas; re-emit them in one simple SSE format
  let source: ReadableStream<string>;
  try {
    source = await streamCompletion(def, key, model, system, context, image, controller.signal);
  } catch (e) {
    clearTimeout(timer);
    return jsonFail(c, 502, failCode(e), failMessage(e), { provider: publicId });
  }

  const reader = source.getReader();
  const encoder = new TextEncoder();

  const out = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let closed = false;
      const send = (obj: Record<string, unknown>) => {
        if (closed) return;
        try {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };
      let total = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            total += value.length;
            send({ type: 'delta', delta: value });
          }
        }
        if (total === 0) send({ type: 'error', error: 'empty_reply', message: `${label} returned an empty answer.` });
        else send({ type: 'done', model, provider: publicId });
      } catch (e) {
        send({
          type: 'error',
          error: failCode(e),
          message:
            e instanceof ProviderError
              ? `${label} stopped the answer: ${shortMessage(e.message, [key])}`
              : controller.signal.aborted
                ? `${label} took too long to answer.`
                : `The connection to ${label} was interrupted.`
        });
      } finally {
        clearTimeout(timer);
        if (!closed) {
          closed = true;
          try {
            ctrl.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    cancel() {
      clearTimeout(timer);
      controller.abort();
      reader.cancel().catch(() => undefined);
    }
  });

  return new Response(out, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    }
  });
};

// Registered on every path the parent app might mount this router at
// (mounted at "/", "/api" or "/api/chat"), so the route is always POST /api/chat.
chatRoutes.post('/api/chat', handler);
chatRoutes.post('/chat', handler);
chatRoutes.post('/', handler);

export default chatRoutes;
