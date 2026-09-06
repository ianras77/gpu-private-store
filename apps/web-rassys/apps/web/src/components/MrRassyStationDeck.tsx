"use client";

import Image from "next/image";
import Link from "next/link";
import { MessageCircle, Pause, Play, Radio, Send, Waves } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePersistentRadioPlayer } from "./PersistentRadioPlayerProvider";
import { createRadioChatRequestId, ensureRadioChatClientId } from "../lib/radio-chat";

export function MrRassyStationDeck({ compact = false }: { compact?: boolean }) {
  const { displayNow, playing, buffering, toggle } = usePersistentRadioPlayer();
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const clientIdRef = useRef<string | null>(null);
  useEffect(() => { clientIdRef.current = ensureRadioChatClientId(); }, []);
  const send = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setReply("");
    setStatus("Sending to the booth…");
    try {
      const clientId = clientIdRef.current ?? ensureRadioChatClientId();
      const requestId = createRadioChatRequestId();
      const response = await fetch("/api/radio/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, clientId, requestId }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "radio_unavailable");
      setReply(payload?.reply?.message ?? payload?.reply?.text ?? (payload?.pending ? "Mr Rassy heard you. He’s shaping a reply — stay on the line." : "Mr Rassy heard you."));
      setStatus(payload?.pending ? "The booth is thinking…" : "Back on the mic.");
      setMessage("");
    } catch { setStatus("The booth is temporarily off-air. Try again in a moment."); }
    finally { setSending(false); }
  };
  return <section className={`station-deck ${compact ? "station-deck-compact" : ""}`} aria-label="Mr Rassy live booth">
    <div className="station-deck-art">{displayNow?.albumArtUrl ? <Image src={displayNow.albumArtUrl} alt={displayNow.title ?? "Current artwork"} fill sizes={compact ? "180px" : "360px"} className="object-cover" unoptimized /> : <div className="station-art-placeholder"><Waves size={48} /></div>}<div className="station-art-overlay" /><div className="station-live-pill"><span className="glow-dot h-2 w-2 rounded-full" /> {buffering ? "CATCHING THE SIGNAL" : "ON AIR"}</div><div className="station-art-copy"><div className="eyebrow">Now in the room</div><div className="truncate text-xl font-semibold text-white">{displayNow?.title ?? "The next record is being cued"}</div><div className="truncate text-sm text-cloud/70">{displayNow?.artist ?? "Mr Rassy"}</div></div></div>
    <div className="station-deck-copy"><div className="eyebrow"><Radio size={13} className="mr-2 inline text-glow" /> Mr Rassy // live booth</div><h2 className="section-title mt-3 text-3xl sm:text-5xl">You’re in the station.</h2><p className="mt-3 text-sm leading-7 text-cloud/72">The music is here when you want it. The booth is listening either way.</p><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => void toggle()} className="inline-flex items-center gap-2 rounded-full bg-glow px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-black">{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? "Pause the line" : "Open the line"}</button><Link href="/mr-rassy/library" className="inline-flex items-center gap-2 rounded-full border border-white/12 px-5 py-3 text-xs uppercase tracking-[0.18em] text-white">Browse the stacks</Link></div><div className="mt-6 rounded-[22px] border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-cloud/55"><MessageCircle size={13} className="text-glow" /> Talk to the booth</div><div className="mt-3 flex gap-2"><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void send(); }} placeholder="Ask what Mr Rassy is hearing..." className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-cloud/40 focus:border-glow/60" aria-label="Talk to Mr Rassy" /><button type="button" onClick={() => void send()} disabled={sending || !message.trim()} className="rounded-full border border-glow/40 px-4 text-glow disabled:opacity-40" aria-label="Send message"><Send size={15} /></button></div>{reply && <div className="mt-3 text-sm leading-6 text-cloud/78">{reply}</div>}{status && <div className="mt-2 text-xs text-cloud/52" role="status">{status}</div>}</div></div>
  </section>;
}
