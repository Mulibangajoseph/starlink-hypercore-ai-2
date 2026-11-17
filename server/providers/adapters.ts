import type { ProviderDef } from './config';

type Json = Record<string, unknown>;
interface Msg { role: string; content: string }
interface Img { mime: string; data: string }

export class ProviderError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const CLAUDE_MAX_TOKENS = 4096;

function obj(v: unknown): Json | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function parseImage(image?: string): Img | undefined {
  if (!image) return undefined;
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(image);
  if (!m) return undefined;
  return { mime: m[1], data: m[2] };
}

function cleanMessages(messages: Msg[]): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of messages) {
    const content = (m.content ?? '').toString();
    if (!content.trim()) continue;
    out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content });
  }
  return out;
}

/** Alternating roles, starting with the user: needed by Claude and Gemini. */
function alternating(messages: Msg[]): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of cleanMessages(messages)) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + m.content;
    else out.push({ ...m });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

async function upstreamError(res: Response, name: string): Promise<ProviderError> {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const j = obj(JSON.parse(text));
      const e = j?.error;
      detail = str(obj(e)?.message) || str(e) || str(j?.message);
      if (!detail && Array.isArray(JSON.parse(text))) {
        detail = str(obj(arr(JSON.parse(text))[0])?.error && obj(obj(arr(JSON.parse(text))[0])?.error)?.message);
      }
    } catch {
      detail = text;
    }
  } catch {
    detail = '';
  }
  detail = detail.replace(/\s+/g, ' ').trim().slice(0, 300);
  let message: string;
  if (res.status === 401 || res.status === 403) message = `${name} rejected the API key. Check that it is valid and has access.`;
  else if (res.status === 429) message = `${name} is rate limiting or out of quota. Check the plan and billing for this key.`;
  else if (res.status === 404) message = `${name} does not know this model. Pick another model.`;
  else message = `${name} returned an error (${res.status}).`;
  if (detail && res.status !== 401) message += ` ${detail}`;
  return new ProviderError(res.status >= 400 && res.status < 600 ? res.status : 502, message);
}

interface Request1 { url: string; headers: Record<string, string>; body: Json }

function buildRequest(def: ProviderDef, key: string, model: string, system: string, messages: Msg[], image: Img | undefined, stream: boolean): Request1 {
  if (def.id === 'openai' || def.id === 'deepseek') {
    const msgs: Json[] = [];
    if (system) msgs.push({ role: 'system', content: system });
    const clean = cleanMessages(messages);
    let lastUser = -1;
    clean.forEach((m, i) => { if (m.role === 'user') lastUser = i; });
    clean.forEach((m, i) => {
      if (image && def.id === 'openai' && i === lastUser) {
        msgs.push({
          role: 'user',
          content: [
            { type: 'text', text: m.content },
            { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.data}` } }
          ]
        });
      } else msgs.push({ role: m.role, content: m.content });
    });
    return {
      url: def.baseUrl
        ? `${def.baseUrl.replace(/\/+$/, '')}/chat/completions`
        : def.id === 'openai'
          ? OPENAI_URL
          : DEEPSEEK_URL,
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: { model, messages: msgs, stream }
    };
  }
  if (def.id === 'claude') {
    const alt = alternating(messages);
    let lastUser = -1;
    alt.forEach((m, i) => { if (m.role === 'user') lastUser = i; });
    const msgs: Json[] = alt.map((m, i) => {
      if (image && i === lastUser) {
        return {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } },
            { type: 'text', text: m.content }
          ]
        };
      }
      return { role: m.role, content: m.content };
    });
    const body: Json = { model, max_tokens: CLAUDE_MAX_TOKENS, messages: msgs, stream };
    if (system) body.system = system;
    return {
      url: CLAUDE_URL,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body
    };
  }
  // gemini
  const alt = alternating(messages);
  let lastUser = -1;
  alt.forEach((m, i) => { if (m.role === 'user') lastUser = i; });
  const contents: Json[] = alt.map((m, i) => {
    const parts: Json[] = [{ text: m.content }];
    if (image && i === lastUser) parts.push({ inlineData: { mimeType: image.mime, data: image.data } });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
  const body: Json = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  return {
    url: `${GEMINI_BASE}${encodeURIComponent(model)}:${action}`,
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body
  };
}

function geminiText(j: Json): string {
  const fb = obj(j.promptFeedback);
  const cand = obj(arr(j.candidates)[0]);
  const parts = arr(obj(cand?.content)?.parts);
  const text = parts.map((p) => str(obj(p)?.text)).join('');
  if (!text && str(fb?.blockReason)) {
    throw new ProviderError(422, `Gemini blocked this request (${str(fb?.blockReason)}).`);
  }
  return text;
}

function streamDelta(def: ProviderDef, j: Json): string {
  if (def.id === 'openai' || def.id === 'deepseek') {
    const delta = obj(obj(arr(j.choices)[0])?.delta);
    return str(delta?.content);
  }
  if (def.id === 'claude') {
    const type = str(j.type);
    if (type === 'error') {
      throw new ProviderError(502, `Claude stream error: ${str(obj(j.error)?.message) || 'unknown error'}`);
    }
    if (type === 'content_block_delta') {
      const d = obj(j.delta);
      if (str(d?.type) === 'text_delta') return str(d?.text);
    }
    return '';
  }
  return geminiText(j);
}

function sseToText(def: ProviderDef, res: Response): ReadableStream<string> {
  if (!res.body) throw new ProviderError(502, `${def.label} returned an empty stream.`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleLine = (line: string): string => {
    const t = line.trim();
    if (!t.startsWith('data:')) return '';
    const payload = t.slice(5).trim();
    if (!payload || payload === '[DONE]') return '';
    let parsed: Json | undefined;
    try {
      parsed = obj(JSON.parse(payload));
    } catch {
      return '';
    }
    return parsed ? streamDelta(def, parsed) : '';
  };

  return new ReadableStream<string>({
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            const rest = handleLine(buffer + decoder.decode());
            buffer = '';
            if (rest) controller.enqueue(rest);
            controller.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          let out = '';
          for (const line of lines) out += handleLine(line);
          if (out) {
            controller.enqueue(out);
            return;
          }
        }
      } catch (e) {
        controller.error(e);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    }
  });
}

async function send(def: ProviderDef, req: Request1, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ProviderError(502, `Could not reach ${def.label}. Try again in a moment.`);
  }
  if (!res.ok) throw await upstreamError(res, def.label);
  return res;
}

export async function streamCompletion(
  def: ProviderDef,
  key: string,
  model: string,
  system: string,
  messages: { role: string; content: string }[],
  image?: string,
  signal?: AbortSignal
): Promise<ReadableStream<string>> {
  const req = buildRequest(def, key, model, system, messages, parseImage(image), true);
  const res = await send(def, req, signal);
  return sseToText(def, res);
}

export async function completeOnce(
  def: ProviderDef,
  key: string,
  model: string,
  system: string,
  messages: { role: string; content: string }[],
  image?: string,
  signal?: AbortSignal
): Promise<string> {
  const req = buildRequest(def, key, model, system, messages, parseImage(image), false);
  const res = await send(def, req, signal);
  let j: Json | undefined;
  try {
    j = obj(await res.json());
  } catch {
    throw new ProviderError(502, `${def.label} sent a response that could not be read.`);
  }
  if (!j) throw new ProviderError(502, `${def.label} sent an empty response.`);
  let text = '';
  if (def.id === 'openai' || def.id === 'deepseek') {
    const content = obj(obj(arr(j.choices)[0])?.message)?.content;
    if (typeof content === 'string') text = content;
    else text = arr(content).map((p) => str(obj(p)?.text)).join('');
  } else if (def.id === 'claude') {
    text = arr(j.content)
      .map((b) => (str(obj(b)?.type) === 'text' ? str(obj(b)?.text) : ''))
      .join('');
  } else {
    text = geminiText(j);
  }
  if (!text.trim()) throw new ProviderError(502, `${def.label} returned no text.`);
  return text;
}
