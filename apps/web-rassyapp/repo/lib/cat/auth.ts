import "server-only";

import { fetchJson } from "@/lib/cat/client";
import type { CatAuthResponse, CatUser } from "@/lib/cat/types";

export async function loginToCat(username: string, password: string) {
  const response = await fetchJson<CatAuthResponse>("/auth/token", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  if (!response?.access_token) {
    throw new Error("Cat auth response missing access_token");
  }

  return response.access_token;
}

export async function fetchCurrentUser(token: string) {
  return fetchJson<CatUser>("/users/me", {
    method: "GET",
    token
  });
}
