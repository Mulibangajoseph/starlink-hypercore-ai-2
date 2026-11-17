import type { ApiError, ChatRequest, ChatResponse, ProviderInfo, ServerStatus, UsageInfo } from './types';
import { apiBase } from './native';

export class ApiFailure extends Error {
  code: string;
  missing?: string[];
  constructor(code: string, message: string, missing?: string[]) {
    super(message);
    this.name = 'ApiFailure';
    this.code = code;
    this.missing = missing;
  }
}

const MAX_IMAGE_SIDE = 1024;
const JPEG_QUALITY = 0.82;
const DEVICE_KEY = 'app:deviceId';
const OFFLINE_MESSAGE = 'You are offline. Reconnect to send messages.';

/** In the browser the path stays relative; inside the Android app it points at the live server. */
function withBase(path: string): string {
  let base = '';
  try {
    base = apiBase();
  } catch {
    base = '';
  }
  if (!base) return path;
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** A stable anonymous id for this device, sent to the server for usage limits. */
function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

function jsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Device-Id': getDeviceId() };
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function toFailure(res: Response, body: unknown): ApiFailure {
  const err = (body && typeof body === 'object' ? body : {}) as Partial<ApiError>;
  const code = typeof err.error === 'string' && err.error ? err.error : `http_${res.status}`;
  const message =
    typeof err.message === 'string' && err.message
      ? err.message
      : res.status === 429
        ? 'Daily request limit reached for this device. Try again tomorrow.'
        : res.status === 503
          ? 'AI provider not connected'
          : res.status === 413
            ? 'That message or file is too large.'
            : res.status >= 500
              ? 'The AI provider returned an error. Try again.'
              : 'The request could not be completed.';
  const missing = Array.isArray(err.missing) ? err.missing.filter((m): m is string => typeof m === 'string') : undefined;
  return new ApiFailure(code, message, missing);
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(withBase(path), {
      ...init,
      headers: { 'X-Device-Id': getDeviceId(), ...(init?.headers as Record<string, string> | undefined) }
    });
  } catch {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new ApiFailure('offline', OFFLINE_MESSAGE);
    }
    throw new ApiFailure('network', 'Cannot reach server');
  }
  const body = await readJson(res);
  if (!res.ok) throw toFailure(res, body);
  return body;
}

export async function fetchStatus(): Promise<ServerStatus> {
  const body = (await request('api/status')) as Partial<ServerStatus> | null;
  if (!body || typeof body !== 'object' || typeof body.configured !== 'boolean') {
    throw new ApiFailure('bad_response', 'Cannot reach server');
  }
  const status: ServerStatus = {
    configured: body.configured,
    provider: typeof body.provider === 'string' ? body.provider : null,
    model: typeof body.model === 'string' ? body.model : null,
    video: body.video === true,
    missing: Array.isArray(body.missing) ? body.missing.filter((m): m is string => typeof m === 'string') : []
  };
  if (Array.isArray(body.providers)) {
    status.providers = body.providers
      .filter((p): p is { id: string; configured: boolean } => !!p && typeof p === 'object' && typeof (p as { id?: unknown }).id === 'string')
      .map((p) => ({ id: p.id, configured: p.configured === true }));
  }
  return status;
}

function parseUsage(raw: unknown): UsageInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as { used?: unknown; limit?: unknown };
  if (typeof u.used === 'number' && typeof u.limit === 'number') return { used: u.used, limit: u.limit };
  return null;
}

function parseProvider(raw: unknown): ProviderInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string') return null;
  const models = Array.isArray(p.models)
    ? p.models
        .map((m) => {
          if (typeof m === 'string') return { id: m, label: m };
          if (m && typeof m === 'object') {
            const mm = m as { id?: unknown; label?: unknown };
            if (typeof mm.id === 'string') return { id: mm.id, label: typeof mm.label === 'string' ? mm.label : mm.id };
          }
          return null;
        })
        .filter((m): m is { id: string; label: string } => m !== null)
    : [];
  return {
    id: p.id as ProviderInfo['id'],
    label: typeof p.label === 'string' ? p.label : p.id,
    configured: p.configured === true,
    paid: p.paid !== false,
    envKey: typeof p.envKey === 'string' ? p.envKey : '',
    models
  };
}

/** Provider catalogue with configured flags (no secrets) and today's usage for this device. */
export async function fetchProviders(): Promise<{ providers: ProviderInfo[]; usage: UsageInfo | null }> {
  const body = await request('api/providers');
  const list = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { providers?: unknown }).providers)
      ? ((body as { providers: unknown[] }).providers)
      : null;
  if (!list) throw new ApiFailure('bad_response', 'Cannot reach server');
  const providers = list.map(parseProvider).filter((p): p is ProviderInfo => p !== null);
  const usage = body && typeof body === 'object' && !Array.isArray(body) ? parseUsage((body as { usage?: unknown }).usage) : null;
  return { providers, usage };
}

export async function sendChat(req: ChatRequest): Promise<ChatResponse> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiFailure('offline', OFFLINE_MESSAGE);
  }
  const body = (await request('api/chat', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ ...req, stream: false })
  })) as Partial<ChatResponse> | null;
  if (!body || typeof body.reply !== 'string') {
    throw new ApiFailure('bad_response', 'The AI provider sent an empty answer. Try again.');
  }
  return { reply: body.reply, model: typeof body.model === 'string' ? body.model : '' };
}

function extractSseText(data: string): string {
  if (!data || data === '[DONE]') return '';
  try {
    const obj = JSON.parse(data) as unknown;
    if (typeof obj === 'string') return obj;
    if (obj && typeof obj === 'object') {
      const o = obj as Record<string, unknown>;
      if (typeof o.error === 'string') {
        throw new ApiFailure(o.error, typeof o.message === 'string' ? o.message : 'The AI provider returned an error. Try again.');
      }
      for (const key of ['delta', 'text', 'content', 'reply']) {
        if (typeof o[key] === 'string') return o[key] as string;
      }
    }
    return '';
  } catch (e) {
    if (e instanceof ApiFailure) throw e;
    return data;
  }
}

/**
 * Streams a reply from api/chat. Calls onDelta for each piece (with the full text so far).
 * Resolves with the full reply; when stopped through the signal it resolves with what arrived.
 * If streaming cannot start, falls back to the non-stream request.
 */
export async function sendChatStream(
  req: ChatRequest,
  onDelta: (delta: string, full: string) => void,
  signal?: AbortSignal
): Promise<ChatResponse> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiFailure('offline', OFFLINE_MESSAGE);
  }
  let full = '';
  let model = req.model ?? '';
  try {
    let res: Response;
    try {
      res = await fetch(withBase('api/chat'), {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ ...req, stream: true }),
        signal
      });
    } catch (e) {
      if (signal?.aborted) return { reply: '', model };
      void e;
      throw new ApiFailure('network', 'Cannot reach server');
    }
    if (!res.ok) throw toFailure(res, await readJson(res));
    const headerModel = res.headers.get('X-Model');
    if (headerModel) model = headerModel;
    const type = (res.headers.get('Content-Type') ?? '').toLowerCase();

    if (type.includes('application/json') || !res.body) {
      const body = (await readJson(res)) as Partial<ChatResponse> | null;
      if (!body || typeof body.reply !== 'string') {
        throw new ApiFailure('bad_response', 'The AI provider sent an empty answer. Try again.');
      }
      if (typeof body.model === 'string') model = body.model;
      full = body.reply;
      onDelta(full, full);
      return { reply: full, model };
    }

    const isSse = type.includes('text/event-stream');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const push = (piece: string) => {
      if (!piece) return;
      full += piece;
      onDelta(piece, full);
    };
    const handleSseBlock = (block: string) => {
      const dataLines: string[] = [];
      let event = '';
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
      }
      if (!dataLines.length) return;
      const data = dataLines.join('\n');
      if (event === 'error') {
        throw new ApiFailure('stream_error', extractSseText(data) || 'The stream was interrupted. Try again.');
      }
      push(extractSseText(data));
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!isSse) {
          push(chunk);
          continue;
        }
        buffer += chunk;
        let idx: number;
        while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
          handleSseBlock(block);
        }
      }
      const tail = decoder.decode();
      if (!isSse) push(tail);
      else if (buffer.trim()) handleSseBlock(buffer);
    } catch (e) {
      if (signal?.aborted) return { reply: full, model };
      if (e instanceof ApiFailure) throw e;
      throw new ApiFailure('stream_error', 'The stream was interrupted. Try again.');
    }
    if (!full.trim()) throw new ApiFailure('bad_response', 'The AI provider sent an empty answer. Try again.');
    return { reply: full, model };
  } catch (e) {
    if (signal?.aborted) return { reply: full, model };
    const failure = e instanceof ApiFailure ? e : new ApiFailure('stream_error', 'The stream was interrupted. Try again.');
    const definite = ['needs_setup', 'offline', 'too_large', 'bad_request'].includes(failure.code) || /^http_4\d\d$/.test(failure.code) || failure.code === 'rate_limited' || failure.code === 'limit_reached';
    if (full || definite) throw failure;
    // Streaming never produced text: try the non-stream path once.
    try {
      return await sendChat(req);
    } catch (fallback) {
      throw fallback instanceof ApiFailure ? fallback : failure;
    }
  }
}

/** Generates an image through the server (OpenAI key, paid). Returns an image URL or data URL. */
export async function generateImage(prompt: string, signal?: AbortSignal): Promise<{ image: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiFailure('offline', OFFLINE_MESSAGE);
  }
  const body = (await request('api/image', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ prompt }),
    signal
  })) as Record<string, unknown> | null;
  const b64 = body && typeof body.b64_json === 'string' ? body.b64_json : '';
  const candidate =
    body && typeof body.image === 'string'
      ? body.image
      : body && typeof body.url === 'string'
        ? body.url
        : body && typeof body.imageUrl === 'string'
          ? body.imageUrl
          : b64
            ? `data:image/png;base64,${b64}`
            : '';
  if (!candidate) throw new ApiFailure('bad_response', 'No image was returned. Try again.');
  const image = /^(data:|https?:|blob:)/.test(candidate) ? candidate : `data:image/png;base64,${candidate}`;
  return { image };
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read')));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode'));
    img.src = src;
  });
}

/** Reads an image file and returns a JPEG data URL no larger than 1024 px on its longest side. */
export async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new ApiFailure('not_image', 'Only image files can be attached.');
  }
  let original: string;
  try {
    original = await readAsDataUrl(file);
  } catch {
    throw new ApiFailure('read_failed', 'Could not read that file.');
  }
  let img: HTMLImageElement;
  try {
    img = await loadImage(original);
  } catch {
    throw new ApiFailure('not_image', 'That image format cannot be opened.');
  }
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (!longest) throw new ApiFailure('not_image', 'That image format cannot be opened.');
  const scale = Math.min(1, MAX_IMAGE_SIDE / longest);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ApiFailure('canvas', 'Could not process that image.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}
