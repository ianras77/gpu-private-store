"use client";

export default function LearningError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="learning-not-found" role="alert">
      <p className="learning-kicker">A page stumbled</p>
      <h1>The reader could not open that module.</h1>
      <p>
        Your place in the radio player is still here. Try opening the page
        again.
      </p>
      <button type="button" onClick={reset} className="learning-back-link">
        Try again
      </button>
    </main>
  );
}
