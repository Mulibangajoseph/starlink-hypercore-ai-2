import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Home, MessageSquare, Wrench, Settings, Plus, History, X } from 'lucide-react';
import type { Screen, ShellProps } from '../types';
import Brand, { StatusBadge } from './Brand';
import HistoryList from './HistoryList';

const NAV: { id: Screen; label: string; Icon: typeof Home }[] = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'tools', label: 'Tools', Icon: Wrench },
  { id: 'settings', label: 'Settings', Icon: Settings }
];

/** Other parts of the app can open the phone history panel with: window.dispatchEvent(new Event('starlink:open-history')) */
const OPEN_HISTORY_EVENT = 'starlink:open-history';

export default function Shell(props: ShellProps): JSX.Element {
  const { screen, onNavigate, store, statusState, onNewChat } = props;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [storageDismissed, setStorageDismissed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    const open = () => setDrawerOpen(true);
    window.addEventListener(OPEN_HISTORY_EVENT, open);
    return () => window.removeEventListener(OPEN_HISTORY_EVENT, open);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // Close the drawer if the viewport grows to desktop (sidebar takes over).
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 860px)');
    const onChange = () => {
      if (mq.matches) setDrawerOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!store.storageError) setStorageDismissed(false);
  }, [store.storageError]);

  const openChat = (id: string) => {
    store.openChat(id);
    onNavigate('chat');
    setDrawerOpen(false);
  };

  const handleNewChat = () => {
    setDrawerOpen(false);
    onNewChat();
  };

  const history = (
    <HistoryList
      conversations={store.conversations}
      activeId={store.activeId}
      onOpen={openChat}
      onRename={store.renameChat}
      onDelete={store.deleteChat}
    />
  );

  return (
    <div className="app">
      {/* Desktop sidebar */}
      <aside className="sidebar" aria-label="Sidebar">
        <Brand />
        <div className="hairline" />
        <button type="button" className="btn btn-primary" onClick={handleNewChat}>
          <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
          New chat
        </button>
        <nav aria-label="Main" className="stack" style={{ gap: 'var(--space-1)' }}>
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="tab side"
              aria-current={screen === id ? 'page' : undefined}
              onClick={() => onNavigate(id)}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            AI status
          </span>
          <StatusBadge status={statusState.status} failed={statusState.failed} />
        </div>
        <div className="hairline" />
        <h2 style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', fontWeight: 500 }}>History</h2>
        <div style={{ flex: 1, minHeight: 0 }}>{history}</div>
      </aside>

      <div className="main" style={{ overflow: 'hidden' }}>
        {/* Phone header: brand name and history — one row */}
        <header className="hide-desktop" style={{ flex: 'none' }}>
          <div
            className="row"
            style={{
              justifyContent: 'space-between',
              padding: 'var(--space-2) var(--space-4)',
              paddingTop: 'calc(var(--space-2) + env(safe-area-inset-top))',
              minHeight: 56
            }}
          >
            <Brand compact />
            <button
              type="button"
              className="icon-btn"
              aria-label="Open conversation history"
              style={{ flex: 'none' }}
              onClick={() => setDrawerOpen(true)}
            >
              <History size={22} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <div className="hairline" />
        </header>

        <main
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto'
          }}
        >
          {props.children as ReactNode}
        </main>
      </div>

      {/* Phone bottom tab bar */}
      <nav className="tabbar mobile" aria-label="Main">
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="tab"
            aria-current={screen === id ? 'page' : undefined}
            onClick={() => onNavigate(id)}
          >
            <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {/* Phone history slide-over */}
      {drawerOpen && (
        <>
          <div className="drawer-backdrop hide-desktop" onClick={closeDrawer} aria-hidden="true" />
          <aside
            className="drawer hide-desktop"
            role="dialog"
            aria-modal="true"
            aria-label="Conversation history"
          >
            <div className="stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2>History</h2>
                <button
                  ref={closeRef}
                  type="button"
                  className="icon-btn"
                  aria-label="Close history"
                  onClick={closeDrawer}
                >
                  <X size={22} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              <div className="hairline" />
              <button type="button" className="btn btn-primary" onClick={handleNewChat}>
                <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
                New chat
              </button>
              {history}
            </div>
          </aside>
        </>
      )}

      <div aria-live="polite">
        {store.storageError && !storageDismissed && (
          <div className="toast" role="status">
            <div className="row">
              <span style={{ fontSize: 'var(--text-sm)' }}>
                Can’t save to this browser. Changes stay until you close the app.
              </span>
              <button
                type="button"
                className="btn btn-tertiary"
                style={{ height: 32 }}
                onClick={() => setStorageDismissed(true)}
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
