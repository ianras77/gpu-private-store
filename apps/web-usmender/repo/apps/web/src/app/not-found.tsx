import Link from 'next/link';

export default function NotFound() {
  return (
    <main>
      <section className="page-header">
        <div className="pill">Not found</div>
        <h1>We could not find that page.</h1>
        <p className="microcopy">The room may have moved or the link expired.</p>
      </section>
      <section className="card">
        <div className="cta-row">
          <Link className="button primary" href="/">
            Go to home
          </Link>
          <Link className="button secondary" href="/sessions/new">
            Start a session
          </Link>
        </div>
      </section>
    </main>
  );
}
