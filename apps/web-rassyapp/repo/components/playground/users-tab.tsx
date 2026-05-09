"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PermissionMap = Record<string, string[]>;

type User = {
  id: string;
  username?: string | null;
  permissions?: PermissionMap | null;
};

type CreateFormState = {
  username: string;
  password: string;
  permissions: PermissionMap;
};

type UpdateFormState = {
  userId: string;
  password: string;
  permissions: PermissionMap;
};

export function UsersTab() {
  const [users, setUsers] = React.useState<User[]>([]);
  const [available, setAvailable] = React.useState<PermissionMap>({});
  const [status, setStatus] = React.useState<string | null>(null);

  const [createForm, setCreateForm] = React.useState<CreateFormState>({
    username: "",
    password: "",
    permissions: {}
  });

  const [updateForm, setUpdateForm] = React.useState<UpdateFormState>({
    userId: "",
    password: "",
    permissions: {}
  });

  const loadUsers = React.useCallback(async () => {
    const res = await fetch("/api/cat/users");
    if (!res.ok) return;
    const data = (await res.json()) as { users?: User[] } | User[] | User;
    const raw = (data as any).users ?? data;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    setUsers(list);
  }, []);

  const loadPermissions = React.useCallback(async () => {
    const res = await fetch("/api/cat/auth/permissions");
    if (!res.ok) return;
    const data = (await res.json()) as { permissions?: PermissionMap } | PermissionMap;
    const map = (data as any).permissions ?? data ?? {};
    setAvailable(map);
  }, []);

  React.useEffect(() => {
    loadUsers();
    loadPermissions();
  }, [loadUsers, loadPermissions]);

  const togglePermission = (formKey: "create" | "update", resource: string, perm: string) => {
    const updatePermissions = <T extends { permissions: PermissionMap }>(prev: T): T => {
      const current = { ...(prev.permissions ?? {}) } as PermissionMap;
      const list = new Set(current[resource] ?? []);
      if (list.has(perm)) {
        list.delete(perm);
      } else {
        list.add(perm);
      }
      const next: PermissionMap = { ...current, [resource]: Array.from(list) };
      return { ...prev, permissions: next };
    };

    if (formKey === "create") {
      setCreateForm((prev) => updatePermissions(prev));
      return;
    }

    setUpdateForm((prev) => updatePermissions(prev));
  };

  const createUser = async () => {
    if (!createForm.username.trim() || !createForm.password.trim()) return;
    setStatus(null);

    const payload: Record<string, unknown> = {
      username: createForm.username.trim(),
      password: createForm.password.trim()
    };

    if (Object.keys(createForm.permissions).length) {
      payload.permissions = createForm.permissions;
    }

    const res = await fetch("/api/cat/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Unable to create user");
      return;
    }

    setStatus("User created");
    setCreateForm({ username: "", password: "", permissions: {} });
    loadUsers();
  };

  const updateUser = async () => {
    if (!updateForm.userId) return;
    setStatus(null);

    const payload: Record<string, unknown> = {};
    if (updateForm.password.trim()) payload.password = updateForm.password.trim();
    if (Object.keys(updateForm.permissions).length) {
      payload.permissions = updateForm.permissions;
    }

    const res = await fetch(`/api/cat/users/${encodeURIComponent(updateForm.userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Unable to update user");
      return;
    }

    setStatus("User updated");
    setUpdateForm({ userId: "", password: "", permissions: {} });
    loadUsers();
  };

  const deleteUser = async (userId: string) => {
    await fetch(`/api/cat/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
    setUsers((prev) => prev.filter((user) => user.id !== userId));
  };

  return (
    <div className="mt-6 space-y-4">
      <Card>
        <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Overview</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Users</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">{users.length}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Permission resources</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">{Object.keys(available).length}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Create target</div>
            <div className="mt-1 truncate text-sm font-semibold text-ink-100">
              {createForm.username || "--"}
            </div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Update target</div>
            <div className="mt-1 truncate text-sm font-semibold text-ink-100">
              {updateForm.userId || "--"}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Actions</div>
            <div className="mt-4 space-y-3">
              <Button variant="outline" onClick={() => Promise.all([loadUsers(), loadPermissions()])}>
                Reload users + permissions
              </Button>
              <Input
                placeholder="Username"
                value={createForm.username}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, username: event.target.value }))
                }
              />
              <Input
                placeholder="Password"
                type="password"
                value={createForm.password}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, password: event.target.value }))
                }
              />
              {Object.keys(available).length ? (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Create permissions</div>
                  {Object.entries(available).map(([resource, perms]) => (
                    <div key={resource} className="space-y-1">
                      <div className="text-xs font-semibold text-ink-300">{resource}</div>
                      <div className="flex flex-wrap gap-2">
                        {perms.map((perm) => (
                          <label key={perm} className="flex items-center gap-2 text-xs text-ink-300">
                            <input
                              type="checkbox"
                              checked={createForm.permissions[resource]?.includes(perm) ?? false}
                              onChange={() => togglePermission("create", resource, perm)}
                            />
                            <span>{perm}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <Button variant="glow" onClick={createUser}>
                Add member
              </Button>

              <select
                className="w-full rounded-xl border border-ink-700 bg-ink-900/70 px-4 py-3 text-sm text-ink-50"
                value={updateForm.userId}
                onChange={(event) =>
                  setUpdateForm((prev) => ({ ...prev, userId: event.target.value }))
                }
              >
                <option value="">Select user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.username ?? user.id}
                  </option>
                ))}
              </select>
              <Input
                placeholder="New password (optional)"
                type="password"
                value={updateForm.password}
                onChange={(event) =>
                  setUpdateForm((prev) => ({ ...prev, password: event.target.value }))
                }
              />
              {Object.keys(available).length ? (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Update permissions</div>
                  {Object.entries(available).map(([resource, perms]) => (
                    <div key={resource} className="space-y-1">
                      <div className="text-xs font-semibold text-ink-300">{resource}</div>
                      <div className="flex flex-wrap gap-2">
                        {perms.map((perm) => (
                          <label key={perm} className="flex items-center gap-2 text-xs text-ink-300">
                            <input
                              type="checkbox"
                              checked={updateForm.permissions[resource]?.includes(perm) ?? false}
                              onChange={() => togglePermission("update", resource, perm)}
                            />
                            <span>{perm}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <Button variant="outline" onClick={updateUser}>
                Save changes
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Output</div>
            {status ? (
              <div className="mt-3 rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2 text-sm text-ink-300">
                {status}
              </div>
            ) : (
              <div className="mt-3 text-xs text-ink-400">No recent user action message.</div>
            )}
          </Card>

          {users.length === 0 ? (
            <Card>
              <div className="text-sm text-ink-300">No teammates yet.</div>
            </Card>
          ) : (
            users.map((user) => (
              <Card key={user.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-ink-50">
                      {user.username ?? "(unnamed)"}
                    </div>
                    <div className="mt-2 text-xs text-ink-400">{user.id}</div>
                    {user.permissions ? (
                      <div className="mt-3 space-y-1 text-xs text-ink-300">
                        {Object.entries(user.permissions).map(([resource, perms]) => (
                          <div key={resource}>
                            {resource}: {(perms ?? []).join(", ")}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button variant="ghost" size="sm" onClick={() => deleteUser(user.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
