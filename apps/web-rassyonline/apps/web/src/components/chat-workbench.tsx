"use client";

import { ChangeEvent, FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { applyLocalChatIntent, type WebSearchMode } from "@/lib/chat-intents";
import { parseMarkdownBlocks } from "@/lib/markdown";
import { ServerEventParser, type ServerEvent } from "@/lib/sse";
import type { ChatMode } from "@/lib/rassymind";
import { detectThemeIntent, getTheme, type ThemeId } from "@/lib/theme";

type VisualArtifact = { kind: "dot-matrix" | "chart" | "ascii-art" | "calculator" | "math-lab"; title?: string; svg?: string; art?: string; width?: number; height?: number; type?: string; labels?: string[]; values?: number[]; series?: string; expression?: string; result?: number; status?: "ok" | "failed"; error?: string; mode?: string; graph?: { xMin: number; xMax: number; points: Array<{ x: number; y: number | null }> } };

const displayNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, useGrouping: true });

function sourceHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "source"; }
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  searched?: boolean;
  searchStatus?: "used" | "failed" | "empty" | "not-used";
  sources?: Array<{ title: string; url: string; snippet: string }>;
  citationStatus?: "verified" | "source-linked" | "unsupported" | "not-applicable";
  status?: "streaming" | "complete" | "truncated" | "interrupted" | "failed";
  artifacts?: VisualArtifact[];
};

type UserDocument = {
  id: string;
  title: string;
  filename: string;
  status: "pending" | "ready" | "failed";
  active: boolean;
  error: string | null;
  chunkCount: number;
};
type SessionDocument = { id: string; title: string; text: string; sizeBytes: number; truncated: boolean };
type ThreadSummary = { id: string; title: string; updatedAt: string };

const OPENING_LINES = ["Hi, I’m Rassy. What can I help with?"];

export function ChatWorkbench({ modes, signedIn, accountId }: { modes: ChatMode[]; signedIn: boolean; accountId?: string }) {
  const storageKey = (name: string) => `rassy-online:${accountId ?? "guest"}:${name}`;
  const [mode, setMode] = useState(modes.find((item) => item.id === "general")?.id ?? modes[0]?.id ?? "general");
  const [webSearch, setWebSearch] = useState<WebSearchMode>("auto");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: OPENING_LINES[0]
    }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [sessionDocuments, setSessionDocuments] = useState<SessionDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [documentNotice, setDocumentNotice] = useState<string | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>("aurora");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(modes[0]?.maxTokens ?? 2048);
  const [showTuning, setShowTuning] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activity, setActivity] = useState(0.16);
  const [activityKind, setActivityKind] = useState<"idle" | "thinking" | "searching" | "answering">("idle");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState("rassy");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBusy, setAudioBusy] = useState(false);
  const [speechPlaying, setSpeechPlaying] = useState(false);
  const [streamModel, setStreamModel] = useState("rassy-agent");
  const abortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const playbackUrlRef = useRef<string | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const requestSequenceRef = useRef(0);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const activeMode = useMemo(() => modes.find((item) => item.id === mode) ?? modes[0], [mode, modes]);
  const activeDocuments = documents.filter((document) => document.active && document.status === "ready");

  useEffect(() => {
    setMessages((current) => current.length === 1 && current[0]?.role === "assistant" ? [{ role: "assistant", content: OPENING_LINES[0] }] : current);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void refreshDocuments();
    void refreshThreads();
    const storedThread = window.localStorage.getItem(storageKey("thread-id"));
    if (storedThread) void openThread(storedThread);
  }, [signedIn]);

  useEffect(() => {
    const stored = window.localStorage.getItem("rassy-online-theme");
    setThemeId(getTheme(stored).id);
  }, []);

  useEffect(() => {
    if (signedIn) return;
    const storedThread = window.localStorage.getItem(storageKey("thread-id"));
    if (storedThread) setThreadId(storedThread);
    const storedMessages = window.localStorage.getItem(storageKey("transcript"));
    if (storedMessages) {
      try {
        const restored = JSON.parse(storedMessages) as ChatMessage[];
        if (Array.isArray(restored) && restored.length) setMessages(restored.slice(-60));
      } catch {
        window.localStorage.removeItem(storageKey("transcript"));
      }
    }
  }, []);

  useEffect(() => {
    if (signedIn || messages.length <= 1) return;
    const timer = window.setTimeout(() => window.localStorage.setItem(storageKey("transcript"), JSON.stringify(messages.slice(-60))), 500);
    return () => window.clearTimeout(timer);
  }, [messages, signedIn]);

  useEffect(() => {
    if (sending && stickToBottomRef.current && messageListRef.current) messageListRef.current.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "auto" });
  }, [messages, sending]);

  useEffect(() => {
    const storedDraft = window.localStorage.getItem(storageKey("draft"));
    if (storedDraft) setInput(storedDraft);
  }, []);

  useEffect(() => {
    if (input) window.localStorage.setItem(storageKey("draft"), input);
    else window.localStorage.removeItem(storageKey("draft"));
    const textarea = composerRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 72), 240)}px`;
    }
  }, [input]);

  useEffect(() => {
    if (!recording) { setRecordingSeconds(0); return; }
    const started = Date.now();
    const timer = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    playbackRef.current?.pause();
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.rassyTheme = themeId;
    window.localStorage.setItem("rassy-online-theme", themeId);
  }, [themeId]);

  useEffect(() => {
    setMaxTokens(activeMode?.maxTokens ?? 2048);
  }, [activeMode?.id, activeMode?.maxTokens]);

  async function refreshDocuments() {
    const response = await fetch("/api/documents", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { documents?: UserDocument[] };
    setDocuments(data.documents ?? []);
  }

  async function refreshThreads() {
    const response = await fetch("/api/threads", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { threads?: ThreadSummary[] };
    setThreads(data.threads ?? []);
  }

  function startNewThread() {
    requestSequenceRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setThreadId(null);
    window.localStorage.removeItem(storageKey("thread-id"));
    window.localStorage.removeItem(storageKey("transcript"));
    document.cookie = "rassy_online_thread=; Max-Age=0; Path=/; SameSite=Lax";
    setMessages([{ role: "assistant", content: OPENING_LINES[0] }]);
    setInput("");
  }

  async function openThread(id: string) {
    const sequence = ++requestSequenceRef.current;
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    const response = await fetch(`/api/threads/${id}`, { cache: "no-store" });
    if (!response.ok || sequence !== requestSequenceRef.current) return;
    const data = (await response.json()) as { messages?: Array<ChatMessage> };
    if (sequence !== requestSequenceRef.current) return;
    setThreadId(id);
    window.localStorage.setItem(storageKey("thread-id"), id);
    document.cookie = `rassy_online_thread=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax`;
    setMessages((data.messages ?? []).filter((message) => message.role === "user" || message.role === "assistant").map((message) => ({ ...message, role: message.role as "user" | "assistant" })));
  }

  async function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setUploading(true);

    let receivedComplete = false;
    try {
      if (!signedIn) {
        const next: SessionDocument[] = [];
        for (const file of files) {
          if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name}: guest files are limited to 5 MB`);
          const text = (await file.text()).replace(/\r\n/g, "\n").trim();
          if (!text) throw new Error(`${file.name}: the file is empty`);
          next.push({ id: `${file.name}-${file.lastModified}-${file.size}`, title: file.name, text: text.slice(0, 40_000), sizeBytes: file.size, truncated: text.length > 40_000 });
        }
        setSessionDocuments((current) => [...current, ...next].slice(-8));
        setDocumentNotice(`${next.length} file${next.length === 1 ? "" : "s"} ready for this session only${next.some((document) => document.truncated) ? " (content capped at 40,000 characters)" : ""}. Sign in to keep them.`);
        return;
      }
      let completed = 0;
      setDocumentNotice(`Reading ${files.length} source${files.length === 1 ? "" : "s"}…`);
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", file.name);
        const response = await fetch("/api/documents", { method: "POST", body: formData });
        const data = (await response.json().catch(() => ({}))) as { error?: string; document?: UserDocument };
        if (!response.ok) throw new Error(`${file.name}: ${data.error ?? "upload_failed"}`);
        completed += 1;
        setDocumentNotice(`Ingested ${completed}/${files.length} source${files.length === 1 ? "" : "s"} through rassy-embed.`);
      }
        setDocumentNotice(`${files.length} source${files.length === 1 ? "" : "s"} indexed, embedded, and ready for this working set.`);
      await refreshDocuments();
    } catch (error) {
      setDocumentNotice(error instanceof Error ? error.message : "Upload failed");
      await refreshDocuments();
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function toggleDocument(document: UserDocument) {
    const nextActive = !document.active;
    setDocuments((current) => current.map((item) => (item.id === document.id ? { ...item, active: nextActive } : item)));
    const response = await fetch(`/api/documents/${document.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: nextActive })
    });
    if (!response.ok) {
      setDocuments((current) => current.map((item) => (item.id === document.id ? { ...item, active: document.active } : item)));
      setDocumentNotice("Could not update document toggle.");
    }
  }

  async function removeDocument(document: UserDocument) {
    const response = await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
    if (!response.ok) { setDocumentNotice("Could not delete the document."); return; }
    setDocuments((current) => current.filter((item) => item.id !== document.id));
  }

  async function toggleRecording() {
    if (recording) { recorderRef.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setDocumentNotice("This browser does not support microphone recording."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data); };
      recorder.onerror = () => {
        if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false); setAudioBusy(false);
        setDocumentNotice("The microphone stopped before any audio was captured.");
      };
      recorder.onstop = async () => {
        if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false); setAudioBusy(true);
        try {
          const type = recorder.mimeType || "audio/webm";
          const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          const blob = new Blob(audioChunksRef.current, { type });
          if (!blob.size) throw new Error("No audio was captured. Hold the mic button while speaking, then stop.");
          if (blob.size > 25 * 1024 * 1024) throw new Error("Recording exceeds the 25 MB audio limit.");
          const form = new FormData(); form.append("file", blob, `rassy-recording.${extension}`);
          const response = await fetch("/api/audio/transcriptions", { method: "POST", body: form });
          const data = await response.json().catch(() => ({})) as { text?: string; error?: string };
          if (!response.ok || !data.text) throw new Error(data.error ?? "Transcription failed");
          setInput((current) => current ? `${current} ${data.text}` : data.text!);
        } catch (error) { setDocumentNotice(error instanceof Error ? error.message : "Transcription failed"); }
        finally { setAudioBusy(false); }
      };
      recorderRef.current = recorder; recorder.start(250); setRecording(true); setDocumentNotice("Listening… speak naturally, then press Stop mic.");
      recordingTimerRef.current = window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 120_000);
    } catch { setDocumentNotice("Microphone permission was not granted."); }
  }

  async function readAloud(text: string) {
    if (playbackRef.current) {
      playbackRef.current.pause();
      playbackRef.current = null;
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = null;
      setSpeechPlaying(false);
      return;
    }
    if (audioBusy || !text.trim()) return;
    setAudioBusy(true);
    try {
      const response = await fetch("/api/audio/speech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: text }) });
      if (!response.ok) throw new Error("Speech synthesis failed");
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      playbackRef.current = audio;
      playbackUrlRef.current = url;
      audio.onended = () => { if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current); playbackRef.current = null; playbackUrlRef.current = null; setSpeechPlaying(false); };
      await audio.play();
      setSpeechPlaying(true);
    } catch (error) {
      playbackRef.current?.pause();
      playbackRef.current = null;
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = null;
      setSpeechPlaying(false);
      setDocumentNotice(error instanceof Error ? error.message : "Speech synthesis failed");
    }
    finally { setAudioBusy(false); }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let prompt = input.trim();
    if (!prompt || sending) return;
    let intentNotice: ChatMessage | null = null;
    let requestWebSearch = webSearch;
    let requestMode = mode;

    const localIntent = applyLocalChatIntent(prompt);
    if (localIntent) {
      if (localIntent.updates.mode) {
        requestMode = localIntent.updates.mode;
        setMode(localIntent.updates.mode);
      }
      if (localIntent.updates.themeId) setThemeId(localIntent.updates.themeId);
      if (localIntent.updates.webSearch) {
        requestWebSearch = localIntent.updates.webSearch;
        setWebSearch(localIntent.updates.webSearch);
      }
      if (localIntent.kind === "local") {
        setMessages((current) => [...current, { role: "assistant", content: localIntent.notice }]);
        setInput("");
        return;
      }
      prompt = localIntent.prompt ?? prompt;
      intentNotice = { role: "assistant", content: localIntent.notice };
    }

    const requestedTheme = detectThemeIntent(prompt);
    if (requestedTheme) {
      setThemeId(requestedTheme);
    }

    const visibleMessages = intentNotice ? [...messages, intentNotice] : messages;
    const nextMessages = [...visibleMessages, { role: "user" as const, content: prompt }];
    const requestSequence = ++requestSequenceRef.current;
    stickToBottomRef.current = true;
    setShowJump(false);
    setMessages([...nextMessages, { role: "assistant", content: "", status: "streaming" }]);
    setInput("");
    setSending(true);
    setActivity(0.72);
    setActivityKind("thinking");
    setActiveTool(null);

    const abort = new AbortController();
    abortRef.current = abort;
    let receivedComplete = false;
    let terminalStatus: "complete" | "truncated" = "complete";
    let partialText = "";

    try {
      const mastraThreadId = threadId ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rassy-${Date.now()}`);
      if (!threadId) setThreadId(mastraThreadId);
      window.localStorage.setItem(storageKey("thread-id"), mastraThreadId);
      document.cookie = `rassy_online_thread=${encodeURIComponent(mastraThreadId)}; Max-Age=31536000; Path=/; SameSite=Lax`;
      const response = await fetch("/api/mastra/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          agent: "rassy",
          mode: requestMode,
          threadId: mastraThreadId,
          activeDocumentIds: activeDocuments.map((document) => document.id),
          sessionDocuments: sessionDocuments.map(({ title, text }) => ({ title, text })),
          webSearch: requestWebSearch,
          temperature,
          maxTokens,
          messages: nextMessages.map((message) => ({ role: message.role, content: message.content }))
        })
      });

      const nextThreadId = response.headers.get("x-rassy-thread-id") ?? response.headers.get("x-thread-id");
      if (nextThreadId) setThreadId(nextThreadId);
      setActiveAgent(response.headers.get("x-rassy-agent") ?? "rassy");
      setStreamModel(response.headers.get("x-rassy-model") ?? "rassy-agent");
      let searched = false;
      let searchStatus: ChatMessage["searchStatus"] = "not-used";
      let sources: ChatMessage["sources"] = [];
      let citationStatus: ChatMessage["citationStatus"] = "not-applicable";

      if (!response.ok || !response.body) {
        const text = await response.text();
        if (response.status === 429) throw new Error("RassyMind is busy. Try again in a moment.");
        throw new Error(text || "RassyMind could not answer this request.");
      }

      const reader = response.body.getReader();
      const parser = new ServerEventParser();
      let streamText = "";
      let reasoning = "";
      let inReasoning = false;
      const processRecord = ({ event, data: raw }: ServerEvent) => {
        const data = JSON.parse(raw) as { delta?: string; status?: ChatMessage["searchStatus"]; results?: ChatMessage["sources"]; tool?: string; message?: string; retryable?: boolean; citationStatus?: ChatMessage["citationStatus"]; artifact?: VisualArtifact; kind?: string };
        if (event === "activity" && data.tool) { setActiveTool(data.tool); if (data.tool === "web-search" || data.tool === "parallel-research") { searched = true; setActivityKind("searching"); } else setActivityKind("thinking"); }
        if (event === "search") { searched = true; searchStatus = data.status ?? "empty"; sources = data.results ?? []; setActivityKind("thinking"); }
        if (event === "artifact" && data.results?.length) sources = data.results;
        if (event === "artifact" && data.artifact?.kind) {
          const artifact = data.artifact;
          setMessages((current) => current.map((message, messageIndex) => messageIndex === current.length - 1 ? { ...message, artifacts: [...(message.artifacts ?? []), artifact] } : message));
        }
        if (event === "complete" || event === "truncated") { citationStatus = data.citationStatus; terminalStatus = event; receivedComplete = true; }
        if (event === "citation-warning") citationStatus = "unsupported";
        if (event === "text" && data.delta) streamText += data.delta;
        if (event === "text" && data.delta) partialText += data.delta;
        if (event === "reasoning" && data.delta) reasoning += data.delta;
        if (event === "error") throw new Error(data.message ?? "RassyMind stream failed");
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (requestSequence !== requestSequenceRef.current) return;
        for (const record of parser.feed(value)) processRecord(record);
        const reasoningStart = streamText.indexOf("<think>");
        if (reasoningStart >= 0) {
          const reasoningEnd = streamText.indexOf("</think>", reasoningStart + 7);
          if (reasoningEnd >= 0) {
            reasoning += streamText.slice(reasoningStart + 7, reasoningEnd);
            streamText = streamText.slice(0, reasoningStart) + streamText.slice(reasoningEnd + 8);
          } else {
            reasoning += streamText.slice(reasoningStart + 7);
            streamText = streamText.slice(0, reasoningStart);
            inReasoning = true;
          }
        } else if (inReasoning) {
          const reasoningEnd = streamText.indexOf("</think>");
          if (reasoningEnd >= 0) {
            reasoning += streamText.slice(0, reasoningEnd);
            streamText = streamText.slice(reasoningEnd + 8);
            inReasoning = false;
          } else {
            reasoning += streamText;
            streamText = "";
          }
        }
        setMessages((current) => {
          const copy = [...current];
          const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: streamText, reasoning, searched, searchStatus, sources, citationStatus, status: "streaming" };
          return copy;
        });
        setActivity((current) => Math.min(1, current * 0.72 + Math.min(.3, value.length / 180)));
        setActivityKind(reasoning ? "thinking" : "answering");
      }
      for (const record of parser.finish()) processRecord(record);
      if (!receivedComplete) throw new Error("RassyMind stream ended before completion; the response may be incomplete.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (requestSequence === requestSequenceRef.current) {
          setMessages((current) => {
            const copy = [...current];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") copy[copy.length - 1] = { ...last, status: "interrupted", content: last.content || "Response stopped." };
            return copy;
          });
        }
        return;
      }
      const message = error instanceof Error ? error.message : "Chat request failed";
      if (requestSequence !== requestSequenceRef.current) return;
      setMessages((current) => {
        const copy = [...current];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, role: "assistant", content: partialText ? `${partialText}\n\nResponse interrupted: ${message}` : message, status: "failed" };
        return copy;
      });
    } finally {
      if (requestSequence !== requestSequenceRef.current) return;
      setMessages((current) => {
        const copy = [...current];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant" && last.status === "streaming" && receivedComplete) copy[copy.length - 1] = { ...last, status: terminalStatus };
        return copy;
      });
      setSending(false);
      setActivity(0.24);
      setActivityKind("idle");
      setActiveTool(null);
      if (signedIn) void refreshThreads();
      abortRef.current = null;
    }
  }

  return (
    <div className="rassy-chat-layout">
      {signedIn ? <aside className="chat-history" aria-label="Chat history"><div className="history-heading"><span>Chats</span><button type="button" onClick={startNewThread}>New</button></div><div className="history-list">{threads.length ? threads.map((thread) => <button className={thread.id === threadId ? "history-item active" : "history-item"} key={thread.id} type="button" onClick={() => void openThread(thread.id)}>{thread.title}<small>{new Date(thread.updatedAt).toLocaleDateString()}</small></button>) : <p>No saved chats yet.</p>}</div></aside> : null}
      <section className="chat-workbench" aria-label="Rassy chat">
      <div className="routing-ribbon" aria-label="Rassy controls">
        <div className="lane-switcher autopilot-control" aria-label="Rassy focus">
          <div className="focus-control" role="group" aria-label="Choose response focus">
            {([["general", "Chat"], ["knowledge", "Documents"], ["deep-coding", "Code"]] as const).map(([value, label]) => (
              <button className={mode === value ? "active" : ""} key={value} type="button" onClick={() => setMode(value)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="ribbon-tools">
          <label className="web-control">Web
            <select value={webSearch} onChange={(event) => setWebSearch(event.target.value as WebSearchMode)} aria-label="Web search policy">
              <option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option>
            </select>
          </label>
          <button className={showTuning ? "tuning-toggle active" : "tuning-toggle"} type="button" onClick={() => setShowTuning((value) => !value)} aria-expanded={showTuning}>
            Settings <span>{showTuning ? "−" : "+"}</span>
          </button>
          {!signedIn ? <button className="tuning-toggle" type="button" onClick={startNewThread}>New chat</button> : null}
        </div>

        {showTuning ? (
          <div className="tuning-panel" aria-label="Rassy tuning controls">
            <label><span>Creativity <output>{temperature.toFixed(1)}</output></span><input type="range" min="0" max="1.5" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /><small>Precision ← · exploratory →</small></label>
            <label><span>Response budget <output>{maxTokens} tokens</output></span><input type="range" min="256" max="8192" step="256" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} /><small>{activeMode?.contextWindow}</small></label>
          </div>
        ) : null}

        <details className="memory-source-tray" aria-label="Document memory">
          <summary>Files{signedIn ? activeDocuments.length ? ` · ${activeDocuments.length} selected` : "" : sessionDocuments.length ? ` · ${sessionDocuments.length} attached` : ""}</summary>
          <div className="memory-head">
            <p className="system-label">Sources</p>
            <strong>{signedIn ? `${activeDocuments.length} stored sources` : `${sessionDocuments.length} session files`}</strong>
            {
              <label className={uploading ? "upload-button disabled" : "upload-button"}>
                <span aria-hidden="true">↑</span> {uploading ? "Indexing" : "Add sources"}
                <input type="file" multiple accept=".txt,.md,.markdown,.rst,.adoc,.json,.jsonl,.csv,.tsv,.log,.yaml,.yml,.toml,.ini,.conf,.env,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.hpp,.cs,.php,.sh,.bash,.zsh,.sql,.html,.css,.scss,.xml,.graphql,.proto,.dockerfile,text/*,application/json" onChange={uploadDocument} disabled={uploading} />
              </label>
            }
          </div>
          {documentNotice ? <p className="document-notice">{documentNotice}</p> : null}
          {signedIn ? (
            <div className="document-list memory-source-list">
              {documents.map((document) => (
                <div className="document-entry" key={document.id}><button
                  className={document.active ? "document-pill active" : "document-pill"}
                  disabled={document.status !== "ready"}
                  onClick={() => toggleDocument(document)}
                  type="button"
                >
                  <span>{document.title}</span>
                  <small>{document.status === "ready" ? `${document.chunkCount} chunks` : document.error ?? document.status}</small>
                </button><button className="document-remove" type="button" onClick={() => void removeDocument(document)} aria-label={`Delete ${document.title}`}>Remove</button></div>
              ))}
            </div>
          ) : sessionDocuments.length ? <div className="document-list memory-source-list">{sessionDocuments.map((document) => <div className="document-entry" key={document.id}><div className="document-pill active session-document"><span>{document.title}</span><small>session only · {Math.ceil(document.sizeBytes / 1024)} KB{document.truncated ? " · truncated" : ""}</small></div><button className="document-remove" type="button" onClick={() => setSessionDocuments((current) => current.filter((item) => item.id !== document.id))} aria-label={`Remove ${document.title}`}>Remove</button></div>)}</div> : <p className="document-notice">Files stay in this browser session until you sign in.</p>}
        </details>
      </div>

      <div className="transcript-shell">
        {sending ? <div className="desk-signal" aria-live="polite"><span className="desk-signal-pulse" /><strong>{activityKind === "searching" ? "Searching the web…" : "Rassy is working…"}</strong></div> : null}
        <div className="message-list" ref={messageListRef} onScroll={(event) => {
          const element = event.currentTarget;
          const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
          stickToBottomRef.current = nearBottom;
          setShowJump(!nearBottom);
        }}>
          {messages.map((message, index) => (
            <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
              <div className="message-meta"><div className="message-actions">{message.status === "interrupted" ? <span className="search-warning">Stopped</span> : message.status === "failed" ? <span className="search-warning">Failed</span> : message.status === "truncated" ? <span className="search-warning">Stopped at response limit</span> : null}{message.searchStatus === "used" ? <span className="evidence-badge">Searched</span> : message.searchStatus === "failed" ? <span className="search-warning">Search failed</span> : message.searchStatus === "empty" ? <span className="search-warning">No usable results</span> : null}{message.citationStatus === "unsupported" ? <span className="search-warning">Citation review needed</span> : message.citationStatus === "source-linked" ? <span className="evidence-badge">Sources linked</span> : message.citationStatus === "verified" ? <span className="evidence-badge">Citations checked</span> : null}{message.role === "assistant" && message.content ? <><CopyButton text={message.content} label="Copy" /><button className="copy-button" type="button" onClick={() => void readAloud(message.content)} disabled={audioBusy}>{speechPlaying ? "■ Stop audio" : "▶ Listen"}</button></> : null}</div></div>
              {message.sources?.length ? <details className="search-sources"><summary><span className="search-sources-label"><i aria-hidden="true">✦</i> Search signal</span><span>{message.sources.length} sources · open evidence</span></summary><div>{message.sources.map((source, sourceIndex) => <a href={source.url} key={`${source.url}-${sourceIndex}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${source.title} from ${sourceHost(source.url)}`}><strong><em>{String(sourceIndex + 1).padStart(2, "0")}</em> {source.title}</strong><small><b>{sourceHost(source.url)}</b>{source.snippet ? ` · ${source.snippet}` : ""}</small></a>)}</div></details> : null}
              {message.role === "assistant" && message.reasoning ? <details className="reasoning-panel" open={showReasoning}><summary onClick={(event) => { event.preventDefault(); setShowReasoning((value) => !value); }}>{showReasoning ? "Hide details" : "Show details"}</summary><p>{message.reasoning.trim()}</p></details> : null}
              {message.artifacts?.map((artifact, artifactIndex) => <ArtifactView artifact={artifact} key={`${artifact.kind}-${artifactIndex}`} />)}
              {message.role === "assistant" && !message.content && sending ? <ThinkingState /> : <MarkdownMessage content={message.content || ""} />}
            </article>
          ))}
        </div>
        {showJump ? <button className="jump-latest" type="button" onClick={() => { messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" }); stickToBottomRef.current = true; setShowJump(false); }}>Jump to latest</button> : null}
      </div>

      <form className="composer-preview live" onSubmit={sendMessage}>
        <textarea
          ref={composerRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
              event.preventDefault();
              if (!sending && input.trim()) event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Talk to Rassy… (Shift + Enter for a new line)"
          aria-label="Message Rassy"
          rows={1}
        />
        <button type="button" className={recording ? "recording voice-button" : "voice-button"} onClick={() => void toggleRecording()} disabled={audioBusy} aria-label={recording ? "Stop recording" : "Dictate message"}>{recording ? `Stop ${recordingSeconds}s` : audioBusy ? "Transcribing…" : "Voice"}</button>
        {sending ? <button type="button" onClick={() => abortRef.current?.abort()}>Stop</button> : null}
        {!sending ? <button type="submit">Send</button> : null}
      </form>

      </section>
    </div>
  );
}

function Mindfield({ activity, kind }: { activity: number; kind: "idle" | "thinking" | "searching" | "answering" }) {
  return (
    <div className={`mindfield mindfield-${kind}`} style={{ "--activity": activity } as React.CSSProperties} aria-label={`Rassy activity: ${kind}`} role="img">
      <svg className="mindfield-art" viewBox="0 0 1200 64" preserveAspectRatio="none" aria-hidden="true">
        <path className="trace trace-a" d="M0 34h92l20-2 18-20 15 40 18-29 14 11h100l20-2 18-20 15 40 18-29 14 11h100l20-2 18-20 15 40 18-29 14 11h100l20-2 18-20 15 40 18-29 14 11h100l20-2 18-20 15 40 18-29 14 11h100l20-2 18-20 15 40 18-29 14 11h140" />
        <path className="trace trace-b" d="M0 32h130l16 7 16-10 18 3h110l18 11 18-24 18 28 18-12h112l16 7 16-10 18 3h110l18 11 18-24 18 28 18-12h112l16 7 16-10 18 3h110l18 11 18-24 18 28 18-12h120" />
        <path className="trace trace-c" d="M0 32h1200" />
        <circle className="trace-node node-a" cx="270" cy="23" r="2" />
        <circle className="trace-node node-b" cx="706" cy="41" r="2" />
        <circle className="trace-node node-c" cx="1032" cy="25" r="2" />
      </svg>
    </div>
  );
}

function ThinkingState() {
  return (
    <div className="thinking-state" role="status" aria-label="Rassy is thinking">
      <span className="thinking-orbit" aria-hidden="true"><i /><i /><i /></span>
      <span>Rassy is thinking</span>
    </div>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);
  return (
    <div className="markdown-body">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Heading = (`h${block.depth + 2}` as "h3" | "h4" | "h5");
          return <Heading key={index}>{renderInline(block.text)}</Heading>;
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={index}>
              {block.items.map((item) => (
                <li key={item}>{renderInline(item)}</li>
              ))}
            </List>
          );
        }
        if (block.type === "quote") {
          return <blockquote key={index}>{renderInline(block.text)}</blockquote>;
        }
        if (block.type === "rule") return <hr key={index} />;
        if (block.type === "image") return <figure className="markdown-figure" key={index}><img src={block.url} alt={block.alt || ""} loading="lazy" /><figcaption>{block.alt}</figcaption></figure>;
        if (block.type === "callout") return <aside className={`markdown-callout ${block.tone}`} key={index}><strong>{block.tone}</strong><div>{renderInline(block.text)}</div></aside>;
        if (block.type === "table") {
          return (
            <div className="markdown-table-wrap" key={index}>
              <table>
                <thead>
                  <tr>
                    {block.headers.map((header) => (
                      <th key={header}>{renderInline(header)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${cell}-${cellIndex}`}>{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === "code") {
          return <CodeBlock key={index} language={block.language} text={block.text} />;
        }
        return <p key={index}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return <button className="copy-button" type="button" onClick={() => { void copyText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1400); }); }}>{copied ? "Copied" : label}</button>;
}

function CodeBlock({ language, text }: { language: string | null; text: string }) {
  return <div className="code-block"><div className="code-toolbar"><span>{language ?? "code"}</span><CopyButton text={text} label="Copy code" /></div><pre><code>{text}</code></pre></div>;
}

function ArtifactView({ artifact }: { artifact: VisualArtifact }) {
  if ((artifact.kind === "dot-matrix" || artifact.kind === "math-lab") && artifact.svg) {
    const svg = sanitizeArtifactSvg(artifact.svg);
    if (!svg) return <ArtifactFallback label="This visual artifact could not be safely rendered." />;
    return <figure className={`visual-artifact ${artifact.kind === "math-lab" ? "math-lab-artifact" : "dot-matrix-artifact"}`}><div dangerouslySetInnerHTML={{ __html: svg }} /><figcaption>{artifact.title ?? (artifact.kind === "math-lab" ? "Math Lab" : "Dot-matrix artwork")} · {artifact.width ?? 500} × {artifact.height ?? 500}px{artifact.mode ? ` · ${artifact.mode}` : ""}</figcaption></figure>;
  }
  if (artifact.kind === "ascii-art" && artifact.art) return <figure className="visual-artifact ascii-artifact"><pre>{artifact.art}</pre><figcaption>{artifact.title ?? "ASCII artwork"}</figcaption></figure>;
  if (artifact.kind === "chart" && artifact.labels && artifact.values) {
    if (artifact.type !== "bar") return <ArtifactFallback label={`${artifact.type ?? "This"} chart rendering is not available yet.`} />;
    const scale = Math.max(1, ...artifact.values.map((value) => Math.abs(value)));
    return <figure className="visual-artifact chart-artifact"><div className="chart-bars signed">{artifact.labels.map((label, index) => {
      const value = artifact.values?.[index] ?? 0;
      return <div className="chart-bar" key={`${label}-${index}`}><div className="chart-positive">{value > 0 ? <span style={{ height: `${value / scale * 100}%` }} /> : null}</div><div className="chart-negative">{value < 0 ? <span style={{ height: `${-value / scale * 100}%` }} /> : value === 0 ? <i aria-label="zero value" /> : null}</div><b>{label}</b><small>{displayNumber.format(value)}</small></div>;
    })}</div><figcaption>{artifact.title ?? "Chart"} · {artifact.series ?? "Value"}</figcaption></figure>;
  }
  if (artifact.kind === "calculator") return <section className={`visual-artifact calculator-artifact ${artifact.status === "failed" ? "failed" : ""}`}><header><span>RASSY GRAPHICS CALCULATOR</span><b>RUN / 01</b></header><div className="calculator-expression"><code>{artifact.expression}</code><span>=</span><strong>{artifact.status === "ok" ? artifact.result : "Unable to calculate"}</strong></div>{artifact.graph ? <CalculatorGraph graph={artifact.graph} /> : null}{artifact.error ? <p>{artifact.error}</p> : null}<small>Calculator · verified result{artifact.graph ? " · graph sampled from expression" : ""}</small></section>;
  return null;
}

function sanitizeArtifactSvg(input: string): string | null {
  if (input.length > 220_000 || typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") return null;
  const parsed = new DOMParser().parseFromString(input, "image/svg+xml");
  if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") return null;
  const namespace = "http://www.w3.org/2000/svg";
  const allowedTags = new Set(["svg", "g", "rect", "circle", "line", "path", "polyline", "polygon", "text", "title"]);
  const allowedAttributes = new Set(["width", "height", "viewBox", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "fill", "stroke", "stroke-width", "opacity", "text-anchor", "role", "aria-label", "class"]);
  const safeValue = (name: string, value: string) => {
    if (name === "aria-label") return value.length <= 160;
    if (name === "role") return value === "img";
    if (name === "class") return /^[a-z-]{1,30}$/.test(value);
    if (name === "fill" || name === "stroke") return /^(?:none|white|black|#[0-9a-f]{3,8})$/i.test(value);
    if (name === "text-anchor") return /^(?:start|middle|end)$/.test(value);
    return value.length <= 20_000 && /^[0-9eE+.,%\s\-a-zA-Z]*$/.test(value);
  };
  const clean = parsed.implementation.createDocument(namespace, "svg", null);
  const copy = (source: Element, target: Element, depth: number): void => {
    if (depth > 16) return;
    for (const attribute of Array.from(source.attributes)) {
      if (allowedAttributes.has(attribute.name) && safeValue(attribute.name, attribute.value)) target.setAttribute(attribute.name, attribute.value);
    }
    if (source.localName === "text" || source.localName === "title") target.textContent = source.textContent?.slice(0, 1000) ?? "";
    for (const child of Array.from(source.children)) {
      if (child.namespaceURI !== namespace || !allowedTags.has(child.localName)) continue;
      const next = clean.createElementNS(namespace, child.localName);
      copy(child, next, depth + 1);
      target.appendChild(next);
    }
  };
  copy(parsed.documentElement, clean.documentElement, 0);
  return new XMLSerializer().serializeToString(clean);
}

function ArtifactFallback({ label }: { label: string }) {
  return <div className="visual-artifact artifact-fallback" role="status">{label}</div>;
}

function CalculatorGraph({ graph }: { graph: NonNullable<VisualArtifact["graph"]> }) {
  const valid = graph.points.filter((point) => point.y !== null);
  if (!valid.length) return null;
  const minY = Math.min(...valid.map((point) => point.y as number), -1);
  const maxY = Math.max(...valid.map((point) => point.y as number), 1);
  const rangeY = maxY - minY || 1;
  const segments: string[] = [];
  let current: string[] = [];
  for (const point of graph.points) {
    if (point.y === null) { if (current.length) segments.push(current.join(" ")); current = []; continue; }
    current.push(`${((point.x - graph.xMin) / (graph.xMax - graph.xMin) * 100).toFixed(2)},${(100 - ((point.y - minY) / rangeY * 100)).toFixed(2)}`);
  }
  if (current.length) segments.push(current.join(" "));
  const zeroX = graph.xMin <= 0 && graph.xMax >= 0 ? ((-graph.xMin) / (graph.xMax - graph.xMin) * 100) : null;
  const zeroY = minY <= 0 && maxY >= 0 ? (100 - ((0 - minY) / rangeY * 100)) : null;
  return <div className="calculator-graph"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Graph of calculator expression"><path className="graph-grid" d="M0 25H100M0 50H100M0 75H100M25 0V100M50 0V100M75 0V100" />{zeroX !== null ? <path className="graph-axis" d={`M${zeroX} 0V100`} /> : null}{zeroY !== null ? <path className="graph-axis" d={`M0 ${zeroY}H100`} /> : null}{segments.map((points, index) => <polyline className="graph-line" points={points} key={index} />)}</svg><div className="graph-labels"><span>{graph.xMin}</span><span>0</span><span>{graph.xMax}</span></div></div>;
}

function renderInline(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)]+\))/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${token}-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("~~")) {
      nodes.push(<del key={`${token}-${match.index}`}>{token.slice(2, -2)}</del>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={`${token}-${match.index}`}>{token.slice(1, -1)}</code>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      nodes.push(
        <a key={`${token}-${match.index}`} href={link?.[2] ?? "#"} target="_blank" rel="noreferrer noopener">
          {link?.[1] ?? token}
        </a>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
