import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "jm-token";
export const SECURE_STORE_OPTIONS = { keychainService: "app" } as const;

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY, SECURE_STORE_OPTIONS);
}

export async function setToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token, SECURE_STORE_OPTIONS);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY, SECURE_STORE_OPTIONS);
}
