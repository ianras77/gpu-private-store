"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

export default function DungeonMasterInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [message, setMessage] = useState("Joining the campaign...");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dm/invites/${encodeURIComponent(params.token)}/accept`, {
      method: "POST",
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          campaignId?: string;
          error?: string;
        };
        if (!response.ok || !payload.campaignId)
          throw new Error(payload.error ?? "invite_failed");
        if (!cancelled)
          router.replace(
            `/dungeon-master?campaign=${encodeURIComponent(payload.campaignId)}`,
          );
      })
      .catch((error: Error) => {
        if (!cancelled)
          setMessage(
            error.message === "unauthorized"
              ? "Sign in first, then open this invite again."
              : "This invite is unavailable or expired.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [params.token, router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="rave-panel max-w-lg rounded-3xl p-8 text-center">
        <h1 className="section-title text-2xl">Campaign invite</h1>
        <p
          className="mt-3 text-sm text-cloud/75"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
        <Link
          className="mt-6 inline-block text-sm text-glow"
          href="/dungeon-master"
        >
          Open Dungeon Master
        </Link>
      </section>
    </main>
  );
}
