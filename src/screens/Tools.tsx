import {
  Code2,
  PenLine,
  Image as ImageIcon,
  Landmark,
  ArrowRight,
  MessageSquare,
  Sparkles,
  FileText,
  Mic,
  Video,
  GraduationCap,
  Briefcase,
  Languages,
  Search,
  LayoutDashboard,
  Bot
} from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ChatMode, ToolsProps } from '../types';
import { TOOL_REGISTRY } from '../tools';
import type { ToolDef } from '../tools';

const ICONS: Record<string, typeof Code2> = {
  chat: MessageSquare,
  general: MessageSquare,
  code: Code2,
  writing: PenLine,
  image: ImageIcon,
  imagegen: Sparkles,
  documents: FileText,
  voice: Mic,
  video: Video,
  academy: GraduationCap,
  business: Briefcase,
  translate: Languages,
  research: Search,
  manager: LayoutDashboard,
  agents: Bot
};

function iconFor(t: ToolDef): typeof Code2 {
  const id = t.id.toLowerCase();
  if (ICONS[id]) return ICONS[id];
  const hit = Object.keys(ICONS).find((k) => id.includes(k));
  if (hit) return ICONS[hit];
  if (t.mode && ICONS[t.mode]) return ICONS[t.mode];
  return Sparkles;
}

const iconWrap: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 44,
  height: 44,
  borderRadius: 'var(--radius)',
  background: 'var(--accent-soft)',
  color: 'var(--accent)',
  flex: 'none'
};

const muteWrap: CSSProperties = { ...iconWrap, background: 'var(--surface-2)', color: 'var(--ink-muted)' };

const codeStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  background: 'var(--bg)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)'
};

export default function Tools({ statusState, onStart }: ToolsProps) {
  const { status, failed, providers } = statusState;
  const anyConfigured = providers.some((p) => p.configured) || !!status?.configured;
  const notice = failed
    ? 'Cannot reach server. Tools open a chat, but replies need the server.'
    : status && !anyConfigured
      ? 'AI provider not connected yet. Tools open a chat, but replies need a provider set up in Settings.'
      : null;
  const active = TOOL_REGISTRY.filter((t) => !t.soon);
  const soon = TOOL_REGISTRY.filter((t) => t.soon);
  const startMode = (t: ToolDef): ChatMode => t.mode ?? 'general';

  return (
    <div className="screen">
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <header className="stack" style={{ gap: 'var(--space-2)' }}>
          <h1>Tools</h1>
          <p className="muted">Start a chat tuned for one job. The mode shows as a chip and changes the assistant&apos;s instructions.</p>
          <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            {anyConfigured
              ? `${providers.filter((p) => p.configured).length} provider${providers.filter((p) => p.configured).length === 1 ? '' : 's'} connected.`
              : 'No provider connected yet.'}
          </p>
          <div className="hairline" aria-hidden="true" />
          <nav aria-label="Tools sections" className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {[
              ['tools-ai', 'AI tools'],
              ['tools-soon', 'Departments'],
              ['tools-int', 'Integrations']
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="chip"
                onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                {label}
              </button>
            ))}
          </nav>
          {notice && (
            <p role="status" aria-live="polite" className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              {notice}
            </p>
          )}
        </header>

        <section aria-labelledby="tools-ai" className="stack" style={{ gap: 'var(--space-3)' }}>
          <h2 id="tools-ai">AI tools</h2>
          <div className="grid">
            {active.map((t) => {
              const Icon = iconFor(t);
              return (
                <article key={t.id} className="card stack" style={{ justifyContent: 'space-between' }}>
                  <div className="stack">
                    <div style={iconWrap}>
                      <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                    </div>
                    <h3>{t.title}</h3>
                    <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>{t.text}</p>
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={() => onStart(startMode(t))}>
                    Open
                    <ArrowRight size={20} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        {soon.length > 0 && (
          <section aria-labelledby="tools-soon" className="stack" style={{ gap: 'var(--space-3)' }}>
            <h2 id="tools-soon">Departments</h2>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
              {soon.map((t) => {
                const Icon = iconFor(t);
                const isVideo = t.id.toLowerCase().includes('video');
                return (
                  <article key={t.id} className="card stack">
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={muteWrap}>
                        <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                      </div>
                      <span className="chip static">Planned</span>
                    </div>
                    <h3>{t.title}</h3>
                    <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>{t.text}</p>
                    {isVideo && (
                      <div className="stack" style={{ gap: 'var(--space-2)' }}>
                        <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>Server environment variable</p>
                        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                          <code style={codeStyle}>VIDEO_API_KEY</code>
                        </div>
                        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                          {status?.video
                            ? 'A video key is set, but no video provider adapter is built into this version yet.'
                            : 'Needs a video provider and a server-side adapter. Nothing is generated until then.'}
                        </p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section aria-labelledby="tools-int" className="stack" style={{ gap: 'var(--space-3)' }}>
          <h2 id="tools-int">Integrations</h2>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
            <article className="card stack">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={muteWrap}>
                  <Landmark size={22} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <span className="chip static">Link later</span>
              </div>
              <h3>STARLINK HYPERCORE FINANCE</h3>
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                A reserved place to connect your existing Finance project in a future version.
              </p>
              <button type="button" className="btn btn-secondary" disabled>
                Link later
              </button>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}
