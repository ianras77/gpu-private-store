import "server-only";

function requireValue(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  catHttpBase: requireValue("CAT_HTTP_BASE", process.env.CAT_HTTP_BASE),
  catWsBase: requireValue("CAT_WS_BASE", process.env.CAT_WS_BASE),
  catHttpApiKey: process.env.CAT_HTTP_API_KEY,
  catWsApiKey: process.env.CAT_WS_API_KEY,
  appSessionSecret: requireValue("APP_SESSION_SECRET", process.env.APP_SESSION_SECRET)
};
