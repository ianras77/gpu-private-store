import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/users";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    redirect("/login?error=admin_required");
  }

  return (
    <main className="admin-shell">
      <section className="admin-header">
        <Link className="back-link" href="/">
          Rassy Online
        </Link>
        <div>
          <p className="system-label">Admin Console</p>
          <h1>Control room for accounts, capabilities, and runtime health.</h1>
        </div>
      </section>

      <section className="admin-grid">
        <article className="admin-tile">
          <h2>Registration</h2>
          <p>{process.env.RASSY_ONLINE_REGISTRATION_POLICY ?? "open"}</p>
        </article>
        <article className="admin-tile">
          <h2>Bootstrap Admin</h2>
          <p>{process.env.RASSY_ONLINE_BOOTSTRAP_ADMIN_EMAIL || "Not configured"}</p>
        </article>
        <article className="admin-tile">
          <h2>RassyMind</h2>
          <p>{process.env.RASSYMIND_BASE_URL ?? "Not configured"}</p>
        </article>
        <Link className="admin-tile action" href="/admin/users">
          <h2>Users</h2>
          <p>Review accounts and roles</p>
        </Link>
      </section>
    </main>
  );
}
