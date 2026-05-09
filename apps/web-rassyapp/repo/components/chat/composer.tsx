"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Composer({
  onSend,
  disabled,
  placeholder,
  mode = "Ask",
  contextHint,
  suggestions = []
}: {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  mode?: string;
  contextHint?: string;
  suggestions?: string[];
}) {
  const [text, setText] = React.useState("");

  const submit = React.useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }, [onSend, text]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="rounded-3xl border border-ink-800 bg-ink-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-full border border-glow-500/30 bg-glow-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-glow-300">
          {mode}
        </div>
        <div className="text-xs text-ink-400">
          {contextHint ?? "Workspace context will be attached automatically."}
        </div>
      </div>

      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? "Send a message."}
        className="mt-3 min-h-[110px] border-none bg-transparent focus:ring-0"
        disabled={disabled}
      />

      {suggestions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setText(suggestion)}
              className="rounded-full border border-ink-700 bg-ink-950/70 px-3 py-1.5 text-xs text-ink-300 transition hover:border-ink-500 hover:text-ink-100"
              disabled={disabled}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-ink-400">
          Shift + Enter for new line. Enter sends the current instruction.
        </div>
        <Button variant="glow" size="sm" onClick={submit} disabled={disabled}>
          Send
        </Button>
      </div>
    </div>
  );
}
