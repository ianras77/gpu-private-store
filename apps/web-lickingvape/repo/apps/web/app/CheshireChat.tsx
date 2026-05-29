'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildRasiesSearchHref, chatModes } from './content';
import { publicApiBase } from './lib/api';

type ChatRole = 'user' | 'cat';
type ChatModeId = (typeof chatModes)[number]['id'];

type ChatMessage = {
  id: string | number;
  role: ChatRole;
  text: string;
  at: string;
};

type CatMemory = {
  name: string;
  goal: string;
  mood: string;
  streakDays: number;
  lastCheckIn: string;
  recentWin: string;
  currentStruggle: string;
  tabStack: string;
};

type AuthUser = {
  id: number;
  handle: string;
  display_name: string;
};

type StatusTone = 'info' | 'success' | 'error';

type StatusState = {
  tone: StatusTone;
  text: string;
};

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const memoryStorageKey = 'lv.cat.memory.v1';
const historyStorageKey = 'lv.cat.history.v1';
const draftStorageKey = 'lv.cat.draft.v1';
const authTokenStorageKey = 'lv.auth.token.v1';

const MAX_CHAT_MESSAGE_CHARS = 800;
const API_TIMEOUT_MS = 15000;
const HYDRATE_RETRIES = 2;
const HYDRATE_RETRY_DELAY_MS = 350;
const WORLD_SEARCH_QUERY = 'latest headlines anxiety nicotine today';
const defaultChatMode: ChatModeId = 'craving';

const emptyMemory: CatMemory = {
  name: '',
  goal: '',
  mood: '',
  streakDays: 0,
  lastCheckIn: '',
  recentWin: '',
  currentStruggle: '',
  tabStack: ''
};

function firstCatMessage(): ChatMessage {
  return {
    id: 'cat-welcome',
    role: 'cat',
    text: "Lights low, wall awake. I'm the Stripe Scribe. Pick a mode, bring the craving, the slip, the headline, or the life mess, and I will help you make one concrete next move.",
    at: new Date().toISOString()
  };
}

function parseMemory(value: string | null): CatMemory {
  if (!value) return { ...emptyMemory };
  try {
    const parsed = JSON.parse(value) as Partial<CatMemory>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      goal: typeof parsed.goal === 'string' ? parsed.goal : '',
      mood: typeof parsed.mood === 'string' ? parsed.mood : '',
      streakDays: Number.isFinite(parsed.streakDays) ? Number(parsed.streakDays) : 0,
      lastCheckIn: typeof parsed.lastCheckIn === 'string' ? parsed.lastCheckIn : '',
      recentWin: typeof parsed.recentWin === 'string' ? parsed.recentWin : '',
      currentStruggle: typeof parsed.currentStruggle === 'string' ? parsed.currentStruggle : '',
      tabStack: typeof parsed.tabStack === 'string' ? parsed.tabStack : ''
    };
  } catch {
    return { ...emptyMemory };
  }
}

function parseHistory(value: string | null): ChatMessage[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as ChatMessage[];
    return parsed.filter(
      (item) =>
        item &&
        (item.role === 'cat' || item.role === 'user') &&
        (typeof item.id === 'string' || typeof item.id === 'number') &&
        typeof item.text === 'string' &&
        typeof item.at === 'string'
    );
  } catch {
    return [];
  }
}

function inferMood(input: string): string | null {
  const lower = input.toLowerCase();
  if (/(anxious|panic|stressed|spiral|overwhelmed)/.test(lower)) return 'anxious';
  if (/(sad|down|empty|numb|low)/.test(lower)) return 'low';
  if (/(proud|good|strong|better|steady)/.test(lower)) return 'steadier';
  if (/(angry|mad|frustrated|irritated)/.test(lower)) return 'frustrated';
  return null;
}

function inferGoal(input: string): string | null {
  const lower = input.toLowerCase();
  const prefix = /(goal is|my goal is|i want to|i'm trying to|i am trying to)\s+(.+)/;
  const match = lower.match(prefix);
  if (!match?.[2]) return null;
  const trimmed = match[2].trim();
  if (!trimmed) return null;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function inferTabStack(input: string): string | null {
  if (
    /(news|headline|world|politic|election|war|economy|layoff|rent|inflation|current events|search\.rasies|doomscroll|timeline|internet)/i.test(
      input
    )
  ) {
    return input.slice(0, 220);
  }
  return null;
}

function buildThread(memory: CatMemory): string {
  const reminders: string[] = [];

  if (memory.goal.trim()) reminders.push(`goal: ${memory.goal.trim()}`);
  if (memory.streakDays > 0) reminders.push(`streak: ${memory.streakDays} day(s)`);
  if (memory.mood.trim()) reminders.push(`room tone: ${memory.mood.trim()}`);
  if (memory.recentWin.trim()) reminders.push(`recent receipt: ${memory.recentWin.trim()}`);
  if (memory.currentStruggle.trim())
    reminders.push(`what feels loud: ${memory.currentStruggle.trim()}`);
  if (memory.tabStack.trim()) reminders.push(`tab stack: ${memory.tabStack.trim()}`);

  return reminders.length ? `I still have your thread: ${reminders.join(' | ')}.` : '';
}

function buildReply(input: string, memory: CatMemory, mode?: ChatModeId): string {
  const lower = input.toLowerCase();
  const name = memory.name.trim() || 'friend';
  const thread = buildThread(memory);
  const postFrame = 'Three beats. Scene, ache, next move. Rough edges are welcome.';

  if (mode === 'craving') {
    return `${name}, beat the first stripe before you debate the whole beast. ${thread} Move the vape or buying path farther away, name the stripe out loud, drink something cold, and write one wall sentence: what happened, what it promised, what you are doing instead.`.trim();
  }

  if (mode === 'post') {
    return `${name}, Draft it like a wall post. ${thread} Scene / trigger / refusal. One paragraph, no apology tax. Start with: "The stripe I am fighting is..." and end with the next move you can prove.`.trim();
  }

  if (mode === 'reset') {
    return `${name}, one slip does not get a crown. ${thread} Write the receipt while it is boring: what happened, what lit it, what changes before bed. Then do one physical reset: route, drawer, app, card, or room.`.trim();
  }

  if (
    mode === 'world' ||
    /(news|headline|world|politic|election|war|economy|layoff|rent|inflation|current events|search\.rasies|doomscroll|timeline|internet)/.test(
      lower
    )
  ) {
    return `${name}, the outside world is in the room with us. ${thread} Run one tight search on search.rasies.com, not a doomscroll marathon. Try "${WORLD_SEARCH_QUERY}" or the exact headline plus "nicotine" or "stress". Then come back and give me ${postFrame.toLowerCase()}`.trim();
  }

  if (/(post|write|draft|caption|content|publish|share)/.test(lower)) {
    return `${name}, let's make it postable. ${thread} ${postFrame} Start ugly. We can sharpen after it exists.`.trim();
  }

  if (/(slip|relapse|i hit|i caved|bought a vape)/.test(lower)) {
    return `${name}, no gothic shame spiral. ${thread} Give me the boring true version: what happened, what lit the fuse, and what changes before tonight ends.`.trim();
  }

  if (/(craving|urge|want a hit|need nicotine)/.test(lower)) {
    return `${name}, keep the lights low and the plan sharp. ${thread} Water. Jaw unclenched. Move the device farther away. Then post one line before you bargain with the craving.`.trim();
  }

  if (/(win|proud|did it|made it|success)/.test(lower)) {
    return `Archive that, ${name}. ${thread} Put the win in the feed so future-you has evidence on the next ugly night.`.trim();
  }

  if (/(night|sleep|2am|late)/.test(lower)) {
    return `${name}, late-night brain is a liar with great lighting. ${thread} Let's make a short script: tea or cold water, timer, one post, phone farther away, lights lower.`.trim();
  }

  return `${name}, I am here and the room is still open. ${thread} Tell me the sharpest part of the scene and we will cut it down to one next move.`.trim();
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function requestApi<T>(
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? API_TIMEOUT_MS);
  const onAbort = () => controller.abort();

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    const res = await fetch(`${publicApiBase()}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => '');

    if (!res.ok) {
      const message =
        payload && typeof payload === 'object' && 'detail' in payload
          ? String(payload.detail)
          : typeof payload === 'string' && payload.trim().length
            ? payload
            : 'Request failed';
      throw new ApiError(res.status, message);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (options.signal) {
      options.signal.removeEventListener('abort', onAbort);
    }
  }
}

export default function CheshireChat() {
  const [memory, setMemory] = useState<CatMemory>(emptyMemory);
  const [messages, setMessages] = useState<ChatMessage[]>([firstCatMessage()]);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<ChatModeId>(defaultChatMode);

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(true);
  const [status, setStatus] = useState<StatusState | null>(null);

  const threadRef = useRef<HTMLDivElement | null>(null);
  const sendInFlightRef = useRef(false);
  const sendAbortRef = useRef<AbortController | null>(null);

  const useRemote = Boolean(token && user);
  const activeMode = chatModes.find((item) => item.id === mode) || chatModes[0];
  const trimmedDraft = draft.trim();
  const draftLen = draft.length;
  const tooLong = draftLen > MAX_CHAT_MESSAGE_CHARS;

  const setInfo = (text: string) => setStatus({ tone: 'info', text });
  const setSuccess = (text: string) => setStatus({ tone: 'success', text });
  const setError = (text: string) => setStatus({ tone: 'error', text });

  const loadLocalFallback = useCallback(() => {
    const storedMemory = parseMemory(window.localStorage.getItem(memoryStorageKey));
    const storedHistory = parseHistory(window.localStorage.getItem(historyStorageKey));
    setMemory(storedMemory);
    setMessages(storedHistory.length ? storedHistory : [firstCatMessage()]);
  }, []);

  const clearSessionToLocal = useCallback(
    (reason: string) => {
      window.localStorage.removeItem(authTokenStorageKey);
      setToken(null);
      setUser(null);
      loadLocalFallback();
      setError(reason);
    },
    [loadLocalFallback]
  );

  const hydrateRemote = async (sessionToken: string) => {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < HYDRATE_RETRIES; attempt += 1) {
      try {
        const me = await requestApi<{ user: AuthUser }>('/auth/me', { token: sessionToken });
        const state = await requestApi<{ memory: CatMemory; messages: ChatMessage[] }>(
          '/chat/state',
          {
            token: sessionToken
          }
        );

        setToken(sessionToken);
        setUser(me.user);
        setMemory(state.memory || emptyMemory);
        setMessages(state.messages.length ? state.messages : [firstCatMessage()]);
        return;
      } catch (error) {
        lastError = error;
        if (error instanceof ApiError && error.status === 401) {
          throw error;
        }
        if (attempt < HYDRATE_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, HYDRATE_RETRY_DELAY_MS));
        }
      }
    }

    throw lastError || new Error('Could not load chat state.');
  };

  useEffect(() => {
    const savedDraft = window.localStorage.getItem(draftStorageKey);
    if (savedDraft) {
      setDraft(savedDraft.slice(0, MAX_CHAT_MESSAGE_CHARS));
    }

    const savedToken = window.localStorage.getItem(authTokenStorageKey);
    if (!savedToken) {
      loadLocalFallback();
      setAuthBusy(false);
      return;
    }

    hydrateRemote(savedToken)
      .catch((error) => {
        const reason =
          error instanceof ApiError && error.status === 401
            ? 'Session expired. Signed out.'
            : 'Could not sync profile. Local notebook mode is active.';
        clearSessionToLocal(reason);
      })
      .finally(() => setAuthBusy(false));
  }, [clearSessionToLocal, loadLocalFallback]);

  useEffect(() => {
    if (useRemote) return;
    window.localStorage.setItem(memoryStorageKey, JSON.stringify(memory));
  }, [memory, useRemote]);

  useEffect(() => {
    if (useRemote) return;
    window.localStorage.setItem(historyStorageKey, JSON.stringify(messages.slice(-40)));
  }, [messages, useRemote]);

  useEffect(() => {
    if (!draft) {
      window.localStorage.removeItem(draftStorageKey);
      return;
    }
    window.localStorage.setItem(draftStorageKey, draft.slice(0, MAX_CHAT_MESSAGE_CHARS));
  }, [draft]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (sendAbortRef.current) {
        sendAbortRef.current.abort();
      }
    };
  }, []);

  const memorySummary = useMemo(() => {
    const bits: string[] = [];
    if (memory.name.trim()) bits.push(`Name: ${memory.name.trim()}`);
    if (memory.goal.trim()) bits.push(`Current stripe: ${memory.goal.trim()}`);
    if (memory.streakDays > 0) bits.push(`Streak: ${memory.streakDays} day(s)`);
    if (memory.mood.trim()) bits.push(`Room tone: ${memory.mood.trim()}`);
    if (memory.recentWin.trim()) bits.push(`Recent receipt: ${memory.recentWin.trim()}`);
    if (memory.currentStruggle.trim())
      bits.push(`What feels loud: ${memory.currentStruggle.trim()}`);
    if (memory.tabStack.trim()) bits.push(`Tab stack: ${memory.tabStack.trim()}`);
    if (!bits.length) return 'No thread saved yet.';
    return bits.join(' | ');
  }, [memory]);

  const onAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!handle.trim() || !password.trim()) {
      setError('Handle and password are required.');
      return;
    }

    if (authMode === 'register' && password.trim().length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setAuthBusy(true);
    setStatus(null);

    try {
      const path = authMode === 'register' ? '/auth/register' : '/auth/login';
      const response = await requestApi<{ token: string; user: AuthUser }>(path, {
        method: 'POST',
        body: {
          handle,
          password,
          display_name: displayName.trim() || undefined
        }
      });

      window.localStorage.setItem(authTokenStorageKey, response.token);
      await hydrateRemote(response.token);
      setPassword('');
      setSuccess('Synced. The Scribe will keep your notebook across devices.');
    } catch (error) {
      setError(extractErrorMessage(error, 'Could not authenticate.'));
    } finally {
      setAuthBusy(false);
    }
  };

  const onLogout = async () => {
    if (token) {
      try {
        await requestApi('/auth/logout', { method: 'POST', token });
      } catch {
        // Ignore logout API errors and continue local sign-out.
      }
    }

    window.localStorage.removeItem(authTokenStorageKey);
    setToken(null);
    setUser(null);
    loadLocalFallback();
    setInfo('Signed out. Local notebook mode is active.');
  };

  const saveRemoteMemory = async () => {
    if (!token || !useRemote || busy) return;

    setBusy(true);
    setStatus(null);
    try {
      const data = await requestApi<{ memory: CatMemory }>('/chat/state', {
        method: 'POST',
        token,
        body: { memory }
      });
      setMemory(data.memory || memory);
      setSuccess('Notebook synced to your profile.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionToLocal('Session expired. Signed out.');
      } else {
        setError(extractErrorMessage(error, 'Could not sync memory.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const onSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (sendInFlightRef.current) return;

    const text = draft.trim();
    if (!text) return;

    if (text.length > MAX_CHAT_MESSAGE_CHARS) {
      setError(`Keep it under ${MAX_CHAT_MESSAGE_CHARS} characters.`);
      return;
    }

    setBusy(true);
    setStatus(null);

    if (useRemote && token) {
      const optimisticUserId = `${Date.now()}-user`;
      const optimisticCatId = `${Date.now()}-cat-pending`;
      const nowIso = new Date().toISOString();

      const optimisticUser: ChatMessage = {
        id: optimisticUserId,
        role: 'user',
        text,
        at: nowIso
      };

      const optimisticCat: ChatMessage = {
        id: optimisticCatId,
        role: 'cat',
        text: 'Stay with me a second. Pulling your thread together.',
        at: nowIso
      };

      setMessages((prev) => [...prev, optimisticUser, optimisticCat].slice(-40));
      setDraft('');

      sendInFlightRef.current = true;
      const controller = new AbortController();
      sendAbortRef.current = controller;

      try {
        const data = await requestApi<{ memory: CatMemory; messages: ChatMessage[] }>(
          '/chat/reply',
          {
            method: 'POST',
            token,
            body: { message: text, mode },
            signal: controller.signal
          }
        );

        setMemory(data.memory || emptyMemory);
        setMessages(data.messages.length ? data.messages : [firstCatMessage()]);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionToLocal('Session expired. Signed out.');
          setDraft(text);
          return;
        }

        setMessages((prev) =>
          prev.map((message) =>
            message.id === optimisticCatId
              ? {
                  ...message,
                  text: 'Signal dropped for a second. Hit send again and I will pick up the thread.'
                }
              : message
          )
        );
        setDraft(text);
        setError(extractErrorMessage(error, 'Could not send message.'));
      } finally {
        sendInFlightRef.current = false;
        sendAbortRef.current = null;
        setBusy(false);
      }
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      text,
      at: new Date().toISOString()
    };

    const inferredMood = inferMood(text);
    const inferredGoal = inferGoal(text);
    const inferredTabStack = inferTabStack(text);

    const nextMemory: CatMemory = {
      ...memory,
      mood: inferredMood || memory.mood,
      goal: inferredGoal || memory.goal,
      lastCheckIn: new Date().toISOString(),
      recentWin: /(win|proud|did it|made it|success)/i.test(text)
        ? text.slice(0, 220)
        : memory.recentWin,
      currentStruggle: /(craving|urge|spiral|slip|hard|struggle)/i.test(text)
        ? text.slice(0, 220)
        : memory.currentStruggle,
      tabStack: inferredTabStack || memory.tabStack
    };

    const catMessage: ChatMessage = {
      id: `${Date.now()}-cat`,
      role: 'cat',
      text: buildReply(text, nextMemory, mode),
      at: new Date().toISOString()
    };

    setMemory(nextMemory);
    setMessages((prev) => [...prev, userMessage, catMessage].slice(-40));
    setDraft('');
    setBusy(false);
  };

  const onReset = async () => {
    if (busy) return;

    if (useRemote && token) {
      setBusy(true);
      setStatus(null);
      try {
        await requestApi('/chat/reset', { method: 'POST', token });
        setMemory(emptyMemory);
        setMessages([firstCatMessage()]);
        setInfo('Cloud notebook cleared.');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionToLocal('Session expired. Signed out.');
        } else {
          setError(extractErrorMessage(error, 'Could not reset memory.'));
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    setMemory(emptyMemory);
    setMessages([firstCatMessage()]);
    setInfo('Local notebook cleared.');
  };

  if (authBusy) {
    return <div className="small">Loading the Scribe&apos;s notebook...</div>;
  }

  return (
    <div className="chat-shell">
      <div className="chat-memory">
        <div className="card-eyebrow">Thread sync</div>

        {!user ? (
          <form onSubmit={onAuthSubmit} className="chat-auth-form">
            <div className="chat-auth-tabs">
              <button
                type="button"
                className={`button ghost ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => setAuthMode('login')}
              >
                Log in
              </button>
              <button
                type="button"
                className={`button ghost ${authMode === 'register' ? 'active' : ''}`}
                onClick={() => setAuthMode('register')}
              >
                Start archive
              </button>
            </div>
            <div className="memory-grid">
              <label htmlFor="auth-handle">
                Handle
                <input
                  id="auth-handle"
                  value={handle}
                  onChange={(event) => setHandle(event.target.value.toLowerCase())}
                  placeholder="ink_in_the_teeth"
                />
              </label>
              <label htmlFor="auth-password">
                Password
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                />
              </label>
              {authMode === 'register' ? (
                <label htmlFor="auth-display-name">
                  Display name
                  <input
                    id="auth-display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="How the den sees you"
                  />
                </label>
              ) : null}
            </div>
            <div className="inline-actions">
              <button type="submit" disabled={authBusy}>
                {authMode === 'register' ? 'Create + sync' : 'Log in + sync'}
              </button>
              <span className="small">
                Optional. Sign in if you want the Scribe to remember the thread everywhere.
              </span>
            </div>
          </form>
        ) : (
          <div className="chat-auth-signed">
            <div className="small">
              Signed in as <strong>@{user.handle}</strong>
            </div>
            <div className="inline-actions">
              <button type="button" className="button ghost" onClick={onLogout}>
                Log out
              </button>
            </div>
          </div>
        )}

        <div className="chat-divider" />
        <div className="card-eyebrow">Notebook</div>
        <div className="memory-grid">
          <label htmlFor="cat-name">
            Name
            <input
              id="cat-name"
              value={memory.name}
              onChange={(event) => setMemory((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="What should the Scribe call you?"
            />
          </label>
          <label htmlFor="cat-goal">
            Current stripe
            <input
              id="cat-goal"
              value={memory.goal}
              onChange={(event) => setMemory((prev) => ({ ...prev, goal: event.target.value }))}
              placeholder="Example: Get through tonight without buying pods"
            />
          </label>
          <label htmlFor="cat-mood">
            Room tone
            <input
              id="cat-mood"
              value={memory.mood}
              onChange={(event) => setMemory((prev) => ({ ...prev, mood: event.target.value }))}
              placeholder="Example: wired, sad, trying"
            />
          </label>
          <label htmlFor="cat-streak">
            Streak days
            <input
              id="cat-streak"
              type="number"
              min={0}
              value={memory.streakDays}
              onChange={(event) =>
                setMemory((prev) => ({
                  ...prev,
                  streakDays: Math.max(0, Number(event.target.value) || 0)
                }))
              }
            />
          </label>
          <label htmlFor="cat-win">
            Recent receipt
            <input
              id="cat-win"
              value={memory.recentWin}
              onChange={(event) =>
                setMemory((prev) => ({ ...prev, recentWin: event.target.value }))
              }
              placeholder="Example: Survived the drive home"
            />
          </label>
          <label htmlFor="cat-struggle">
            What feels loud
            <input
              id="cat-struggle"
              value={memory.currentStruggle}
              onChange={(event) =>
                setMemory((prev) => ({ ...prev, currentStruggle: event.target.value }))
              }
              placeholder="Example: headlines + night cravings"
            />
          </label>
          <label htmlFor="cat-tabs">
            Tab stack
            <input
              id="cat-tabs"
              value={memory.tabStack}
              onChange={(event) => setMemory((prev) => ({ ...prev, tabStack: event.target.value }))}
              placeholder="Example: layoffs, rent panic, one cursed headline"
            />
          </label>
        </div>
        <div className="inline-actions" style={{ marginTop: 10 }}>
          {useRemote ? (
            <button
              type="button"
              className="button ghost"
              onClick={saveRemoteMemory}
              disabled={busy}
            >
              Save notebook to profile
            </button>
          ) : (
            <span className="small">
              Local thread mode. Sign in if you want this notebook on every device.
            </span>
          )}
        </div>
        <div className="chat-note">{memorySummary}</div>
      </div>

      <div className="chat-thread" aria-live="polite" aria-busy={busy} ref={threadRef}>
        {messages.map((message) => (
          <div
            key={String(message.id)}
            className={`chat-bubble ${message.role === 'user' ? 'user' : 'cat'}`}
          >
            {message.text}
          </div>
        ))}
      </div>

      <div className="chat-actions chat-mode-grid" aria-label="Scribe modes">
        {chatModes.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`mode-card ${mode === option.id ? 'active' : ''}`}
            onClick={() => {
              setMode(option.id);
              setDraft(option.prompt);
            }}
            disabled={busy}
          >
            <span>{option.label}</span>
            <small>{option.description}</small>
          </button>
        ))}
        <a
          href={buildRasiesSearchHref(WORLD_SEARCH_QUERY)}
          target="_blank"
          rel="noreferrer"
          className="button ghost prompt-link"
        >
          Open Rasies search
        </a>
      </div>

      <form onSubmit={onSend} className="chat-input-row">
        <label htmlFor="chat-message" className="sr-only">
          Message the Stripe Scribe
        </label>
        <input
          id="chat-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={activeMode.prompt}
          maxLength={MAX_CHAT_MESSAGE_CHARS}
          aria-invalid={tooLong}
        />
        <button type="submit" disabled={!trimmedDraft || busy || tooLong}>
          {busy ? 'Sending...' : 'Send'}
        </button>
        <button type="button" className="button ghost" onClick={onReset} disabled={busy}>
          Clear thread
        </button>
      </form>

      <div className="chat-input-meta">
        <span className={`small ${draftLen > MAX_CHAT_MESSAGE_CHARS * 0.9 ? 'warn' : ''}`}>
          {draftLen}/{MAX_CHAT_MESSAGE_CHARS}
        </span>
        {busy ? <span className="small">The Scribe is writing back...</span> : null}
      </div>

      {status ? <div className={`small chat-status ${status.tone}`}>{status.text}</div> : null}
    </div>
  );
}
