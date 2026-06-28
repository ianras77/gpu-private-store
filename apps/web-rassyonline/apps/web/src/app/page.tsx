import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/users";
import { CHAT_MODES } from "@/lib/rassycodex";
import { ChatWorkbench } from "@/components/chat-workbench";

const modes = [
  { name: "General", model: "rassy-general", state: "Ready path" },
  { name: "Deep Coding", model: "rassy-codex", state: "Reserved" },
  { name: "Fast Coding", model: "rassy-codex-lite", state: "Reserved" },
  { name: "Knowledge", model: "rassy-embed + rassy-rerank", state: "Vector stage" },
  { name: "Image", model: "rassy-image", state: "Admin gated" },
  { name: "Audio", model: "rassy-audio", state: "Admin gated" }
];

const stageGates = [
  "Runtipi installable skeleton",
  "Auth, roles, and admin bootstrap",
  "RassyCodex streaming chat",
  "User-scoped Qdrant document memory",
  "Magical theme and UX loops"
];

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="app-shell">
      <section className="starfield" aria-hidden="true">
        <span className="star star-a" />
        <span className="star star-b" />
        <span className="star star-c" />
        <span className="orbit orbit-one" />
        <span className="orbit orbit-two" />
      </section>

      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          R
        </div>
        <div>
          <p className="system-label">Rassy Online</p>
          <h1>RassyCodex, tuned into a public magical workbench.</h1>
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
        <aside className="thread-rail" aria-label="Stage map">
          <div className="rail-heading">Build Loop</div>
          {stageGates.map((gate, index) => (
            <div className={index === 3 ? "gate active" : "gate"} key={gate}>
              <span>{index + 1}</span>
              <p>{gate}</p>
            </div>
          ))}
        </aside>

        <section className="chat-stage" aria-label="Rassy Online preview">
          <div className="constellation compact">
            {modes.map((mode, index) => (
              <article className={`mode-node node-${index}`} key={mode.name}>
                <div>
                  <h2>{mode.name}</h2>
                  <p>{mode.model}</p>
                </div>
                <span>{mode.state}</span>
              </article>
            ))}
          </div>

          <ChatWorkbench modes={CHAT_MODES} signedIn={Boolean(user)} />
        </section>

        <aside className="status-panel" aria-label="Runtipi readiness">
          <div>
            <p className="system-label">Install Surface</p>
            <h2>Runtipi-first foundation</h2>
          </div>
          <ul>
            <li>Public web service on port 3000</li>
            <li>Private Postgres state store</li>
            <li>Private Qdrant vector store</li>
            <li>RassyCodex via host gateway</li>
            <li>Health route at /api/health</li>
          </ul>
          <a className="health-link" href="/api/health">
            Open health check
          </a>
        </aside>
      </section>
    </main>
  );
}
