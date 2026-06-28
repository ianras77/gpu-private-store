import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, listUsers } from "@/lib/auth/users";

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    redirect("/login?error=admin_required");
  }

  const users = await listUsers();

  return (
    <main className="admin-shell">
      <section className="admin-header">
        <Link className="back-link" href="/admin">
          Admin
        </Link>
        <div>
          <p className="system-label">Users</p>
          <h1>Registered Rassy Online accounts.</h1>
        </div>
      </section>

      <section className="user-table" aria-label="User accounts">
        <div className="user-row heading">
          <span>Email</span>
          <span>Role</span>
          <span>Status</span>
          <span>Created</span>
        </div>
        {users.map((account) => (
          <div className="user-row" key={account.id}>
            <span>{account.email}</span>
            <span>{account.role}</span>
            <span>{account.status}</span>
            <span>{account.createdAt.toISOString().slice(0, 10)}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
