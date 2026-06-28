"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMode, ChatModeId } from "@/lib/rassycodex";
import { detectThemeIntent, getTheme, THEME_PRESETS, type ThemeId } from "@/lib/theme";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
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

export function ChatWorkbench({ modes, signedIn }: { modes: ChatMode[]; signedIn: boolean }) {
  const [mode, setMode] = useState(modes[0]?.id ?? "general");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Rassy Online is awake. Pick a mode, ask a question, and I will route it through RassyCodex."
    }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [documentNotice, setDocumentNotice] = useState<string | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>("aurora");
  const abortRef = useRef<AbortController | null>(null);

  const activeMode = useMemo(() => modes.find((item) => item.id === mode) ?? modes[0], [mode, modes]);
  const activeDocuments = documents.filter((document) => document.active && document.status === "ready");
  const activeTheme = getTheme(themeId);

  useEffect(() => {
    if (!signedIn) return;
    void refreshDocuments();
  }, [signedIn]);

  useEffect(() => {
    const stored = window.localStorage.getItem("rassy-online-theme");
    setThemeId(getTheme(stored).id);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.rassyTheme = themeId;
    window.localStorage.setItem("rassy-online-theme", themeId);
  }, [themeId]);

  async function refreshDocuments() {
    const response = await fetch("/api/documents", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { documents?: UserDocument[] };
    setDocuments(data.documents ?? []);
  }

  async function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setDocumentNotice("Indexing document...");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name);

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "upload_failed");
      setDocumentNotice("Document indexed and ready.");
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

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || sending) return;
    const requestedTheme = detectThemeIntent(prompt);
    if (requestedTheme) {
      setThemeId(requestedTheme);
    }

    const nextMessages = [...messages, { role: "user" as const, content: prompt }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setSending(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: abort.signal,
          body: JSON.stringify({
            mode,
            threadId,
            activeDocumentIds: activeDocuments.map((document) => document.id),
            messages: nextMessages.map((message) => ({ role: message.role, content: message.content }))
          })
      });

      const nextThreadId = response.headers.get("x-thread-id");
      if (nextThreadId) setThreadId(nextThreadId);

      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(text || "Chat request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((current) => {
          const copy = [...current];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, content: last.content + chunk };
          return copy;
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat request failed";
      setMessages((current) => {
        const copy = [...current];
        copy[copy.length - 1] = { role: "assistant", content: message };
        return copy;
      });
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  return (
    <section className="chat-workbench" aria-label="RassyCodex chat">
      <div className="chat-toolbar">
        <div>
          <p className="system-label">Active Mode</p>
          <h2>{activeMode?.label ?? "General"}</h2>
          <p>{activeMode?.description}</p>
        </div>
        <label>
          Mode
          <select value={mode} onChange={(event) => setMode(event.target.value as ChatModeId)}>
            {modes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} - {item.model}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="theme-tray" aria-label="Theme controls">
        <div>
          <p className="system-label">Atmosphere</p>
          <h2>{activeTheme.label}</h2>
        </div>
        <div className="theme-options">
          {THEME_PRESETS.map((theme) => (
            <button
              className={theme.id === themeId ? "theme-swatch active" : "theme-swatch"}
              data-theme-swatch={theme.id}
              key={theme.id}
              onClick={() => setThemeId(theme.id)}
              type="button"
            >
              <span />
              {theme.label}
            </button>
          ))}
        </div>
      </section>

      <section className="document-tray" aria-label="Document memory">
        <div className="document-tray-header">
          <div>
            <p className="system-label">Document Charms</p>
            <h2>{signedIn ? `${activeDocuments.length} active` : "Sign in to save knowledge"}</h2>
          </div>
          {signedIn ? (
            <label className={uploading ? "upload-button disabled" : "upload-button"}>
              {uploading ? "Indexing" : "Upload"}
              <input type="file" accept=".txt,.md,.markdown,.json,.csv,.log,.yaml,.yml,text/*,application/json" onChange={uploadDocument} disabled={uploading} />
            </label>
          ) : null}
        </div>
        {documentNotice ? <p className="document-notice">{documentNotice}</p> : null}
        {signedIn ? (
          <div className="document-list">
            {documents.length === 0 ? <p className="empty-documents">No documents yet.</p> : null}
            {documents.map((document) => (
              <button
                className={document.active ? "document-pill active" : "document-pill"}
                disabled={document.status !== "ready"}
                key={document.id}
                onClick={() => toggleDocument(document)}
                type="button"
              >
                <span>{document.title}</span>
                <small>
                  {document.status === "ready" ? `${document.chunkCount} chunks` : document.error ?? document.status}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-documents">Anonymous chats stay ephemeral. Accounts unlock durable document memory.</p>
        )}
      </section>

      <div className="message-list">
        {messages.map((message, index) => (
          <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
            <span>{message.role === "user" ? "You" : "RassyCodex"}</span>
            <p>{message.content || (sending ? "..." : "")}</p>
          </article>
        ))}
      </div>

      <form className="composer-preview live" onSubmit={sendMessage}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask RassyCodex anything..."
          aria-label="Message"
        />
        {sending ? (
          <button type="button" onClick={() => abortRef.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>

      <div className="persistence-note">
        {signedIn ? "Signed in: this thread can be saved." : "Anonymous: this chat is local to this browser session."}
      </div>
    </section>
  );
}
