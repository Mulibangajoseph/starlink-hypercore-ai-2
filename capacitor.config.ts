// Capacitor configuration for the Android shell of STARLINK HYPERCORE AI.
// The web build in `dist` is bundled into the app. The app's backend is
// reached through the same relative API paths; to point the packaged app at a
// hosted backend, set `server.url` through the CAP_SERVER_URL environment
// variable before running `npx cap sync android`.

interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  backgroundColor?: string;
  server?: {
    androidScheme?: 'https' | 'http';
    url?: string;
    cleartext?: boolean;
  };
  android?: {
    allowMixedContent?: boolean;
    webContentsDebuggingEnabled?: boolean;
  };
}

declare const process: { env: Record<string, string | undefined> } | undefined;

const serverUrl: string | undefined =
  typeof process !== 'undefined' ? process.env.CAP_SERVER_URL : undefined;

export const config: CapacitorConfig = {
  appId: 'ai.starlinkhypercore.app',
  appName: 'STARLINK HYPERCORE AI',
  webDir: 'dist',
  backgroundColor: '#050b1a',
  server: {
    androidScheme: 'https',
    ...(serverUrl ? { url: serverUrl } : {}),
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
