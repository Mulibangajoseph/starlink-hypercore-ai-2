import { useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Monitor, RotateCw, Smartphone } from 'lucide-react';

const CSS = `
.hp-root{display:flex;flex-direction:column;gap:var(--space-2,8px);margin-top:var(--space-2,8px);width:100%;max-width:100%}
.hp-bar{display:flex;flex-wrap:wrap;gap:var(--space-2,8px);align-items:center}
.hp-btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--space-2,8px);min-height:44px;min-width:44px;padding:0 var(--space-3,12px);border-radius:var(--radius-control,10px);border:1px solid var(--line,rgba(120,170,255,.28));background:transparent;color:var(--ink,#e8f1ff);font:inherit;font-size:14px;font-weight:500;white-space:nowrap;cursor:pointer;transition:background .18s ease-out,transform .18s ease-out,border-color .18s ease-out}
.hp-btn:hover{background:rgba(80,160,255,.14);border-color:var(--accent,#22d3ee)}
.hp-btn:active{transform:scale(.97);background:rgba(80,160,255,.24)}
.hp-btn:focus-visible{outline:2px solid var(--accent,#22d3ee);outline-offset:2px}
.hp-btn[aria-pressed="true"]{border-color:var(--accent,#22d3ee);color:var(--accent,#22d3ee)}
.hp-spacer{flex:1 1 auto}
.hp-frame-wrap{display:flex;justify-content:center;border:1px solid var(--line,rgba(120,170,255,.28));border-radius:var(--radius-card,12px);background:#fff;overflow:hidden}
.hp-frame{display:block;border:0;background:#fff;height:min(420px,60dvh);transition:width .2s ease-out}
.hp-note{font-size:12px;color:var(--muted,#8fa3c4);line-height:1.5;margin:0}
@media (prefers-reduced-motion:reduce){.hp-btn,.hp-frame{transition:none}.hp-btn:active{transform:none}}
`;

function fileNameFor(html: string): string {
  const m = html.match(/<title[^>]*>([^<]{1,60})<\/title>/i);
  const base = (m ? m[1] : 'website')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'website'}.html`;
}

export default function HtmlPreview(props: { html: string }) {
  const { html } = props;
  const [narrow, setNarrow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [message, setMessage] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const doc = useMemo(() => {
    if (/<html[\s>]/i.test(html) || /<!doctype/i.test(html)) return html;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`;
  }, [html]);

  function say(text: string) {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(''), 3000);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      say('HTML copied');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      say('Copy was blocked by the browser. Select the code and copy it manually.');
    }
  }

  function download() {
    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const name = fileNameFor(html);
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      say(`Downloaded ${name}`);
    } catch {
      say('Download failed. Try Copy instead.');
    }
  }

  return (
    <div className="hp-root">
      <style>{CSS}</style>
      <div className="hp-bar" role="toolbar" aria-label="Website preview actions">
        <button
          type="button"
          className="hp-btn"
          aria-pressed={narrow}
          onClick={() => setNarrow((v) => !v)}
          aria-label={narrow ? 'Switch to desktop width' : 'Switch to phone width'}
        >
          {narrow ? <Monitor size={18} strokeWidth={2} aria-hidden="true" /> : <Smartphone size={18} strokeWidth={2} aria-hidden="true" />}
          {narrow ? 'Desktop' : 'Phone'}
        </button>
        <button type="button" className="hp-btn" onClick={() => setReloadKey((k) => k + 1)} aria-label="Reload preview">
          <RotateCw size={18} strokeWidth={2} aria-hidden="true" />
          Reload
        </button>
        <span className="hp-spacer" />
        <button type="button" className="hp-btn" onClick={copy} aria-label="Copy HTML">
          {copied ? <Check size={18} strokeWidth={2} aria-hidden="true" /> : <Copy size={18} strokeWidth={2} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="hp-btn" onClick={download} aria-label="Download HTML file">
          <Download size={18} strokeWidth={2} aria-hidden="true" />
          Download
        </button>
      </div>
      <div className="hp-frame-wrap">
        <iframe
          key={reloadKey}
          className="hp-frame"
          title="Website preview"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={doc}
          style={{ width: narrow ? 375 : '100%', maxWidth: '100%' }}
        />
      </div>
      <p className="hp-note">Runs in a sandbox: no access to this app or your data, and no network requests.</p>
      <div aria-live="polite" className="hp-note">{message}</div>
    </div>
  );
}
