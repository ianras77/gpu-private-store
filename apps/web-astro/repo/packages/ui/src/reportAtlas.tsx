"use client";

import React from "react";
import { Button, Card, Heading, Section, Text } from "./primitives";

type ReportSection = { key: string; title: string; body?: string[]; summary?: string; factRefs?: string[]; uncertaintyNotes?: string[]; status?: string };
type ReportArtifact = { cover?: { title?: string; subtitle?: string; excerpt?: string }; navigation?: Array<{ key: string; title: string }>; sections?: ReportSection[]; practicalIntegration?: { reflections?: string[]; practices?: string[]; questions?: string[] }; disclaimer?: string };

export const ReportAtlas: React.FC<{ artifact: ReportArtifact; companion?: { token: string; chartProfileId: string; brandId: string } }> = ({ artifact, companion }) => {
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState<string | null>(null);
  const [factRefs, setFactRefs] = React.useState<string[]>([]);
  const [companionLoading, setCompanionLoading] = React.useState(false);
  const [companionError, setCompanionError] = React.useState<string | null>(null);
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [memoryEnabled, setMemoryEnabled] = React.useState(true);
  const ask = async () => {
    if (!companion || !question.trim()) return;
    setCompanionLoading(true); setCompanionError(null);
    try {
      const headers = { "content-type": "application/json", authorization: `Bearer ${companion.token}` };
      let activeThreadId = threadId;
      if (!activeThreadId) {
        const threadResponse = await fetch("/v1/chart-companion/threads", { method: "POST", headers, body: JSON.stringify({ chartProfileId: companion.chartProfileId, brandId: companion.brandId, memoryEnabled }) });
        const thread = await threadResponse.json();
        if (!threadResponse.ok) throw new Error(thread.error ?? "Unable to open Chart Companion.");
        activeThreadId = thread.conversation.id; setThreadId(activeThreadId);
      }
      const response = await fetch(`/v1/chart-companion/threads/${activeThreadId}/messages`, { method: "POST", headers, body: JSON.stringify({ content: question.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Chart Companion is unavailable.");
      setAnswer(data.answer ?? ""); setFactRefs(data.factRefs ?? []); setQuestion("");
    } catch (error) { setCompanionError(error instanceof Error ? error.message : "Chart Companion is unavailable."); }
    finally { setCompanionLoading(false); }
  };
  const clearCompanion = async () => {
    if (!companion || !threadId) return;
    await fetch(`/v1/chart-companion/threads/${threadId}`, { method: "DELETE", headers: { authorization: `Bearer ${companion.token}` } });
    setThreadId(null); setAnswer(null); setFactRefs([]);
  };
  const toggleMemory = async () => {
    if (!companion || !threadId) { setMemoryEnabled(!memoryEnabled); return; }
    const enabled = !memoryEnabled;
    const response = await fetch(`/v1/chart-companion/threads/${threadId}/memory`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${companion.token}` }, body: JSON.stringify({ enabled }) });
    if (response.ok) setMemoryEnabled(enabled);
  };
  const sections = artifact.sections ?? [];
  return <div className="astro-report-atlas">
    <Section>
      <div className="astro-note-strip"><Text muted>{artifact.cover?.subtitle ?? "A grounded, sectioned astrology report"}</Text><Heading>{artifact.cover?.title ?? "Your Astrology Atlas"}</Heading><Text>{artifact.cover?.excerpt}</Text></div>
      {artifact.navigation?.length ? <nav aria-label="Report chapters" className="astro-details"><summary>Chapters</summary><ol className="astro-list">{artifact.navigation.map((item) => <li key={item.key}><a href={`#report-${item.key}`}>{item.title}</a></li>)}</ol></nav> : null}
    </Section>
    {sections.map((section) => <Section key={section.key}><article id={`report-${section.key}`}><Heading level={2}>{section.title}</Heading>{section.summary ? <Text muted>{section.summary}</Text> : null}<div className="astro-prose">{section.body?.map((paragraph, index) => <Text key={index}>{paragraph}</Text>)}</div>{section.uncertaintyNotes?.length ? <Card><Text muted>Uncertainty</Text><ul className="astro-list">{section.uncertaintyNotes.map((note) => <li key={note}>{note}</li>)}</ul></Card> : null}{section.factRefs?.length ? <Text muted>Grounded in {section.factRefs.length} chart facts · {section.status ?? "complete"}</Text> : null}</article></Section>)}
    {artifact.practicalIntegration ? <Section title="Practical integration"><div className="astro-grid">{[...(artifact.practicalIntegration.reflections ?? []), ...(artifact.practicalIntegration.practices ?? []), ...(artifact.practicalIntegration.questions ?? [])].map((item) => <Card key={item}><Text>{item}</Text></Card>)}</div></Section> : null}
    {companion ? <Section title="Ask Your Chart"><Text muted>Ask a follow-up grounded in this saved chart. The answer will cite the deterministic facts used.</Text><textarea aria-label="Ask Your Chart" value={question} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setQuestion(event.target.value)} placeholder="Why does this pattern matter?" rows={3} /><Button onClick={() => void ask()} disabled={companionLoading || !question.trim()}>{companionLoading ? "Consulting your chart…" : "Ask Your Chart"}</Button><div><Button variant="ghost" onClick={() => void toggleMemory()}>{memoryEnabled ? "Memory on" : "Memory off"}</Button>{threadId ? <Button variant="ghost" onClick={() => void clearCompanion()}>Clear conversation</Button> : null}</div>{companionError ? <Text muted>{companionError}</Text> : null}{answer ? <Card><Text>{answer}</Text>{factRefs.length ? <Text muted>Grounded in {factRefs.length} chart facts.</Text> : null}</Card> : null}</Section> : null}
    {artifact.disclaimer ? <Text muted>{artifact.disclaimer}</Text> : null}
  </div>;
};
