"use client";

import * as React from "react";
import { MessageList, type ChatMessage } from "@/components/chat/message-list";
import { Composer } from "@/components/chat/composer";
import { streamChat } from "@/lib/client/stream";

export function StarterChat() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const publicUserId = React.useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `public_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );

  const sendMessage = async (text: string) => {
    if (busy) return;
    setError(null);
    setBusy(true);

    const userMessage: ChatMessage = { role: "user", content: text };
    const assistantMessage: ChatMessage = { role: "assistant", content: "" };
    let assistantIndex = 0;

    setMessages((prev) => {
      assistantIndex = prev.length + 1;
      return [...prev, userMessage, assistantMessage];
    });

    const controller = new AbortController();

    try {
      await streamChat(
        { mode: "public", text, userId: publicUserId.current },
        (event) => {
          if (event.type === "token") {
            setMessages((prev) => {
              const next = [...prev];
              const current = next[assistantIndex];
              if (current) {
                next[assistantIndex] = {
                  ...current,
                  content: current.content + event.value
                };
              }
              return next;
            });
          }
          if (event.type === "final") {
            setMessages((prev) => {
              const next = [...prev];
              const current = next[assistantIndex];
              if (current && event.value) {
                next[assistantIndex] = {
                  ...current,
                  content: event.value
                };
              }
              return next;
            });
          }
          if (event.type === "error") {
            setError(event.message);
          }
          if (event.type === "notification") {
            setMessages((prev) => [...prev, { role: "system", content: event.message }]);
          }
        },
        controller.signal
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stream failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.4em] text-ink-400">Quick Session</div>
        <h2 className="mt-2 text-2xl font-semibold text-ink-50">
          Try the game coach before you enter the full studio.
        </h2>
        <p className="mt-2 text-sm text-ink-300">
          Uses guest access if enabled. Sign in to save ideas, upload inspiration, install build
          kits, and follow the parent-reviewed publish path.
        </p>
      </div>

      <div className="rounded-3xl border border-ink-800 bg-ink-900/50 p-6">
        {messages.length === 0 ? (
          <div className="text-sm text-ink-400">
            Start with a question or request. Responses stream in real time.
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-ember-500/40 bg-ember-500/10 px-4 py-3 text-sm text-ember-300">
          {error}
        </div>
      ) : null}

      <Composer
        onSend={sendMessage}
        disabled={busy}
        mode="Preview"
        contextHint="Guest mode only. Sign in to unlock saved projects, inspiration packs, and reusable build kits."
        suggestions={[
          "Pitch a kid-friendly obby with checkpoints, coins, and a funny guide character.",
          "Help me turn a pet adventure idea into scenes, quests, and starter scripts.",
          "What should a family game studio do to make Roblox building feel easy for kids?"
        ]}
      />
    </div>
  );
}
