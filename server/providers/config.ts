// Single catalogue of AI providers, their model ids and the env variable that holds each key.
// Model ids change often: edit this file only, nothing else hardcodes them.
// Keys themselves are never stored here; they are read from the server environment (c.env[envKey]).

export type ProviderId = 'openai' | 'claude' | 'gemini' | 'deepseek';

export interface ProviderDef {
  id: ProviderId;
  label: string;
  envKey: string;
  models: { id: string; label: string }[];
  paid: boolean;
  /** Optional OpenAI-compatible base URL (used by the AI_BASE_URL fallback). */
  baseUrl?: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    paid: true,
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (fast)' },
      { id: 'gpt-4o', label: 'GPT-4o (vision)' }
    ]
  },
  {
    id: 'claude',
    label: 'Claude',
    envKey: 'ANTHROPIC_API_KEY',
    paid: true,
    models: [
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fast)' }
    ]
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    paid: true,
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (fast)' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
    ]
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    paid: true,
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' }
    ]
  }
];
