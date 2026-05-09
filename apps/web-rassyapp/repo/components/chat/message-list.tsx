import * as React from "react";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  meta?: {
    why?: Record<string, unknown> | null;
  };
};

export function MessageList({
  messages,
  renderActions
}: {
  messages: ChatMessage[];
  renderActions?: (message: ChatMessage, index: number) => React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {messages.map((message, index) => (
        <div
          key={message.id ?? index}
          className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
        >
          <div
            className={cn(
              "max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-lg",
              message.role === "user"
                ? "bg-ink-50 text-ink-900"
                : message.role === "system"
                  ? "border border-ink-700 bg-ink-900/70 text-ink-200"
                  : "bg-ink-800 text-ink-100"
            )}
          >
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
            {message.meta?.why ? (
              <details className="mt-3 rounded-xl border border-ink-700 bg-ink-950/60 p-3 text-[11px] text-ink-200">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-ink-300">
                  Trace
                </summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink-200">
                  {JSON.stringify(message.meta.why, null, 2)}
                </pre>
              </details>
            ) : null}
            {renderActions ? renderActions(message, index) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
