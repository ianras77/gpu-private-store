"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import type { ChatMode, ChatModeId } from "@/lib/rassycodex";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
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
  const abortRef = useRef<AbortController | null>(null);

  const activeMode = useMemo(() => modes.find((item) => item.id === mode) ?? modes[0], [mode, modes]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || sending) return;

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
