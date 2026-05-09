"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Setting = {
  name: string;
  value: unknown;
  category?: string | null;
};

export function SettingsTab() {
  const [settings, setSettings] = React.useState<Setting[]>([]);
  const [form, setForm] = React.useState({ name: "", category: "", value: "{}" });
  const [status, setStatus] = React.useState<string | null>(null);

  const loadSettings = React.useCallback(async () => {
    const res = await fetch("/api/cat/settings");
    if (!res.ok) return;
    const data = (await res.json()) as { settings?: Setting[] } | Setting[];
    const list = Array.isArray(data) ? data : (data.settings ?? []);
    setSettings(list);
  }, []);

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const buildPayload = () => {
    const name = form.name.trim();
    if (!name) return null;
    let value: unknown;
    try {
      value = JSON.parse(form.value);
    } catch {
      setStatus("Invalid JSON in value");
      return null;
    }
    const payload: Record<string, unknown> = { name, value };
    if (form.category.trim()) payload.category = form.category.trim();
    return payload;
  };

  const createSetting = async () => {
    const payload = buildPayload();
    if (!payload) return;
    const res = await fetch("/api/cat/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Unable to create setting");
      return;
    }
    setStatus("Setting created");
    loadSettings();
  };

  const updateSetting = async () => {
    const payload = buildPayload();
    if (!payload) return;
    const res = await fetch("/api/cat/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Unable to update setting");
      return;
    }
    setStatus("Setting updated");
    loadSettings();
  };

  const deleteSetting = async () => {
    if (!form.name.trim()) return;
    const res = await fetch(`/api/cat/settings?name=${encodeURIComponent(form.name.trim())}`, {
      method: "DELETE"
    });
    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Unable to delete setting");
      return;
    }
    setStatus("Setting deleted");
    loadSettings();
  };

  return (
    <div className="mt-6 space-y-4">
      <Card>
        <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Overview</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Settings loaded</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">{settings.length}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Editing name</div>
            <div className="mt-1 truncate text-sm font-semibold text-ink-100">{form.name || "--"}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Category</div>
            <div className="mt-1 truncate text-sm font-semibold text-ink-100">{form.category || "--"}</div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Actions</div>
            <div className="mt-4 space-y-3">
              <Input
                placeholder="Setting name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <Input
                placeholder="Category (optional)"
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              />
              <Textarea
                placeholder="Value JSON"
                value={form.value}
                onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))}
                rows={10}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="glow" onClick={createSetting}>
                  Create
                </Button>
                <Button variant="outline" onClick={updateSetting}>
                  Update
                </Button>
                <Button variant="ghost" onClick={deleteSetting}>
                  Delete
                </Button>
                <Button variant="outline" onClick={loadSettings}>
                  Reload
                </Button>
              </div>
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
              <div className="mt-3 text-xs text-ink-400">No recent action message.</div>
            )}
          </Card>

          {settings.length === 0 ? (
            <Card>
              <div className="text-sm text-ink-300">No settings returned.</div>
            </Card>
          ) : (
            settings.map((setting) => (
              <Card key={setting.name}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-ink-100">{setting.name}</div>
                    {setting.category ? (
                      <div className="mt-1 text-xs text-ink-400">{setting.category}</div>
                    ) : null}
                    <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-ink-800 bg-ink-950/60 p-3 text-[11px] text-ink-300">
                      {JSON.stringify(setting.value, null, 2)}
                    </pre>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm({
                        name: setting.name,
                        category: setting.category ?? "",
                        value: JSON.stringify(setting.value ?? {}, null, 2)
                      })
                    }
                  >
                    Edit
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
