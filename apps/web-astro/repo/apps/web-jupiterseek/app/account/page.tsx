"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageShell, Section, Heading, Text, Button, Card, Input } from "@astro/ui";
import { apiRequest } from "../../lib/api";
import { brand, brandCopy } from "../../lib/brand";
import {
  clearAuthSession,
  linkCurrentChartProfile,
  loadAuthSession,
  loadChart,
  storeAuthSession,
  unlinkCurrentChartProfile
} from "../../lib/storage";

type AuthMode = "register" | "login";

type StoredSession = {
  token: string;
  expiresAt?: string;
  user: {
    id: string;
    email: string;
    displayName?: string | null;
  };
};

type ChartProfile = {
  id: string;
  label?: string | null;
  birthDate: string;
  timeUnknown: boolean;
  timezone?: string;
  locationLabel?: string | null;
  houseSystem?: string | null;
  isPrimary?: boolean;
  autoWeekly?: boolean;
  readingCount?: number;
  contentCount?: number;
};

type FeedEntry = {
  id: string;
  kind: string;
  title: string;
  excerpt: string;
  body?: any;
  weekOf?: string | null;
  publishedAt?: string;
  chartProfileId?: string | null;
};

const initialForm = {
  displayName: "",
  email: "",
  password: ""
};

const formatEntryPreview = (entry: FeedEntry) => {
  if (entry.kind === "weekly-update") {
    return entry.body?.opening ?? entry.excerpt;
  }
  if (Array.isArray(entry.body?.narrative) && entry.body.narrative[0]) {
    return entry.body.narrative[0];
  }
  return entry.excerpt;
};

const formatDateLabel = (value?: string | null) => {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

export default function AccountPage() {
  const [mode, setMode] = useState<AuthMode>("register");
  const [form, setForm] = useState(initialForm);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [currentChart, setCurrentChart] = useState<any | null>(null);
  const [stats, setStats] = useState<{ chartCount: number; feedCount: number } | null>(null);
  const [charts, setCharts] = useState<ChartProfile[]>([]);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const currentChartSaved = Boolean(currentChart?.chartProfileId);
  const primaryChart = useMemo(
    () => charts.find((chart) => chart.isPrimary) ?? charts[0] ?? null,
    [charts]
  );
  const trimmedEmail = form.email.trim();
  const trimmedDisplayName = form.displayName.trim();
  const emailLooksValid = /\S+@\S+\.\S+/.test(trimmedEmail);
  const displayNameReady = mode !== "register" || !trimmedDisplayName || trimmedDisplayName.length >= 2;
  const authDisabled =
    busyKey === "register" ||
    busyKey === "login" ||
    !emailLooksValid ||
    form.password.length < 10 ||
    !displayNameReady;
  const currentChartIdentity = currentChart
    ? [currentChart.locationLabel, currentChart.birthDate].filter(Boolean).join(" · ")
    : null;

  const hydrateDashboard = async (token: string, expiresAt?: string) => {
    const [sessionData, chartsData, feedData] = await Promise.all([
      apiRequest<{
        user: StoredSession["user"];
        stats: { chartCount: number; feedCount: number };
      }>("/v1/auth/session", { token }),
      apiRequest<{ charts: ChartProfile[] }>("/v1/charts", { token }),
      apiRequest<{ entries: FeedEntry[] }>("/v1/content/feed?limit=12", { token })
    ]);

    const nextSession: StoredSession = {
      token,
      expiresAt: expiresAt ?? loadAuthSession()?.expiresAt,
      user: sessionData.user
    };

    setSession(nextSession);
    storeAuthSession(nextSession);
    setStats(sessionData.stats);
    setCharts(chartsData.charts ?? []);
    setFeed(feedData.entries ?? []);
  };

  useEffect(() => {
    setCurrentChart(loadChart());
    const existingSession = loadAuthSession();
    if (!existingSession?.token) return;
    setSession(existingSession);
    void hydrateDashboard(existingSession.token, existingSession.expiresAt).catch(() => {
      clearAuthSession();
      setSession(null);
    });
  }, []);

  const saveCurrentChartAndReport = async (token: string, autoTriggered = false) => {
    if (!currentChart) {
      setError("Generate a chart first so there is something to save.");
      return;
    }
    if (currentChart.chartProfileId) {
      setMessage("This chart is already connected to your account.");
      await hydrateDashboard(token);
      return;
    }
    if (
      typeof currentChart.locationLat !== "number" ||
      typeof currentChart.locationLon !== "number"
    ) {
      setError("This chart was created before saving support was added. Generate it again to claim it.");
      return;
    }

    setBusyKey("save-chart");
    setError(null);
    setMessage(
      autoTriggered
        ? "Account ready. Saving your current chart and writing the first report..."
        : "Saving this chart and writing the first report..."
    );

    try {
      const saved = await apiRequest<{ chart: ChartProfile }>("/v1/charts", {
        method: "POST",
        token,
        body: {
          label: `${currentChart.locationLabel ?? "Natal Chart"} · ${currentChart.birthDate}`,
          birthDate: currentChart.birthDate,
          birthTime: currentChart.birthTime,
          timeUnknown: currentChart.timeUnknown,
          lat: currentChart.locationLat,
          lon: currentChart.locationLon,
          timezone: currentChart.locationTimezone ?? currentChart.meta?.timezone,
          locationLabel: currentChart.locationLabel,
          houseSystem: currentChart.meta?.houseSystem ?? currentChart.houses?.system,
          chartJson: currentChart
        }
      });

      linkCurrentChartProfile(saved.chart);
      setCurrentChart(loadChart());

      await apiRequest("/v1/content/initial-report", {
        method: "POST",
        token,
        body: {
          chartProfileId: saved.chart.id,
          brandId: brand.id,
          length: "standard"
        }
      });

      await hydrateDashboard(token);
      setMessage("Chart saved. Your first report is now in the private grimoire.");
    } catch (err: any) {
      setError(err.message ?? "Could not save the chart right now.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleAuth = async () => {
    setBusyKey(mode);
    setError(null);
    setMessage(null);

    try {
      const data = await apiRequest<{
        user: StoredSession["user"];
        token: string;
        expiresAt?: string;
      }>(mode === "register" ? "/v1/auth/register" : "/v1/auth/login", {
        method: "POST",
        body:
          mode === "register"
            ? {
                displayName: trimmedDisplayName || undefined,
                email: trimmedEmail,
                password: form.password
              }
            : {
                email: trimmedEmail,
                password: form.password
              }
      });

      const nextSession: StoredSession = {
        token: data.token,
        expiresAt: data.expiresAt,
        user: data.user
      };

      storeAuthSession(nextSession);
      setSession(nextSession);
      setForm(initialForm);
      await hydrateDashboard(nextSession.token, nextSession.expiresAt);

      if (currentChart && !currentChart.chartProfileId) {
        await saveCurrentChartAndReport(nextSession.token, true);
      } else {
        setMessage(
          mode === "register"
            ? "Account created. Your private grimoire is ready."
            : "Signed in. Your private grimoire is ready."
        );
      }
    } catch (err: any) {
      setError(err.message ?? "Could not complete sign-in.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleLogout = async () => {
    if (!session?.token) return;
    setBusyKey("logout");
    setError(null);

    try {
      await apiRequest("/v1/auth/logout", {
        method: "POST",
        token: session.token
      });
    } catch {
      // Best effort logout; clear local session regardless.
    } finally {
      clearAuthSession();
      setSession(null);
      setStats(null);
      setCharts([]);
      setFeed([]);
      setMessage("Signed out.");
      setBusyKey(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (!session?.token) return;
    if (!window.confirm("Delete your account, saved charts, and private feed?")) return;

    setBusyKey("delete-account");
    setError(null);

    try {
      await apiRequest("/v1/account", {
        method: "DELETE",
        token: session.token
      });
      if (currentChart?.chartProfileId) {
        unlinkCurrentChartProfile(currentChart.chartProfileId);
        setCurrentChart(loadChart());
      }
      clearAuthSession();
      setSession(null);
      setStats(null);
      setCharts([]);
      setFeed([]);
      setMessage("Account deleted.");
    } catch (err: any) {
      setError(err.message ?? "Could not delete the account.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleSetPrimary = async (chartId: string) => {
    if (!session?.token) return;
    setBusyKey(`primary-${chartId}`);
    setError(null);

    try {
      await apiRequest(`/v1/charts/${chartId}/primary`, {
        method: "POST",
        token: session.token
      });
      await hydrateDashboard(session.token);
      setMessage("Primary chart updated.");
    } catch (err: any) {
      setError(err.message ?? "Could not update the primary chart.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteChart = async (chartId: string) => {
    if (!session?.token) return;
    if (!window.confirm("Delete this saved chart?")) return;

    setBusyKey(`delete-${chartId}`);
    setError(null);

    try {
      await apiRequest(`/v1/charts/${chartId}`, {
        method: "DELETE",
        token: session.token
      });
      unlinkCurrentChartProfile(chartId);
      setCurrentChart(loadChart());
      await hydrateDashboard(session.token);
      setMessage("Saved chart deleted.");
    } catch (err: any) {
      setError(err.message ?? "Could not delete the chart.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleWeeklyUpdate = async (chartId?: string) => {
    if (!session?.token) return;
    const targetChartId = chartId ?? primaryChart?.id;
    if (!targetChartId) {
      setError("Save a chart first so the weekly entry has a chart to write from.");
      return;
    }

    setBusyKey(`weekly-${targetChartId}`);
    setError(null);

    try {
      await apiRequest("/v1/content/weekly-update", {
        method: "POST",
        token: session.token,
        body: {
          chartProfileId: targetChartId,
          brandId: brand.id
        }
      });
      await hydrateDashboard(session.token);
      setMessage("Fresh weekly entry written.");
    } catch (err: any) {
      setError(err.message ?? "Could not write the weekly update.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <PageShell>
      <Section title="Private Grimoire">
        <div className="astro-split-panel">
          <div className="astro-form-shell">
            <div className="astro-stack-tight">
              <Heading level={2}>
                {session?.user.displayName
                  ? `${session.user.displayName}, your grimoire is open.`
                  : session
                    ? "Your grimoire is open."
                    : `Create your ${brand.name} grimoire.`}
              </Heading>
              <Text muted>
                {session
                  ? brandCopy.account.intro
                  : "Register or sign in to save the chart, keep the first report, and collect the weekly writing that follows it."}
              </Text>
            </div>

            {!session ? (
              <>
                <div className="astro-note-strip">
                  <strong>{currentChart ? "We found your chart." : "Start with one chart."}</strong>
                  <Text muted>
                    {currentChart
                      ? currentChartSaved
                        ? `${currentChartIdentity ?? "This chart"} is already tied to a saved grimoire. Sign in with the same account to reopen it.`
                        : `${currentChartIdentity ?? "Your local chart"} is ready to be claimed the moment you create the account.`
                      : "The fastest path is simple: draw the chart first, then create the account so the first report and weekly notes have somewhere to live."}
                  </Text>
                </div>

                <form
                  className="astro-form-shell"
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    if (authDisabled) return;
                    void handleAuth();
                  }}
                >
                  <div className="astro-auth-toggle">
                    <button
                      type="button"
                      className={`astro-auth-tab ${mode === "register" ? "is-active" : ""}`}
                      onClick={() => setMode("register")}
                    >
                      Create Account
                    </button>
                    <button
                      type="button"
                      className={`astro-auth-tab ${mode === "login" ? "is-active" : ""}`}
                      onClick={() => setMode("login")}
                    >
                      Sign In
                    </button>
                  </div>

                  <div className="astro-form-grid">
                    {mode === "register" ? (
                      <label className="astro-field">
                        <span className="astro-field-label">Display name</span>
                        <p className="astro-field-hint">Optional. This is how the grimoire addresses you.</p>
                        <Input
                          value={form.displayName}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, displayName: event.target.value }))
                          }
                          placeholder="Your name"
                          autoComplete="nickname"
                        />
                      </label>
                    ) : null}

                    <label className="astro-field">
                      <span className="astro-field-label">Email</span>
                      <p className="astro-field-hint">This becomes your account key.</p>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                        placeholder="you@example.com"
                        autoComplete="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        inputMode="email"
                        enterKeyHint="next"
                      />
                    </label>

                    <label className="astro-field">
                      <span className="astro-field-label">Password</span>
                      <p className="astro-field-hint">Use at least 10 characters.</p>
                      <Input
                        type="password"
                        value={form.password}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, password: event.target.value }))
                        }
                        placeholder="A strong password"
                        autoComplete={mode === "register" ? "new-password" : "current-password"}
                        enterKeyHint="go"
                      />
                    </label>
                  </div>

                  <div className="astro-hero-actions">
                    <Button type="submit" disabled={authDisabled}>
                      {busyKey === mode
                        ? mode === "register"
                          ? "Creating Account..."
                          : "Signing In..."
                        : mode === "register"
                          ? "Create Account"
                          : "Sign In"}
                    </Button>
                    <Link href="/intake" className="astro-button astro-button-ghost astro-button-block">
                      Start With Birth Chart
                    </Link>
                  </div>
                  <Text muted>
                    Use a valid email and a password with at least 10 characters.
                  </Text>
                </form>
              </>
            ) : (
              <>
                <div className="astro-metric-grid">
                  <Card>
                    <Text className="astro-kicker">Email</Text>
                    <Heading level={3}>{session.user.email}</Heading>
                  </Card>
                  <Card>
                    <Text className="astro-kicker">Saved charts</Text>
                    <Heading level={3}>{stats?.chartCount ?? charts.length}</Heading>
                  </Card>
                  <Card>
                    <Text className="astro-kicker">Feed entries</Text>
                    <Heading level={3}>{stats?.feedCount ?? feed.length}</Heading>
                  </Card>
                </div>

                <div className="astro-hero-actions">
                  <Link href="/intake" className="astro-button astro-button-primary astro-button-block">
                    Cast New Chart
                  </Link>
                  <Button
                    variant="ghost"
                    onClick={() => handleWeeklyUpdate()}
                    disabled={busyKey === `weekly-${primaryChart?.id ?? ""}` && Boolean(primaryChart)}
                  >
                    Write This Week&apos;s Entry
                  </Button>
                  <Button variant="ghost" onClick={handleLogout} disabled={busyKey === "logout"}>
                    Log Out
                  </Button>
                </div>
              </>
            )}

            {message ? <Text>{message}</Text> : null}
            {error ? <Text>{error}</Text> : null}
          </div>

          <div className="astro-note-strip">
            <strong>{brandCopy.signature.title}</strong>
            <Text muted>{brandCopy.account.note}</Text>
            <Text muted>
              Save one chart and the rest of the experience gets much better: first report, weekly entries,
              and a place to keep the whole thread together.
            </Text>
            <div className="astro-stack-tight">
              {brand.focusModules.map((module) => (
                <Text key={module.id} muted>
                  {module.title} · {module.description}
                </Text>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Current Chart">
        {currentChart ? (
          <div className="astro-split-panel">
            <Card>
              <Heading level={3}>
                {currentChart.locationLabel ?? "Current chart"} · {currentChart.birthDate}
              </Heading>
              <Text muted>
                {currentChart.timeUnknown
                  ? "Time unknown. This chart focuses on signs and aspects."
                  : currentChart.birthTime
                    ? `${currentChart.birthTime} · ${currentChart.locationTimezone ?? currentChart.meta?.timezone ?? "Local time"}`
                    : currentChart.locationTimezone ?? currentChart.meta?.timezone ?? "Timezone saved"}
              </Text>
              {currentChart.locationLabel ? <Text muted>{currentChart.locationLabel}</Text> : null}
            </Card>

            <div className="astro-form-shell">
              <Text muted>
                {currentChartSaved
                  ? "This chart is already saved to the account. Use it for new readings and weekly entries."
                  : "This chart is still local to the browser. Claim it once and the report can start living in your private grimoire."}
              </Text>
              <div className="astro-hero-actions">
                {session ? (
                  <Button
                    onClick={() => void saveCurrentChartAndReport(session.token)}
                    disabled={busyKey === "save-chart" || currentChartSaved}
                  >
                    {currentChartSaved ? "Chart Saved" : busyKey === "save-chart" ? "Saving..." : "Save Chart + First Report"}
                  </Button>
                ) : (
                  <Button variant="ghost" disabled>
                    Sign in to save this chart
                  </Button>
                )}
                <Link href="/chart" className="astro-button astro-button-ghost astro-button-block">
                  Open Chart
                </Link>
                <Link href="/reading" className="astro-button astro-button-ghost astro-button-block">
                  Open Reading
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <Card>
            <Heading level={3}>No local chart yet</Heading>
            <Text muted>Generate a birth chart first, then come back here to save it and build your feed.</Text>
            <Link href="/intake" className="astro-button astro-button-primary astro-button-block">
              Start Birth Chart
            </Link>
          </Card>
        )}
      </Section>

      <Section title="Saved Charts">
        {session ? (
          charts.length > 0 ? (
            <div className="astro-item-stack">
              {charts.map((chart) => (
                <Card key={chart.id}>
                  <div className="astro-card-head">
                    <div className="astro-stack-tight">
                      <Heading level={3}>{chart.label ?? chart.locationLabel ?? "Saved chart"}</Heading>
                      <Text muted>
                        {chart.birthDate}
                        {chart.locationLabel ? ` · ${chart.locationLabel}` : ""}
                        {chart.timeUnknown ? " · Time unknown" : chart.timezone ? ` · ${chart.timezone}` : ""}
                      </Text>
                    </div>
                    {chart.isPrimary ? <span className="astro-chip">Primary</span> : null}
                  </div>
                  <div className="astro-inline-meta">
                    <span className="astro-chip">{chart.readingCount ?? 0} readings</span>
                    <span className="astro-chip">{chart.contentCount ?? 0} feed entries</span>
                    {chart.houseSystem ? <span className="astro-chip">{chart.houseSystem}</span> : null}
                  </div>
                  <div className="astro-card-actions">
                    {!chart.isPrimary ? (
                      <Button
                        variant="ghost"
                        onClick={() => void handleSetPrimary(chart.id)}
                        disabled={busyKey === `primary-${chart.id}`}
                      >
                        Make Primary
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      onClick={() => void handleWeeklyUpdate(chart.id)}
                      disabled={busyKey === `weekly-${chart.id}`}
                    >
                      Write Weekly Entry
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => void handleDeleteChart(chart.id)}
                      disabled={busyKey === `delete-${chart.id}`}
                    >
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <Heading level={3}>No saved charts yet</Heading>
              <Text muted>Save the current chart above to start your private archive.</Text>
            </Card>
          )
        ) : (
          <Card>
            <Heading level={3}>Register to unlock saved charts</Heading>
            <Text muted>
              This is where the account turns the chart into an ongoing experience instead of a one-time reading.
            </Text>
          </Card>
        )}
      </Section>

      <Section title="Weekly Feed">
        {session ? (
          feed.length > 0 ? (
            <div className="astro-item-stack">
              {feed.map((entry) => (
                <Card key={entry.id}>
                  <div className="astro-card-head">
                    <div className="astro-stack-tight">
                      <Text className="astro-kicker">
                        {entry.kind === "weekly-update" ? "Weekly entry" : "Initial report"}
                      </Text>
                      <Heading level={3}>{entry.title}</Heading>
                    </div>
                    <span className="astro-chip">{formatDateLabel(entry.publishedAt ?? entry.weekOf)}</span>
                  </div>
                  <Text muted>{entry.excerpt}</Text>
                  <Text muted>{formatEntryPreview(entry)}</Text>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <Heading level={3}>No feed entries yet</Heading>
              <Text muted>
                Save a chart to write the first report, then use the weekly button to keep the journal moving.
              </Text>
            </Card>
          )
        ) : (
          <Card>
            <Heading level={3}>The weekly journal lives here</Heading>
            <Text muted>
              Your first natal report and every new weekly note collect in this screen once the account is active.
            </Text>
          </Card>
        )}
      </Section>

      {session ? (
        <Section title="Data Controls">
          <Text muted>{brandCopy.account.note}</Text>
          <Button variant="ghost" onClick={handleDeleteAccount} disabled={busyKey === "delete-account"}>
            Delete Account
          </Button>
        </Section>
      ) : null}
    </PageShell>
  );
}
