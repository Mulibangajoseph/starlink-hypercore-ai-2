import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, MessageSquare, Pencil, Trash2, X } from 'lucide-react';
import { MODE_LABEL } from '../types';
import type { HistoryListProps, ProviderId } from '../types';

const PROVIDER_LABEL: Record<ProviderId, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
  deepseek: 'DeepSeek'
};

const ICON = { size: 20, strokeWidth: 1.75 } as const;

function formatWhen(ts: number): string {
  const diffSec = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(diffSec / 86400), 'day');
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(ts);
}

export default function HistoryList(props: HistoryListProps) {
  const { conversations, activeId, onOpen, onRename, onDelete } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  if (sorted.length === 0) {
    return (
      <div className="empty">
        <div className="circle" aria-hidden="true">
          <MessageSquare {...ICON} />
        </div>
        <h3>No conversations yet</h3>
        <p>Start a new chat and it will show up here.</p>
      </div>
    );
  }

  const startEdit = (id: string, title: string) => {
    setConfirmId(null);
    setEditingId(id);
    setDraft(title);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const saveEdit = (id: string) => {
    const next = draft.trim();
    if (!next) {
      setError('Title can’t be empty.');
      inputRef.current?.focus();
      return;
    }
    if (next.length > 80) {
      setError('Keep the title under 80 characters.');
      inputRef.current?.focus();
      return;
    }
    onRename(id, next);
    setEditingId(null);
    setError(null);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit(id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  return (
    <ul
      aria-label="Conversations"
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
    >
      {sorted.map((c) => {
        const isActive = c.id === activeId;
        const isEditing = editingId === c.id;
        const isConfirming = confirmId === c.id;
        const count = c.messages.length;

        return (
          <li key={c.id}>
            {isEditing ? (
              <div className="stack" style={{ gap: 'var(--space-1)', padding: 'var(--space-1) 0' }}>
                <div className="row" style={{ gap: 'var(--space-1)' }}>
                  <label htmlFor={`rename-${c.id}`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                    Conversation title
                  </label>
                  <input
                    id={`rename-${c.id}`}
                    ref={inputRef}
                    className={error ? 'field field-error' : 'field'}
                    value={draft}
                    autoFocus
                    maxLength={120}
                    aria-invalid={error ? true : undefined}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      if (error) setError(null);
                    }}
                    onKeyDown={(e) => onKey(e, c.id)}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button type="button" className="icon-btn primary" aria-label="Save title" onClick={() => saveEdit(c.id)}>
                    <Check {...ICON} />
                  </button>
                  <button type="button" className="icon-btn" aria-label="Cancel rename" onClick={cancelEdit}>
                    <X {...ICON} />
                  </button>
                </div>
                {error && (
                  <p className="field-error-text" role="alert">
                    {error}
                  </p>
                )}
              </div>
            ) : isConfirming ? (
              <div className="card" role="alertdialog" aria-label={`Delete ${c.title}`} style={{ borderColor: 'var(--danger)' }}>
                <p style={{ overflowWrap: 'anywhere' }}>
                  Delete “{c.title}”?
                </p>
                <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                  This removes {count} {count === 1 ? 'message' : 'messages'} from this browser.
                </p>
                <div className="row" style={{ marginTop: 'var(--space-3)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirmId(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      setConfirmId(null);
                      onDelete(c.id);
                    }}
                  >
                    Delete chat
                  </button>
                </div>
              </div>
            ) : (
              <div className="row" style={{ gap: 'var(--space-1)', alignItems: 'center' }}>
                <button
                  type="button"
                  className="list-row"
                  aria-current={isActive ? true : undefined}
                  onClick={() => onOpen(c.id)}
                  style={{ flex: 1, minWidth: 0, width: 'auto' }}
                >
                  <MessageSquare {...ICON} style={{ flex: 'none', color: isActive ? 'var(--accent)' : 'var(--ink-muted)' }} aria-hidden="true" />
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 500, overflowWrap: 'anywhere', lineHeight: 1.3 }}>{c.title}</span>
                    <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                      {MODE_LABEL[c.mode]}
                      {c.provider ? ` · ${PROVIDER_LABEL[c.provider]}` : ''} · {formatWhen(c.updatedAt)}
                    </span>
                  </span>
                </button>
                <button type="button" className="icon-btn" aria-label={`Rename ${c.title}`} onClick={() => startEdit(c.id, c.title)}>
                  <Pencil {...ICON} />
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label={`Delete ${c.title}`}
                  onClick={() => {
                    setEditingId(null);
                    setConfirmId(c.id);
                  }}
                >
                  <Trash2 {...ICON} />
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
