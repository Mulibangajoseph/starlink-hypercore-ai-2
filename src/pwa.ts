import { useEffect, useState } from 'react';
import { THEME_COLOR } from './brand';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listening = false;
const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((fn) => fn());
}

function ensureListeners(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

function ensureHeadTag(selector: string, create: () => HTMLElement): void {
  if (!document.head.querySelector(selector)) document.head.appendChild(create());
}

export function registerPwa(): void {
  if (typeof document === 'undefined') return;
  ensureListeners();

  ensureHeadTag('meta[name="theme-color"]', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = THEME_COLOR;
    return meta;
  });

  const env = (import.meta as unknown as { env?: { PROD?: boolean } }).env;
  if (!env?.PROD || !('serviceWorker' in navigator)) return;

  // Skip the service worker when the app is shown inside another page (a preview frame):
  // registration is not allowed there and the browser logs a script-fetch error.
  const loc = window.location as Location & { ancestorOrigins?: DOMStringList };
  if (loc.ancestorOrigins && loc.ancestorOrigins.length > 0) return;

  // The offline shell is for the installed app only: in a regular browser tab some hosts
  // refuse the worker script and the browser logs a fetch error on load.
  const mq = (q: string) => (typeof window.matchMedia === 'function' ? window.matchMedia(q).matches : false);
  const standalone =
    mq('(display-mode: standalone)') ||
    mq('(display-mode: minimal-ui)') ||
    mq('(display-mode: window-controls-overlay)') ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!standalone) return;

  const register = () => {
    // Only register when the worker script is really served as JavaScript.
    fetch('./sw.js', { cache: 'no-store' })
      .then((res) => {
        const type = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok || res.redirected || !type.includes('javascript')) return undefined;
        return navigator.serviceWorker.register('./sw.js');
      })
      .catch(() => {
        /* offline support is optional; the app keeps working without it */
      });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<void> } {
  ensureListeners();
  const [canInstall, setCanInstall] = useState<boolean>(deferredPrompt !== null);

  useEffect(() => {
    const sync = () => setCanInstall(deferredPrompt !== null);
    subscribers.add(sync);
    sync();
    return () => {
      subscribers.delete(sync);
    };
  }, []);

  const install = async (): Promise<void> => {
    const evt = deferredPrompt;
    if (!evt) return;
    try {
      await evt.prompt();
      await evt.userChoice;
    } catch {
      /* the prompt was dismissed or unavailable */
    }
    deferredPrompt = null;
    notify();
  };

  return { canInstall, install };
}
