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
        <Link className="brand-lockup" href="/" aria-label="Rassy Online home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="presentation">
              <path className="signal-line" d="M7 33h13l5-14 8 27 7-19h17" />
              <circle className="signal" cx="55" cy="27" r="2.5" />
            </svg>
          </span>
          <span className="brand-type"><strong>RASSY</strong><small>PRIVATE / LIVE</small></span>
        </Link>
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

      <section className="home-intro" aria-labelledby="home-title">
        <div>
          <p className="system-label"><span className="live-dot" /> RassyMind / live appliance</p>
          <h1 id="home-title">A useful place to think, make, and find the thread.</h1>
          <p>Start in Auto. Rassy routes ordinary chat, research, code, documents, and voice to the capability that is actually available.</p>
        </div>
        <div className="home-facts" aria-label="Current service facts">
          <span><strong>Qwen3.8</strong> deep chat + tools</span>
          <span><strong>Rendered tokens</strong> counted before admission</span>
          <span><strong>Private by default</strong> no prompt content in telemetry</span>
        </div>
      </section>

      <section className="workspace-grid">
        <ChatWorkbench modes={CHAT_MODES} signedIn={Boolean(user)} />
      </section>
    </main>
  );
}
