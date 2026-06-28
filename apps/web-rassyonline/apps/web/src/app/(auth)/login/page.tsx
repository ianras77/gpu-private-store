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
        <Link className="back-link" href="/">
          Rassy Online
        </Link>
        <div>
          <p className="system-label">Account Portal</p>
          <h1>Keep your threads, documents, and magic.</h1>
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
