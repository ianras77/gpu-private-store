"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Party } from "@jogmania/api-client";

const defaultRoles = ["Scout", "Runner", "Guardian", "Navigator"];

export default function PartiesPage() {
  const { user } = useAuth();
  const api = useApi();
  const [parties, setParties] = useState<Party[]>([]);
  const [name, setName] = useState("");
  const [worldName, setWorldName] = useState("");
  const [worldTheme, setWorldTheme] = useState("neon");
  const [members, setMembers] = useState(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [runnerName, setRunnerName] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api.listParties().then(setParties).catch(() => setParties([]));
  }, [api, user]);

  const canCreate = name.trim().length > 1;

  const payloadMembers = useMemo(
    () =>
      members
        .map((member, index) => member.trim())
        .filter(Boolean)
        .map((member, index) => ({
          name: member,
          role: defaultRoles[index % defaultRoles.length]
        })),
    [members]
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreate || loading) return;
    setLoading(true);
    try {
      const party = await api.createParty({
        name: name.trim(),
        world_name: worldName.trim() || undefined,
        world_theme: worldTheme.trim() || undefined,
        members: payloadMembers
      });
      setParties((prev) => [party, ...prev]);
      setName("");
      setWorldName("");
      setMembers(["", "", ""]);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    setJoinError(null);
    try {
      const joined = await api.joinParty(inviteCode, runnerName);
      setParties((current) => current.some((party) => party.id === joined.id) ? current : [joined, ...current]);
      setInviteCode("");
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "That invite code did not open a world.");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 jm-holo">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="jm-kicker">Party Setup</p>
            <h3 className="font-display text-2xl">Assemble a crew</h3>
            <p className="text-xs text-jm-muted mt-1">Make a crew, or join a pal&apos;s arcade. Every person&apos;s route and pace stay private.</p>
          </div>
          <Badge tone="cyan">{parties.length} parties</Badge>
        </div>
        <form className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4" onSubmit={handleCreate}>
          <div className="lg:col-span-2 space-y-3">
            <input
              className="jm-input w-full"
              placeholder="Party name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="jm-input w-full"
                placeholder="World name (optional)"
                value={worldName}
                onChange={(event) => setWorldName(event.target.value)}
              />
              <input
                className="jm-input w-full"
                placeholder="World theme (neon, jungle, synth)"
                value={worldTheme}
                onChange={(event) => setWorldTheme(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {members.map((member, index) => (
                <input
                  key={`member-${index}`}
                  className="jm-input w-full"
                  placeholder={`Member ${index + 1}`}
                  value={member}
                  onChange={(event) => {
                    const next = [...members];
                    next[index] = event.target.value;
                    setMembers(next);
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Button type="submit" disabled={!canCreate || loading}>
              {loading ? "Creating..." : "Create Party"}
            </Button>
            <div className="text-xs text-jm-muted">
              Roles auto-assign as Scout, Runner, Guardian. You can edit later.
            </div>
          </div>
        </form>
      </Card>

      <Card className="p-5">
        <p className="jm-kicker">A pal sent you a ticket?</p>
        <form className="mt-3 flex flex-wrap gap-3" onSubmit={handleJoin}>
          <input className="jm-input" aria-label="Party invite code" placeholder="Invite code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} required />
          <input className="jm-input" aria-label="Your crew name" placeholder="Name for the crew" value={runnerName} onChange={(event) => setRunnerName(event.target.value)} required />
          <Button type="submit">Join their world</Button>
        </form>
        {joinError ? <p className="mt-2 text-xs text-jm-magenta">{joinError}</p> : null}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {parties.map((party) => (
          <Link key={party.id} href={`/parties/${party.id}`}>
            <Card className="p-5 jm-holo">
              <div className="flex items-center justify-between">
                <div>
                  <p className="jm-kicker">Party</p>
                  <h3 className="font-display text-xl">{party.name}</h3>
                </div>
                <Badge tone="magenta">{party.members?.length ?? 0} members</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="jm-chip text-jm-cyan">World {party.world?.name ?? "Unbound"}</span>
                <span className="jm-chip text-jm-acid">{String((party.world?.state_json?.arcade as { chapter?: string } | undefined)?.chapter ?? "Marquee Mystery")}</span>
              </div>
              <p className="mt-3 text-xs text-jm-muted">{Number((party.world?.state_json?.arcade as { runs?: number } | undefined)?.runs ?? 0)} adventures · every saved run brings one more attraction to life</p>
              <div className="mt-4 jm-meter">
                <span style={{ width: `${Math.min(100, Number((party.world?.state_json?.arcade as { chapter_lights?: string[] } | undefined)?.chapter_lights?.length ?? 0) * 20)}%` }} />
              </div>
              <p className="mt-3 text-[11px] text-jm-muted">Crew ticket: <span className="font-mono text-jm-acid">{party.invite_code}</span></p>
            </Card>
          </Link>
        ))}
        {parties.length === 0 && (
          <p className="text-sm text-jm-muted">No parties yet. Create your first crew.</p>
        )}
      </div>
    </div>
  );
}
