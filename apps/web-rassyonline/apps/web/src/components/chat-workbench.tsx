"use client";

import { ChangeEvent, FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { applyLocalChatIntent, type WebSearchMode } from "@/lib/chat-intents";
import { parseMarkdownBlocks } from "@/lib/markdown";
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

const PROMPT_RUNES = [
  {
    label: "Research",
    prompt: "/search find current sources and summarize what matters for "
  },
  {
    label: "Code Lane",
    prompt: "/code"
  },
  {
    label: "Patch",
    prompt: "/code\nDraft the smallest safe patch for: "
  },
  {
    label: "Trace",
    prompt: "/local trace the source-to-sink path for: "
  }
];

const MODE_GLYPHS: Record<ChatModeId, string> = {
  general: "ASK",
  "deep-coding": "CODE",
  "fast-coding": "FAST",
  quick: "SNAP",
  knowledge: "KNOW"
};

export function ChatWorkbench({ modes, signedIn }: { modes: ChatMode[]; signedIn: boolean }) {
  const [mode, setMode] = useState(modes[0]?.id ?? "general");
  const [webSearch, setWebSearch] = useState<WebSearchMode>("auto");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "RassyCodex is listening.\n\nPick a lane, ask for a patch, trace a system, or light up web search. I will keep the model route visible so you always know what kind of mind you are invoking."
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
  const webSearchLabel = webSearch === "on" ? "web lit" : webSearch === "off" ? "local only" : "auto web";

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
    let prompt = input.trim();
    if (!prompt || sending) return;
    let intentNotice: ChatMessage | null = null;
    let requestWebSearch = webSearch;

    const localIntent = applyLocalChatIntent(prompt);
    if (localIntent) {
      if (localIntent.updates.mode) setMode(localIntent.updates.mode);
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
          webSearch: requestWebSearch,
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
      <aside className="ritual-rail" aria-label="Rassy controls">
        <div className="focus-orb" aria-label={`Current routing is ${webSearchLabel}`}>
          <span>{webSearch === "off" ? "local" : webSearch}</span>
          <strong>{webSearchLabel}</strong>
        </div>

        <div className="rail-card primary">
          <p className="system-label">Mode</p>
          <h2>{activeMode?.label ?? "General"}</h2>
          <p>{activeMode?.description}</p>
          <select value={mode} onChange={(event) => setMode(event.target.value as ChatModeId)} aria-label="Mode">
            {modes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} - {item.model}
              </option>
            ))}
          </select>
        </div>

        <div className="lane-deck" aria-label="RassyCodex lane deck">
          {modes.map((item) => (
            <button className={item.id === mode ? "lane-card active" : "lane-card"} key={item.id} onClick={() => setMode(item.id)} type="button">
              <span>{MODE_GLYPHS[item.id]}</span>
              <strong>{item.label}</strong>
              <small>{item.model}</small>
            </button>
          ))}
        </div>

        <div className="rail-card">
          <p className="system-label">Web</p>
          <div className="segmented-control" aria-label="Web search mode">
            {(["auto", "on", "off"] as WebSearchMode[]).map((item) => (
              <button className={webSearch === item ? "active" : ""} key={item} onClick={() => setWebSearch(item)} type="button">
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="rail-card">
          <p className="system-label">Atmosphere</p>
          <h2>{activeTheme.label}</h2>
          <div className="theme-options">
            {THEME_PRESETS.map((theme) => (
              <button
                aria-label={theme.label}
                className={theme.id === themeId ? "theme-swatch active" : "theme-swatch"}
                data-theme-swatch={theme.id}
                key={theme.id}
                onClick={() => setThemeId(theme.id)}
                type="button"
              >
                <span />
              </button>
            ))}
          </div>
        </div>

        <section className="rail-card document-tray" aria-label="Document memory">
          <div className="document-tray-header">
            <div>
              <p className="system-label">Memory</p>
              <h2>{signedIn ? `${activeDocuments.length} active` : "Ephemeral"}</h2>
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
                  <small>{document.status === "ready" ? `${document.chunkCount} chunks` : document.error ?? document.status}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-documents">Sign in when you want durable document memory.</p>
          )}
        </section>
      </aside>

      <div className="transcript-shell">
        <div className="route-readout" aria-label="Active RassyCodex route">
          <div>
            <span>{MODE_GLYPHS[mode]}</span>
            <strong>{activeMode?.model ?? "rassy-general"}</strong>
          </div>
          <p>{webSearchLabel}</p>
          <p>{activeDocuments.length ? `${activeDocuments.length} memory charms` : "no memory charms"}</p>
          <p>{sending ? "streaming" : "ready"}</p>
        </div>

        <div className="message-list">
          {messages.map((message, index) => (
            <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
              <span>{message.role === "user" ? "You" : "RassyCodex"}</span>
              <MarkdownMessage content={message.content || (sending ? "..." : "")} />
            </article>
          ))}
        </div>
      </div>

      <form className="composer-preview live" onSubmit={sendMessage}>
        <div className="prompt-runes" aria-label="Prompt shortcuts">
          {PROMPT_RUNES.map((rune) => (
            <button key={rune.label} onClick={() => setInput(rune.prompt)} type="button">
              {rune.label}
            </button>
          ))}
        </div>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Try /code patch this, /search current docs, /know compare notes, or ask naturally..."
          aria-label="Message"
          rows={1}
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
        {signedIn ? "Signed in. Threads can persist." : "Anonymous session. Nothing durable unless you log in."}
      </div>
    </section>
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
          return (
            <pre key={index}>
              <code>{block.text}</code>
            </pre>
          );
        }
        return <p key={index}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${token}-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={`${token}-${match.index}`}>{token.slice(1, -1)}</code>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      nodes.push(
        <a key={`${token}-${match.index}`} href={link?.[2] ?? "#"} target="_blank" rel="noreferrer">
          {link?.[1] ?? token}
        </a>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
