export type Screen = 'home' | 'chat' | 'tools' | 'settings';
export type ChatMode = 'general' | 'code' | 'writing' | 'image' | 'imagegen' | 'documents';
export type Role = 'user' | 'assistant';
export type ProviderId = 'openai' | 'claude' | 'gemini' | 'deepseek';

export interface Message { id: string; role: Role; content: string; createdAt: number; hasImage?: boolean; error?: boolean; generatedImage?: string; fileName?: string; }
export interface Conversation { id: string; title: string; mode: ChatMode; messages: Message[]; createdAt: number; updatedAt: number; provider?: ProviderId; model?: string; }
export interface Profile { displayName: string; }
export interface Preferences { sendOnEnter: boolean; autoSpeak: boolean; }

export interface ProviderInfo { id: ProviderId | 'default'; label: string; configured: boolean; paid: boolean; envKey: string; models: { id: string; label: string }[]; }
export interface UsageInfo { used: number; limit: number; }
export interface ServerStatus { configured: boolean; provider: string | null; model: string | null; video: boolean; missing: string[]; providers?: { id: string; configured: boolean }[]; }
export interface ChatRequest { mode: ChatMode; messages: { role: Role; content: string }[]; image?: string; provider?: ProviderId; model?: string; stream?: boolean; }
export interface ChatResponse { reply: string; model: string; }
export interface ApiError { error: string; message?: string; missing?: string[]; }

export const MAX_MESSAGE_CHARS = 8000;
export const MAX_CONTEXT_MESSAGES = 20;

export interface Store {
  conversations: Conversation[];
  activeId: string | null;
  active: Conversation | null;
  profile: Profile;
  prefs: Preferences;
  storageError: boolean;
  deviceId: string;
  newChat: (mode?: ChatMode) => string;
  openChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  addMessage: (id: string, msg: Message) => void;
  updateMessage: (id: string, msgId: string, patch: Partial<Message>) => void;
  removeMessage: (id: string, msgId: string) => void;
  setConversationModel: (id: string, provider: ProviderId | undefined, model: string | undefined) => void;
  setProfile: (p: Profile) => void;
  setPrefs: (p: Preferences) => void;
  clearAll: () => void;
}

export interface StatusState { status: ServerStatus | null; failed: boolean; refresh: () => void; providers: ProviderInfo[]; usage: UsageInfo | null; }

export interface ProviderSelectProps { providers: ProviderInfo[]; provider?: ProviderId; model?: string; onChange: (provider: ProviderId | undefined, model: string | undefined) => void; }

export interface ShellProps { screen: Screen; onNavigate: (s: Screen) => void; store: Store; statusState: StatusState; children: unknown; onNewChat: () => void; }
export interface HistoryListProps { conversations: Conversation[]; activeId: string | null; onOpen: (id: string) => void; onRename: (id: string, title: string) => void; onDelete: (id: string) => void; }
export interface MessageBubbleProps { message: Message; onRetry?: () => void; }
export interface ComposerProps { mode: ChatMode; disabled: boolean; sendOnEnter: boolean; streaming?: boolean; onStop?: () => void; onSend: (text: string, image?: string, doc?: { name: string; text: string }) => void; }
export interface HomeProps { store: Store; statusState: StatusState; onNavigate: (s: Screen) => void; onStart: (mode: ChatMode) => void; }
export interface ChatProps { store: Store; statusState: StatusState; onNavigate: (s: Screen) => void; onOpenHistory: () => void; }
export interface ToolsProps { statusState: StatusState; onStart: (mode: ChatMode) => void; }
export interface SettingsProps { store: Store; statusState: StatusState; }

export const MODE_LABEL: Record<ChatMode, string> = { general: 'Chat', code: 'Code', writing: 'Writing', image: 'Image', imagegen: 'Create image', documents: 'Documents' };
export const SUGGESTIONS: Record<ChatMode, string[]> = {
  general: ['Explain how a PWA works', 'Plan a 3-day study schedule', 'Give me 5 project name ideas'],
  code: ['Explain this error message', 'Write a debounce function in TypeScript', 'Build a landing page for a coffee shop'],
  writing: ['Polish this paragraph', 'Write a friendly follow-up email', 'Summarize this text in 3 bullets'],
  image: ['What is in this photo?', 'Read the text in this image', 'Describe this chart'],
  imagegen: ['A neon city at night, cinematic', 'A minimal logo of a star', 'A cozy cabin in snowy mountains'],
  documents: ['Summarize this document', 'List the key points', 'What are the action items?']
};
export const ENV_VARS = [
  { name: 'OPENAI_API_KEY', secret: true, note: 'OpenAI chat and image generation (paid).' },
  { name: 'ANTHROPIC_API_KEY', secret: true, note: 'Claude (paid).' },
  { name: 'GEMINI_API_KEY', secret: true, note: 'Google Gemini (paid beyond the free tier).' },
  { name: 'DEEPSEEK_API_KEY', secret: true, note: 'DeepSeek (paid, low cost).' },
  { name: 'AI_API_KEY', secret: true, note: 'Optional OpenAI-compatible fallback key (server only).' },
  { name: 'AI_BASE_URL', secret: false, note: 'Fallback OpenAI-compatible base URL.' },
  { name: 'AI_MODEL', secret: false, note: 'Fallback model id.' },
  { name: 'DAILY_LIMIT', secret: false, note: 'Requests per device per day (default 100).' }
];
