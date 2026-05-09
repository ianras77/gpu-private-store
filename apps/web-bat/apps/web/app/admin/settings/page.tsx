"use client";

import { FormEvent, useEffect, useState } from "react";

import { apiBase } from "@/lib/api";

type Controls = {
  direct_publish: boolean;
  x_live_posting: boolean;
  x_research_enabled: boolean;
  research_directive: string;
  analysis_directive: string;
  voice_blueprint: string;
  live_vibe: string;
};

type SettingsResponse = {
  controls: Controls;
  environment: {
    x_enabled: boolean;
    x_dry_run: boolean;
    manual_review: boolean;
    auto_publish: boolean;
    auto_publish_social: boolean;
  };
};

const emptyControls: Controls = {
  direct_publish: false,
  x_live_posting: false,
  x_research_enabled: false,
  research_directive: "",
  analysis_directive: "",
  voice_blueprint: "",
  live_vibe: "",
};

const presets: Array<{
  name: string;
  summary: string;
  controls: Controls;
}> = [
  {
    name: "Texas Heat",
    summary: "Fast research pulse, high specificity, strong why-now pressure, and enough nerve to move quickly without losing the receipts.",
    controls: {
      direct_publish: true,
      x_live_posting: false,
      x_research_enabled: true,
      research_directive:
        "Trump administration legal filing contradiction\nWhite House statement contradicts court filing\nRepublicans uneasy Trump response",
      analysis_directive:
        "Find the official line, the cleanest receipt that breaks it, and the political consequence readers should actually care about.",
      voice_blueprint:
        "Write like the desk is early, specific, and impeccably sourced. Lead with the concrete contradiction and make the stakes obvious in the first paragraph.",
      live_vibe: "Quick, elegant, sharp, and built for immediate posting without losing factual discipline.",
    },
  },
  {
    name: "Velvet Venom",
    summary: "Prioritize memorable lines, sharper thesis statements, and quotable hooks that still feel polished instead of loud.",
    controls: {
      direct_publish: false,
      x_live_posting: false,
      x_research_enabled: true,
      research_directive:
        "Trump administration vanity contradiction\nMAGA infighting leadership dispute\ncabinet official contradicts White House",
      analysis_directive:
        "Keep the line feminine and pithy. One lacquered cut per piece, then back to the receipts and the social consequence.",
      voice_blueprint:
        "Aim for a premium opinion column cut: stylish compression, no filler, one hard line readers will repeat, and a clean consequence paragraph.",
      live_vibe: "Wry, polished, and a little dangerous in the best way.",
    },
  },
  {
    name: "Rattlesnake Watch",
    summary: "Track recurring patterns, keep the contradiction map tight, and let the best links self-surface as signal picks.",
    controls: {
      direct_publish: false,
      x_live_posting: false,
      x_research_enabled: true,
      research_directive:
        "court blocks Trump administration action\nfederal judge administration criticism\nagency purge administration backlash",
      analysis_directive:
        "Track the pattern, not just the headline. Explain how the new receipt changes the notebook and what line the site should avoid repeating.",
      voice_blueprint:
        "Stay pattern-first. Connect the newest evidence to the longer-running contradiction and explain why the pattern is not cooling.",
      live_vibe: "Precise, skeptical, and built for quote cards and thread openings.",
    },
  },
  {
    name: "War Room",
    summary: "Force the desk onto a live conflict or foreign-policy rupture without losing the BAT angle: White House line, fallout, backlash, and receipts.",
    controls: {
      direct_publish: true,
      x_live_posting: false,
      x_research_enabled: true,
      research_directive:
        "Trump Iran war latest 2026\nWhite House Iran strike fallout 2026\nCongress war powers Trump Iran 2026\noil prices Iran conflict Trump 2026\nPentagon Middle East escalation latest 2026\nRepublican backlash Trump Iran 2026",
      analysis_directive:
        "Translate escalation into BAT terms: what the White House said, what actually happened, who is already contradicting it, and what domestic price or backlash is forming.",
      voice_blueprint:
        "Treat live conflict coverage like a BAT front-page package. Lead with the administration line, prove what changed in the real world, show who is already contradicting or breaking with the message, and make the domestic political stakes plain.",
      live_vibe: "Fast war-room dispatches: elegant, sourced, screenshot-ready, and alive to backlash, market nerves, and briefing-room spin.",
    },
  },
  {
    name: "Social Swarm",
    summary: "Keep the desk draft-first but shape every story for dispatches, quote cards, and thread components with clean internet legs.",
    controls: {
      direct_publish: false,
      x_live_posting: false,
      x_research_enabled: true,
      research_directive:
        "Trump statement backlash\nconservative columnist alarm Trump\nGOP donor concern Trump",
      analysis_directive:
        "Build every story around one shareable insight, one clear receipt, and one reason the link deserves to travel.",
      voice_blueprint:
        "Every story should leave the room with a launch packet: why-now, social hook, quote-card line, and a closer with internet legs.",
      live_vibe: "Fast, social-native, sharp enough to post cold.",
    },
  },
];

export default function AdminSettingsPage() {
  const [controls, setControls] = useState<Controls>(emptyControls);
  const [environment, setEnvironment] = useState<SettingsResponse["environment"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");

  const load = async () => {
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch(`${apiBase}/api/v1/admin/system-settings`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Load failed (${response.status})`);
      }
      const data = (await response.json()) as SettingsResponse;
      setControls(data.controls);
      setEnvironment(data.environment);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Load failed";
      setStatus(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch(`${apiBase}/api/v1/admin/system-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(controls),
      });
      if (!response.ok) {
        throw new Error(`Save failed (${response.status})`);
      }
      const payload = (await response.json()) as { controls: Controls };
      setControls(payload.controls);
      setStatus("Saved runtime controls.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed";
      setStatus(message);
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setStatus("");
    try {
      const response = await fetch(`${apiBase}/api/v1/admin/pipeline/run-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Run failed (${response.status})`);
      }
      setStatus("Pipeline run started and completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Run failed";
      setStatus(message);
    } finally {
      setRunning(false);
    }
  };

  const applyPreset = (preset: Controls) => {
    setControls(preset);
    setStatus("Preset loaded. Save controls when you’re ready.");
  };

  return (
    <>
      <section className="admin-hero">
        <div>
          <p className="admin-kicker">Settings</p>
          <h1>Editorial operating console</h1>
          <p className="admin-copy">
            Choose the desk’s mode, steer the research plan, and decide how boldly the system should publish when the story is moving in real time.
          </p>
        </div>
        <div className="admin-status-grid">
          <article className="mission-stat">
            <span>Runtime</span>
            <strong>{controls.direct_publish ? "publish-first" : "draft-first"}</strong>
            <p>{controls.x_research_enabled ? "X is part of the research pulse." : "Web research only."}</p>
          </article>
          <article className="mission-stat">
            <span>Review mode</span>
            <strong>{environment?.manual_review ? "manual review on" : "manual review off"}</strong>
            <p>{environment?.x_enabled ? "X credentials are present in env." : "X env credentials are not configured."}</p>
          </article>
        </div>
      </section>

      <section className="preset-grid">
        {presets.map((preset) => (
          <article key={preset.name} className="story-panel">
            <p className="section-kicker">{preset.name}</p>
            <p>{preset.summary}</p>
            <button type="button" onClick={() => applyPreset(preset.controls)}>
              Load preset
            </button>
          </article>
        ))}
      </section>

      <form className="story-panel control-form" onSubmit={save}>
        <p className="section-kicker">Runtime switches</p>
        <div className="toggle-grid">
          <label className="toggle-card">
            <input
              type="checkbox"
              checked={controls.direct_publish}
              onChange={(event) => setControls((prev) => ({ ...prev, direct_publish: event.target.checked }))}
            />
            <span>Direct publish</span>
            <small>Skip draft hold when quality and style gates allow it.</small>
          </label>

          <label className="toggle-card">
            <input
              type="checkbox"
              checked={controls.x_research_enabled}
              onChange={(event) => setControls((prev) => ({ ...prev, x_research_enabled: event.target.checked }))}
            />
            <span>Include X in research</span>
            <small>Mix recent X search into the research pass.</small>
          </label>

          <label className="toggle-card">
            <input
              type="checkbox"
              checked={controls.x_live_posting}
              onChange={(event) => setControls((prev) => ({ ...prev, x_live_posting: event.target.checked }))}
            />
            <span>Allow live X posting</span>
            <small>Let published social assets dispatch beyond dry-run mode.</small>
          </label>
        </div>

        <div className="control-grid">
          <div>
            <label>
              <strong>Research directive</strong>
            </label>
            <p>
              For a breaking topic, stack a few angles instead of one headline: the event itself, the White House line, backlash, and the downstream political or market fallout.
            </p>
            <textarea
              value={controls.research_directive}
              onChange={(event) => setControls((prev) => ({ ...prev, research_directive: event.target.value }))}
              rows={6}
              placeholder="One query per line. These become the lead questions every cycle."
            />
          </div>

          <div>
            <label>
              <strong>Voice blueprint</strong>
            </label>
            <textarea
              value={controls.voice_blueprint}
              onChange={(event) => setControls((prev) => ({ ...prev, voice_blueprint: event.target.value }))}
              rows={6}
              placeholder="Long-form editorial instruction. Think thesis, pace, precision, and memorable lines."
            />
          </div>

          <div>
            <label>
              <strong>Analysis directive</strong>
            </label>
            <p>
              This is the intelligence layer between research and writing. Tell the analyst what pattern, contradiction, tone, or consequence it
              should sharpen before the writer ever starts.
            </p>
            <textarea
              value={controls.analysis_directive}
              onChange={(event) => setControls((prev) => ({ ...prev, analysis_directive: event.target.value }))}
              rows={5}
              placeholder="Examples: what changed, what the official line is hiding, what tone fits this topic, what consequence matters most."
            />
          </div>

          <div>
            <label>
              <strong>Live vibe</strong>
            </label>
            <textarea
              value={controls.live_vibe}
              onChange={(event) => setControls((prev) => ({ ...prev, live_vibe: event.target.value }))}
              rows={5}
              placeholder="Short-form posting energy for dispatches, clapbacks, and thread openings."
            />
          </div>
        </div>

        <div className="action-row">
          <button type="submit" disabled={saving || loading}>
            {saving ? "Saving..." : "Save controls"}
          </button>
          <button type="button" onClick={runNow} disabled={running || loading}>
            {running ? "Running..." : "Run pipeline now"}
          </button>
          <button type="button" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>

        {status ? <p className="form-status">{status}</p> : null}
      </form>

      <section className="mission-grid">
        <article className="story-panel">
          <p className="section-kicker">Environment</p>
          <div className="stack-list compact">
            <div className="stack-item static">
              <strong>X enabled in env</strong>
              <span>{environment?.x_enabled ? "true" : "false"}</span>
            </div>
            <div className="stack-item static">
              <strong>X dry run in env</strong>
              <span>{environment?.x_dry_run ? "true" : "false"}</span>
            </div>
            <div className="stack-item static">
              <strong>Manual review</strong>
              <span>{environment?.manual_review ? "true" : "false"}</span>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}
