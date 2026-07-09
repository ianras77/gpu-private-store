"use client";

import React, { useMemo, useState } from "react";
import type { BrandConfig, BrandCopy } from "@astro/brands";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type ChatUi = {
  mood: "wonder" | "clarity" | "devotion" | "discipline" | "revelation";
  palette: "dawn" | "ember" | "nocturne" | "verdant" | "gold";
  motion: "still" | "pulse" | "orbit";
  density: "focused" | "layered" | "deep";
  activeCapability:
    | "rassy-chat"
    | "birth-chart"
    | "human-guide"
    | "esoterica-memory"
    | "weekly-grimoire"
    | "compatibility"
    | "source-trace";
};

type ChatResponse = {
  reply: string;
  ui: ChatUi;
  quickActions: string[];
  meta?: {
    provider: string;
    model: string;
    usedFallback: boolean;
  };
};

const CAPABILITIES = [
  {
    id: "rassy-chat",
    label: "Live Dialogue",
    detail: "A conversational center that keeps asking, reflecting, and guiding.",
    href: "/"
  },
  {
    id: "birth-chart",
    label: "Birth Chart",
    detail: "Date, time, place, houses, aspects, retrogrades, and angles.",
    href: "/intake"
  },
  {
    id: "human-guide",
    label: "Human Guide",
    detail: "Long-form chart synthesis with allegory, practice, and source grounding.",
    href: "/reading"
  },
  {
    id: "esoterica-memory",
    label: "Memory Corpus",
    detail: "Indexed books and teachings for richer symbolic context.",
    href: "/reading"
  },
  {
    id: "weekly-grimoire",
    label: "Grimoire",
    detail: "Saved chart, account memory, weekly notes, and living continuity.",
    href: "/account"
  },
  {
    id: "compatibility",
    label: "Compatibility",
    detail: "Two-chart relational weather and practical stewardship.",
    href: "/compatibility"
  },
  {
    id: "source-trace",
    label: "Trace",
    detail: "Model, provider, and provenance signals when the system speaks.",
    href: "/reading"
  }
] as const;

const PALETTES = {
  dawn: {
    accent: "#d4a100",
    ink: "#181513",
    glow: "rgba(212, 161, 0, 0.28)",
    wash: "rgba(255, 247, 226, 0.82)"
  },
  ember: {
    accent: "#d86a3d",
    ink: "#1c1110",
    glow: "rgba(216, 106, 61, 0.28)",
    wash: "rgba(255, 237, 226, 0.8)"
  },
  nocturne: {
    accent: "#7d8fff",
    ink: "#eef0ff",
    glow: "rgba(125, 143, 255, 0.3)",
    wash: "rgba(16, 18, 31, 0.84)"
  },
  verdant: {
    accent: "#3f8f68",
    ink: "#0f1813",
    glow: "rgba(63, 143, 104, 0.25)",
    wash: "rgba(231, 247, 236, 0.82)"
  },
  gold: {
    accent: "#c9932d",
    ink: "#17130d",
    glow: "rgba(201, 147, 45, 0.3)",
    wash: "rgba(255, 244, 214, 0.82)"
  }
};

const DEFAULT_UI: ChatUi = {
  mood: "wonder",
  palette: "dawn",
  motion: "pulse",
  density: "layered",
  activeCapability: "rassy-chat"
};

const starterFor = (brand: BrandConfig, copy: BrandCopy): ChatMessage => ({
  id: "seed",
  role: "assistant",
  content:
    `I am ${brand.name} in RassyGPT mode. The whole site can now move through this conversation: birth chart, Human Guide, memory corpus, grimoire, compatibility, and source trace.\n\n` +
    `${copy.hero.mantra} Ask me for a chart, bring me a life question, or tell me what kind of mirror you need today.`
});

const promptStarters = [
  "Start with my birth chart.",
  "Ask me the right questions before you read me.",
  "Show me how the Human Guide works.",
  "Turn this into practical guidance for today."
];

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const renderParagraphs = (content: string) =>
  content.split(/\n{2,}/).map((paragraph, index) => (
    <p key={`${paragraph.slice(0, 18)}-${index}`}>{paragraph}</p>
  ));

export const RassyChatHome: React.FC<{ brand: BrandConfig; brandCopy: BrandCopy }> = ({
  brand,
  brandCopy
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [starterFor(brand, brandCopy)]);
  const [input, setInput] = useState("");
  const [ui, setUi] = useState<ChatUi>(DEFAULT_UI);
  const [quickActions, setQuickActions] = useState(promptStarters);
  const [meta, setMeta] = useState<ChatResponse["meta"]>({
    provider: "rassygpt",
    model: "rassy-smart",
    usedFallback: false
  });
  const [isSending, setIsSending] = useState(false);

  const palette = PALETTES[ui.palette];
  const activeCapability = CAPABILITIES.find((item) => item.id === ui.activeCapability) ?? CAPABILITIES[0];
  const transcriptMessages = useMemo(
    () =>
      messages.slice(-10).map((message) => ({
        role: message.role,
        content: message.content
      })),
    [messages]
  );

  const sendMessage = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isSending) return;

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content: trimmed
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/v1/rassy-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Brand-Id": brand.id
        },
        body: JSON.stringify({
          brandId: brand.id,
          messages: [...transcriptMessages, userMessage].slice(-12)
        })
      });

      if (!response.ok) {
        throw new Error(`Chat failed with ${response.status}`);
      }

      const data = (await response.json()) as ChatResponse;
      setMessages([
        ...nextMessages,
        {
          id: makeId(),
          role: "assistant",
          content: data.reply
        }
      ]);
      setUi(data.ui);
      if (data.quickActions.length) setQuickActions(data.quickActions);
      setMeta(data.meta);
    } catch {
      setMessages([
        ...nextMessages,
        {
          id: makeId(),
          role: "assistant",
          content:
            "The live RassyGPT thread blinked for a moment, but the conversation can continue. Tell me whether you want chart calculation, a Human Guide, memory-grounded interpretation, compatibility, or a practical reflection, and I will route the next step cleanly."
        }
      ]);
      setUi({
        mood: "clarity",
        palette: "dawn",
        motion: "still",
        density: "focused",
        activeCapability: "source-trace"
      });
      setMeta({ provider: "browser-fallback", model: "local", usedFallback: true });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className={`rassy-chat-page rassy-chat-${ui.motion} rassy-density-${ui.density}`}
      style={
        {
          "--chat-accent": palette.accent,
          "--chat-ink": palette.ink,
          "--chat-glow": palette.glow,
          "--chat-wash": palette.wash
        } as React.CSSProperties
      }
    >
      <section className="rassy-command">
        <div className="rassy-command-header">
          <div>
            <p className="astro-kicker">RassyGPT / RassyCodex</p>
            <h1>{brand.name} is the conversation now.</h1>
          </div>
          <div className="rassy-live-chip" aria-label="Live model status">
            <span />
            {meta?.model ?? "rassy-smart"}
          </div>
        </div>

        <div className="rassy-chat-shell">
          <aside className="rassy-capability-rail" aria-label="RassyCodex capabilities">
            <div className="rassy-rail-intro">
              <p className="astro-kicker">Current Lens</p>
              <strong>{activeCapability.label}</strong>
              <span>{activeCapability.detail}</span>
            </div>
            <div className="rassy-capability-list">
              {CAPABILITIES.map((capability) => (
                <a
                  key={capability.id}
                  href={capability.href}
                  className={capability.id === ui.activeCapability ? "is-active" : ""}
                >
                  <strong>{capability.label}</strong>
                  <span>{capability.detail}</span>
                </a>
              ))}
            </div>
          </aside>

          <div className="rassy-dialogue-panel">
            <div className="rassy-atmosphere" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="rassy-message-stream" aria-live="polite">
              {messages.map((message) => (
                <article key={message.id} className={`rassy-message rassy-message-${message.role}`}>
                  <div className="rassy-message-role">{message.role === "assistant" ? "RassyGPT" : "You"}</div>
                  <div className="rassy-message-body">{renderParagraphs(message.content)}</div>
                </article>
              ))}
              {isSending ? (
                <article className="rassy-message rassy-message-assistant rassy-message-thinking">
                  <div className="rassy-message-role">RassyGPT</div>
                  <div className="rassy-message-body">
                    <p>Listening, tracing, tuning the room...</p>
                  </div>
                </article>
              ) : null}
            </div>

            <div className="rassy-quick-actions" aria-label="Suggested prompts">
              {quickActions.slice(0, 4).map((action) => (
                <button key={action} type="button" onClick={() => void sendMessage(action)}>
                  {action}
                </button>
              ))}
            </div>

            <form
              className="rassy-input-bar"
              onSubmit={(event: any) => {
                event.preventDefault();
                void sendMessage(input);
              }}
            >
              <label htmlFor="rassy-chat-input">Chat with RassyGPT</label>
              <textarea
                id="rassy-chat-input"
                value={input}
                onChange={(event: any) => setInput(event.target.value)}
                placeholder="Ask for your birth chart, a Human Guide, a pattern you are living, or a practical next step..."
                rows={3}
              />
              <button type="submit" disabled={isSending || !input.trim()}>
                Send
              </button>
            </form>
          </div>

          <aside className="rassy-orchestration" aria-label="Conversation controls">
            <div className="rassy-knob-panel">
              <p className="astro-kicker">LLM-Controlled Room</p>
              <div className="rassy-knob">
                <span>Mood</span>
                <strong>{ui.mood}</strong>
              </div>
              <div className="rassy-knob">
                <span>Palette</span>
                <strong>{ui.palette}</strong>
              </div>
              <div className="rassy-knob">
                <span>Motion</span>
                <strong>{ui.motion}</strong>
              </div>
              <div className="rassy-meter" data-density={ui.density}>
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="rassy-system-card">
              <p className="astro-kicker">Engine Trace</p>
              <strong>{meta?.provider ?? "rassygpt"}</strong>
              <span>{meta?.usedFallback ? "Fallback response active" : "Live route active"}</span>
              <span>{brandCopy.reading.notes[0]}</span>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
};
