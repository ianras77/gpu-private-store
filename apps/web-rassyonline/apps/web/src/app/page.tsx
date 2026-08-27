import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/users";
import { CHAT_MODES } from "@/lib/rassymind";
import { ChatWorkbench } from "@/components/chat-workbench";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="app-shell">
      <div className="ambient-field" aria-hidden="true" />

      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><span>R</span><i /></div>
        <div>
          <p className="system-label">RASSY // ONLINE <span className="live-dot" /> LIVE WORKBENCH</p>
          <h1>One mind. Every lane.</h1>
          <p className="topbar-subtitle">A user-owned RassyMind instrument for reasoning, code, vectors, and live web context.</p>
        </div>
        <div className="top-actions">
          {user ? (
            <>
              <span className="account-chip">{user.email}</span>
              {user.role === "admin" ? (
                <Link className="stage-chip" href="/admin">
                  Admin
                </Link>
              ) : null}
              <form action="/api/auth/logout" method="post">
                <button className="ghost-button" type="submit">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <Link className="stage-chip" href="/login">
              Log in
            </Link>
          )}
        </div>
      </header>

      <section className="workspace-grid">
        <ChatWorkbench modes={CHAT_MODES} signedIn={Boolean(user)} />
      </section>
    </main>
  );
}
