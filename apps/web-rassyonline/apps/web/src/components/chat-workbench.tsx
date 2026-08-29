"use client";

import { ChangeEvent, FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { applyLocalChatIntent, type WebSearchMode } from "@/lib/chat-intents";
import { parseMarkdownBlocks } from "@/lib/markdown";
import { getLaneDisplay } from "@/lib/chat-presentation";
import type { ChatMode } from "@/lib/rassymind";
import { detectThemeIntent, getTheme, THEME_PRESETS, type ThemeId } from "@/lib/theme";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  searched?: boolean;
  sources?: Array<{ title: string; url: string; snippet: string }>;
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
type ThreadSummary = { id: string; title: string; updatedAt: string };

export function ChatWorkbench({ modes, signedIn }: { modes: ChatMode[]; signedIn: boolean }) {
  const [mode, setMode] = useState(modes[0]?.id ?? "general");
  const [webSearch, setWebSearch] = useState<WebSearchMode>("auto");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "I’m Rassy — ready when you are. Ask naturally and I’ll take care of the rest. Turn on Search when freshness or sources matter."
    }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [documentNotice, setDocumentNotice] = useState<string | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>("aurora");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(modes[0]?.maxTokens ?? 2048);
  const [showTuning, setShowTuning] = useState(false);
  const [showReasoning, setShowReasoning] = useState(true);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activity, setActivity] = useState(0.16);
  const [activityKind, setActivityKind] = useState<"idle" | "thinking" | "searching" | "answering">("idle");
  const abortRef = useRef<AbortController | null>(null);

  const activeMode = useMemo(() => modes.find((item) => item.id === mode) ?? modes[0], [mode, modes]);
  const activeDocuments = documents.filter((document) => document.active && document.status === "ready");
  const activeTheme = getTheme(themeId);

  useEffect(() => {
    if (!signedIn) return;
    void refreshDocuments();
    void refreshThreads();
  }, [signedIn]);

  useEffect(() => {
    const stored = window.localStorage.getItem("rassy-online-theme");
    setThemeId(getTheme(stored).id);
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
    setThreadId(null);
    setMessages([{ role: "assistant", content: "I’m Rassy — ready when you are. Ask naturally and I’ll take care of the rest. Turn on Search when freshness or sources matter." }]);
  }

  async function openThread(id: string) {
    const response = await fetch(`/api/threads/${id}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { messages?: Array<{ role: "user" | "assistant" | "system"; content: string }> };
    setThreadId(id);
    setMessages((data.messages ?? []).filter((message) => message.role === "user" || message.role === "assistant").map((message) => ({ role: message.role as "user" | "assistant", content: message.content })));
  }

  async function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setUploading(true);

    try {
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
      setDocumentNotice(`${files.length} source${files.length === 1 ? "" : "s"} indexed, embedded, and ready for Knowledge mode.`);
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
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setSending(true);
    setActivity(0.72);
    setActivityKind(requestWebSearch === "on" || (requestWebSearch === "auto" && prompt.match(/\b(current|latest|search|web|source|today)\b/i)) ? "searching" : "thinking");

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          mode: requestMode,
          threadId,
          activeDocumentIds: activeDocuments.map((document) => document.id),
          webSearch: requestWebSearch,
          temperature,
          maxTokens,
          messages: nextMessages.map((message) => ({ role: message.role, content: message.content }))
        })
      });

      const nextThreadId = response.headers.get("x-thread-id");
      if (nextThreadId) setThreadId(nextThreadId);
      const searched = response.headers.get("x-rassy-web-search") === "used";
      let sources: ChatMessage["sources"];
      const encodedSources = response.headers.get("x-rassy-search-results");
      if (encodedSources) {
        try { sources = JSON.parse(decodeURIComponent(encodedSources)) as ChatMessage["sources"]; } catch { sources = undefined; }
      }

      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(text || "Chat request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamText = "";
      let reasoning = "";
      let inReasoning = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        streamText += chunk;
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
          copy[copy.length - 1] = { ...last, content: streamText, reasoning, searched, sources };
          return copy;
        });
        setActivity((value) => Math.min(1, value * 0.72 + Math.min(.3, chunk.length / 180)));
        setActivityKind(reasoning ? "thinking" : "answering");
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
      setActivity(0.24);
      setActivityKind("idle");
      if (signedIn) void refreshThreads();
      abortRef.current = null;
    }
  }

  return (
    <div className="rassy-chat-layout">
      {signedIn ? <aside className="chat-history" aria-label="Chat history"><div className="history-heading"><span>RASSY / HISTORY</span><button type="button" onClick={startNewThread}>New</button></div><div className="history-list">{threads.length ? threads.map((thread) => <button className={thread.id === threadId ? "history-item active" : "history-item"} key={thread.id} type="button" onClick={() => void openThread(thread.id)}>{thread.title}<small>{new Date(thread.updatedAt).toLocaleDateString()}</small></button>) : <p>No saved chats yet.</p>}</div></aside> : null}
      <section className="chat-workbench" aria-label="Rassy chat">
      <div className="routing-ribbon" aria-label="Rassy controls">
        <div className="lane-switcher autopilot-control" aria-label="Rassy automatic routing">
          <label className="preference-select">
              <select aria-label="Optional capability preference" value={mode} onChange={(event) => setMode(event.target.value as ChatMode["id"]) }>
              <option value="general">Let Rassy choose</option>
              {modes.filter((item) => item.id !== "general").map((item) => <option key={item.id} value={item.id}>{item.label} · {getLaneDisplay(item.id).capability}</option>)}
            </select>
          </label>
        </div>

        <div className="ribbon-tools">
          <div className="segmented-control" aria-label="Web search mode">
            {(["auto", "on", "off"] as WebSearchMode[]).map((item) => (
              <button className={webSearch === item ? "active" : ""} key={item} onClick={() => setWebSearch(item)} type="button">
                {item === "on" ? "search" : item === "off" ? "local" : "auto"}
              </button>
            ))}
          </div>

          <div className="theme-options" aria-label={`Atmosphere: ${activeTheme.label}`}>
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
          <button className={showTuning ? "tuning-toggle active" : "tuning-toggle"} type="button" onClick={() => setShowTuning((value) => !value)} aria-expanded={showTuning}>
            Tune <span>{showTuning ? "−" : "+"}</span>
          </button>
        </div>

        {showTuning ? (
          <div className="tuning-panel" aria-label="Rassy tuning controls">
            <label><span>Creativity <output>{temperature.toFixed(1)}</output></span><input type="range" min="0" max="1.5" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /><small>Precision ← · exploratory →</small></label>
            <label><span>Response budget <output>{maxTokens} tokens</output></span><input type="range" min="256" max="8192" step="256" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} /><small>{activeMode?.model} · {activeMode?.contextWindow}</small></label>
          </div>
        ) : null}

        <section className="memory-source-tray" aria-label="Document memory">
          <div className="memory-head">
            <p className="system-label">Sources</p>
            <strong>{signedIn ? `${activeDocuments.length} selected` : "sign in for durable memory"}</strong>
            {signedIn ? (
              <label className={uploading ? "upload-button disabled" : "upload-button"}>
                {uploading ? "Indexing" : "Upload"}
                <input type="file" multiple accept=".txt,.md,.markdown,.rst,.adoc,.json,.jsonl,.csv,.tsv,.log,.yaml,.yml,.toml,.ini,.conf,.env,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.hpp,.cs,.php,.sh,.bash,.zsh,.sql,.html,.css,.scss,.xml,.graphql,.proto,.dockerfile,text/*,application/json" onChange={uploadDocument} disabled={uploading} />
              </label>
            ) : null}
          </div>
          {documentNotice ? <p className="document-notice">{documentNotice}</p> : null}
          {signedIn ? (
            <div className="document-list memory-source-list">
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
          ) : null}
        </section>
      </div>

      <div className="transcript-shell">
        <Mindfield activity={activity} kind={activityKind} />
        <div className="message-list">
          {messages.map((message, index) => (
            <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
              <div className="message-meta"><span>{message.role === "user" ? "You" : "Rassy"}</span><div className="message-actions">{message.searched ? <span className="evidence-badge">WEB SOURCES</span> : null}{message.role === "assistant" && message.content ? <CopyButton text={message.content} label="Copy Markdown" /> : null}</div></div>
              {message.sources?.length ? <details className="search-sources"><summary>Search signal <span>{message.sources.length} sources · open evidence</span></summary><div>{message.sources.map((source, sourceIndex) => <a href={source.url} key={`${source.url}-${sourceIndex}`} target="_blank" rel="noreferrer"><strong>{sourceIndex + 1}. {source.title}</strong><small>{source.snippet || source.url}</small></a>)}</div></details> : null}
              {message.role === "assistant" && message.reasoning ? <details className="reasoning-panel" open={showReasoning}><summary onClick={(event) => { event.preventDefault(); setShowReasoning((value) => !value); }}>{showReasoning ? "Hide reasoning trace" : "Show reasoning trace"}<span>RASSYMIND / TRANSPARENT</span></summary><p>{message.reasoning.trim()}</p></details> : null}
              <MarkdownMessage content={message.content || (sending ? "..." : "")} />
            </article>
          ))}
        </div>
      </div>

      <form className="composer-preview live" onSubmit={sendMessage}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
              event.preventDefault();
              if (!sending && input.trim()) event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Message Rassy"
          aria-label="Message Rassy"
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
