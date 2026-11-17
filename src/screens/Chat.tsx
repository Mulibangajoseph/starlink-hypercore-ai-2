import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, History, MessageSquare, RotateCw, SquarePen } from 'lucide-react';
import type { ChatMode, ChatProps, ChatRequest, Message, ProviderId } from '../types';
import { MAX_CONTEXT_MESSAGES, MAX_MESSAGE_CHARS, MODE_LABEL, SUGGESTIONS } from '../types';
import { ApiFailure, sendChatStream } from '../api';
import { speak } from '../voice';
import MessageBubble from '../components/MessageBubble';
import Composer from '../components/Composer';
import ProviderSelect from '../components/ProviderSelect';

type Notice = { id: string; kind: 'setup' | 'attach'; missing?: string[]; paid?: boolean } | null;
type Doc = { name: string; text: string };

class StreamFail extends Error {
  status: number;
  code: string;
  missing?: string[];
  constructor(status: number, code: string, message: string, missing?: string[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.missing = missing;
  }
}

const CODE_ACTIONS: { label: string; prompt: string }[] = [
  {
    label: 'Generate',
    prompt: 'Generate a TypeScript function that debounces a callback, with a short usage example.',
  },
  {
    label: 'Debug',
    prompt: 'Help me debug my code. Ask me to paste the code and the exact error message, then explain the cause and give a fix.',
  },
  {
    label: 'Build website',
    prompt:
      'Build a complete, responsive landing page for a coffee shop as a single HTML file with inline CSS and JavaScript. Return it in one html code block.',
  },
  {
    label: 'Review code',
    prompt:
      'Review my code. Ask me to paste it, then list bugs, risks, readability issues and security concerns in order of importance, with a concrete fix for each.',
  },
  {
    label: 'Explain code',
    prompt:
      'Explain my code. Ask me to paste it, then walk through what it does step by step in plain language, including the key functions and any edge cases.',
  },
  {
    label: 'Write tests',
    prompt:
      'Write unit tests for my code. Ask me to paste it and name the language or test framework, then cover normal cases, edge cases and failures.',
  },
  {
    label: 'Refactor',
    prompt:
      'Refactor my code for clarity and maintainability without changing its behavior. Ask me to paste it, then show the improved version and briefly explain each change.',
  },
];

const DOC_BUDGET = MAX_MESSAGE_CHARS - 400;

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function composeDocument(question: string, doc: Doc): string {
  const room = Math.max(500, DOC_BUDGET - question.length);
  const body = doc.text.length > room ? `${doc.text.slice(0, room)}\n[document truncated]` : doc.text;
  return `Document "${doc.name}":\n\n${body}\n\nQuestion: ${question}`;
}

async function readError(res: Response): Promise<StreamFail> {
  let code = 'error';
  let message = "Couldn't get a reply. Try again.";
  let missing: string[] | undefined;
  try {
    const data = (await res.json()) as { error?: string; message?: string; missing?: string[] };
    if (data.error) code = data.error;
    if (data.message) message = data.message;
    if (Array.isArray(data.missing)) missing = data.missing;
  } catch {
    /* keep defaults */
  }
  if (res.status === 429 && !message.toLowerCase().includes('limit')) {
    message = 'Daily request limit reached for this device. Try again tomorrow.';
  }
  return new StreamFail(res.status, code, message, missing);
}


async function generateImage(prompt: string, deviceId: string): Promise<string> {
  const res = await fetch('api/image', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-device-id': deviceId },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as { image?: string; url?: string; b64?: string; b64_json?: string };
  const b64 = data.b64 ?? data.b64_json;
  const src = data.image ?? data.url ?? (b64 ? `data:image/png;base64,${b64}` : '');
  if (!src) throw new StreamFail(0, 'no_image', 'No image was returned. Try a different prompt.');
  return src;
}

export default function Chat({ store, statusState, onNavigate, onOpenHistory }: ChatProps) {
  const { active } = store;
  const mode: ChatMode = active?.mode ?? 'general';
  const messages = active?.messages ?? [];

  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [streamMsgId, setStreamMsgId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<{ provider?: ProviderId; model?: string }>({});
  const inflight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const images = useRef<Map<string, string>>(new Map());
  const docs = useRef<Map<string, Doc>>(new Map());
  const endRef = useRef<HTMLDivElement>(null);

  const loading = !!active && loadingId === active.id;
  const showNotice = !!active && notice?.id === active.id ? notice : null;
  const last = messages[messages.length - 1];
  const unanswered = !!active && !loading && !showNotice && !!last && last.role === 'user';
  const lastErrorId = last && last.role === 'assistant' && last.error ? last.id : null;
  const streamingVisible = loading && !!last && last.role === 'assistant' && last.id === streamMsgId;
  const lastContentLen = last ? last.content.length : 0;

  const provider = active ? active.provider : pending.provider;
  const model = active ? active.model : pending.model;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, lastContentLen, loading, showNotice, unanswered, active?.id]);

  function addError(id: string, text: string) {
    store.addMessage(id, { id: makeId(), role: 'assistant', content: text, createdAt: Date.now(), error: true });
  }

  function handleFailure(id: string, e: unknown) {
    if (e instanceof StreamFail) {
      if (e.code === 'needs_setup') {
        setNotice({ id, kind: 'setup', missing: e.missing });
        statusState.refresh();
        return;
      }
      addError(id, e.message);
      return;
    }
    if (e instanceof ApiFailure && e.code === 'needs_setup') {
      setNotice({ id, kind: 'setup', missing: (e as unknown as { missing?: string[] }).missing });
      statusState.refresh();
      return;
    }
    addError(id, e instanceof Error && e.message ? e.message : "Couldn't get a reply. Try again.");
  }

  async function run(
    id: string,
    convMode: ChatMode,
    history: Message[],
    opts: { image?: string; provider?: ProviderId; model?: string },
  ) {
    if (inflight.current) return;
    inflight.current = true;
    setLoadingId(id);
    setStreamMsgId(null);
    setNotice(null);
    const controller = new AbortController();
    abortRef.current = controller;
    let assistantId: string | null = null;
    let text = '';

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        addError(id, 'You are offline. Check your connection and retry.');
        return;
      }

      if (convMode === 'imagegen') {
        const prompt = history[history.length - 1]?.content ?? '';
        try {
          const src = await generateImage(prompt, store.deviceId);
          store.addMessage(id, {
            id: makeId(),
            role: 'assistant',
            content: 'Here is your image.',
            createdAt: Date.now(),
            generatedImage: src,
          });
        } catch (e) {
          if (e instanceof StreamFail && e.code === 'needs_setup') {
            setNotice({ id, kind: 'setup', missing: e.missing ?? ['OPENAI_API_KEY'], paid: true });
            statusState.refresh();
          } else if (e instanceof DOMException && e.name === 'AbortError') {
            /* cancelled */
          } else {
            handleFailure(id, e);
          }
        }
        return;
      }

      const context = history
        .filter((m) => !m.error)
        .slice(-MAX_CONTEXT_MESSAGES)
        .map((m) => {
          const doc = docs.current.get(m.id);
          return { role: m.role, content: doc ? composeDocument(m.content, doc) : m.content };
        });
      const body: ChatRequest = {
        mode: convMode,
        messages: context,
        ...(opts.image ? { image: opts.image } : {}),
        ...(opts.provider ? { provider: opts.provider } : {}),
        ...(opts.model ? { model: opts.model } : {}),
      };

      let lastFlush = 0;
      const flush = (force: boolean) => {
        if (!assistantId) return;
        const now = Date.now();
        if (!force && now - lastFlush < 60) return;
        lastFlush = now;
        store.updateMessage(id, assistantId, { content: text });
      };
      const onDelta = (_piece: string, full: string) => {
        text = full;
        if (!assistantId) {
          assistantId = makeId();
          store.addMessage(id, { id: assistantId, role: 'assistant', content: text, createdAt: Date.now() });
          setStreamMsgId(assistantId);
          lastFlush = Date.now();
          return;
        }
        flush(false);
      };

      // Streams through api/chat; when streaming cannot start, sendChatStream falls back to the non-stream request.
      try {
        const res = await sendChatStream(body, onDelta, controller.signal);
        if (res.reply && res.reply !== text) text = res.reply;
        if (assistantId) flush(true);
        else if (text.trim()) {
          store.addMessage(id, { id: makeId(), role: 'assistant', content: text, createdAt: Date.now() });
        }
        if (controller.signal.aborted) return;
        if (!text.trim()) throw new ApiFailure('empty', 'The model returned an empty reply. Try again.');
      } catch (e) {
        flush(true);
        if (controller.signal.aborted) return;
        if (assistantId) {
          addError(id, 'The reply was interrupted. Retry to try again.');
          return;
        }
        handleFailure(id, e);
        return;
      }
      if (text.trim() && store.prefs.autoSpeak) speak(text);
    } finally {
      inflight.current = false;
      abortRef.current = null;
      setLoadingId(null);
      setStreamMsgId(null);
      statusState.refresh();
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleSend(text: string, image?: string, doc?: Doc) {
    let clean = text.trim();
    if (!clean && doc) clean = 'Summarize this document.';
    if (!clean || inflight.current) return;
    if (clean.length > MAX_MESSAGE_CHARS) clean = clean.slice(0, MAX_MESSAGE_CHARS);
    let id = active?.id;
    let convMode = active?.mode ?? 'general';
    let prov = active?.provider;
    let mod = active?.model;
    if (!id) {
      id = store.newChat();
      prov = pending.provider;
      mod = pending.model;
      if (prov) store.setConversationModel(id, prov, mod);
      convMode = 'general';
    }
    const userMsg: Message = {
      id: makeId(),
      role: 'user',
      content: clean,
      createdAt: Date.now(),
      ...(image ? { hasImage: true } : {}),
      ...(doc ? { fileName: doc.name } : {}),
    };
    if (image) images.current.set(userMsg.id, image);
    if (doc) docs.current.set(userMsg.id, doc);
    store.addMessage(id, userMsg);
    void run(id, convMode, [...(active?.messages ?? []), userMsg], { image, provider: prov, model: mod });
  }

  function retryFrom(history: Message[]) {
    if (!active || inflight.current) return;
    const lastUser = history[history.length - 1];
    if (!lastUser || lastUser.role !== 'user') return;
    const image = images.current.get(lastUser.id);
    if ((lastUser.hasImage && !image) || (lastUser.fileName && !docs.current.has(lastUser.id))) {
      setNotice({ id: active.id, kind: 'attach' });
      return;
    }
    void run(active.id, active.mode, history, { image, provider: active.provider, model: active.model });
  }

  function handleRetryError(msg: Message) {
    if (!active) return;
    const idx = active.messages.findIndex((m) => m.id === msg.id);
    if (idx < 0) return;
    let history = active.messages.slice(0, idx);
    store.removeMessage(active.id, msg.id);
    // Drop a partial reply left by an interrupted stream so the retry starts from the question.
    while (history.length > 0 && history[history.length - 1].role === 'assistant') {
      store.removeMessage(active.id, history[history.length - 1].id);
      history = history.slice(0, -1);
    }
    retryFrom(history);
  }

  function handleModelChange(p: ProviderId | undefined, m: string | undefined) {
    if (active) store.setConversationModel(active.id, p, m);
    else setPending({ provider: p, model: m });
  }

  const isEmpty = messages.length === 0;
  const title = active && active.title ? active.title : 'New chat';
  const noticeProviderLabel =
    statusState.providers.find((p) => p.id === (provider ?? 'default'))?.label ?? 'The AI provider';

  return (
    <section
      className="screen"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      aria-label="Chat"
    >
      <header
        className="row"
        style={{
          padding: 'var(--space-3) var(--space-4)',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <div className="row" style={{ minWidth: 0, flex: 1, gap: 'var(--space-2)' }}>
          <h1 style={{ fontSize: 'var(--text-lg)', lineHeight: 1.2, minWidth: 0, overflowWrap: 'anywhere' }}>
            {title}
          </h1>
          <span className="chip static" style={{ flex: 'none' }}>
            {MODE_LABEL[mode]}
          </span>
        </div>
        <div className="row" style={{ gap: 0, flex: 'none' }}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Start new chat"
            title="New chat"
            disabled={!!active && active.messages.length === 0}
            onClick={() => store.newChat()}
          >
            <SquarePen size={20} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn hide-desktop"
            aria-label="Open conversation history"
            title="History"
            onClick={onOpenHistory}
          >
            <History size={20} strokeWidth={1.75} />
          </button>
        </div>
      </header>
      {mode !== 'imagegen' && (
        <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
          <ProviderSelect
            providers={statusState.providers}
            provider={provider}
            model={model}
            onChange={handleModelChange}
          />
        </div>
      )}
      <div className="hairline" />

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            width: '100%',
            maxWidth: 'var(--max-w)',
            margin: '0 auto',
            padding: 'var(--space-4)',
            minHeight: '100%',
          }}
        >
          {isEmpty && !loading && (
            <div className="empty" style={{ margin: 'auto 0' }}>
              <div className="circle">
                <MessageSquare size={28} strokeWidth={1.75} />
              </div>
              <h3>
                {mode === 'code'
                  ? 'What are we building?'
                  : mode === 'writing'
                    ? 'What are we writing?'
                    : mode === 'image'
                      ? 'Show me a photo'
                      : mode === 'imagegen'
                        ? 'Describe an image'
                        : mode === 'documents'
                          ? 'Attach a document'
                          : 'Ask anything'}
              </h3>
              <p>
                {mode === 'image'
                  ? 'Attach a photo with the paperclip, then ask about it. Examples:'
                  : mode === 'documents'
                    ? 'Attach a PDF, TXT, MD, CSV or JSON file, then ask about it. Examples:'
                    : mode === 'imagegen'
                      ? 'Image generation uses OpenAI and is a paid service. Try:'
                      : 'Type below or start from one of these prompts.'}
              </p>
              {mode === 'code' && (
                <div
                  className="row"
                  style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}
                >
                  {CODE_ACTIONS.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      className="btn btn-secondary"
                      disabled={loading}
                      onClick={() => handleSend(a.prompt)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
              <div
                className="row"
                style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}
              >
                {SUGGESTIONS[mode].map((s) =>
                  mode === 'image' || mode === 'documents' ? (
                    <span key={s} className="chip static">
                      {s}
                    </span>
                  ) : (
                    <button
                      key={s}
                      type="button"
                      className="chip"
                      disabled={loading}
                      onClick={() => handleSend(s)}
                    >
                      {s}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onRetry={m.id === lastErrorId && !loading ? () => handleRetryError(m) : undefined}
            />
          ))}

          {loading && !streamingVisible && (
            <div
              className="bubble assistant"
              role="status"
              aria-label="Assistant is typing"
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}
            >
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}

          {showNotice && (
            <div
              className="card"
              role="status"
              style={{
                alignSelf: 'stretch',
                borderColor: 'rgba(251,191,36,.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <AlertTriangle size={20} strokeWidth={1.75} color="var(--warning)" style={{ flex: 'none', marginTop: 2 }} aria-hidden="true" />
                <div className="stack" style={{ gap: 'var(--space-1)' }}>
                  <h3>{showNotice.kind === 'setup' ? 'Not connected' : 'Attachment needs re-attaching'}</h3>
                  <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                    {showNotice.kind === 'setup'
                      ? `${noticeProviderLabel} has no API key on the server yet, so no answer was generated.${
                          showNotice.missing && showNotice.missing.length > 0
                            ? ` Missing: ${showNotice.missing.join(', ')}.`
                            : ''
                        }${showNotice.paid ? ' Image generation is a paid service billed by OpenAI.' : ''} Your message is saved.`
                      : 'Photos and documents are only kept until you reload. Attach it again in a new message.'}
                  </p>
                </div>
              </div>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {showNotice.kind === 'setup' && (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => onNavigate('settings')}>
                      Settings &gt; Connect AI
                    </button>
                    <button type="button" className="btn btn-tertiary" onClick={() => retryFrom(messages)}>
                      <RotateCw size={18} strokeWidth={1.75} aria-hidden="true" />
                      Retry
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {unanswered && (
            <div
              className="row"
              style={{ alignSelf: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-2)' }}
            >
              <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                No reply received yet.
              </span>
              <button type="button" className="btn btn-secondary" onClick={() => retryFrom(messages)}>
                <RotateCw size={18} strokeWidth={1.75} aria-hidden="true" />
                Retry
              </button>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <Composer
        mode={mode}
        disabled={loading}
        sendOnEnter={store.prefs.sendOnEnter}
        streaming={loading}
        onStop={handleStop}
        onSend={handleSend}
      />
    </section>
  );
}
