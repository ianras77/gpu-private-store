"use client";

import Image from "next/image";
import Link from "next/link";
import { Disc3, Heart, MessageCircle, Pause, Play, Radio, Send, Waves } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePersistentRadioPlayer } from "./PersistentRadioPlayerProvider";
import { createRadioChatRequestId, ensureRadioChatClientId } from "../lib/radio-chat";

export function MrRassyStationDeck({ compact = false }: { compact?: boolean }) {
  const { displayNow, playing, buffering, toggle } = usePersistentRadioPlayer();
  const trackMeta = [displayNow?.album, displayNow?.year ? String(displayNow.year) : null, displayNow?.genres?.slice(0, 2).join(" · ")].filter(Boolean).join("  /  ");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [lovedTrackId, setLovedTrackId] = useState<string | null>(null);
  const clientIdRef = useRef<string | null>(null);
  useEffect(() => { clientIdRef.current = ensureRadioChatClientId(); }, []);
  useEffect(() => {
    if (!pendingSince || !clientIdRef.current) return;
    const poll = async () => {
      try {
        const response = await fetch(`/api/radio/chat?clientId=${encodeURIComponent(clientIdRef.current!)}`);
        const payload = await response.json().catch(() => null);
        const messages = Array.isArray(payload?.messages) ? payload.messages : [];
        const answer = messages.find((item: { role?: string; createdAt?: number; text?: string }) =>
          item.role === "dj" && Number(item.createdAt) >= pendingSince,
        );
        if (answer?.text) {
          setReply(answer.text);
          setStatus("Back on the mic.");
          setPendingSince(null);
        }
      } catch {
        // The next interval will retry without interrupting the player.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => window.clearInterval(timer);
  }, [pendingSince]);
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
      if (payload?.pending) {
        const latestListener = Array.isArray(payload?.messages)
          ? payload.messages.filter((item: { role?: string }) => item.role === "listener").at(-1)
          : null;
        setPendingSince(Number(latestListener?.createdAt ?? Date.now()));
      }
      setMessage("");
    } catch { setStatus("The booth is temporarily off-air. Try again in a moment."); }
    finally { setSending(false); }
  };
  const loveTrack = async () => {
    if (!displayNow?.id || lovedTrackId === displayNow.id) return;
    try {
      const response = await fetch("/api/radio/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vote: "up", trackId: displayNow.id, title: displayNow.title, artist: displayNow.artist }) });
      if (response.ok) setLovedTrackId(displayNow.id);
    } catch {
      // Keep the control quiet if the feedback lane is temporarily unavailable.
    }
  };
  return <section className={`station-deck ${compact ? "station-deck-compact" : ""}`} aria-label={compact ? "Mr Rassy homepage radio player" : "Mr Rassy live booth"}>
    <div className="station-deck-art">{displayNow?.albumArtUrl ? <Image src={displayNow.albumArtUrl} alt={displayNow.title ?? "Current artwork"} fill sizes={compact ? "180px" : "360px"} className="object-cover" unoptimized /> : <div className="station-art-placeholder"><Waves size={48} /></div>}<div className="station-art-overlay" /><div className="station-live-pill"><span className="glow-dot h-2 w-2 rounded-full" /> {buffering ? "CATCHING THE SIGNAL" : "ON AIR"}</div><div className="station-art-copy"><div className="eyebrow">Now in the room</div><div className="truncate text-xl font-semibold text-white">{displayNow?.title ?? "The next record is being cued"}</div><div className="truncate text-sm text-cloud/70">{displayNow?.artist ?? "Mr Rassy"}</div></div></div>
    <div className="station-deck-copy"><div className="eyebrow"><Radio size={13} className="mr-2 inline text-glow" /> Mr Rassy // live booth</div><h2 className="section-title mt-3 text-3xl sm:text-5xl">You’re in the station.</h2><p className="mt-3 text-sm leading-7 text-cloud/72">The music is here when you want it. The booth is listening either way.</p><div className="mt-5 grid grid-cols-2 gap-2 rounded-[22px] border border-white/10 bg-black/20 p-3 text-xs text-cloud/70 sm:grid-cols-3"><div><span className="block text-[10px] uppercase tracking-[0.2em] text-cloud/45">Track</span><span className="mt-1 block truncate text-white">{displayNow?.title ?? "Cueing next"}</span></div><div><span className="block text-[10px] uppercase tracking-[0.2em] text-cloud/45">Artist</span><span className="mt-1 block truncate text-white">{displayNow?.artist ?? "Mr Rassy"}</span></div><div><span className="block text-[10px] uppercase tracking-[0.2em] text-cloud/45">Record</span><span className="mt-1 block truncate text-white">{trackMeta || "Live selection"}</span></div></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void toggle()} className="inline-flex items-center gap-2 rounded-full bg-glow px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-black">{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? "Pause the line" : "Open the line"}</button><button type="button" onClick={() => void loveTrack()} disabled={!displayNow?.id || lovedTrackId === displayNow.id} className="inline-flex items-center gap-2 rounded-full border border-sunrise/40 px-4 py-3 text-xs uppercase tracking-[0.16em] text-sunrise disabled:opacity-70"><Heart size={15} fill={lovedTrackId === displayNow?.id ? "currentColor" : "none"} />{lovedTrackId === displayNow?.id ? "Loved" : "Love this track"}</button><Link href="/mr-rassy/library" className="inline-flex items-center gap-2 rounded-full border border-white/12 px-5 py-3 text-xs uppercase tracking-[0.18em] text-white"><Disc3 size={15} /> Browse the stacks</Link></div><div className="mt-6 rounded-[22px] border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-cloud/55"><MessageCircle size={13} className="text-glow" /> Talk to the booth</div><div className="mt-3 flex gap-2"><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void send(); }} placeholder="Ask what Mr Rassy is hearing..." className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-cloud/40 focus:border-glow/60" aria-label="Talk to Mr Rassy" /><button type="button" onClick={() => void send()} disabled={sending || !message.trim()} className="rounded-full border border-glow/40 px-4 text-glow disabled:opacity-40" aria-label="Send message"><Send size={15} /></button></div>{reply && <div className="mt-3 text-sm leading-6 text-cloud/78">{reply}</div>}{status && <div className="mt-2 text-xs text-cloud/52" role="status">{status}</div>}</div></div>
  </section>;
}
