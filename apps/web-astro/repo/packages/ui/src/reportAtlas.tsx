"use client";

import React from "react";
import { Button, Card, Heading, Section, Text } from "./primitives";

type ReportSection = { key: string; title: string; body?: string[]; summary?: string; factRefs?: string[]; uncertaintyNotes?: string[]; status?: string };
type ReportArtifact = { cover?: { title?: string; subtitle?: string; excerpt?: string }; navigation?: Array<{ key: string; title: string }>; sections?: ReportSection[]; practicalIntegration?: { reflections?: string[]; practices?: string[]; questions?: string[] }; disclaimer?: string };
type CompanionMessage = { id: string; role: "user" | "assistant"; content: string; createdAt?: string; factRefs?: string[] };
type CompanionProps = { token: string; chartProfileId: string; brandId: string };

const suggestions = ["What is the main pattern in my chart?", "Help me understand one point of tension.", "What can I reflect on this week?"];

export const ChartCompanion: React.FC<CompanionProps> = ({ token, chartProfileId, brandId }) => {
  const [question, setQuestion] = React.useState("");
  const [turns, setTurns] = React.useState<CompanionMessage[]>([]);
  const turnsRef = React.useRef<CompanionMessage[]>([]);
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [memoryEnabled, setMemoryEnabled] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [loadingThread, setLoadingThread] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastTrace, setLastTrace] = React.useState<{ tools: string[]; mode: string; memoryUsed: boolean; factCount: number } | null>(null);

  const requestHeaders = React.useMemo(() => ({ "content-type": "application/json", authorization: `Bearer ${token}`, "X-Brand-Id": brandId }), [token, brandId]);
  const replaceTurns = (next: CompanionMessage[]) => {
    turnsRef.current = next;
    setTurns(next);
  };

  React.useEffect(() => {
    const controller = new AbortController();
    const hydrate = async () => {
      setLoadingThread(true);
      setError(null);
      try {
        const response = await fetch("/api/v1/chart-companion/threads", { headers: requestHeaders, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to open your chart conversation.");
        const existing = (data.conversations ?? []).find((item: any) => item.chartProfileId === chartProfileId && item.brandId === brandId);
        if (!existing) return;
        const detailResponse = await fetch(`/api/v1/chart-companion/threads/${existing.id}`, { headers: requestHeaders, signal: controller.signal });
        const detail = await detailResponse.json();
        if (!detailResponse.ok) throw new Error(detail.error ?? "Unable to restore your chart conversation.");
        setThreadId(existing.id);
        setMemoryEnabled(Boolean(detail.conversation.memoryEnabled));
        replaceTurns(detail.conversation.messages ?? []);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to open your chart conversation.");
      } finally {
        if (!controller.signal.aborted) setLoadingThread(false);
      }
    };
    void hydrate();
    return () => controller.abort();
  }, [requestHeaders, chartProfileId, brandId]);

  const ask = async (value = question) => {
    const content = value.trim();
    if (!content || loading || loadingThread) return;
    setQuestion("");
    setError(null);
    setLoading(true);
    const userTurnId = `local-${Date.now()}`;
    replaceTurns([...turnsRef.current, { id: userTurnId, role: "user", content }]);
    try {
      let activeThreadId = threadId;
      if (!activeThreadId) {
        const threadResponse = await fetch("/api/v1/chart-companion/threads", { method: "POST", headers: requestHeaders, body: JSON.stringify({ chartProfileId, brandId, memoryEnabled }) });
        const thread = await threadResponse.json();
        if (!threadResponse.ok) throw new Error(thread.error ?? "Unable to open Chart Companion.");
        activeThreadId = thread.conversation.id;
        setThreadId(activeThreadId);
      }
      const response = await fetch(`/api/v1/chart-companion/threads/${activeThreadId}/messages`, { method: "POST", headers: requestHeaders, body: JSON.stringify({ content }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Chart Companion is unavailable.");
      replaceTurns([...turnsRef.current.filter((turn) => turn.id !== userTurnId), { id: userTurnId, role: "user", content }, { id: `reply-${Date.now()}`, role: "assistant", content: data.answer ?? "", factRefs: data.factRefs ?? [] }]);
      setLastTrace({ tools: data.metadata?.tools ?? [], mode: data.metadata?.mode ?? "model", memoryUsed: Boolean(data.metadata?.memoryUsed), factCount: data.factRefs?.length ?? 0 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chart Companion is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  const toggleMemory = async () => {
    const enabled = !memoryEnabled;
    if (!threadId) {
      setMemoryEnabled(enabled);
      if (!enabled) replaceTurns([]);
      return;
    }
    setError(null);
    try {
      const response = await fetch(`/api/v1/chart-companion/threads/${threadId}/memory`, { method: "PATCH", headers: requestHeaders, body: JSON.stringify({ enabled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update conversation memory.");
      setMemoryEnabled(enabled);
      if (!enabled) replaceTurns([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update conversation memory.");
    }
  };

  const clearConversation = async () => {
    if (!threadId) return;
    setError(null);
    try {
      const response = await fetch(`/api/v1/chart-companion/threads/${threadId}`, { method: "DELETE", headers: requestHeaders });
      if (!response.ok) throw new Error("Could not clear this conversation.");
      setThreadId(null);
      replaceTurns([]);
      setLastTrace(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not clear this conversation.");
    }
  };

  return <section className="chart-companion" aria-labelledby="chart-companion-title">
    <div className="companion-heading">
      <div><p className="experience-eyebrow">A conversation with your chart</p><h2 id="chart-companion-title" className="astro-heading astro-heading-2">Ask what you really want to know.</h2><Text muted>Mastra selects the relevant chart facts, then your companion interprets them with care.</Text></div>
      <span className="companion-live-mark"><i /> PRIVATE SESSION</span>
    </div>
    <div className="companion-tools" aria-label="What the companion can do"><span><b>01</b> Retrieve chart facts</span><span><b>02</b> Keep your thread in context</span><span><b>03</b> Cite what it used</span></div>
    {loadingThread ? <p className="companion-status" role="status">Opening your private chart thread…</p> : null}
    {turns.length ? <div className="companion-transcript" aria-live="polite">{turns.map((turn) => <article className={`companion-message companion-message-${turn.role}`} key={turn.id}><span>{turn.role === "user" ? "YOU" : "YOUR CHART"}</span><p>{turn.content}</p>{turn.role === "assistant" && turn.factRefs?.length ? <small>Grounded in {turn.factRefs.length} chart facts</small> : null}</article>)}</div> : <div className="companion-empty"><span className="companion-orbit" aria-hidden="true">✳</span><p>Start anywhere. Ask about a placement, a repeating pattern, or what feels difficult to put into words.</p></div>}
    <div className="companion-suggestions">{suggestions.map((item) => <button key={item} type="button" onClick={() => setQuestion(item)} disabled={loading || loadingThread}>{item}</button>)}</div>
    <form className="companion-composer" onSubmit={(event: { preventDefault: () => void }) => { event.preventDefault(); void ask(); }}>
      <label className="visually-hidden" htmlFor="companion-question">Your question</label>
      <textarea id="companion-question" value={question} onChange={(event: { target: { value: string } }) => setQuestion(event.target.value)} onKeyDown={(event: { key: string; shiftKey: boolean; preventDefault: () => void }) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); } }} placeholder="Tell me what you’re wondering about…" rows={2} maxLength={8_000} />
      <Button type="submit" disabled={loading || loadingThread || !question.trim()}>{loading ? "Reading the pattern…" : "Ask"}</Button>
    </form>
    <div className="companion-footnote"><p>{memoryEnabled ? "Private memory is on. Recent turns in this chart thread help your companion follow what matters to you." : "Private memory is off. This thread will not be stored or used as context next time."}</p><div><button type="button" onClick={() => void toggleMemory()} disabled={loading}>{memoryEnabled ? "Turn memory off" : "Turn memory on"}</button>{threadId ? <button type="button" onClick={() => void clearConversation()} disabled={loading}>Clear thread</button> : null}</div></div>
    {lastTrace ? <p className="companion-provenance">{lastTrace.tools.length ? `Tool used: ${lastTrace.tools.join(", ")}` : "Chart facts retrieved"}{lastTrace.factCount ? ` · ${lastTrace.factCount} facts cited` : ""}{lastTrace.memoryUsed ? " · recent context used" : ""}{lastTrace.mode === "grounded-fallback" ? " · grounded fallback" : ""}</p> : null}
    {error ? <p className="companion-error" role="alert">{error}</p> : null}
  </section>;
};

export const ReportAtlas: React.FC<{ artifact: ReportArtifact; companion?: CompanionProps }> = ({ artifact, companion }) => {
  const sections = artifact.sections ?? [];
  return <div className="astro-report-atlas">
    <Section>
      <div className="report-cover"><p className="experience-eyebrow">Your personal field guide</p><Text muted>{artifact.cover?.subtitle ?? "A grounded, sectioned astrology report"}</Text><Heading>{artifact.cover?.title ?? "Your Astrology Atlas"}</Heading><Text>{artifact.cover?.excerpt}</Text></div>
      {artifact.navigation?.length ? <nav aria-label="Report chapters" className="report-contents"><span>IN THIS READING</span><ol>{artifact.navigation.map((item, index) => <li key={item.key}><a href={`#report-${item.key}`}><small>{String(index + 1).padStart(2, "0")}</small>{item.title}<b>↗</b></a></li>)}</ol></nav> : null}
    </Section>
    {sections.map((section, index) => <Section key={section.key}><article id={`report-${section.key}`} className="report-chapter"><p className="experience-eyebrow">CHAPTER {String(index + 1).padStart(2, "0")}{section.status === "fallback" ? " · GROUNDED SUMMARY" : ""}</p><Heading level={2}>{section.title}</Heading>{section.summary ? <Text muted>{section.summary}</Text> : null}<div className="astro-prose">{section.body?.map((paragraph, paragraphIndex) => <Text key={paragraphIndex}>{paragraph}</Text>)}</div>{section.uncertaintyNotes?.length ? <Card><Text muted>Where the chart is uncertain</Text><ul className="astro-list">{section.uncertaintyNotes.map((note) => <li key={note}>{note}</li>)}</ul></Card> : null}{section.factRefs?.length ? <p className="report-citation">Built from {section.factRefs.length} chart facts · {section.status ?? "complete"}</p> : null}</article></Section>)}
    {artifact.practicalIntegration ? <Section title="Bring it into your life"><div className="astro-grid">{[...(artifact.practicalIntegration.reflections ?? []), ...(artifact.practicalIntegration.practices ?? []), ...(artifact.practicalIntegration.questions ?? [])].map((item) => <Card key={item}><Text>{item}</Text></Card>)}</div></Section> : null}
    {companion ? <ChartCompanion {...companion} /> : null}
    {artifact.disclaimer ? <Text muted>{artifact.disclaimer}</Text> : null}
  </div>;
};
