'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import ArcadeCabinet from '@/components/ArcadeCabinet';
import InsertCoin from '@/components/InsertCoin';
import Hud from '@/components/Hud';
import QuestPanel from '@/components/QuestPanel';
import LootModal from '@/components/LootModal';
import PaceToggle from '@/components/PaceToggle';
import ControlHints from '@/components/ControlHints';
import RunnerGame, { type Metrics } from '@/game/RunnerGame';
import {
  ApiError,
  createRun,
  getCourses,
  getQuestToday,
  getStoredToken,
  listRuns,
  login,
  logout,
  register,
  rollLoot,
  type Course,
  type LootItem,
  type Quest,
  type RunOut,
  type RunSummary
} from '@/lib/api';
import { playCoin } from '@/lib/sfx';

type RunRecord = RunOut & { label: string };

type CourseBadge = {
  label: string;
  min: number;
  tone: string;
};

const COURSE_BADGES: CourseBadge[] = [
  { label: 'Bronze', min: 0, tone: 'text-amber-200' },
  { label: 'Silver', min: 600, tone: 'text-slate-200' },
  { label: 'Gold', min: 1200, tone: 'text-yellow-200' },
  { label: 'Platinum', min: 2000, tone: 'text-neon-blue' }
];

function formatPace(secondsPerKm?: number | null) {
  if (!secondsPerKm || secondsPerKm <= 0) return '--';
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.floor(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDuration(secondsTotal: number) {
  if (!secondsTotal || secondsTotal <= 0) return '0:00';
  const minutes = Math.floor(secondsTotal / 60);
  const seconds = Math.floor(secondsTotal % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDistance(distanceM: number) {
  if (!distanceM || distanceM <= 0) return '-- km';
  return `${(distanceM / 1000).toFixed(2)} km`;
}

function formatImprovement(value: number | null) {
  if (value === null) return 'First course record';
  if (value === 0) return 'Matched best';
  if (value > 0) return `Faster by ${Math.round(value)}s/km`;
  return `Slower by ${Math.round(Math.abs(value))}s/km`;
}

function formatRunLabel(value: string | null) {
  if (!value) return 'Recent';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getCourseBadge(points: number) {
  const current =
    [...COURSE_BADGES].reverse().find((badge) => points >= badge.min) ?? COURSE_BADGES[0];
  const nextIndex = COURSE_BADGES.findIndex((badge) => badge.label === current.label) + 1;
  const next = COURSE_BADGES[nextIndex] ?? current;
  const range = Math.max(1, next.min - current.min);
  const progress = Math.min(100, ((points - current.min) / range) * 100);
  return { current, next, progress };
}

function getSessionPoints(metrics: Metrics) {
  return Math.max(0, Math.round(metrics.xp + metrics.streak * 12));
}

export default function Home() {
  const [started, setStarted] = useState(false);
  const [simulatePace, setSimulatePace] = useState(false);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [loot, setLoot] = useState<LootItem[] | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({ pace: 3.5, streak: 0, xp: 0 });
  const [runKey, setRunKey] = useState(0);
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    getQuestToday()
      .then(setQuest)
      .catch(() => setQuest(null));
  }, []);

  const refreshData = useCallback(
    async (preferredCourseId?: string, options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      try {
        const [courseData, runData] = await Promise.all([getCourses(), listRuns()]);
        const runs = runData.map((run) => ({ ...run, label: formatRunLabel(run.created_at) }));
        setCourses(courseData);
        setRunHistory(runs);
        setActiveCourseId((current) => {
          const fallback = preferredCourseId ?? current ?? courseData[0]?.id ?? null;
          if (!fallback) return null;
          return courseData.some((course) => course.id === fallback)
            ? fallback
            : (courseData[0]?.id ?? null);
        });
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    []
  );

  const handleLogout = useCallback(() => {
    logout();
    setIsAuthed(false);
    setCourses([]);
    setRunHistory([]);
    setActiveCourseId(null);
    setStarted(false);
    setMetrics({ pace: 3.5, streak: 0, xp: 0 });
    setApiError(null);
    setAuthError(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      const token = getStoredToken();
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      setIsAuthed(true);
      try {
        await refreshData();
        if (mounted) setApiError(null);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          handleLogout();
        } else if (mounted) {
          setApiError('Arcade servers are offline. Runs will not save.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    bootstrap();
    return () => {
      mounted = false;
    };
  }, [refreshData, handleLogout]);

  useEffect(() => {
    if (!activeCourseId) return;
    setStarted(false);
    setMetrics({ pace: 3.5, streak: 0, xp: 0 });
    setRunKey((k) => k + 1);
  }, [activeCourseId]);

  const activeCourse = useMemo(
    () => courses.find((course) => course.id === activeCourseId) ?? courses[0] ?? null,
    [courses, activeCourseId]
  );

  const totalPoints = useMemo(
    () => courses.reduce((sum, course) => sum + course.points, 0),
    [courses]
  );

  const activeCourseRuns = useMemo(
    () =>
      activeCourse ? runHistory.filter((run) => run.course_id === activeCourse.id).slice(0, 4) : [],
    [runHistory, activeCourse]
  );

  const lastRun = activeCourseRuns[0];
  const sessionPoints = getSessionPoints(metrics);
  const badge = getCourseBadge(activeCourse?.points ?? 0);

  const handleStart = useCallback(() => {
    if (!isAuthed) {
      setApiError('Sign in to start a run.');
      return;
    }
    if (loading || !activeCourse) {
      setApiError('Course sync in progress. Try again in a moment.');
      return;
    }
    playCoin();
    setApiError(null);
    setLoot(null);
    setMetrics({ pace: 3.5, streak: 0, xp: 0 });
    setRunKey((k) => k + 1);
    setStarted(true);
  }, [loading, activeCourse, isAuthed]);

  const handleAuthSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const email = authEmail.trim();
      if (!email || !authPassword) {
        setAuthError('Email and password required.');
        return;
      }
      setAuthError(null);
      setApiError(null);
      setAuthBusy(true);
      try {
        if (authMode === 'login') {
          await login(email, authPassword);
        } else {
          await register(email, authPassword);
        }
        setIsAuthed(true);
        await refreshData();
        setAuthPassword('');
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.status === 401) {
            setAuthError('Invalid email or password.');
          } else if (error.status === 400) {
            setAuthError('Email already registered or invalid.');
          } else if (error.status === 429) {
            setAuthError('Too many attempts. Try again soon.');
          } else {
            setAuthError('Unable to sign in. Try again.');
          }
        } else {
          setAuthError('Unable to sign in. Try again.');
        }
      } finally {
        setAuthBusy(false);
      }
    },
    [authEmail, authPassword, authMode, refreshData]
  );

  const handleGameOver = useCallback(
    async (summary: RunSummary) => {
      setStarted(false);
      if (!activeCourse || !isAuthed) return;

      try {
        await createRun({
          ...summary,
          course_id: activeCourse.id,
          session_points: sessionPoints
        });
        await refreshData(activeCourse.id, { silent: true });
        setApiError(null);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          handleLogout();
          setApiError('Session expired. Sign in again to save runs.');
        } else {
          setApiError('Run saved locally only. Check your server connection.');
        }
      }

      try {
        const items = await rollLoot(summary);
        setLoot(items);
      } catch (error) {
        setLoot([
          { name: 'Static Charm', rarity: 'common', description: 'Keeps the CRT humming.' },
          {
            name: 'Jungle Prism',
            rarity: 'rare',
            description: 'Splits neon light into pace boosts.'
          }
        ]);
      }
    },
    [activeCourse, sessionPoints, refreshData, handleLogout, isAuthed]
  );

  return (
    <main className="min-h-screen px-4 py-10 md:px-8">
      <ArcadeCabinet>
        <div className="space-y-8">
          <header className="space-y-3 text-center">
            <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/50">
              <span className="rounded-full border border-white/20 px-3 py-1">Run</span>
              <span className="rounded-full border border-white/20 px-3 py-1">Course</span>
              <span className="rounded-full border border-white/20 px-3 py-1">Improve</span>
              <span className="rounded-full border border-white/20 px-3 py-1">Points</span>
            </div>
            <h1 className="animate-glowpulse font-pixel text-4xl text-neon-pink md:text-6xl">
              JOGMANIA
            </h1>
            <p className="mx-auto max-w-2xl text-white/70">
              Every run becomes a course record. Improve your pace, bank points, and climb the
              arcade board.
            </p>
          </header>

          <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
            <section className="space-y-6">
              <div className="crt pixel-border relative h-[520px] md:h-[560px]">
                <RunnerGame
                  key={`${runKey}-${activeCourse?.id ?? 'course'}`}
                  running={started}
                  simulatePace={simulatePace}
                  themeKey={activeCourse?.theme_key}
                  onMetrics={setMetrics}
                  onGameOver={handleGameOver}
                />
                <InsertCoin started={started} onStart={handleStart} />
                <div className="scanline" />
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl bg-black/50 p-4">
                  <div className="mb-2 font-pixel text-xs text-neon-blue">Active Course</div>
                  <div className="text-xl text-white">
                    {activeCourse?.name ?? 'Select a course'}
                  </div>
                  <div className="text-xs text-white/60">{activeCourse?.description ?? ''}</div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/70">
                    <div>
                      Distance{' '}
                      <span className="text-white">
                        {activeCourse ? activeCourse.distance_km.toFixed(1) : '--'} km
                      </span>
                    </div>
                    <div>
                      Best pace{' '}
                      <span className="text-neon-green">
                        {formatPace(activeCourse?.best_pace_s_per_km)}/km
                      </span>
                    </div>
                    <div>
                      Course points{' '}
                      <span className="text-neon-yellow">{activeCourse?.points ?? 0}</span>
                    </div>
                  </div>
                </div>
                <Hud
                  pace={metrics.pace}
                  streak={metrics.streak}
                  xp={metrics.xp}
                  sessionPoints={sessionPoints}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-black/40 p-4">
                  <div className="mb-2 font-pixel text-xs text-neon-yellow">Run Recap</div>
                  {lastRun ? (
                    <div className="space-y-3 text-xs text-white/70">
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Date</span>
                        <span className="text-white">{lastRun.label}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Distance</span>
                        <span className="text-white">{formatDistance(lastRun.distance_m)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Time</span>
                        <span className="text-white">{formatDuration(lastRun.duration_s)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Avg pace</span>
                        <span className="text-neon-green">
                          {formatPace(lastRun.avg_pace_s_per_km)}/km
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Points earned</span>
                        <span className="font-pixel text-neon-yellow">+{lastRun.points}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-white/60">
                      Complete a run to lock in a course record.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-black/40 p-4">
                  <div className="mb-2 font-pixel text-xs text-neon-green">Course Improvements</div>
                  {activeCourseRuns.length ? (
                    <div className="space-y-3 text-xs text-white/70">
                      {activeCourseRuns.map((run, index) => (
                        <div key={run.id} className="rounded-xl bg-black/50 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-white">
                              Run {activeCourseRuns.length - index}
                            </span>
                            <span className="text-white/50">{run.label}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-white/60">Pace</span>
                            <span className="text-white">
                              {formatPace(run.avg_pace_s_per_km)}/km
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-white/60">Delta</span>
                            <span
                              className={
                                run.improvement_s_per_km !== null && run.improvement_s_per_km > 0
                                  ? 'text-neon-green'
                                  : run.improvement_s_per_km !== null &&
                                      run.improvement_s_per_km < 0
                                    ? 'text-neon-pink'
                                    : 'text-white/60'
                              }
                            >
                              {formatImprovement(run.improvement_s_per_km)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-white/60">
                      Your improvements stack here run by run.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <PaceToggle enabled={simulatePace} onToggle={() => setSimulatePace((v) => !v)} />
                <div className="rounded-full border border-white/20 bg-black/40 px-4 py-2 text-xs uppercase text-white/80">
                  Pending points:{' '}
                  <span className="font-pixel text-neon-yellow">{sessionPoints}</span>
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              {!isAuthed ? (
                <div className="pixel-border rounded-2xl bg-black/60 p-4">
                  <div className="mb-3 font-pixel text-xs text-neon-blue">Player Login</div>
                  <div className="flex gap-2 text-[10px] uppercase">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setAuthError(null);
                      }}
                      className={`rounded-full border px-3 py-1 transition ${
                        authMode === 'login'
                          ? 'border-neon-blue text-neon-blue'
                          : 'border-white/20 text-white/50'
                      }`}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setAuthError(null);
                      }}
                      className={`rounded-full border px-3 py-1 transition ${
                        authMode === 'register'
                          ? 'border-neon-green text-neon-green'
                          : 'border-white/20 text-white/50'
                      }`}
                    >
                      Register
                    </button>
                  </div>
                  <form onSubmit={handleAuthSubmit} className="mt-4 space-y-3">
                    <input
                      type="email"
                      placeholder="runner@jogmania.com"
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                      disabled={authBusy}
                      className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-neon-blue focus:outline-none"
                    />
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                      disabled={authBusy}
                      className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-neon-blue focus:outline-none"
                    />
                    {authError ? (
                      <div className="text-[10px] text-neon-pink">{authError}</div>
                    ) : null}
                    <button
                      type="submit"
                      disabled={authBusy}
                      className="neon-button w-full rounded-full px-4 py-2 text-xs uppercase tracking-wide text-white disabled:opacity-50"
                    >
                      {authBusy
                        ? 'Linking arcade...'
                        : authMode === 'login'
                          ? 'Enter Arcade'
                          : 'Create Runner'}
                    </button>
                  </form>
                  <div className="mt-3 text-[10px] text-white/50">
                    Runs save to your profile and drive course points.
                  </div>
                </div>
              ) : (
                <div className="pixel-border rounded-2xl bg-black/60 p-4">
                  <div className="mb-2 font-pixel text-xs text-neon-blue">Runner Session</div>
                  <div className="text-xs text-white/70">Arcade profile synced. Ready to run.</div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-3 w-full rounded-full border border-white/20 px-3 py-2 text-[10px] uppercase tracking-wide text-white/70 transition hover:border-white/40"
                  >
                    Log out
                  </button>
                </div>
              )}

              {apiError ? (
                <div className="rounded-2xl border border-neon-pink/30 bg-black/60 p-3 text-xs text-neon-pink">
                  {apiError}
                </div>
              ) : null}

              <div className="pixel-border rounded-2xl bg-[#0c0c1b]/80 p-4">
                <div className="mb-3 font-pixel text-xs text-neon-yellow">Course Deck</div>
                {!isAuthed ? (
                  <div className="text-xs text-white/60">Sign in to load your courses.</div>
                ) : loading ? (
                  <div className="text-xs text-white/60">Syncing course data...</div>
                ) : courses.length ? (
                  <div className="space-y-3">
                    {courses.map((course) => {
                      const lastCourseRun = runHistory.find((run) => run.course_id === course.id);
                      const isActive = course.id === activeCourse?.id;
                      return (
                        <button
                          key={course.id}
                          type="button"
                          disabled={started || loading}
                          onClick={() => setActiveCourseId(course.id)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            isActive
                              ? 'border-neon-blue bg-black/60 shadow-[0_0_12px_rgba(51,214,255,0.35)]'
                              : 'border-white/10 bg-black/40 hover:border-white/30'
                          } ${started || loading ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm text-white">{course.name}</div>
                              <div className="text-[10px] text-white/40">
                                {course.distance_km.toFixed(1)} km
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-pixel text-sm text-neon-yellow">
                                {course.points}
                              </div>
                              <div className="text-[10px] text-white/50">pts</div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-white/60">
                            <span>Best {formatPace(course.best_pace_s_per_km)}/km</span>
                            <span>Last {formatPace(course.last_pace_s_per_km)}/km</span>
                          </div>
                          {lastCourseRun ? (
                            <div className="mt-2 text-[10px] text-white/60">
                              <span
                                className={
                                  lastCourseRun.improvement_s_per_km !== null &&
                                  lastCourseRun.improvement_s_per_km > 0
                                    ? 'text-neon-green'
                                    : lastCourseRun.improvement_s_per_km !== null &&
                                        lastCourseRun.improvement_s_per_km < 0
                                      ? 'text-neon-pink'
                                      : 'text-white/50'
                                }
                              >
                                {formatImprovement(lastCourseRun.improvement_s_per_km)}
                              </span>
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-white/60">
                    No courses found. Check your connection.
                  </div>
                )}
                {started ? (
                  <div className="mt-3 text-[10px] text-white/40">
                    Finish the run to switch courses.
                  </div>
                ) : null}
              </div>

              <QuestPanel quest={quest} courseName={activeCourse?.name} />

              <div className="pixel-border rounded-2xl bg-black/50 p-4">
                <div className="mb-3 font-pixel text-xs text-neon-green">Points Vault</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/70">Total Points</span>
                  <span className="font-pixel text-lg text-neon-pink">{totalPoints}</span>
                </div>
                <div className="mt-3 text-xs text-white/70">
                  Course stash - {activeCourse?.name ?? ''}{' '}
                  <span className="text-neon-yellow">{activeCourse?.points ?? 0}</span>
                </div>
                <div className="mt-3 rounded-xl bg-black/40 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Badge</span>
                    <span className={`font-pixel ${badge.current.tone}`}>
                      {badge.current.label}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-neon-green to-neon-yellow"
                      style={{ width: `${badge.progress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-white/40">
                    <span>{badge.current.min} pts</span>
                    <span>
                      {badge.next.label} at {badge.next.min} pts
                    </span>
                  </div>
                </div>
              </div>

              <ControlHints />

              <div className="pixel-border rounded-2xl bg-black/40 p-4 text-xs text-white/70">
                <div className="mb-2 font-pixel text-xs text-neon-pink">Arcade Feed</div>
                <div>Courses sync after every cash out.</div>
                <div>New best pace drops a bonus point cache.</div>
                <div>Stack streaks to unlock relic drops.</div>
              </div>
            </aside>
          </div>
        </div>
      </ArcadeCabinet>

      <LootModal items={loot} onClose={() => setLoot(null)} />
    </main>
  );
}
