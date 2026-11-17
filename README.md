# STARLINK HYPERCORE AI

STARLINK HYPERCORE AI is a multi-provider AI assistant: streaming chat, a coding assistant, writing help, image generation, image understanding, and document and PDF analysis. It runs in the browser, installs as a PWA, and has its own server for provider calls.

## Where the brand lives

| What | Where |
| --- | --- |
| Product name, tagline, theme colour | `src/brand.ts` (`BRAND_NAME`, `BRAND_TAGLINE`, `THEME_COLOR`) |
| Logo component and status badge | `src/components/Brand.tsx` |
| Page title, description, theme colour, icon links, Open Graph and Twitter tags | `index.html` |
| Install identity (name, short name, colours, icons) | `public/manifest.webmanifest` |
| Icons: favicon, "any" icon, maskable icon | `public/icons/` |
| Offline page and cache name | `public/sw.js` |
| Design tokens (colours, type, spacing) | `src/theme.css` |

To rename the product or change its colour, update `src/brand.ts`, then the matching values in `public/manifest.webmanifest`, `index.html` and `public/sw.js`. Those three are static files and cannot import the module. Replace the SVGs in `public/icons/` to change the logo. Keep the maskable icon's artwork inside the central safe zone (about 80% of the canvas).

## Custom domain

Every asset URL in the app is relative (`./manifest.webmanifest`, `./icons/icon.svg`, `./sw.js`, and API calls such as `api/chat`). The same build therefore works on the platform address or on your own domain without code changes.

1. Add your domain in the platform's domain settings for this app. It will give you the DNS record to create, usually a CNAME for a subdomain such as `ai.example.com`, or A/AAAA records for an apex domain.
2. Create that record at your DNS provider and wait for it to propagate. HTTPS is required for the service worker, install prompt, voice input and microphone access.
3. Open the app on the new domain. Browsers treat each origin as its own installation, so people who installed from the old address install again from the new one. Local chat history is stored per origin and does not move between domains.
4. Optional: for link previews, add absolute `og:url` and `og:image` tags to `index.html` with your final domain. They are left out by default so the build stays domain-neutral.

## Installing as an app

On Android Chrome and on desktop Chrome or Edge, use "Install app" in Settings, or the browser's install option. The installed app opens standalone as STARLINK HYPERCORE AI with the star icon and navy theme. On iOS Safari, use Share, then "Add to Home Screen".

## Android APK and Play Store

This project is a PWA. It does not contain a built APK or an Android Studio project, and no APK is produced by the build. To publish on Android, wrap the live HTTPS address with an external tool:

- **Bubblewrap** (Trusted Web Activity) or **PWABuilder** read `manifest.webmanifest` for the name `STARLINK HYPERCORE AI`, the short name, icons and colours (`#050A14`).
- Use the production domain as the host, and set the package id and signing key in the tool.
- PNG icons are often required by store listings. Export `public/icons/icon.svg` (and the maskable variant) to PNG at 192 and 512 px with any image editor, and supply them to the wrapper.
- For a Trusted Web Activity, host the generated `assetlinks.json` at `/.well-known/assetlinks.json` on your domain.

## Server configuration

API keys are never in the front end. Set them as server environment secrets: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, and optionally `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `DAILY_LIMIT`. Providers without a key show as not configured in the app.

## Notices

The platform that builds and hosts this app may require its own attribution or licence notices. Keep any such notice the platform inserts, and keep the licence files of the open-source packages the build bundles. The app's own interface does not show any builder branding.
