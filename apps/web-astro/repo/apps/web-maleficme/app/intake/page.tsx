"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell, Section, Text, Input, Button, Card, Heading } from "@astro/ui";
import { apiRequest } from "../../lib/api";
import { brandCopy } from "../../lib/brand";
import { loadAuthSession, storeChart } from "../../lib/storage";

type GeoCandidate = {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lon: number;
  timezone: string;
};

export default function IntakePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<GeoCandidate[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<GeoCandidate | null>(null);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(loadAuthSession()?.token));
  }, []);

  useEffect(() => {
    const query = locationQuery.trim();
    if (query.length < 2) {
      setLocationResults([]);
      setSearchingLocation(false);
      return;
    }
    if (selectedLocation && query === selectedLocation.name) {
      setLocationResults([]);
      setSearchingLocation(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setSearchingLocation(true);
      try {
        const data = await apiRequest<{ results?: GeoCandidate[] }>("/v1/geo/resolve", {
          method: "POST",
          body: { query, limit: 6 },
          signal: controller.signal
        });
        setLocationResults(data.results ?? []);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setLocationResults([]);
      } finally {
        setSearchingLocation(false);
      }
    }, 320);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [locationQuery, selectedLocation]);

  const readiness = useMemo(
    () => [
      {
        label: "Date",
        value: birthDate || "Needed to anchor the sky."
      },
      {
        label: "Time",
        value: timeUnknown
          ? "Working without birth time. Houses and Rising will stay hidden."
          : birthTime || "Add birth time to unlock Rising and houses."
      },
      {
        label: "Place",
        value: selectedLocation?.name || "Add the birthplace to set the local horizon."
      }
    ],
    [birthDate, birthTime, timeUnknown, selectedLocation]
  );

  const canGenerate = Boolean(
    birthDate &&
      selectedLocation &&
      (timeUnknown || birthTime)
  );

  const handleSubmit = async () => {
    setError(null);
    if (!birthDate) {
      setError("Add a birth date.");
      return;
    }
    if (!timeUnknown && !birthTime) {
      setError("Add a birth time or choose time unknown.");
      return;
    }
    if (!selectedLocation) {
      setError("Choose a location from the list.");
      return;
    }

    setLoading(true);
    try {
      const chartData = await apiRequest<{ chart: any }>("/v1/chart/natal", {
        method: "POST",
        body: {
          birthDate,
          birthTime: timeUnknown || !birthTime ? undefined : birthTime,
          timeUnknown,
          lat: selectedLocation.lat,
          lon: selectedLocation.lon,
          timezone: selectedLocation.timezone
        }
      });

      storeChart({
        ...chartData.chart,
        birthDate,
        birthTime: timeUnknown || !birthTime ? undefined : birthTime,
        timeUnknown,
        locationLabel: selectedLocation.name,
        locationTimezone: selectedLocation.timezone,
        locationLat: selectedLocation.lat,
        locationLon: selectedLocation.lon
      });
      router.push("/chart");
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <Section title="Birth Details">
        <div className="astro-form-shell">
          <div className="astro-stack-tight">
            <Heading level={2}>The birth-chart step should feel easy.</Heading>
            <Text muted>{brandCopy.intake.intro}</Text>
          </div>

          <div className="astro-note-strip">
            <strong>This is all we need</strong>
            <Text muted>
              Birthday, birth time if you have it, and birthplace. We draw the chart visually first,
              then the longer report takes over.
            </Text>
            {signedIn ? (
              <Text muted>
                You are signed in, so this chart can be claimed into your private grimoire right after it is drawn.
              </Text>
            ) : (
              <Text muted>
                You can create an account after this step to save the chart and start your weekly journal.
              </Text>
            )}
          </div>

          <div className="astro-form-grid">
            <label className="astro-field">
              <span className="astro-field-label">1. Birth date</span>
              <p className="astro-field-hint">This locks the planets into place.</p>
              <Input
                type="date"
                value={birthDate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBirthDate(e.target.value)}
              />
            </label>

            <label className="astro-field">
              <span className="astro-field-label">2. Birth time</span>
              <p className="astro-field-hint">This unlocks the Rising sign, houses, and sharper timing.</p>
              <Input
                type="time"
                value={birthTime}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBirthTime(e.target.value)}
                disabled={timeUnknown}
              />
            </label>

            <label className="astro-field" style={{ gridColumn: "1 / -1" }}>
              <span className="astro-field-label">3. Birth location</span>
              <p className="astro-field-hint">Search by city and choose the cleanest match below.</p>
              <Input
                placeholder="City, Country"
                value={locationQuery}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const next = e.target.value;
                  setError(null);
                  setLocationQuery(next);
                  if (selectedLocation && next !== selectedLocation.name) {
                    setSelectedLocation(null);
                  }
                }}
                autoComplete="off"
                autoCapitalize="words"
                spellCheck={false}
                inputMode="search"
                enterKeyHint="search"
              />
            </label>
          </div>

          <div className="astro-hero-actions">
            <label className="astro-field-toggle" style={{ flex: "1 1 280px" }}>
              <input
                type="checkbox"
                className="astro-field-checkbox"
                checked={timeUnknown}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const checked = e.target.checked;
                  setTimeUnknown(checked);
                  if (checked) setBirthTime("");
                }}
              />
              <div className="astro-stack-tight">
                <span className="astro-field-label">Time unknown</span>
                <p className="astro-field-hint">{brandCopy.intake.timeUnknown}</p>
              </div>
            </label>

            {!timeUnknown ? (
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setTimeUnknown(true);
                  setBirthTime("");
                }}
              >
                Continue Without Time
              </Button>
            ) : null}
          </div>

          {selectedLocation ? (
            <div className="location-selected">
              <span>Selected</span>
              <strong>{selectedLocation.name}</strong>
              <span>{selectedLocation.timezone}</span>
            </div>
          ) : null}

          {searchingLocation ? <Text muted>Searching locations...</Text> : null}

          {!selectedLocation && locationResults.length > 0 ? (
            <div className="location-results">
              {locationResults.map((candidate) => {
                const meta = [candidate.timezone, candidate.description].filter(Boolean).join(" · ");
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    className="location-option"
                    onClick={() => {
                      setError(null);
                      setSelectedLocation(candidate);
                      setLocationQuery(candidate.name);
                      setLocationResults([]);
                    }}
                  >
                    <div className="location-option-title">{candidate.name}</div>
                    <div className="location-option-meta">{meta}</div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {!selectedLocation &&
          !searchingLocation &&
          locationQuery.trim().length >= 2 &&
          locationResults.length === 0 ? (
            <Text muted>No matches yet. Try a nearby city or include the country.</Text>
          ) : null}

          <Card>
            <Heading level={3}>What the chart can already see</Heading>
            <div className="astro-compact-grid">
              {readiness.map((item) => (
                <div key={item.label} className="astro-stack-tight">
                  <Text className="astro-kicker">{item.label}</Text>
                  <Text muted>{item.value}</Text>
                </div>
              ))}
            </div>
          </Card>

          {error ? <Text>{error}</Text> : null}

          <div className="astro-hero-actions">
            <Button className="astro-button-block" onClick={handleSubmit} disabled={loading || !canGenerate}>
              {loading ? "Drawing Chart..." : "Draw My Birth Chart"}
            </Button>
            {!signedIn ? (
              <Link href="/account" className="astro-button astro-button-ghost astro-button-block">
                Create Account First
              </Link>
            ) : null}
          </div>
        </div>
      </Section>

      <Section title="What Happens Next">
        <div className="astro-compact-grid">
          {brandCopy.intake.notes.map((item, index) => (
            <Card key={item}>
              <Heading level={3}>Next {index + 1}</Heading>
              <Text muted>{item}</Text>
            </Card>
          ))}
        </div>
      </Section>
    </PageShell>
  );
}
