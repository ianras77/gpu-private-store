export type StoredUser = {
  id: string;
  email: string;
  displayName: string;
};

export type StoredAuth = {
  token: string;
  user: StoredUser;
};

const TOKEN_KEY = 'usmender.token';
const USER_KEY = 'usmender.user';
const AUTH_EVENT = 'usmender-auth-changed';

function canUseStorage() {
  return typeof window !== 'undefined';
}

function dispatchAuthChanged() {
  if (!canUseStorage()) return;
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function readToken() {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function readStoredUser(): StoredUser | null {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function hasStoredAuth() {
  return Boolean(readToken());
}

export function saveAuth(input: StoredAuth) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(TOKEN_KEY, input.token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(input.user));
  dispatchAuthChanged();
}

export function clearAuth() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  dispatchAuthChanged();
}

export function subscribeToAuthChanges(listener: () => void) {
  if (!canUseStorage()) {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_KEY || event.key === USER_KEY) {
      listener();
    }
  };

  window.addEventListener(AUTH_EVENT, listener);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(AUTH_EVENT, listener);
    window.removeEventListener('storage', handleStorage);
  };
}
