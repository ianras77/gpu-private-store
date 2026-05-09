"use client";

import { FormEvent, useState } from "react";

type AdminLoginClientProps = {
  nextPath: string;
};

export function AdminLoginClient({ nextPath }: AdminLoginClientProps) {
  const [username, setUsername] = useState("ian");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, next: nextPath }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; redirectTo?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Login failed (${response.status})`);
      }
      window.location.href = payload.redirectTo || "/admin";
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <article className="login-card">
      <p className="hero-kicker">Admin</p>
      <h1>BAT control room access</h1>
      <p className="hero-note">
        The admin side is private. Think of this as the backstage door: same snake energy, fewer spectators.
        {nextPath !== "/admin" ? " After login, you will land on the page you asked for." : ""}
      </p>

      <form className="login-form" onSubmit={submit}>
        <div>
          <label htmlFor="username">
            <strong>Username</strong>
          </label>
          <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </div>

        <div>
          <label htmlFor="password">
            <strong>Password</strong>
          </label>
          <div className="input-with-action">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
            <button type="button" className="button-link muted small" onClick={() => setShowPassword((current) => !current)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "Unlocking..." : "Enter mission control"}
        </button>
        {status ? (
          <p className="login-status" aria-live="polite">
            {status}
          </p>
        ) : null}
      </form>
    </article>
  );
}
