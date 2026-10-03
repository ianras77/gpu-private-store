import Link from "next/link";

export default function LearningModuleNotFound() {
  return (
    <main className="learning-not-found">
      <p className="learning-kicker">That page has moved on</p>
      <h1>This exploration is not available.</h1>
      <p>It may have been unpublished or removed from the learning folder.</p>
      <Link href="/learn" className="learning-back-link">
        Return to the Curiosity Room
      </Link>
    </main>
  );
}
