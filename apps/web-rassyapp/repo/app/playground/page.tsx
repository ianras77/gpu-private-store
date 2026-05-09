import { requireUser } from "@/lib/auth/require-user";
import { ConsoleShell } from "@/components/playground/playground-shell";

export default async function PlaygroundPage() {
  const user = await requireUser();

  return (
    <ConsoleShell
      user={{ id: user.id, username: user.username, engineUserId: user.engineUserId }}
    />
  );
}
