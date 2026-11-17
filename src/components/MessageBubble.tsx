import { Children, isValidElement, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  RotateCcw,
  Square,
  Volume2,
} from 'lucide-react';
import type { MessageBubbleProps } from '../types';
import { speak, stopSpeaking } from '../voice';
import HtmlPreview from './HtmlPreview';

const ICON = { size: 16, strokeWidth: 1.75 } as const;

function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return '';
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const child = Children.toArray(children)[0];
  let lang = '';
  let text = nodeText(children);
  if (isValidElement(child)) {
    const props = child.props as { className?: string; children?: ReactNode };
    const match = /language-([\w#+-]+)/.exec(props.className ?? '');
    if (match) lang = match[1];
    text = nodeText(props.children);
  }
  text = text.replace(/\n$/, '');

  const onCopy = async () => {
    const ok = await copyText(text);
    setState(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1800);
  };

  const label = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy';
  const isHtml = lang.toLowerCase() === 'html' || /^\s*<!doctype html|^\s*<html[\s>]/i.test(text);
  const [showPreview, setShowPreview] = useState(false);

  const onDownload = () => {
    const blob = new Blob([text], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'website.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      <div
        className="row"
        style={{
          justifyContent: 'space-between',
          padding: 'var(--space-1) var(--space-2) var(--space-1) var(--space-3)',
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface-2)',
        }}
      >
        <span className="muted" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
          {lang || 'code'}
        </span>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
        {isHtml && (
          <>
            <button
              type="button"
              className="chip"
              onClick={() => setShowPreview((v) => !v)}
              aria-pressed={showPreview}
              aria-label={showPreview ? 'Hide preview' : 'Preview website'}
            >
              {showPreview ? <EyeOff {...ICON} aria-hidden /> : <Eye {...ICON} aria-hidden />}
              <span>{showPreview ? 'Hide' : 'Preview'}</span>
            </button>
            <button type="button" className="chip" onClick={onDownload} aria-label="Download HTML file">
              <Download {...ICON} aria-hidden />
              <span>Download</span>
            </button>
          </>
        )}
        <button
          type="button"
          className={`chip${state === 'copied' ? ' ok' : state === 'failed' ? ' bad' : ''}`}
          onClick={onCopy}
          aria-label={`${label} code`}
        >
          {state === 'copied' ? <Check {...ICON} aria-hidden /> : <Copy {...ICON} aria-hidden />}
          <span aria-live="polite">{label}</span>
        </button>
        </div>
      </div>
      {isHtml && showPreview && <HtmlPreview html={text} />}
      <pre style={{ margin: 0, border: 0, borderRadius: 0, background: 'transparent' }}>
        <code>{text}</code>
      </pre>
    </div>
  );
}

const heading = ({ children }: { children?: ReactNode }) => (
  <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>{children}</h3>
);
const listStyle = { margin: 0, paddingLeft: 'var(--space-5)' } as const;

const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  ul: ({ children }) => <ul style={listStyle}>{children}</ul>,
  ol: ({ children }) => <ol style={listStyle}>{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: 0,
        paddingLeft: 'var(--space-3)',
        borderLeft: '2px solid var(--accent)',
        color: 'var(--ink-muted)',
      }}
    >
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
      {children}
    </a>
  ),
  // The app loads no remote images: show the alt text instead.
  img: ({ alt }) => <span className="muted">{alt ? `[image: ${alt}]` : '[image]'}</span>,
  table: ({ children }) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th style={{ textAlign: 'left', padding: 'var(--space-1) var(--space-3)', borderBottom: '1px solid var(--line)' }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ padding: 'var(--space-1) var(--space-3)', borderBottom: '1px solid var(--line)' }}>{children}</td>
  ),
  code: ({ children }) => (
    <code
      style={{
        background: 'var(--surface-2)',
        borderRadius: 4,
        padding: '0 var(--space-1)',
      }}
    >
      {children}
    </code>
  ),
};

function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!speaking) return;
    const id = window.setInterval(() => {
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) setSpeaking(false);
    }, 500);
    return () => window.clearInterval(id);
  }, [speaking]);

  useEffect(
    () => () => {
      if (speechSupported() && window.speechSynthesis.speaking) {
        /* leave playback to the owner of the current speech */
      }
    },
    [],
  );

  if (!speechSupported()) return null;

  const toggle = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      speak(text);
      setSpeaking(true);
    }
  };

  return (
    <button
      type="button"
      className="chip"
      onClick={toggle}
      aria-pressed={speaking}
      aria-label={speaking ? 'Stop reading aloud' : 'Read reply aloud'}
    >
      {speaking ? <Square {...ICON} aria-hidden /> : <Volume2 {...ICON} aria-hidden />}
      <span>{speaking ? 'Stop' : 'Listen'}</span>
    </button>
  );
}

function formatTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
  } catch {
    return '';
  }
}

export default function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const time = formatTime(message.createdAt);

  if (message.error) {
    return (
      <div className="bubble assistant error" role="alert">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <AlertTriangle {...ICON} aria-hidden style={{ color: 'var(--danger)', flex: 'none', marginTop: 4 }} />
          <div className="stack" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
            <p>{message.content || 'Something went wrong. Try again.'}</p>
            {onRetry && (
              <div>
                <button type="button" className="btn btn-secondary" onClick={onRetry}>
                  <RotateCcw {...ICON} aria-hidden />
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bubble ${isUser ? 'user' : 'assistant'}`}>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        {message.fileName && (
          <div
            className="row"
            style={{
              gap: 'var(--space-2)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              opacity: 0.85,
              flexWrap: 'wrap',
            }}
          >
            <FileText {...ICON} aria-hidden />
            <span style={{ overflowWrap: 'anywhere' }}>{message.fileName}</span>
          </div>
        )}
        {message.hasImage && (
          <div
            className="row"
            style={{
              gap: 'var(--space-2)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              opacity: 0.85,
            }}
          >
            <ImageIcon {...ICON} aria-hidden />
            <span>Photo attached</span>
          </div>
        )}
        {isUser ? (
          <p style={{ whiteSpace: 'pre-wrap' }}>{message.content}</p>
        ) : (
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <ReactMarkdown components={components}>{message.content}</ReactMarkdown>
          </div>
        )}
        {message.generatedImage && (
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <img
              src={message.generatedImage}
              alt="Generated image"
              style={{
                display: 'block',
                width: '100%',
                maxWidth: 512,
                height: 'auto',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
              }}
            />
            <div>
              <a
                className="chip"
                href={message.generatedImage}
                download="hypercore-image.png"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Download generated image"
              >
                <Download {...ICON} aria-hidden />
                <span>Download</span>
              </a>
            </div>
          </div>
        )}
        {!isUser && message.content.trim() && (
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <SpeakButton text={message.content} />
          </div>
        )}
        {time && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontVariantNumeric: 'tabular-nums',
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              opacity: isUser ? 0.75 : 1,
              color: isUser ? 'inherit' : 'var(--ink-muted)',
            }}
          >
            {time}
          </span>
        )}
      </div>
    </div>
  );
}
