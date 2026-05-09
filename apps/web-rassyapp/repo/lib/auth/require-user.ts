import "server-only";

import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/session";

export async function requireUser() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/sign-in");
  }
  return session.user;
}

export async function getUserSession() {
  return getSessionFromCookies();
}
