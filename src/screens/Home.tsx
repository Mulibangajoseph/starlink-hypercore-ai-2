import {
  Code2,
  PenLine,
  Image as ImageIcon,
  ImagePlus,
  FileText,
  Plus,
  MessageSquare,
  ChevronRight,
  Settings as SettingsIcon,
  Sparkles,
  ArrowRight,
  Video,
  GraduationCap,
  Briefcase,
  Languages,
  Search,
  LayoutDashboard,
  Bot,
  Download,
  Smartphone,
  X
} from 'lucide-react';
import { useState } from 'react';
import { useInstallPrompt } from '../pwa';
import type { ChatMode, Conversation, HomeProps } from '../types';
import { MODE_LABEL, SUGGESTIONS } from '../types';
import { TOOL_REGISTRY } from '../tools';

const DEPARTMENTS = TOOL_REGISTRY.filter((t) => t.soon);
const DEPT_ICON: Record<string, typeof Code2> = {
  video: Video,
  academy: GraduationCap,
  business: Briefcase,
  translate: Languages,
  research: Search,
  manager: LayoutDashboard,
  agents: Bot
};

const QUICK: { mode: ChatMode; title: string; note: string; Icon: typeof Code2 }[] = [
  { mode: 'code', title: 'Coding help', note: 'Debug, explain and write code', Icon: Code2 },
  { mode: 'writing', title: 'Writing', note: 'Draft, polish and summarize text', Icon: PenLine },
  { mode: 'image', title: 'Image understanding', note: 'Attach a photo and ask about it', Icon: ImageIcon },
  { mode: 'imagegen', title: 'Create image', note: 'Generate a picture from a prompt', Icon: ImagePlus },
  { mode: 'documents', title: 'Documents', note: 'Summarize a PDF, TXT, MD, CSV or JSON', Icon: FileText }
];

const SAMPLE_CHIPS: { mode: ChatMode; text: string }[] = [
  { mode: 'code', text: SUGGESTIONS.code[1] },
  { mode: 'writing', text: SUGGESTIONS.writing[1] },
  { mode: 'general', text: SUGGESTIONS.general[1] }
];

const LOCAL_CSS = `
.home-tool{display:flex;flex-direction:column;align-items:flex-start;gap:var(--space-2);width:100%;text-align:left;padding:var(--space-4);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);cursor:pointer;color:var(--ink);transition:border-color var(--dur),transform var(--dur-fast),background var(--dur)}
.home-tool:hover{border-color:var(--accent);background:var(--surface-2)}
.home-tool:active{transform:scale(.97)}
.home-tool:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.home-tool .ico{display:grid;place-items:center;width:40px;height:40px;border-radius:var(--radius);background:var(--accent-soft);color:var(--accent)}
.home-head{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);flex-wrap:nowrap}
.home-title{font-size:clamp(26px,6vw,var(--text-display));line-height:1.2;font-weight:600}
.home-num{font-variant-numeric:tabular-nums}
.home-split{display:grid;gap:var(--space-5);grid-template-columns:1fr}
@media(min-width:860px){.home-split{grid-template-columns:1.4fr 1fr;align-items:start}}
`;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)').matches : false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return mm || nav.standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

interface InstallState {
  canInstall: boolean;
  installed: boolean;
  install: () => Promise<void>;
}

function useInstall(): InstallState {
  const raw = useInstallPrompt() as unknown;
  const r: Record<string, unknown> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fn = (r.install ?? r.promptInstall ?? r.prompt ?? r.triggerInstall) as unknown;
  const flagKeys = ['canInstall', 'available', 'installable', 'ready'];
  const flagKey = flagKeys.find((k) => typeof r[k] === 'boolean');
  const can = flagKey ? (r[flagKey] as boolean) : false;
  const installedFlag = r.installed ?? r.isInstalled;
  const installed = typeof installedFlag === 'boolean' ? installedFlag || isStandalone() : isStandalone();
  return {
    canInstall: can && typeof fn === 'function' && !installed,
    installed,
    install: async () => {
      if (typeof fn === 'function') {
        await (fn as () => unknown)();
      }
    }
  };
}

function greetingWord(d: Date): string {
  const h = d.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function relativeTime(ts: number): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < min) return rtf.format(0, 'second');
  if (abs < hour) return rtf.format(Math.round(diff / min), 'minute');
  if (abs < day) return rtf.format(Math.round(diff / hour), 'hour');
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), 'day');
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(ts));
}

function countLabel(c: Conversation): string {
  const n = c.messages.length;
  if (n === 0) return 'No messages yet';
  return `${new Intl.NumberFormat().format(n)} ${n === 1 ? 'message' : 'messages'}`;
}

export default function Home({ store, statusState, onNavigate, onStart }: HomeProps) {
  const { status, failed, providers } = statusState;
  const connected = (providers ?? []).filter((p) => p.configured && p.id !== 'default');
  const name = store.profile.displayName.trim();
  const greeting = name ? `${greetingWord(new Date())}, ${name}` : greetingWord(new Date());
  const recent = [...store.conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  const { canInstall, installed, install } = useInstall();
  const [helpOpen, setHelpOpen] = useState(false);
  const [installMsg, setInstallMsg] = useState('');
  const [installing, setInstalling] = useState(false);

  const onInstall = async () => {
    if (installing) return;
    setInstallMsg('');
    if (!canInstall) {
      setHelpOpen(true);
      return;
    }
    setInstalling(true);
    try {
      await install();
    } catch {
      setInstallMsg('Could not open the install prompt. Use your browser menu: Install app.');
      setHelpOpen(true);
    } finally {
      setInstalling(false);
    }
  };

  const dismissNote = () => {
    setHelpOpen(false);
  };

  const showNote = helpOpen && !installed;
  const noteText = isIos()
    ? 'On iPhone or iPad: tap Share in Safari, then Add to Home Screen.'
    : 'Your browser has not offered its install prompt here. Open the browser menu and choose Install app or Add to Home Screen.';
  const apkText =
    'Android APK: there is no APK download in this version. The installed app runs the same on Android; a signed APK is built from the project by following ANDROID.md.';

  const openRecent = (id: string) => {
    store.openChat(id);
    onNavigate('chat');
  };

  let statusLine: string;
  if (failed) statusLine = 'Cannot reach server. Your saved chats are still available.';
  else if (!status) statusLine = 'Checking the AI connection…';
  else if (connected.length > 0) statusLine = `${new Intl.NumberFormat().format(connected.length)} of 4 AI providers connected: ${connected.map((p) => p.label).join(', ')}`;
  else if (status.configured) statusLine = `Model ${status.model ?? 'unknown'}${status.provider ? ` via ${status.provider}` : ''}`;
  else statusLine = 'Ready to connect: add an OpenAI, Claude, Gemini or DeepSeek key in Settings.';

  const showConnect = !failed && status !== null && !status.configured && connected.length === 0;

  return (
    <div className="screen">
      <style>{LOCAL_CSS}</style>
      <div className="container stack" style={{ gap: 'var(--space-5)' }}>
        <div className="stack" style={{ gap: 'var(--space-5)' }}>
          <section className="stack" style={{ gap: 'var(--space-3)' }} aria-labelledby="home-greeting">
            <h1 id="home-greeting" className="home-title">{greeting}</h1>
            <p className="muted" aria-live="polite">{statusLine}</p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => onStart('general')}>
                <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
                New chat
              </button>
              {showConnect && (
                <button type="button" className="btn btn-tertiary" onClick={() => onNavigate('settings')}>
                  <SettingsIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                  Connect AI
                </button>
              )}
              {!installed && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onInstall}
                  disabled={installing}
                  aria-expanded={canInstall ? undefined : helpOpen}
                >
                  <Download size={20} strokeWidth={1.75} aria-hidden="true" />
                  {installing ? 'Installing…' : 'Install app'}
                </button>
              )}
            </div>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }} aria-live="polite">{installMsg}</p>
            {showNote && (
              <div className="card">
                <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-3)', flex: 1, minWidth: 0 }}>
                    <Smartphone size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: 'var(--accent)', flex: 'none' }} />
                    <div className="stack" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
                      <p style={{ fontSize: 'var(--text-sm)' }}>{noteText}</p>
                      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>{apkText}</p>
                    </div>
                  </div>
                  <button type="button" className="icon-btn" onClick={dismissNote} aria-label="Close install help">
                    <X size={20} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </section>

          <div className="home-split">
            <section className="stack" aria-labelledby="home-quick">
              <h2 id="home-quick">Quick start</h2>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
                {QUICK.map(({ mode, title, note, Icon }) => (
                  <button key={mode} type="button" className="home-tool" onClick={() => onStart(mode)}>
                    <span className="ico"><Icon size={20} strokeWidth={1.75} aria-hidden="true" /></span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{title}</span>
                    <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>{note}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="stack" aria-labelledby="home-recent">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 id="home-recent">Recent chats</h2>
                {store.conversations.length > 0 && (
                  <span className="muted home-num" style={{ fontSize: 'var(--text-sm)' }}>
                    {new Intl.NumberFormat().format(store.conversations.length)} total
                  </span>
                )}
              </div>

              {recent.length === 0 ? (
                <div className="card">
                  <div className="empty">
                    <span className="circle"><Sparkles size={28} strokeWidth={1.75} aria-hidden="true" /></span>
                    <h3>No conversations yet</h3>
                    <p>Pick a prompt to open a chat in that mode, or start a blank one.</p>
                    <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center', marginTop: 'var(--space-2)' }}>
                      {SAMPLE_CHIPS.map((c) => (
                        <button
                          key={c.text}
                          type="button"
                          className="chip"
                          style={{ height: 'auto', minHeight: 44, padding: 'var(--space-1) var(--space-3)', whiteSpace: 'normal', textAlign: 'left' }}
                          aria-label={`Open ${MODE_LABEL[c.mode]} chat. Suggested prompt: ${c.text}`}
                          onClick={() => onStart(c.mode)}
                        >
                          {c.text}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="stack" style={{ gap: 'var(--space-1)' }} role="list">
                  {recent.map((c) => (
                    <div role="listitem" key={c.id}>
                      <button type="button" className="list-row" onClick={() => openRecent(c.id)}>
                        <MessageSquare size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: 'var(--accent)', flex: 'none' }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 500, overflowWrap: 'anywhere' }}>{c.title || 'New chat'}</span>
                          <span className="muted" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                            {MODE_LABEL[c.mode]} · {countLabel(c)}
                          </span>
                        </span>
                        <span className="muted" style={{ fontSize: 'var(--text-xs)', flex: 'none', textAlign: 'right' }}>
                          {relativeTime(c.updatedAt)}
                        </span>
                        <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="muted" style={{ flex: 'none' }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="stack" aria-labelledby="home-depts">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <h2 id="home-depts">Departments</h2>
              <button type="button" className="btn btn-tertiary" onClick={() => onNavigate('tools')}>
                All tools
                <ArrowRight size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
              {DEPARTMENTS.map((t) => {
                const Icon = DEPT_ICON[t.id] ?? Sparkles;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="home-tool"
                    aria-label={`${t.title}, planned department. Open Tools`}
                    onClick={() => onNavigate('tools')}
                  >
                    <span className="ico"><Icon size={20} strokeWidth={1.75} aria-hidden="true" /></span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{t.title}</span>
                    <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>Planned</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
