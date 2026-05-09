const requiredEnvDefaults: Record<string, string> = {
  REDIS_URL: "redis://127.0.0.1:6379",
  DATABASE_URL: "postgresql://rassy:password@127.0.0.1:5432/rassy",
  RADIO_ADMIN_API_KEY: "test-radio-admin-key",
  MUSIC_LIBRARY_PATH: "/tmp/rassy-test/music",
  SNIPPETS_PATH: "/tmp/rassy-test/snippets",
  PODCAST_LIBRARY_PATH: "/tmp/rassy-test/podcasts",
  ICECAST_SOURCE_PASSWORD: "test-source-password",
  ICECAST_ADMIN_PASSWORD: "test-admin-password",
  ICECAST_RELAY_PASSWORD: "test-relay-password"
};

for (const [key, value] of Object.entries(requiredEnvDefaults)) {
  process.env[key] ??= value;
}
