"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type Packet = { id: string; directive: string; sources: Array<{ id: string; title: string; url: string }>; weakEvidenceWarnings: string[] };

export default function AdminResearchPage() {
  const [directive, setDirective] = useState("Trump administration latest court ruling");
  const [packet, setPacket] = useState<Packet | null>(null);
  const [status, setStatus] = useState("");
  const run = async (event: FormEvent) => {
    event.preventDefault(); setStatus("Researching approved sources…"); setPacket(null);
    try {
      const response = await fetch("/api/mastra/research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ directive, maxSources: 10 }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Research failed");
      setPacket(result); setStatus(`Research packet ${result.id} complete.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Research failed"); }
  };
  return <section><p className="eyebrow">Mastra newsroom</p><h1>Research</h1><p>Run a bounded source-policy pass, inspect the packet, then move approved evidence into a report.</p><form onSubmit={run} className="stack-list"><label htmlFor="directive">Research directive</label><textarea id="directive" value={directive} onChange={(event) => setDirective(event.target.value)} rows={4} maxLength={4000} required /><button type="submit" className="admin-action">Run research</button></form><p role="status">{status}</p>{packet ? <div className="story-panel"><h2>{packet.sources.length} approved sources</h2>{packet.weakEvidenceWarnings.map((warning) => <p key={warning}>{warning}</p>)}<ol>{packet.sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ol><Link href="/admin/reports">Open reports</Link></div> : null}</section>;
}
