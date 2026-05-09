export type CatAuthResponse = {
  access_token: string;
  token_type?: string;
};

export type CatUser = {
  id: string;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  enabled?: boolean | null;
  permissions?: Array<{
    id: string;
    name: string;
    description?: string | null;
  }> | null;
  created_at?: string | null;
  last_login?: string | null;
};

export type CatChatPayload = {
  text: string;
  metadata?: Record<string, unknown>;
};

export type CatWhy = {
  input?: string | null;
  intermediate_steps?: unknown[] | null;
  memory?: unknown | null;
};

export type CatStreamEvent =
  | { type: "token"; value: string }
  | { type: "final"; value: string; why?: CatWhy | null }
  | { type: "notification"; message: string }
  | { type: "error"; message: string };
