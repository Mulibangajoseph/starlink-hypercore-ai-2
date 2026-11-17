import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Cpu } from 'lucide-react';
import type { ProviderId, ProviderInfo, ProviderSelectProps } from '../types';

const CSS = `
.ps-wrap{position:relative;display:inline-block;max-width:100%}
.ps-trigger{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--line,rgba(120,170,255,.22));background:var(--surface,rgba(16,28,52,.9));color:var(--ink,#e8f1ff);font:inherit;font-size:14px;font-weight:500;cursor:pointer;max-width:100%;white-space:nowrap;transition:background .2s ease-out,transform .2s ease-out,border-color .2s ease-out}
.ps-trigger:hover{border-color:var(--accent,#22d3ee)}
.ps-trigger:active{transform:scale(.97)}
.ps-trigger:focus-visible,.ps-opt:focus-visible{outline:2px solid var(--accent,#22d3ee);outline-offset:2px}
.ps-label{overflow:hidden;text-overflow:ellipsis}
.ps-pop{position:absolute;z-index:60;width:min(320px,calc(100vw - 32px));max-height:min(420px,70dvh);overflow-y:auto;padding:8px;border-radius:16px;border:1px solid var(--line,rgba(120,170,255,.22));background:var(--surface-2,var(--surface,#0d1830));color:var(--ink,#e8f1ff);box-shadow:0 12px 32px rgba(0,0,0,.45);animation:ps-in .2s ease-out}
@keyframes ps-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.ps-pop{animation:none}.ps-trigger{transition:none}}
.ps-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px 4px;font-size:12px;font-weight:600}
.ps-badge{font-size:12px;font-weight:500;padding:0 8px;border-radius:999px;white-space:nowrap;line-height:20px}
.ps-badge.ok{color:var(--accent,#22d3ee);background:rgba(34,211,238,.12)}
.ps-badge.off{color:var(--muted,#9db2d3);background:rgba(157,178,211,.14)}
.ps-opt{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:44px;padding:8px 12px;border:0;border-radius:12px;background:transparent;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer;transition:background .15s ease-out}
.ps-opt:hover{background:rgba(34,211,238,.1)}
.ps-opt:active{background:rgba(34,211,238,.18)}
.ps-opt[aria-selected="true"]{color:var(--accent,#22d3ee);font-weight:600}
.ps-note{padding:4px 8px 8px;font-size:12px;color:var(--muted,#9db2d3)}
`;

export default function ProviderSelect({ providers, provider, model, onChange }: ProviderSelectProps) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = useMemo(() => {
    let p: ProviderInfo | undefined;
    if (provider) p = providers.find((x) => x.id === provider);
    else p = providers.find((x) => x.id === 'default' && x.configured) || providers.find((x) => x.configured);
    if (!p) {
      return {
        text: providers.length > 0 ? 'Choose provider' : 'Loading providers…',
        connected: providers.length === 0
      };
    }
    const m = p.models.find((x) => x.id === model) || (provider ? p.models[0] : p.models[0]);
    const name = p.id === 'default' ? 'Auto' : p.label;
    return { text: m ? `${name} · ${m.label}` : name, connected: p.configured };
  }, [providers, provider, model]);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setUp(window.innerHeight - r.bottom < 380 && r.top > window.innerHeight - r.bottom);
      setAlignRight(r.left + 320 > window.innerWidth - 16);
    }
    setOpen((o) => !o);
  };

  const choose = (p: ProviderInfo, modelId?: string) => {
    if (p.id === 'default') onChange(undefined, undefined);
    else onChange(p.id as ProviderId, modelId);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const popStyle: React.CSSProperties = {
    ...(up ? { bottom: 'calc(100% + 8px)' } : { top: 'calc(100% + 8px)' }),
    ...(alignRight ? { right: 0 } : { left: 0 })
  };

  return (
    <div className="ps-wrap" ref={wrapRef}>
      <style>{CSS}</style>
      <button
        ref={triggerRef}
        type="button"
        className="ps-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`AI model: ${current.text}. Change model`}
        onClick={toggle}
      >
        <Cpu size={18} strokeWidth={1.75} aria-hidden="true" />
        <span className="ps-label">{current.text}</span>
        {!current.connected && <span className="ps-badge off">Not connected</span>}
        <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className="ps-pop" style={popStyle} role="listbox" aria-label="AI provider and model">
          {providers.length === 0 && <div className="ps-note">Providers are loading. Try again in a moment.</div>}
          {providers.map((p) => {
            const isDefault = p.id === 'default';
            return (
              <div key={p.id} role="group" aria-label={p.label}>
                <div className="ps-head">
                  <span>{isDefault ? 'Auto (server default)' : p.label}</span>
                  <span className={`ps-badge ${p.configured ? 'ok' : 'off'}`}>
                    {p.configured ? (p.paid ? 'Connected · paid' : 'Connected') : 'Not connected'}
                  </span>
                </div>
                {isDefault ? (
                  <button
                    type="button"
                    role="option"
                    aria-selected={!provider}
                    className="ps-opt"
                    onClick={() => choose(p)}
                  >
                    <span>{p.models[0]?.label || 'Server default model'}</span>
                    {!provider && <Check size={18} strokeWidth={1.75} aria-hidden="true" />}
                  </button>
                ) : (
                  p.models.map((m, i) => {
                    const selected = provider === p.id && (model ? model === m.id : i === 0);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className="ps-opt"
                        onClick={() => choose(p, m.id)}
                      >
                        <span>{m.label}</span>
                        {selected && <Check size={18} strokeWidth={1.75} aria-hidden="true" />}
                      </button>
                    );
                  })
                )}
                {!p.configured && !isDefault && (
                  <div className="ps-note">Needs {p.envKey} on the server.</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
