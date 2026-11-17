import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './theme.css';
import type { ChatMode, Screen, Store, StatusState, ServerStatus, ProviderInfo, UsageInfo } from './types';
import { useStore } from './store';
import { fetchProviders, fetchStatus } from './api';
import { registerPwa } from './pwa';
import Shell from './components/Shell';
import Home from './screens/Home';
import Chat from './screens/Chat';

const Tools = lazy(() => import('./screens/Tools'));
const Settings = lazy(() => import('./screens/Settings'));

/** Short fallback shown while a lazily loaded screen chunk arrives. */
function ScreenFallback() {
  return (
    <div className="stack" role="status" aria-live="polite" style={{ padding: 'var(--space-4)' }}>
      <span className="muted">Loading…</span>
    </div>
  );
}

/** Provider list (configured flags, models, paid notes) and today's usage come from GET api/providers via fetchProviders. */
function useServerStatus(): StatusState {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    const id = ++requestId.current;
    fetchProviders()
      .then((p) => {
        if (id !== requestId.current) return;
        setProviders(p.providers);
        setUsage(p.usage);
      })
      .catch(() => {
        /* the rest of the app keeps working without the provider list */
      });
    fetchStatus()
      .then((s) => {
        if (id !== requestId.current) return;
        setStatus(s);
        setFailed(false);
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refresh);
    };
  }, [refresh]);

  return useMemo(
    () => ({ status, failed, refresh, providers, usage }),
    [status, failed, refresh, providers, usage]
  );
}

function relativeTime(ts: number): string {
  const diff = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(diff);
  try {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (abs < 60) return rtf.format(0, 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), 'day');
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(ts);
  } catch {
    return new Date(ts).toLocaleDateString();
  }
}

interface HistoryDrawerProps {
  store: Store;
  onClose: () => void;
  onNewChat: () => void;
}

/** Mobile slide-over opened from the Chat header's History button. */
function HistoryDrawer({ store, onClose, onNewChat }: HistoryDrawerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveRename = (id: string) => {
    if (draft.trim()) store.renameChat(id, draft);
    setEditingId(null);
  };

  return (
    <div className="hide-desktop">
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Close history"
        onClick={onClose}
        style={{ border: 0, padding: 0 }}
      />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Conversation history">
        <div className="stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>History</h2>
            <button ref={closeRef} type="button" className="btn btn-tertiary" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="hairline" />
          <button type="button" className="btn btn-primary" onClick={onNewChat}>
            New chat
          </button>
          {store.conversations.length === 0 ? (
            <div className="empty">
              <h3>No conversations yet</h3>
              <p>Your chats will be listed here, newest first.</p>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="stack">
              {store.conversations.map((c) => (
                <li key={c.id} className="stack" style={{ gap: 'var(--space-1)' }}>
                  {editingId === c.id ? (
                    <div className="stack" style={{ gap: 'var(--space-2)' }}>
                      <label className="muted" htmlFor={`rename-${c.id}`} style={{ fontSize: 'var(--text-sm)' }}>
                        Conversation title
                      </label>
                      <input
                        id={`rename-${c.id}`}
                        className="field"
                        value={draft}
                        maxLength={80}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(c.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <div className="row">
                        <button type="button" className="btn btn-secondary" onClick={() => saveRename(c.id)}>
                          Save
                        </button>
                        <button type="button" className="btn btn-tertiary" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="list-row"
                        aria-current={c.id === store.activeId}
                        onClick={() => {
                          store.openChat(c.id);
                          onClose();
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                          <span style={{ display: 'block', fontWeight: 500 }}>{c.title}</span>
                          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                            {relativeTime(c.updatedAt)}
                          </span>
                        </span>
                      </button>
                      {confirmId === c.id ? (
                        <div className="row" style={{ flexWrap: 'wrap', paddingLeft: 'var(--space-3)' }}>
                          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                            Delete this chat?
                          </span>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => {
                              store.deleteChat(c.id);
                              setConfirmId(null);
                            }}
                          >
                            Delete
                          </button>
                          <button type="button" className="btn btn-tertiary" onClick={() => setConfirmId(null)}>
                            Keep
                          </button>
                        </div>
                      ) : (
                        <div className="row" style={{ paddingLeft: 'var(--space-3)' }}>
                          <button
                            type="button"
                            className="btn btn-tertiary"
                            onClick={() => {
                              setDraft(c.title);
                              setEditingId(c.id);
                            }}
                          >
                            Rename
                          </button>
                          <button type="button" className="btn btn-tertiary" onClick={() => setConfirmId(c.id)}>
                            Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

export default function App() {
  const baseStore = useStore();
  const statusState = useServerStatus();
  const [screen, setScreen] = useState<Screen>('home');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    registerPwa();
  }, []);

  // Storage problems: tell the person once, keep working in memory.
  useEffect(() => {
    if (!baseStore.storageError) return;
    setToast('Storage unavailable. Changes are kept only until you close this tab.');
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [baseStore.storageError]);

  const { newChat: baseNewChat, openChat: baseOpenChat, conversations, activeId } = baseStore;

  // Opening or creating a conversation from anywhere (sidebar, Home) shows the Chat screen.
  const store = useMemo<Store>(
    () => ({
      ...baseStore,
      newChat: (mode?: ChatMode) => {
        const id = baseNewChat(mode);
        setScreen('chat');
        return id;
      },
      openChat: (id: string) => {
        baseOpenChat(id);
        setScreen('chat');
      }
    }),
    [baseStore, baseNewChat, baseOpenChat]
  );

  const navigate = useCallback(
    (s: Screen) => {
      if (s === 'chat' && !activeId) {
        if (conversations.length > 0) baseOpenChat(conversations[0].id);
        else baseNewChat('general');
      }
      setHistoryOpen(false);
      setScreen(s);
    },
    [activeId, conversations, baseOpenChat, baseNewChat]
  );

  const startChat = useCallback(
    (mode: ChatMode) => {
      baseNewChat(mode);
      setHistoryOpen(false);
      setScreen('chat');
    },
    [baseNewChat]
  );

  const onNewChat = useCallback(() => startChat('general'), [startChat]);
  const openHistory = useCallback(() => setHistoryOpen(true), []);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);

  let content: JSX.Element;
  if (screen === 'home') {
    content = <Home store={store} statusState={statusState} onNavigate={navigate} onStart={startChat} />;
  } else if (screen === 'chat') {
    content = <Chat store={store} statusState={statusState} onNavigate={navigate} onOpenHistory={openHistory} />;
  } else if (screen === 'tools') {
    content = <Tools statusState={statusState} onStart={startChat} />;
  } else {
    content = <Settings store={store} statusState={statusState} />;
  }

  const isChat = screen === 'chat';

  return (
    <Shell
      screen={screen}
      onNavigate={navigate}
      store={store}
      statusState={statusState}
      onNewChat={onNewChat}
    >
      <div
        key={screen}
        className="screen"
        style={
          isChat
            ? { flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column' }
            : { flex: '1 0 auto' }
        }
      >
        <Suspense fallback={<ScreenFallback />}>{content}</Suspense>
      </div>
      {historyOpen && <HistoryDrawer store={store} onClose={closeHistory} onNewChat={onNewChat} />}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </Shell>
  );
}
