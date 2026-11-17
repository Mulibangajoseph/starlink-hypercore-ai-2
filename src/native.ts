// Native shell detection and honest phone-capability reporting.
// The Capacitor runtime injects window.Capacitor inside the Android app;
// in a normal browser it does not exist, so nothing here pretends otherwise.

export type CapabilityStatus = 'available' | 'android-only' | 'needs-plugin';

export interface Capability {
  id: 'camera' | 'face' | 'sms' | 'calls' | 'assistant';
  label: string;
  status: CapabilityStatus;
  note: string;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

const FACE_CONSENT_KEY = 'app:faceConsent';
const FACE_DATA_PREFIX = 'app:face';
const SERVER_URL_KEY = 'app:serverUrl';

function capacitor(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap ?? null;
}

export function isNative(): boolean {
  const cap = capacitor();
  if (!cap) return false;
  try {
    if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
    if (typeof cap.getPlatform === 'function') return cap.getPlatform() !== 'web';
  } catch {
    return false;
  }
  return false;
}

/**
 * Base URL for API calls, without a trailing slash.
 * Browser: '' (relative paths hit the same origin).
 * Android app: the hosted backend, from a build-time VITE_API_BASE or the
 * "app:serverUrl" value saved on the device.
 */
export function apiBase(): string {
  if (!isNative()) return '';
  let fromEnv: string | undefined;
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    fromEnv = env?.VITE_API_BASE;
  } catch {
    fromEnv = undefined;
  }
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(SERVER_URL_KEY);
  } catch {
    saved = null;
  }
  const raw = (saved || fromEnv || '').trim();
  if (!/^https:\/\//i.test(raw)) return '';
  return raw.replace(/\/+$/, '');
}

export function getCapabilities(): Capability[] {
  const native = isNative();
  const nativeOnly = (note: string): { status: CapabilityStatus; note: string } =>
    native
      ? { status: 'needs-plugin', note }
      : { status: 'android-only', note: 'Android app only. A browser cannot do this.' };

  const sms = nativeOnly(
    'Needs a custom native plugin. Google Play only allows SMS access for the default SMS app.',
  );
  const calls = nativeOnly(
    'Needs a native call-screening service (Android 10+). Auto-answer is not possible from the web layer.',
  );
  const face = nativeOnly(
    'Needs a native ML Kit / BiometricPrompt plugin, and only runs with your consent.',
  );
  const assistant = nativeOnly(
    'Needs a native voice-interaction service to become the device assistant.',
  );

  return [
    {
      id: 'camera',
      label: 'Camera',
      status: 'available',
      note: native
        ? 'Take a photo in Image mode. Android asks for camera permission.'
        : 'Take a photo in Image mode with the photo picker. Your browser asks for permission.',
    },
    { id: 'face', label: 'Face recognition', ...face },
    { id: 'sms', label: 'SMS reading and replying', ...sms },
    { id: 'calls', label: 'Incoming call assistance', ...calls },
    { id: 'assistant', label: 'Voice assistant', ...assistant },
  ];
}

export function faceConsent(): boolean {
  try {
    return localStorage.getItem(FACE_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Off by default. Turning it off also clears any locally stored face data. */
export function setFaceConsent(v: boolean): void {
  try {
    if (v) {
      localStorage.setItem(FACE_CONSENT_KEY, '1');
      return;
    }
    localStorage.removeItem(FACE_CONSENT_KEY);
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(FACE_DATA_PREFIX) && key !== FACE_CONSENT_KEY) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* storage unavailable: nothing to persist or clear */
  }
}
