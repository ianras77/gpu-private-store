import React, { createContext, useContext, useEffect, useState } from "react";
import { getToken, setToken as persistToken, clearToken } from "../services/auth";
import { createApiClient } from "../services/api";
import { getPhoneDevicePayload } from "../services/devices";
import type { AuthResponse } from "@jogmania/api-client";

type AuthContextValue = {
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (email: string, password: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getToken().then((stored) => {
      setToken(stored);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    const api = createApiClient(token);
    void getPhoneDevicePayload()
      .then((payload) => api.registerDevice(payload))
      .catch(() => undefined);
  }, [token]);

  const login = async (email: string, password: string) => {
    const api = createApiClient();
    const res = await api.login(email, password);
    if (res.access_token) {
      await persistToken(res.access_token);
      setToken(res.access_token);
    }
    return res;
  };

  const register = async (email: string, password: string) => {
    const api = createApiClient();
    const res = await api.register(email, password);
    if (res.access_token) {
      await persistToken(res.access_token);
      setToken(res.access_token);
    }
    return res;
  };

  const logout = async () => {
    await clearToken();
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
