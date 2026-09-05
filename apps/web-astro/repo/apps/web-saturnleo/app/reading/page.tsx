"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PageShell, Section, Heading, Text, Button, Card, ReportAtlas } from "@astro/ui";
import { apiRequest } from "../../lib/api";
import { brand, brandCopy } from "../../lib/brand";
import { loadAuthSession, loadChart } from "../../lib/storage";

const formatChartKey = (point: any): string => {
  const label = point.key === "Asc" ? "Rising" : point.key === "MC" ? "Midheaven" : point.key;
  return `${label} in ${point.sign} ${point.signDegree.toFixed(1)} deg`;
};

export default function ReadingPage() {
  const [chart, setChart] = useState<any | null>(null);
  const [reading, setReading] = useState<any | null>(null);
  const [reportArtifact, setReportArtifact] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [shareCard, setShareCard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [readerName, setReaderName] = useState<string | null>(null);

  useEffect(() => {
    setChart(loadChart());
    const authSession = loadAuthSession();
    setAuthToken(authSession?.token ?? null);
    setReaderName(authSession?.user.displayName ?? authSession?.user.email ?? null);
  }, []);

  const chartKeys = useMemo(
    () =>
      chart
        ? [
            chart.points.find((point: any) => point.key === "Sun"),
            chart.points.find((point: any) => point.key === "Moon"),
            chart.points.find((point: any) => point.key === "Asc"),
            chart.points.find((point: any) => point.key === "MC")
          ].filter(Boolean)
        : [],
    [chart]
  );

  if (!chart) {
    return (
      <PageShell>
        <Section>
          <Heading>Chart Not Found</Heading>
          <Text muted>Generate a chart first so the reading has something to interpret.</Text>
          <Link href="/intake" className="astro-button astro-button-primary astro-button-block">
            Go to Intake
          </Link>
        </Section>
      </PageShell>
    );
  }

  const chartSaved = Boolean(chart.chartProfileId);

  const requestReading = async (length: "short" | "standard" | "deep") => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiRequest<{ reading: any }>("/v1/reading/natal", {
        method: "POST",
        token: authToken,
        body: {
          chartJson: chart,
          brandId: brand.id,
          length,
          chartProfileId: chartSaved ? chart.chartProfileId : undefined,
          saveToFeed: Boolean(authToken && chartSaved)
        }
      });
      setReading(data.reading);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const generateShareCard = () => {
    if (!reading) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0e0d0c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 64px serif";
    ctx.fillText(brand.name, 80, 140);
    ctx.font = "400 36px sans-serif";
    ctx.fillText(reading.overview[0] ?? "Your chart at a glance", 80, 240);
    ctx.fillStyle = brand.tokens.accent;
    ctx.fillRect(80, 280, 240, 8);
    ctx.fillStyle = "#ffffff";
    ctx.font = "400 28px sans-serif";
    ctx.fillText("Shared from your natal reading", 80, 360);
    setShareCard(canvas.toDataURL("image/png"));
  };

  const requestHandbook = async () => {
    if (!authToken) { setError("Sign in to generate and save a life handbook."); return; }
    setLoading(true); setError(null);
    try {
      const created = await apiRequest<any>("/v1/report-runs", { method: "POST", token: authToken, body: { chartJson: chart, chartProfileId: chart.chartProfileId, brandId: brand.id, kind: "natal", depth: "handbook", idempotencyKey: crypto.randomUUID(), workflowVersion: "natal-report-v2" } });
      const result = await apiRequest<any>(`/v1/report-runs/${created.run.id}/execute`, { method: "POST", token: authToken });
      setReportArtifact(result.artifact);
    } catch (err: any) { setError(err.message ?? "Unable to generate the handbook."); } finally { setLoading(false); }
  };

  return (
    <PageShell>
      <Section title="Your Reading">
        <div className="astro-form-shell">
          <div className="astro-note-strip">
            <strong>Choose your depth</strong>
            <Text muted>{brandCopy.reading.intro}</Text>
          </div>

          <div className="astro-inline-meta">
            {chart.locationLabel ? <span className="astro-chip">{chart.locationLabel}</span> : null}
            {chart.meta?.timezone ? <span className="astro-chip">{chart.meta.timezone}</span> : null}
            {readerName ? <span className="astro-chip">Signed in as {readerName}</span> : null}
          </div>

          <div className="astro-reading-actions">
            <Button onClick={() => requestReading("short")} disabled={loading}>
              Quick
            </Button>
            <Button variant="ghost" onClick={() => requestReading("standard")} disabled={loading}>
              Standard
            </Button>
            <Button variant="ghost" onClick={() => requestReading("deep")} disabled={loading}>
              Deep Dive
            </Button>
            <Button variant="ghost" onClick={requestHandbook} disabled={loading}>Life Handbook</Button>
          </div>

          <div className="astro-note-strip">
            <strong>
              {chartSaved && authToken
                ? "This reading can be archived in your private grimoire."
                : "Create an account and save this chart to keep the reading and weekly updates together."}
            </strong>
            <Text muted>
              {chartSaved && authToken
                ? "Because this chart is already saved, new readings can attach to the same account history automatically."
                : "The account step turns one reading into an ongoing relationship: saved charts, a first report, and weekly follow-up writing."}
            </Text>
            {!chartSaved || !authToken ? (
              <Link href="/account" className="astro-button astro-button-ghost astro-button-block">
                Open Account
              </Link>
            ) : null}
          </div>

          {error ? <Text>{error}</Text> : null}

          {chartKeys.length > 0 ? (
            <div className="astro-compact-grid">
              {chartKeys.map((point: any) => (
                <Card key={point.key}>
                  <Heading level={3}>
                    {point.key === "Asc" ? "Rising" : point.key === "MC" ? "Midheaven" : point.key}
                  </Heading>
                  <Text muted>{formatChartKey(point)}</Text>
                </Card>
              ))}
            </div>
          ) : null}

          <details className="astro-details">
            <summary>What this reading covers</summary>
            <div className="astro-details-body">
              <ul className="astro-list">
                {brandCopy.reading.notes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      </Section>

      {reportArtifact ? <ReportAtlas artifact={reportArtifact} companion={authToken && chart.chartProfileId ? { token: authToken, chartProfileId: chart.chartProfileId, brandId: brand.id } : undefined} /> : reading ? (
        <Section>
          {reading.title ? <Heading level={2}>{reading.title}</Heading> : null}
          {reading.subtitle ? <Text muted>{reading.subtitle}</Text> : null}
          {reading.excerpt ? (
            <div className="astro-note-strip">
              <strong>At a glance</strong>
              <Text muted>{reading.excerpt}</Text>
            </div>
          ) : null}

          {reading.narrative?.length ? (
            <>
              <Heading level={2}>Narrative</Heading>
              <div className="astro-prose">
                {reading.narrative.map((paragraph: string, idx: number) => (
                  <Text key={idx}>{paragraph}</Text>
                ))}
              </div>
            </>
          ) : null}

          {reading.guideSections?.length ? (
            <>
              <Heading level={2}>Chart Teachings</Heading>
              <div className="astro-stack-tight">
                {reading.guideSections.map((section: any) => (
                  <Card key={section.title}>
                    <Heading level={3}>{section.title}</Heading>
                    <div className="astro-prose">
                      <Text>{section.chartInstruction}</Text>
                      <Text muted>{section.force}</Text>
                      <Text>{section.allegory}</Text>
                      <Text>{section.story}</Text>
                      <Text muted>{section.practicalCounsel}</Text>
                    </div>
                    {section.mysteryQuestion ? (
                      <div className="astro-note-strip">
                        <strong>{section.mysteryQuestion}</strong>
                      </div>
                    ) : null}
                  </Card>
                ))}
              </div>
            </>
          ) : null}

          <Heading level={2}>Overview</Heading>
          <ul className="astro-list">
            {reading.overview.map((line: string, idx: number) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>

          <Heading level={2}>Big Three</Heading>
          <div className="astro-compact-grid">
            <Card>
              <Heading level={3}>Sun</Heading>
              <Text muted>{reading.bigThree.sun}</Text>
            </Card>
            <Card>
              <Heading level={3}>Moon</Heading>
              <Text muted>{reading.bigThree.moon}</Text>
            </Card>
            {reading.bigThree.rising ? (
              <Card>
                <Heading level={3}>Rising</Heading>
                <Text muted>{reading.bigThree.rising}</Text>
              </Card>
            ) : reading.bigThree.presentation ? (
              <Card>
                <Heading level={3}>Presentation</Heading>
                <Text muted>{reading.bigThree.presentation}</Text>
              </Card>
            ) : null}
          </div>

          {reading.characterSheet ? (
            <details className="astro-details">
              <summary>Character sheet</summary>
              <div className="astro-details-body">
                <Card>
                  <Heading level={3}>{reading.characterSheet.title}</Heading>
                  <div className="astro-grid-tight">
                    <div>
                      <Text muted>Archetypes</Text>
                      <ul className="astro-list">
                        {reading.characterSheet.archetypes.map((item: string) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <Text muted>Strengths</Text>
                      <ul className="astro-list">
                        {reading.characterSheet.strengths.map((item: string) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <Text muted>Shadows</Text>
                      <ul className="astro-list">
                        {reading.characterSheet.shadows.map((item: string) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <Text muted>Path</Text>
                      <ul className="astro-list">
                        {reading.characterSheet.path.map((item: string) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <Text muted>{reading.characterSheet.motto}</Text>
                </Card>
              </div>
            </details>
          ) : null}

          <details className="astro-details">
            <summary>Planetary reading</summary>
            <div className="astro-details-body">
              <div className="astro-grid">
                {reading.planets.map((item: any) => (
                  <Card key={item.planet}>
                    <Heading level={3}>{item.planet}</Heading>
                    <Text muted>{item.text}</Text>
                  </Card>
                ))}
              </div>
            </div>
          </details>

          {reading.houses?.length ? (
            <details className="astro-details">
              <summary>House reading</summary>
              <div className="astro-details-body">
                <div className="astro-grid">
                  {reading.houses.map((item: any) => (
                    <Card key={item.house}>
                      <Heading level={3}>House {item.house}</Heading>
                      <Text muted>{item.text}</Text>
                    </Card>
                  ))}
                </div>
              </div>
            </details>
          ) : null}

          <details className="astro-details">
            <summary>Aspect reading</summary>
            <div className="astro-details-body">
              <div className="astro-grid">
                {reading.aspects.map((item: any) => (
                  <Card key={item.aspect}>
                    <Heading level={3}>{item.aspect}</Heading>
                    <Text muted>{item.text}</Text>
                  </Card>
                ))}
              </div>
            </div>
          </details>

          <details className="astro-details">
            <summary>Brand lens</summary>
            <div className="astro-details-body">
              <div className="astro-grid">
                {reading.brandLens.map((item: any) => (
                  <Card key={item.title}>
                    <Heading level={3}>{item.title}</Heading>
                    <Text muted>{item.text}</Text>
                  </Card>
                ))}
              </div>
            </div>
          </details>

          {reading.ritualCalendar?.length ? (
            <details className="astro-details">
              <summary>Ritual calendar</summary>
              <div className="astro-details-body">
                <div className="astro-grid">
                  {reading.ritualCalendar.map((item: any) => (
                    <Card key={`${item.date}-${item.title}`}>
                      <Heading level={3}>{item.title}</Heading>
                      <Text muted>{item.date}</Text>
                      <Text muted>{item.focus}</Text>
                      {item.transit ? <Text muted>{item.transit}</Text> : null}
                      <Text muted>{item.ritual}</Text>
                    </Card>
                  ))}
                </div>
              </div>
            </details>
          ) : null}

          <Heading level={2}>Rituals</Heading>
          <ul className="astro-list">
            {reading.actionables.map((line: string, idx: number) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>

          <Text muted>{reading.disclaimer}</Text>

          <div className="astro-hero-actions">
            <Button onClick={generateShareCard}>Generate Share Card</Button>
            {shareCard ? (
              <a
                href={shareCard}
                download={`${brand.id}-share.png`}
                className="astro-button astro-button-ghost astro-button-block"
              >
                Download
              </a>
            ) : null}
          </div>

          {shareCard ? (
            <Image
              src={shareCard}
              alt="Share card"
              width={1200}
              height={630}
              unoptimized
              style={{
                marginTop: "var(--space-md)",
                width: "100%",
                height: "auto",
                borderRadius: "var(--radius-md)"
              }}
            />
          ) : null}
        </Section>
      ) : (
        <Section>
          <Text muted>Generate a reading to reveal the full interpretation.</Text>
        </Section>
      )}
    </PageShell>
  );
}
