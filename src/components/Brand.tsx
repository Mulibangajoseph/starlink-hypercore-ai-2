import { useId } from 'react';
import type { ServerStatus } from '../types';
import { BRAND_NAME, BRAND_TAGLINE } from '../brand';

const NAME_PARTS = BRAND_NAME.trim().split(/\s+/);
const NAME_SUFFIX = NAME_PARTS.length > 1 ? NAME_PARTS[NAME_PARTS.length - 1] : '';
const NAME_MAIN = NAME_PARTS.length > 1 ? NAME_PARTS.slice(0, -1).join(' ') : BRAND_NAME;

function Mark({ size }: { size: number }) {
  const gid = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false" style={{ flex: 'none' }}>
      <defs>
        <linearGradient id={gid} x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <ellipse cx="16" cy="16" rx="14" ry="6" transform="rotate(-28 16 16)" stroke={`url(#${gid})`} strokeWidth="1.5" opacity="0.85" />
      <path
        d="M16 5C16.8 12 20 15.2 27 16C20 16.8 16.8 20 16 27C15.2 20 12 16.8 5 16C12 15.2 15.2 12 16 5Z"
        fill={`url(#${gid})`}
      />
    </svg>
  );
}

export default function Brand({ compact }: { compact?: boolean }) {
  return (
    <div
      className="row"
      style={{ gap: compact ? 'var(--space-2)' : 'var(--space-3)', minWidth: 0 }}
      title={BRAND_TAGLINE}
    >
      <Mark size={compact ? 28 : 36} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'var(--text-sm)',
            letterSpacing: '.04em',
            whiteSpace: 'nowrap'
          }}
        >
          {NAME_MAIN}
          {NAME_SUFFIX ? (
            <>
              {' '}
              <span style={{ color: 'var(--accent)' }}>{NAME_SUFFIX}</span>
            </>
          ) : null}
        </span>
        {!compact && (
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            {BRAND_TAGLINE}
          </span>
        )}
      </div>
    </div>
  );
}

export function StatusBadge({ status, failed }: { status: ServerStatus | null; failed: boolean }) {
  let label: string;
  let tone: string;
  let dot: string;
  if (failed) {
    label = 'Cannot reach server';
    tone = 'bad';
    dot = 'var(--danger)';
  } else if (!status) {
    label = 'Checking…';
    tone = '';
    dot = 'var(--ink-muted)';
  } else if (status.configured || (status.providers ?? []).some((p) => p.configured)) {
    label = 'Connected';
    tone = 'ok';
    dot = 'var(--success)';
  } else {
    label = 'Not configured';
    tone = 'warn';
    dot = 'var(--warning)';
  }
  return (
    <span className={`chip static ${tone}`.trim()} role="status" aria-live="polite">
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flex: 'none' }}
      />
      {label}
    </span>
  );
}
