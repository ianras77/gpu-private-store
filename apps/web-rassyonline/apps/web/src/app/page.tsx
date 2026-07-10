import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/users";
import { CHAT_MODES } from "@/lib/rassycodex";
import { ChatWorkbench } from "@/components/chat-workbench";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="app-shell">
      <div className="ambient-field" aria-hidden="true" />

      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          R
        </div>
        <div>
          <p className="system-label">Rassy Online</p>
          <h1>The conversation is the interface.</h1>
          <p className="topbar-subtitle">RassyGPT routes code, search, memory, documents, and atmosphere from one living thread.</p>
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
