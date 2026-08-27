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
    label: "Ask",
    prompt: "Help me think through "
  },
  {
    label: "Search",
    prompt: "/search find current sources and summarize what matters for "
  },
  {
    label: "Code",
    prompt: "/code draft the smallest safe patch for: "
  },
  {
    label: "Memory",
    prompt: "/know compare this against my active documents: "
  },
  {
    label: "Tune",
    prompt: "Make the room feel more aurora while we work on "
  }
];

export function ChatWorkbench({ modes, signedIn }: { modes: ChatMode[]; signedIn: boolean }) {
  const [mode, setMode] = useState(modes[0]?.id ?? "general");
  const [webSearch, setWebSearch] = useState<WebSearchMode>("auto");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "RassyMind is ready. Choose a channel, bring your documents if you are signed in, and start the thread."
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
  const abortRef = useRef<AbortController | null>(null);

  const activeMode = useMemo(() => modes.find((item) => item.id === mode) ?? modes[0], [mode, modes]);
  const activeLane = getLaneDisplay(mode);
  const activeDocuments = documents.filter((document) => document.active && document.status === "ready");
  const activeTheme = getTheme(themeId);
  const webSearchLabel = webSearch === "on" ? "web search on" : webSearch === "off" ? "local only" : "web search auto";

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

  useEffect(() => {
    setMaxTokens(activeMode?.maxTokens ?? 2048);
  }, [activeMode?.id, activeMode?.maxTokens]);

  async function refreshDocuments() {
    const response = await fetch("/api/documents", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { documents?: UserDocument[] };
    setDocuments(data.documents ?? []);
  }

  async function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setUploading(true);

    try {
      setDocumentNotice(`Indexing ${files.length} source${files.length === 1 ? "" : "s"} through rassy-embed...`);
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", file.name);
        const response = await fetch("/api/documents", { method: "POST", body: formData });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(`${file.name}: ${data.error ?? "upload_failed"}`);
      }
      setDocumentNotice(`${files.length} source${files.length === 1 ? "" : "s"} indexed and ready.`);
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
    <section className="chat-workbench" aria-label="RassyMind chat">
      <div className="routing-ribbon" aria-label="RassyMind controls">
        <div className="lane-switcher" aria-label="RassyMind channel">
          {modes.map((item) => (
            <button className={item.id === mode ? "lane-button active" : "lane-button"} key={item.id} onClick={() => setMode(item.id)} type="button">
              <span>{getLaneDisplay(item.id).glyph}</span>
              <strong>{item.label}</strong>
            </button>
          ))}
        </div>

        <div className="route-status" aria-label="Active RassyMind channel">
          <span>{activeLane.glyph}</span>
          <div>
            <strong>{activeMode?.model ?? "rassy-mind"}</strong>
            <small>{activeLane.capability} · {sending ? "streaming" : "ready"}</small>
          </div>
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
          <div className="tuning-panel" aria-label="RassyMind tuning controls">
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
              {documents.length === 0 ? <p className="empty-documents">No sources loaded. Upload notes, specs, logs, or research.</p> : null}
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
            <p className="empty-documents">This is a live anonymous thread. Sign in to add your own document memory.</p>
          )}
        </section>
      </div>

      <div className="transcript-shell">
        <div className="route-readout" aria-label="Active RassyMind channel">
          <div>
            <span>{activeLane.glyph}</span>
            <strong>{activeMode?.model ?? "rassy-mind"}</strong>
          </div>
          <p>{webSearchLabel}</p>
          <p>{activeDocuments.length ? `${activeDocuments.length} memory sources` : "thread memory off"}</p>
          <p>{sending ? "streaming" : "ready"}</p>
        </div>

        <div className="message-list">
          {messages.map((message, index) => (
            <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
              <div className="message-meta"><span>{message.role === "user" ? "You" : "RassyMind"}</span>{message.role === "assistant" && message.content ? <CopyButton text={message.content} label="Copy Markdown" /> : null}</div>
              <MarkdownMessage content={message.content || (sending ? "..." : "")} />
            </article>
          ))}
        </div>
      </div>

      <form className="composer-preview live" onSubmit={sendMessage}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Start the thread. /code, /fast, /know, /search, /local..."
          aria-label="Message RassyMind"
          rows={1}
        />
        <div className="prompt-runes" aria-label="Prompt shortcuts">
          {PROMPT_RUNES.map((rune) => (
            <button key={rune.label} onClick={() => setInput(rune.prompt)} type="button">
              {rune.label}
            </button>
          ))}
        </div>
        {sending ? (
          <button type="button" onClick={() => abortRef.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>

      <div className="persistence-note">
        {signedIn ? "Signed in. This thread can become part of your workspace." : "Anonymous session. The room is live, but memory becomes durable after login."}
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
          return <CodeBlock key={index} language={block.language} text={block.text} />;
        }
        return <p key={index}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return <button className="copy-button" type="button" onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1400); }); }}>{copied ? "Copied" : label}</button>;
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
