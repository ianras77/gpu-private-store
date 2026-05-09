import { ApiClient } from "@jogmania/api-client";

export const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:8000";

export function createApiClient(token?: string | null) {
  return new ApiClient({ baseUrl: apiBaseUrl, token });
}
