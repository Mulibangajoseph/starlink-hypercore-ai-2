import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const SPLASH_SELECTOR =
  '#splash, #boot, #boot-splash, #app-splash, #loading-screen, [data-splash], [data-boot-splash]';

function removeSplash(): void {
  const nodes = document.querySelectorAll<HTMLElement>(SPLASH_SELECTOR);
  if (nodes.length === 0) return;
  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  nodes.forEach((node) => {
    if (reduce) {
      node.remove();
      return;
    }
    node.style.transition = 'opacity 200ms ease-out';
    node.style.opacity = '0';
    node.style.pointerEvents = 'none';
    node.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => node.remove(), 260);
  });
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  // Wait for the first painted frame of the app, then fade the splash out.
  requestAnimationFrame(() => {
    requestAnimationFrame(removeSplash);
  });
  // Safety net: never leave the splash covering the app.
  window.setTimeout(removeSplash, 4000);
}
