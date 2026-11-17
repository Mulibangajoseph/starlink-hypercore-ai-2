import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Check,
  CircleAlert,
  Copy,
  Download,
  Gauge,
  Globe,
  KeyRound,
  Lock,
  Mail,
  Camera,
  Mic,
  MessageSquare,
  Phone,
  ScanFace,
  Smartphone,
  Volume2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  User,
  Wifi,
  WifiOff
} from 'lucide-react';
import { ENV_VARS } from '../types';
import type { SettingsProps } from '../types';
import { useInstallPrompt } from '../pwa';
import { BRAND_NAME, BRAND_TAGLINE } from '../brand';
import { voiceInputSupported } from '../voice';
import { faceConsent, getCapabilities, isNative, setFaceConsent } from '../native';
import type { Capability } from '../native';

const CAP_ICON: Record<Capability['id'], typeof Camera> = {
  camera: Camera,
  face: ScanFace,
  sms: MessageSquare,
  calls: Phone,
  assistant: Mic
};

function capStatusLabel(status: Capability['status']): string {
  if (status === 'available') return 'Available';
  if (status === 'android-only') return 'Android app only';
  return 'Needs native plugin';
}

const APP_VERSION = '1.0.0';
const NAME_MAX = 40;
const ICON = { size: 20, strokeWidth: 1.75 } as const;

const sectionStyle = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } as const;
const pageStyle = { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', paddingBottom: 'var(--space-6)' } as const;
const smallMuted = { fontSize: 'var(--text-sm)' } as const;
const rowBetween = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  flexWrap: 'wrap'
} as const;

function validateName(value: string): string {
  const v = value.trim();
  if (!v) return 'Enter a display name.';
  if (v.length > NAME_MAX) return `Keep it under ${NAME_MAX} characters.`;
  return '';
}

export default function Settings({ store, statusState }: SettingsProps) {
  const { status, failed, refresh, providers, usage } = statusState;
  const { canInstall, install } = useInstallPrompt();

  const [name, setName] = useState(store.profile.displayName);
  const [nameError, setNameError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [faceOn, setFaceOn] = useState<boolean>(() => faceConsent());
  const toastTimer = useRef<number | undefined>(undefined);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(copyTimer.current);
    };
  }, []);

  const showToast = (text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  };

  const saveName = (e: FormEvent) => {
    e.preventDefault();
    const err = validateName(name);
    setNameError(err);
    if (err) return;
    store.setProfile({ displayName: name.trim() });
    setName(name.trim());
    showToast('Profile saved');
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(null), 2000);
    } catch {
      showToast('Copy failed. Select the text and copy it manually.');
    }
  };

  const toggleFace = () => {
    const next = !faceOn;
    setFaceConsent(next);
    setFaceOn(next);
    showToast(next ? 'Face feature consent saved on this device' : 'Face consent withdrawn and cleared');
  };

  const toggleEnter = () => {
    store.setPrefs({ ...store.prefs, sendOnEnter: !store.prefs.sendOnEnter });
  };

  const toggleSpeak = () => {
    store.setPrefs({ ...store.prefs, autoSpeak: !store.prefs.autoSpeak });
  };

  const doClear = () => {
    store.clearAll();
    setConfirmClear(false);
    showToast('All conversations deleted');
  };

  const doInstall = async () => {
    setInstalling(true);
    try {
      await install();
    } catch {
      showToast('Install was cancelled or is not available.');
    } finally {
      setInstalling(false);
    }
  };

  const loading = status === null && !failed;
  const missing = status?.missing ?? [];
  const count = store.conversations.length;
  const anyConnected = Boolean(status?.configured) || providers.some((p) => p.configured);
  const micSupported = voiceInputSupported();
  const nf = new Intl.NumberFormat();
  const usagePct = usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const usageLeft = usage ? Math.max(0, usage.limit - usage.used) : 0;

  return (
    <div className="container screen" style={pageStyle}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h1>Settings</h1>
        <div className="hairline" />
      </header>

      {store.storageError && (
        <div className="card" role="alert" style={{ borderColor: 'var(--warning)' }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <CircleAlert {...ICON} color="var(--warning)" aria-hidden="true" style={{ flex: 'none' }} />
            <p style={smallMuted}>
              Browser storage is full or unavailable. The app keeps working, but changes may be lost when you close this tab.
            </p>
          </div>
        </div>
      )}

      {/* Profile */}
      <section aria-labelledby="set-profile" style={sectionStyle}>
        <h2 id="set-profile">Profile</h2>
        <form className="card" onSubmit={saveName} noValidate style={sectionStyle}>
          <div>
            <label htmlFor="display-name" style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: 'var(--space-2)' }}>
              Display name
            </label>
            <input
              id="display-name"
              className={`field${nameError ? ' field-error' : ''}`}
              value={name}
              maxLength={NAME_MAX + 10}
              autoComplete="nickname"
              aria-invalid={nameError ? true : undefined}
              aria-describedby="display-name-help"
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError('');
              }}
              onBlur={() => setNameError(validateName(name))}
              placeholder="Your name"
            />
            {nameError ? (
              <p id="display-name-help" className="field-error-text">{nameError}</p>
            ) : (
              <p id="display-name-help" className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>
                Shown in the greeting on Home. Stored only in this browser.
              </p>
            )}
          </div>
          <div>
            <button type="submit" className="btn btn-primary">
              <User {...ICON} aria-hidden="true" /> Save name
            </button>
          </div>
        </form>
      </section>

      {/* Account */}
      <section aria-labelledby="set-account" style={sectionStyle}>
        <h2 id="set-account">Account</h2>
        <div className="card" style={sectionStyle}>
          <div style={rowBetween}>
            <p style={{ fontWeight: 500 }}>Sync across devices</p>
            <span className="chip static">Not available</span>
          </div>
          <p className="muted" style={smallMuted}>
            Accounts are not available yet. The app is fully usable without signing in. Sign-in with passwords and a private database need a private backend, which this version does not include. Usage limits are tracked per device instead.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" disabled aria-disabled="true">
              <Mail {...ICON} aria-hidden="true" /> Continue with email
            </button>
            <button type="button" className="btn btn-secondary" disabled aria-disabled="true">
              <Globe {...ICON} aria-hidden="true" /> Continue with Google
            </button>
          </div>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <ShieldCheck {...ICON} color="var(--accent)" aria-hidden="true" style={{ flex: 'none' }} />
            <p className="muted" style={smallMuted}>
              Security: API keys stay on the server and never reach your browser. When accounts arrive, sessions will use HttpOnly cookies.
            </p>
          </div>
        </div>
      </section>

      {/* Connect AI */}
      <section aria-labelledby="set-ai" style={sectionStyle}>
        <h2 id="set-ai">Connect AI</h2>
        <div className="card" style={sectionStyle}>
          <div style={rowBetween} aria-live="polite">
            <div className="row">
              {loading ? (
                <RefreshCw {...ICON} color="var(--ink-muted)" aria-hidden="true" />
              ) : failed ? (
                <WifiOff {...ICON} color="var(--danger)" aria-hidden="true" />
              ) : anyConnected ? (
                <Wifi {...ICON} color="var(--success)" aria-hidden="true" />
              ) : (
                <KeyRound {...ICON} color="var(--warning)" aria-hidden="true" />
              )}
              <div>
                <p style={{ fontWeight: 600 }}>
                  {loading
                    ? 'Checking server…'
                    : failed
                      ? 'Cannot reach server'
                      : anyConnected
                        ? 'Connected'
                        : 'Not configured'}
                </p>
                <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                  {loading
                    ? 'Asking /api/status'
                    : failed
                      ? 'The status request failed. Check your connection or deployment.'
                      : anyConnected
                        ? 'At least one provider can answer messages.'
                        : 'No answers are generated until a provider key is set on the server.'}
                </p>
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
              <RefreshCw {...ICON} aria-hidden="true" /> {failed ? 'Retry' : 'Check again'}
            </button>
          </div>

          {loading && (
            <div className="stack" aria-hidden="true">
              <div className="skeleton" style={{ height: 48 }} />
              <div className="skeleton" style={{ height: 48 }} />
              <div className="skeleton" style={{ height: 48 }} />
            </div>
          )}

          {!loading && !failed && providers.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 'var(--space-2)' }}>AI providers</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {providers.map((p) => (
                  <li
                    key={p.id}
                    style={{
                      padding: 'var(--space-3)',
                      background: 'var(--surface-2)',
                      borderRadius: 'var(--radius)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-1)'
                    }}
                  >
                    <div style={rowBetween}>
                      <p style={{ fontWeight: 600 }}>{p.label}</p>
                      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                        {p.paid && <span className="chip static" style={{ height: 24 }}>Paid service</span>}
                        <span className={`chip static ${p.configured ? 'ok' : 'warn'}`} style={{ height: 24 }}>
                          {p.configured ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                    </div>
                    <p className="muted" style={{ fontSize: 'var(--text-xs)', overflowWrap: 'anywhere' }}>
                      Key variable: <code style={{ fontFamily: 'var(--font-mono)' }}>{p.envKey}</code> ({p.configured ? 'Set' : 'Missing'})
                      {p.models.length > 0 ? ` · ${p.models.length} ${p.models.length === 1 ? 'model' : 'models'}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>
                Usage is billed by each provider to the account that owns the key. Image generation uses OPENAI_API_KEY and is a paid service. Add or change keys on the server, then press Check again.
              </p>
            </div>
          )}

          {status?.configured && !failed && (
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: 'var(--space-2) var(--space-4)',
                margin: 0,
                fontSize: 'var(--text-sm)'
              }}
            >
              <dt className="muted">Provider</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{status.provider ?? 'Unknown'}</dd>
              <dt className="muted">Model</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{status.model ?? 'Unknown'}</dd>
              <dt className="muted">Video</dt>
              <dd style={{ margin: 0 }}>{status.video ? 'Provider key set' : 'Not connected'}</dd>
            </dl>
          )}

          {!loading && !failed && status && !anyConnected && missing.length > 0 && (
            <p style={smallMuted}>
              Missing: <strong style={{ fontWeight: 600 }}>{missing.join(', ')}</strong>
            </p>
          )}

          <div>
            <h3 style={{ marginBottom: 'var(--space-2)' }}>Server variables</h3>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {ENV_VARS.map((v) => {
                const known = !loading && !failed && status !== null;
                const prov = providers.find((p) => p.envKey === v.name);
                const isMissing = known && (prov ? !prov.configured : missing.includes(v.name));
                const showState = known && (prov !== undefined || v.secret);
                const missingLabel = v.name === 'AI_API_KEY' ? 'Not set' : 'Missing';
                return (
                  <li
                    key={v.name}
                    className="row"
                    style={{
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      padding: 'var(--space-3)',
                      background: 'var(--surface-2)',
                      borderRadius: 'var(--radius)'
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', overflowWrap: 'anywhere' }}>
                          {v.name}
                        </code>
                        {v.secret && <span className="chip static" style={{ height: 24 }}>Secret</span>}
                        {showState && (
                          <span className={`chip static ${isMissing ? 'warn' : 'ok'}`} style={{ height: 24 }}>
                            {isMissing ? missingLabel : 'Set'}
                          </span>
                        )}
                      </div>
                      <p className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>
                        {v.note}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => copy(v.name)}
                      aria-label={`Copy variable name ${v.name}`}
                    >
                      {copied === v.name ? (
                        <Check {...ICON} color="var(--success)" aria-hidden="true" />
                      ) : (
                        <Copy {...ICON} aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>
              Optional: VIDEO_API_KEY for a future video provider. Never paste keys into this app: they are set on the server only.
            </p>
          </div>

          <div>
            <h3 style={{ marginBottom: 'var(--space-2)' }}>Setup steps</h3>
            <ol
              className="muted"
              style={{ margin: 0, paddingLeft: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}
            >
              <li>Open your hosting dashboard (for example Cloudflare Workers) and go to the project&apos;s Settings, then Variables and Secrets.</li>
              <li>Add each provider key you want to use as an encrypted secret: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY or DEEPSEEK_API_KEY. Providers without a key show as Not connected.</li>
              <li>Optional: AI_API_KEY, AI_BASE_URL and AI_MODEL keep working as an OpenAI-compatible fallback, and DAILY_LIMIT sets the requests per device per day.</li>
              <li>Redeploy the project so the server picks up the values.</li>
              <li>Come back here and press Check again. The status should read Connected.</li>
            </ol>
          </div>

          <div>
            <h3 style={{ marginBottom: 'var(--space-2)' }}>Local development</h3>
            <p className="muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>
              Create a <code style={{ fontFamily: 'var(--font-mono)' }}>.dev.vars</code> file next to the server (keep it out of git):
            </p>
            <pre
              style={{
                margin: 0,
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-3)',
                overflow: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)'
              }}
            >
              <code>{`OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
GEMINI_API_KEY=your-gemini-key
DEEPSEEK_API_KEY=your-deepseek-key
DAILY_LIMIT=100`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Usage */}
      <section aria-labelledby="set-usage" style={sectionStyle}>
        <h2 id="set-usage">Usage today</h2>
        <div className="card" style={sectionStyle}>
          {usage ? (
            <>
              <div style={rowBetween}>
                <div className="row">
                  <Gauge {...ICON} color="var(--accent)" aria-hidden="true" />
                  <p style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {nf.format(usage.used)} of {nf.format(usage.limit)} requests
                  </p>
                </div>
                <span className={`chip static ${usageLeft === 0 ? 'warn' : 'ok'}`} style={{ height: 24 }}>
                  {usageLeft === 0 ? 'Limit reached' : `${nf.format(usageLeft)} left`}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Requests used today"
                aria-valuemin={0}
                aria-valuemax={usage.limit}
                aria-valuenow={Math.min(usage.used, usage.limit)}
                style={{ height: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', overflow: 'hidden' }}
              >
                <div
                  style={{
                    width: `${usagePct}%`,
                    height: '100%',
                    background: usageLeft === 0 ? 'var(--warning)' : 'var(--accent)',
                    transition: 'width 200ms ease-out'
                  }}
                />
              </div>
              <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                The server counts requests for this device each day. When the limit is reached, chat shows a message until the quota resets.
              </p>
            </>
          ) : (
            <p className="muted" style={smallMuted}>
              {failed
                ? 'Usage is unavailable because the server cannot be reached.'
                : loading
                  ? 'Checking usage…'
                  : 'Usage appears here after your first request today.'}
            </p>
          )}
        </div>
      </section>

      {/* Preferences */}
      <section aria-labelledby="set-prefs" style={sectionStyle}>
        <h2 id="set-prefs">Preferences</h2>
        <div className="card" style={sectionStyle}>
          <div style={rowBetween}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p id="enter-label" style={{ fontWeight: 500 }}>Enter sends message</p>
              <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                When off, Enter adds a new line and you send with the button. Shift+Enter is always a new line.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={store.prefs.sendOnEnter}
              aria-labelledby="enter-label"
              className={`chip${store.prefs.sendOnEnter ? ' ok' : ''}`}
              style={{ minWidth: 64, justifyContent: 'center' }}
              onClick={toggleEnter}
            >
              {store.prefs.sendOnEnter ? 'On' : 'Off'}
            </button>
          </div>

          <div className="hairline" style={{ background: 'var(--line)' }} />

          <div style={rowBetween}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p id="speak-label" className="row" style={{ fontWeight: 500 }}>
                <Volume2 {...ICON} aria-hidden="true" /> Speak replies aloud
              </p>
              <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                Automatically reads each new assistant reply. You can also use the speaker button on any message.
                {micSupported
                  ? ' Voice input is available through the mic button in the composer.'
                  : ' Voice input is not supported in this browser, so the mic button is unavailable.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={store.prefs.autoSpeak}
              aria-labelledby="speak-label"
              className={`chip${store.prefs.autoSpeak ? ' ok' : ''}`}
              style={{ minWidth: 64, justifyContent: 'center' }}
              onClick={toggleSpeak}
            >
              {store.prefs.autoSpeak ? 'On' : 'Off'}
            </button>
          </div>

          <div className="hairline" style={{ background: 'var(--line)' }} />

          <div style={sectionStyle}>
            <div style={rowBetween}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ fontWeight: 500 }}>Clear all conversations</p>
                <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                  {count === 0
                    ? 'No conversations saved in this browser.'
                    : `Deletes ${count} ${count === 1 ? 'conversation' : 'conversations'} from this browser. This cannot be undone.`}
                </p>
              </div>
              {!confirmClear && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={count === 0}
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 {...ICON} aria-hidden="true" /> Clear all
                </button>
              )}
            </div>
            {confirmClear && (
              <div
                role="alertdialog"
                aria-label="Confirm clearing all conversations"
                className="row"
                style={{
                  flexWrap: 'wrap',
                  padding: 'var(--space-3)',
                  border: '1px solid var(--danger)',
                  borderRadius: 'var(--radius)'
                }}
              >
                <p style={{ flex: 1, minWidth: 200, fontSize: 'var(--text-sm)' }}>
                  Delete all {count} {count === 1 ? 'conversation' : 'conversations'}?
                </p>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-danger" onClick={doClear}>
                  <Trash2 {...ICON} aria-hidden="true" /> Delete all
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Phone integration */}
      <section aria-labelledby="set-phone" style={sectionStyle}>
        <h2 id="set-phone">Phone integration</h2>
        <div className="card" style={sectionStyle}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Smartphone {...ICON} color="var(--accent)" aria-hidden="true" style={{ flex: 'none' }} />
            <p className="muted" style={smallMuted}>
              {isNative()
                ? 'You are using the Android app. Features marked Needs native plugin are not built into this version yet.'
                : 'A web page cannot control Android system features. Items below that need the Android app say so, and nothing here pretends otherwise.'}
            </p>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {getCapabilities().map((cap) => {
              const CapIcon = CAP_ICON[cap.id];
              return (
                <li
                  key={cap.id}
                  style={{
                    padding: 'var(--space-3)',
                    background: 'var(--surface-2)',
                    borderRadius: 'var(--radius)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-1)'
                  }}
                >
                  <div style={rowBetween}>
                    <div className="row">
                      <CapIcon {...ICON} color="var(--ink-muted)" aria-hidden="true" />
                      <p style={{ fontWeight: 600 }}>{cap.label}</p>
                    </div>
                    <span className={`chip static ${cap.status === 'available' ? 'ok' : 'warn'}`} style={{ height: 24 }}>
                      {capStatusLabel(cap.status)}
                    </span>
                  </div>
                  <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>{cap.note}</p>
                </li>
              );
            })}
          </ul>

          <div className="hairline" style={{ background: 'var(--line)' }} />

          <div style={rowBetween}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p id="face-label" style={{ fontWeight: 500 }}>Face features consent</p>
              <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                Face recognition runs only in the Android app (ML Kit / BiometricPrompt), only with your consent, and nothing is uploaded. Off by default. Turning it off clears your stored consent.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={faceOn}
              aria-labelledby="face-label"
              className={`chip${faceOn ? ' ok' : ''}`}
              style={{ minWidth: 64, justifyContent: 'center' }}
              onClick={toggleFace}
            >
              {faceOn ? 'On' : 'Off'}
            </button>
          </div>

          <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            SMS and call features are limited by Google Play policy to default SMS, Phone or Assistant apps. To build the Android app, follow the steps in ANDROID.md in the project repository.
          </p>
        </div>
      </section>

      {/* Install */}
      <section aria-labelledby="set-install" style={sectionStyle}>
        <h2 id="set-install">Install app</h2>
        <div className="card" style={rowBetween}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontWeight: 500 }}>
              {canInstall ? `Add ${BRAND_NAME} to your device` : `Install ${BRAND_NAME} from your browser`}
            </p>
            <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              {canInstall
                ? `${BRAND_NAME} opens in its own window and the app shell works offline.`
                : `If this app is not installed yet, use the browser menu and choose Install app or Add to Home screen. On iPhone and iPad in Safari, tap Share, then Add to Home Screen. The Install button appears here when your browser supports it.`}
            </p>
            <p className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>
              Android APK: there is no APK download in this version. The installed app runs the same on Android; a signed APK is built from the project by following ANDROID.md.
            </p>
          </div>
          {canInstall && (
            <button type="button" className="btn btn-primary" onClick={doInstall} disabled={installing}>
              <Download {...ICON} aria-hidden="true" /> {installing ? 'Installing…' : 'Install app'}
            </button>
          )}
        </div>
      </section>

      {/* About */}
      <section aria-labelledby="set-about" style={sectionStyle}>
        <h2 id="set-about">About</h2>
        <div className="card" style={sectionStyle}>
          <div style={rowBetween}>
            <div>
              <p style={{ fontWeight: 500 }}>{BRAND_NAME}</p>
              <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>{BRAND_TAGLINE}</p>
            </div>
            <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>Version {APP_VERSION}</span>
          </div>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Lock {...ICON} color="var(--ink-muted)" aria-hidden="true" style={{ flex: 'none' }} />
            <p className="muted" style={smallMuted}>
              Conversations and settings stay in this browser. Messages are relayed through this site&apos;s own server to the AI provider you configure.
            </p>
          </div>
        </div>
      </section>

      <footer className="muted" style={{ fontSize: 'var(--text-xs)', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
        <p>{BRAND_NAME} · Version {APP_VERSION}</p>
      </footer>

      <div aria-live="polite" role="status">
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
