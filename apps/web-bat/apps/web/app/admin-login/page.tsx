import { PublicHeader } from "@/components/PublicHeader";
import { normalizeNextPath } from "@/lib/admin-auth";

import { AdminLoginClient } from "./AdminLoginClient";

type AdminLoginPageProps = {
  searchParams?: Promise<{ next?: string | string[] | undefined }>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const requestedNext = Array.isArray(params?.next) ? params?.next[0] : params?.next;
  const nextPath = normalizeNextPath(requestedNext);

  return (
    <>
      <PublicHeader />
      <main className="page-wrap">
        <section className="login-shell">
          <AdminLoginClient nextPath={nextPath} />
        </section>
      </main>
    </>
  );
}
