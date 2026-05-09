'use client';

import Link from 'next/link';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <section className="page-header">
        <div className="pill">Something went wrong</div>
        <h1>We hit a snag.</h1>
        <p className="microcopy">
          {error.message || 'The room ran into an unexpected error. You can retry or return home.'}
        </p>
      </section>
      <section className="card">
        <div className="cta-row">
          <button className="button primary" type="button" onClick={() => reset()}>
            Try again
          </button>
          <Link className="button secondary" href="/">
            Return home
          </Link>
        </div>
      </section>
    </main>
  );
}
