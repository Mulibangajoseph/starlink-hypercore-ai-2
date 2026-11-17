import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ChatMode, Conversation, Message, Preferences, ProviderId, Profile, Store } from './types';

const KEY_CONVERSATIONS = 'app:conversations';
const KEY_ACTIVE = 'app:active';
const KEY_PROFILE = 'app:profile';
const KEY_PREFS = 'app:prefs';

const DEFAULT_TITLE = 'New chat';
const MAX_TITLE = 80;
const MODES: ChatMode[] = ['general', 'code', 'writing', 'image', 'imagegen', 'documents'];
const PROVIDER_IDS: ProviderId[] = ['openai', 'claude', 'gemini', 'deepseek'];
const KEY_DEVICE = 'app:device';
const MAX_MODEL = 80;
const MAX_STORED_IMAGE = 300000;

function cleanProvider(v: unknown): ProviderId | undefined {
  return typeof v === 'string' && PROVIDER_IDS.includes(v as ProviderId) ? (v as ProviderId) : undefined;
}

function cleanModel(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t && t.length <= MAX_MODEL ? t : undefined;
}

function loadDeviceId(): string {
  try {
    const raw = window.localStorage.getItem(KEY_DEVICE);
    if (typeof raw === 'string' && raw.length >= 8 && raw.length <= 80 && /^[\w-]+$/.test(raw)) return raw;
  } catch {
    /* fall through */
  }
  const id = makeId();
  try {
    window.localStorage.setItem(KEY_DEVICE, id);
  } catch {
    /* keep in memory */
  }
  return id;
}

interface State {
  conversations: Conversation[];
  activeId: string | null;
  profile: Profile;
  prefs: Preferences;
}

type Action =
  | { type: 'new'; conv: Conversation }
  | { type: 'open'; id: string }
  | { type: 'rename'; id: string; title: string }
  | { type: 'delete'; id: string; fresh: Conversation }
  | { type: 'add'; id: string; msg: Message; now: number }
  | { type: 'update'; id: string; msgId: string; patch: Partial<Message> }
  | { type: 'remove'; id: string; msgId: string }
  | { type: 'profile'; profile: Profile }
  | { type: 'prefs'; prefs: Preferences }
  | { type: 'model'; id: string; provider?: ProviderId; model?: string }
  | { type: 'clear' };

function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeConversation(mode: ChatMode): Conversation {
  const now = Date.now();
  return { id: makeId(), title: DEFAULT_TITLE, mode, messages: [], createdAt: now, updatedAt: now };
}

function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return DEFAULT_TITLE;
  return clean.length > 48 ? `${clean.slice(0, 48).trimEnd()}…` : clean;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function sanitizeMessage(raw: unknown): Message | null {
  if (!isObj(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.content !== 'string') return null;
  if (raw.role !== 'user' && raw.role !== 'assistant') return null;
  const msg: Message = {
    id: raw.id,
    role: raw.role,
    content: raw.content,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
  };
  if (raw.hasImage === true) msg.hasImage = true;
  if (raw.error === true) msg.error = true;
  if (typeof raw.generatedImage === 'string' && raw.generatedImage) msg.generatedImage = raw.generatedImage;
  if (typeof raw.fileName === 'string' && raw.fileName) msg.fileName = raw.fileName.slice(0, 200);
  return msg;
}

function sanitizeConversations(raw: unknown): Conversation[] {
  if (!Array.isArray(raw)) return [];
  const out: Conversation[] = [];
  for (const item of raw) {
    if (!isObj(item) || typeof item.id !== 'string') continue;
    const messages = Array.isArray(item.messages)
      ? item.messages.map(sanitizeMessage).filter((m): m is Message => m !== null)
      : [];
    const createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now();
    out.push({
      id: item.id,
      title: typeof item.title === 'string' && item.title.trim() ? item.title : DEFAULT_TITLE,
      mode: MODES.includes(item.mode as ChatMode) ? (item.mode as ChatMode) : 'general',
      messages,
      createdAt,
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : createdAt,
      ...(cleanProvider(item.provider) ? { provider: cleanProvider(item.provider) } : {}),
      ...(cleanModel(item.model) ? { model: cleanModel(item.model) } : {})
    });
  }
  return out;
}

function readKey(key: string, failed: { current: boolean }): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    failed.current = true;
    return null;
  }
}

function loadState(failed: { current: boolean }): State {
  const conversations = sanitizeConversations(readKey(KEY_CONVERSATIONS, failed));
  const activeRaw = readKey(KEY_ACTIVE, failed);
  const activeId =
    typeof activeRaw === 'string' && conversations.some((c) => c.id === activeRaw) ? activeRaw : null;
  const profileRaw = readKey(KEY_PROFILE, failed);
  const prefsRaw = readKey(KEY_PREFS, failed);
  const profile: Profile = {
    displayName: isObj(profileRaw) && typeof profileRaw.displayName === 'string' ? profileRaw.displayName : ''
  };
  const prefs: Preferences = {
    sendOnEnter: isObj(prefsRaw) && typeof prefsRaw.sendOnEnter === 'boolean' ? prefsRaw.sendOnEnter : true,
    autoSpeak: isObj(prefsRaw) && typeof prefsRaw.autoSpeak === 'boolean' ? prefsRaw.autoSpeak : false
  };
  return { conversations, activeId, profile, prefs };
}

function mapConv(state: State, id: string, fn: (c: Conversation) => Conversation): State {
  let changed = false;
  const conversations = state.conversations.map((c) => {
    if (c.id !== id) return c;
    changed = true;
    return fn(c);
  });
  return changed ? { ...state, conversations } : state;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'new':
      return { ...state, conversations: [action.conv, ...state.conversations], activeId: action.conv.id };
    case 'open':
      return state.conversations.some((c) => c.id === action.id) ? { ...state, activeId: action.id } : state;
    case 'rename': {
      const title = action.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
      if (!title) return state;
      return mapConv(state, action.id, (c) => ({ ...c, title }));
    }
    case 'delete': {
      const conversations = state.conversations.filter((c) => c.id !== action.id);
      if (conversations.length === state.conversations.length) return state;
      if (state.activeId === action.id) {
        return { ...state, conversations: [action.fresh, ...conversations], activeId: action.fresh.id };
      }
      return { ...state, conversations };
    }
    case 'add':
      return mapConv(state, action.id, (c) => {
        const firstUser = action.msg.role === 'user' && !c.messages.some((m) => m.role === 'user');
        return {
          ...c,
          title: firstUser && c.title === DEFAULT_TITLE ? titleFrom(action.msg.content) : c.title,
          messages: [...c.messages, action.msg],
          updatedAt: action.now
        };
      });
    case 'update':
      return mapConv(state, action.id, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === action.msgId ? { ...m, ...action.patch, id: m.id } : m))
      }));
    case 'remove':
      return mapConv(state, action.id, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== action.msgId)
      }));
    case 'profile':
      return { ...state, profile: { displayName: action.profile.displayName.trim().slice(0, 40) } };
    case 'prefs':
      return { ...state, prefs: { sendOnEnter: !!action.prefs.sendOnEnter, autoSpeak: !!action.prefs.autoSpeak } };
    case 'model':
      return mapConv(state, action.id, (c) => {
        const next: Conversation = { ...c };
        const provider = cleanProvider(action.provider);
        const model = cleanModel(action.model);
        if (provider) next.provider = provider;
        else delete next.provider;
        if (model) next.model = model;
        else delete next.model;
        return next;
      });
    case 'clear':
      return { ...state, conversations: [], activeId: null };
    default:
      return state;
  }
}

export function useStore(): Store {
  const loadFailed = useRef(false);
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState(loadFailed));
  const [storageError, setStorageError] = useState<boolean>(() => loadFailed.current);
  const [deviceId] = useState<string>(loadDeviceId);

  // Persist on every change; a failure keeps the app working in memory.
  useEffect(() => {
    try {
      const toStore = state.conversations.map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.generatedImage && m.generatedImage.length > MAX_STORED_IMAGE ? { ...m, generatedImage: undefined } : m
        )
      }));
      window.localStorage.setItem(KEY_CONVERSATIONS, JSON.stringify(toStore));
      if (state.activeId) window.localStorage.setItem(KEY_ACTIVE, JSON.stringify(state.activeId));
      else window.localStorage.removeItem(KEY_ACTIVE);
      window.localStorage.setItem(KEY_PROFILE, JSON.stringify(state.profile));
      window.localStorage.setItem(KEY_PREFS, JSON.stringify(state.prefs));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state]);

  const newChat = useCallback((mode: ChatMode = 'general'): string => {
    const conv = makeConversation(mode);
    dispatch({ type: 'new', conv });
    return conv.id;
  }, []);
  const openChat = useCallback((id: string) => dispatch({ type: 'open', id }), []);
  const renameChat = useCallback((id: string, title: string) => dispatch({ type: 'rename', id, title }), []);
  const deleteChat = useCallback(
    (id: string) => dispatch({ type: 'delete', id, fresh: makeConversation('general') }),
    []
  );
  const addMessage = useCallback(
    (id: string, msg: Message) => dispatch({ type: 'add', id, msg, now: Date.now() }),
    []
  );
  const updateMessage = useCallback(
    (id: string, msgId: string, patch: Partial<Message>) => dispatch({ type: 'update', id, msgId, patch }),
    []
  );
  const removeMessage = useCallback(
    (id: string, msgId: string) => dispatch({ type: 'remove', id, msgId }),
    []
  );
  const setProfile = useCallback((profile: Profile) => dispatch({ type: 'profile', profile }), []);
  const setPrefs = useCallback((prefs: Preferences) => dispatch({ type: 'prefs', prefs }), []);
  const clearAll = useCallback(() => dispatch({ type: 'clear' }), []);
  const setConversationModel = useCallback(
    (id: string, provider: ProviderId | undefined, model: string | undefined) =>
      dispatch({ type: 'model', id, provider, model }),
    []
  );

  const sorted = useMemo(
    () => [...state.conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [state.conversations]
  );
  const active = useMemo(
    () => state.conversations.find((c) => c.id === state.activeId) ?? null,
    [state.conversations, state.activeId]
  );

  return useMemo<Store>(
    () => ({
      conversations: sorted,
      activeId: state.activeId,
      active,
      profile: state.profile,
      prefs: state.prefs,
      storageError,
      deviceId,
      setConversationModel,
      newChat,
      openChat,
      renameChat,
      deleteChat,
      addMessage,
      updateMessage,
      removeMessage,
      setProfile,
      setPrefs,
      clearAll
    }),
    [
      sorted,
      state.activeId,
      active,
      state.profile,
      state.prefs,
      storageError,
      deviceId,
      setConversationModel,
      newChat,
      openChat,
      renameChat,
      deleteChat,
      addMessage,
      updateMessage,
      removeMessage,
      setProfile,
      setPrefs,
      clearAll
    ]
  );
}
