"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { PageShell, Section, Text, Input, Button, Card, Heading } from "@astro/ui";
import { API_BASE } from "../../lib/api";
import { brand, brandCopy } from "../../lib/brand";
import { loadChart } from "../../lib/storage";

type GeoCandidate = {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lon: number;
  timezone: string;
};

export default function CompatibilityPage() {
  const [chart, setChart] = useState<any | null>(null);
  const [partnerChart, setPartnerChart] = useState<any | null>(null);
  const [reading, setReading] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<GeoCandidate[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<GeoCandidate | null>(null);
  const [searchingLocation, setSearchingLocation] = useState(false);

  useEffect(() => {
    setChart(loadChart());
  }, []);

  useEffect(() => {
    setPartnerChart(null);
    setReading(null);
  }, [birthDate, birthTime, timeUnknown, selectedLocation?.id]);

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
        const response = await fetch(`${API_BASE}/v1/geo/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Brand-Id": brand.id },
          body: JSON.stringify({ query, limit: 6 }),
          signal: controller.signal
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error("Location lookup failed.");
        }
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

  if (!chart) {
    return (
      <PageShell>
        <Section>
          <Heading>Chart Not Found</Heading>
          <Text muted>Return to intake to generate a chart before running compatibility.</Text>
          <Link href="/intake" className="astro-button astro-button-primary astro-button-block">
            Go to Intake
          </Link>
        </Section>
      </PageShell>
    );
  }

  const buildPartnerChart = async () => {
    if (!birthDate) {
      throw new Error("Add a birth date for the partner.");
    }
    if (!timeUnknown && !birthTime) {
      throw new Error("Add a birth time or mark time unknown for the partner.");
    }
    if (!selectedLocation) {
      throw new Error("Choose a location from the list.");
    }

    const response = await fetch(`${API_BASE}/v1/chart/natal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Brand-Id": brand.id },
      body: JSON.stringify({
        birthDate,
        birthTime: timeUnknown || !birthTime ? undefined : birthTime,
        timeUnknown,
        lat: selectedLocation.lat,
        lon: selectedLocation.lon,
        timezone: selectedLocation.timezone
      })
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = typeof data.error === "string" ? data.error : JSON.stringify(data.error);
      throw new Error(detail || "Partner chart generation failed.");
    }
    return {
      ...data.chart,
      birthDate,
      birthTime: timeUnknown || !birthTime ? undefined : birthTime,
      timeUnknown,
      locationLabel: selectedLocation.name,
      locationTimezone: selectedLocation.timezone
    };
  };

  const requestCompatibility = async (length: "short" | "standard" | "deep") => {
    setError(null);
    setLoading(true);

    try {
      const partner = partnerChart ?? (await buildPartnerChart());
      setPartnerChart(partner);
      const response = await fetch(`${API_BASE}/v1/compatibility/natal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Brand-Id": brand.id },
        body: JSON.stringify({
          chartAJson: chart,
          chartBJson: partner,
          brandId: brand.id,
          length
        })
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = typeof data.error === "string" ? data.error : JSON.stringify(data.error);
        throw new Error(detail || "Compatibility reading failed.");
      }
      setReading(data.reading);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <Section title="Relationship Map">
        <div className="astro-form-shell">
          <div className="astro-stack-tight">
            <Heading level={2}>Weave two charts into one story.</Heading>
            <Text muted>{brandCopy.compatibility.intro}</Text>
          </div>

          <div className="astro-inline-meta">
            {chart?.locationLabel ? <span className="astro-chip">Your chart: {chart.locationLabel}</span> : null}
            {chart.meta?.timezone ? <span className="astro-chip">{chart.meta.timezone}</span> : null}
          </div>

          <div className="astro-reading-actions">
            <Button onClick={() => requestCompatibility("short")} disabled={loading}>
              Short
            </Button>
            <Button variant="ghost" onClick={() => requestCompatibility("standard")} disabled={loading}>
              Standard
            </Button>
            <Button variant="ghost" onClick={() => requestCompatibility("deep")} disabled={loading}>
              Long Form
            </Button>
          </div>

          {error ? <Text>{error}</Text> : null}
        </div>
      </Section>

      <Section title="Partner Details">
        <div className="astro-form-shell">
          <div className="astro-note-strip">
            <strong>Keep the partner input simple</strong>
            <Text muted>
              Date, time, and place are enough to generate the synastry. Exact time gives the clearest
              angle and house story.
            </Text>
          </div>

          <div className="astro-form-grid">
            <label className="astro-field">
              <span className="astro-field-label">Partner birth date</span>
              <p className="astro-field-hint">This anchors their planetary positions.</p>
              <Input
                type="date"
                value={birthDate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBirthDate(e.target.value)}
              />
            </label>

            <label className="astro-field">
              <span className="astro-field-label">Partner birth time</span>
              <p className="astro-field-hint">Use the recorded time when possible.</p>
              <Input
                type="time"
                value={birthTime}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBirthTime(e.target.value)}
                disabled={timeUnknown}
              />
            </label>

            <label className="astro-field" style={{ gridColumn: "1 / -1" }}>
              <span className="astro-field-label">Partner birth location</span>
              <p className="astro-field-hint">Search by city and pick the closest match.</p>
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
              />
            </label>
          </div>

          <label className="astro-field-toggle">
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
        </div>
      </Section>

      <Section title="What This Covers">
        <div className="astro-compact-grid">
          {brandCopy.compatibility.notes.map((item, index) => (
            <Card key={item}>
              <Heading level={3}>Lens {index + 1}</Heading>
              <Text muted>{item}</Text>
            </Card>
          ))}
        </div>
      </Section>

      {reading ? (
        <>
          <Section title="At A Glance">
            {reading.narrative?.length ? (
              <div className="astro-prose">
                {reading.narrative.map((paragraph: string, idx: number) => (
                  <Text key={idx}>{paragraph}</Text>
                ))}
              </div>
            ) : null}

            <div className="astro-compact-grid">
              <Card>
                <Heading level={3}>Overview</Heading>
                <ul className="astro-list">
                  {reading.overview.map((line: string, idx: number) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              </Card>

              <Card>
                <Heading level={3}>You</Heading>
                <Text muted>{reading.pairing.personA.sun}</Text>
                <Text muted>{reading.pairing.personA.moon}</Text>
                {reading.pairing.personA.rising ? (
                  <Text muted>{reading.pairing.personA.rising}</Text>
                ) : reading.pairing.personA.presentation ? (
                  <Text muted>{reading.pairing.personA.presentation}</Text>
                ) : null}
              </Card>

              <Card>
                <Heading level={3}>Partner</Heading>
                <Text muted>{reading.pairing.personB.sun}</Text>
                <Text muted>{reading.pairing.personB.moon}</Text>
                {reading.pairing.personB.rising ? (
                  <Text muted>{reading.pairing.personB.rising}</Text>
                ) : reading.pairing.personB.presentation ? (
                  <Text muted>{reading.pairing.personB.presentation}</Text>
                ) : null}
              </Card>
            </div>
          </Section>

          <Section title="Deeper Notes">
            <div className="astro-form-shell">
              <details className="astro-details" open>
                <summary>Harmony</summary>
                <div className="astro-details-body">
                  <div className="astro-compact-grid">
                    {reading.harmony.map((item: any) => (
                      <Card key={item.title}>
                        <Heading level={3}>{item.title}</Heading>
                        <Text muted>{item.text}</Text>
                      </Card>
                    ))}
                  </div>
                </div>
              </details>

              <details className="astro-details">
                <summary>Friction</summary>
                <div className="astro-details-body">
                  <div className="astro-compact-grid">
                    {reading.friction.map((item: any) => (
                      <Card key={item.title}>
                        <Heading level={3}>{item.title}</Heading>
                        <Text muted>{item.text}</Text>
                      </Card>
                    ))}
                  </div>
                </div>
              </details>

              <details className="astro-details">
                <summary>Synastry Aspects</summary>
                <div className="astro-details-body">
                  <div className="astro-compact-grid">
                    {reading.aspects.map((item: any) => (
                      <Card key={item.aspect}>
                        <Heading level={3}>{item.aspect}</Heading>
                        <Text muted>{item.text}</Text>
                      </Card>
                    ))}
                  </div>
                </div>
              </details>
            </div>
          </Section>

          <Section title="Growth And Rituals">
            <Heading level={3}>Growth</Heading>
            <ul className="astro-list">
              {reading.growth.map((line: string, idx: number) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
            <Heading level={3}>Rituals</Heading>
            <ul className="astro-list">
              {reading.rituals.map((line: string, idx: number) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
            <Text muted>{reading.disclaimer}</Text>
          </Section>
        </>
      ) : null}
    </PageShell>
  );
}
