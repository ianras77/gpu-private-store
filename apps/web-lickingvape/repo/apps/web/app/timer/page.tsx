'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { timerRitual } from '../content';

const presets = [
  { label: '3 min', seconds: 180, note: 'Catch the first lie before it gets cinematic.' },
  { label: '7 min', seconds: 420, note: 'Long enough to interrupt the autopilot loop.' },
  { label: '15 min', seconds: 900, note: 'For the nights when the room keeps arguing back.' }
];

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.max(0, totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function TimerPage() {
  const [selectedDuration, setSelectedDuration] = useState(presets[0].seconds);
  const [secondsLeft, setSecondsLeft] = useState(presets[0].seconds);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running || secondsLeft <= 0) return;

    const id = window.setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearInterval(id);
  }, [running, secondsLeft]);

  useEffect(() => {
    if (secondsLeft === 0) {
      setRunning(false);
    }
  }, [secondsLeft]);

  const activePreset = useMemo(
    () => presets.find((preset) => preset.seconds === selectedDuration) || presets[0],
    [selectedDuration]
  );

  const progress = ((selectedDuration - secondsLeft) / selectedDuration) * 100;

  const choosePreset = (seconds: number) => {
    setSelectedDuration(seconds);
    setSecondsLeft(seconds);
    setRunning(true);
  };

  const reset = () => {
    setSecondsLeft(selectedDuration);
    setRunning(true);
  };

  return (
    <section className="stack timer-shell">
      <div className="section-head timer-head">
        <h2>Wave breaker</h2>
        <p className="muted">
          A tiny ritual console for the first bad stretch. No self-lecture. Just time, breath, and
          one next move.
        </p>
      </div>

      <div className="timer-console">
        <div className="timer-presets" role="tablist" aria-label="Timer presets">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`button ghost ${selectedDuration === preset.seconds ? 'active' : ''}`}
              onClick={() => choosePreset(preset.seconds)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="small timer-note">{activePreset.note}</div>

        <div className="timer-display">{formatTime(secondsLeft)}</div>
        <div className="timer-progress" aria-hidden="true">
          <div className="timer-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div className="inline-actions center-actions">
          <button
            type="button"
            onClick={() => {
              if (secondsLeft === 0) {
                reset();
                return;
              }
              setRunning((prev) => !prev);
            }}
          >
            {running ? 'Pause' : secondsLeft === 0 ? 'Restart' : 'Resume'}
          </button>
          <button type="button" className="button ghost" onClick={reset}>
            Reset
          </button>
          <Link className="button ghost" href="/submit">
            Leave a note
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-eyebrow">During the timer</div>
        <h3>Keep your body in the room.</h3>
        <div className="card-list">
          {timerRitual.map((step) => (
            <div key={step} className="card-list-item">
              {step}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
