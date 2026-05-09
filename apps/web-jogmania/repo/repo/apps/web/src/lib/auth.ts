"use client";

import { useEffect, useMemo, useState } from "react";
import { createApiClient } from "@/lib/api";
import type { User, AuthResponse } from "@jogmania/api-client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const api = useMemo(() => createApiClient(), []);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [api]);

  const login = async (email: string, password: string): Promise<AuthResponse> => {
    const res = await api.login(email, password);
    if (!res.requires_verification) {
      const me = await api.me();
      setUser(me);
    }
    return res;
  };

  const register = async (email: string, password: string): Promise<AuthResponse> => {
    const res = await api.register(email, password);
    if (!res.requires_verification && res.access_token) {
      const me = await api.me();
      setUser(me);
    }
    return res;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore logout errors and clear local state.
    }
    setUser(null);
  };

  return { user, loading, login, register, logout };
}
