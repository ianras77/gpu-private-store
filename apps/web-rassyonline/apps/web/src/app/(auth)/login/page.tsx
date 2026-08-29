import Link from "next/link";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link className="auth-brand" href="/" aria-label="Return to Rassy Online">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="presentation">
              <path className="signal-line" d="M7 33h13l5-14 8 27 7-19h17" />
              <circle className="signal" cx="55" cy="27" r="2.5" />
            </svg>
          </span>
          <span className="brand-type"><strong>RASSY</strong><small>PRIVATE / LIVE</small></span>
        </Link>
        <div>
          <p className="system-label"><span className="live-dot" /> PRIVATE WORKSPACE / AUTH GATE</p>
          <h1>Bring your context with you.</h1>
          <p className="auth-intro">Sign in to keep threads, documents, and your RassyMind workspace connected.</p>
        </div>

        {params.error ? <p className="form-error">{params.error.replaceAll("_", " ")}</p> : null}

        <div className="auth-grid">
          <form action="/api/auth/login" method="post" className="auth-form">
            <h2>Log in</h2>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" minLength={8} required />
            </label>
            <button type="submit">Enter workbench</button>
          </form>

          <form action="/api/auth/register" method="post" className="auth-form">
            <h2>Create account</h2>
            <label>
              Name
              <input name="name" type="text" autoComplete="name" maxLength={120} />
            </label>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="new-password" minLength={8} required />
            </label>
            <button type="submit">Claim a workspace</button>
          </form>
        </div>
      </section>
    </main>
  );
}
