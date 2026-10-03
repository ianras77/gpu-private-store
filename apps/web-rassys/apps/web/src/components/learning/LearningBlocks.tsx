"use client";

import { useId, useState, type ReactNode } from "react";
import type { LearningCheck } from "../../lib/learning/schema";

type TeachingKind = "idea" | "reveal" | "practice" | "reflect";

export function TeachingBlock({
  id,
  kind,
  label,
  children,
}: {
  id?: string;
  kind?: string;
  label?: string;
  children?: ReactNode;
}) {
  const [response, setResponse] = useState("");
  const responseId = useId();
  const blockKind = (
    ["idea", "reveal", "practice", "reflect"].includes(kind ?? "")
      ? kind
      : "idea"
  ) as TeachingKind;
  const title = label?.trim() || "A note to explore";

  if (blockKind === "reveal") {
    return (
      <details id={id} className="learning-reveal">
        <summary>{title}</summary>
        <div className="learning-reveal-body">{children}</div>
      </details>
    );
  }
  if (blockKind === "reflect") {
    return (
      <section id={id} className="learning-reflect">
        <h3>{title}</h3>
        <div>{children}</div>
        <label htmlFor={responseId}>A private response for this visit</label>
        <textarea
          id={responseId}
          value={response}
          onChange={(event) => setResponse(event.target.value)}
          rows={4}
          placeholder="Write something for yourself. It stays in this page and is not saved or sent."
        />
        <p className="learning-quiet">
          This response stays in memory for this visit. It is not saved or sent.
        </p>
      </section>
    );
  }
  if (blockKind === "practice") {
    return (
      <section id={id} className="learning-practice">
        <p className="learning-block-label">Try this</p>
        <h3>{title}</h3>
        <div>{children}</div>
      </section>
    );
  }
  return (
    <aside id={id} className="learning-idea">
      <p className="learning-block-label">Keep in mind</p>
      <h3>{title}</h3>
      <div>{children}</div>
    </aside>
  );
}

export function KnowledgeCheckCard({ check }: { check: LearningCheck }) {
  const [selected, setSelected] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const correct = submitted && selected === check.answer;
  const selectedOption = check.options.find((option) => option.id === selected);
  return (
    <section
      className="learning-check"
      aria-labelledby={`${check.id}-question`}
    >
      <p className="learning-block-label">
        A quick check · for your own learning
      </p>
      <h3 id={`${check.id}-question`}>{check.question}</h3>
      <fieldset>
        <legend className="sr-only">Choose one answer</legend>
        {check.options.map((option) => (
          <label key={option.id} className="learning-check-option">
            <input
              type="radio"
              name={check.id}
              value={option.id}
              checked={selected === option.id}
              onChange={() => {
                setSelected(option.id);
                setSubmitted(false);
              }}
            />
            <span>{option.text}</span>
          </label>
        ))}
      </fieldset>
      <div className="learning-check-actions">
        <button
          type="button"
          onClick={() => setSubmitted(true)}
          disabled={!selected}
        >
          Check answer
        </button>
        {submitted ? (
          <button
            type="button"
            className="learning-secondary-button"
            onClick={() => {
              setSelected("");
              setSubmitted(false);
            }}
          >
            Try again
          </button>
        ) : null}
      </div>
      {submitted && selectedOption ? (
        <p
          className={`learning-check-feedback ${correct ? "is-correct" : ""}`}
          role="status"
          aria-live="polite"
        >
          {selectedOption.feedback}
        </p>
      ) : null}
      <p className="learning-quiet">
        A self-study prompt. You can retry; this is not an exam.
      </p>
    </section>
  );
}
