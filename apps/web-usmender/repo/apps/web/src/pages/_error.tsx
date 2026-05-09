import Link from 'next/link';
import type { NextPageContext } from 'next';

type ErrorPageProps = {
  statusCode?: number;
};

export default function ErrorPage({ statusCode }: ErrorPageProps) {
  return (
    <main>
      <section className="page-header">
        <div className="pill">Something went wrong</div>
        <h1>We hit a snag.</h1>
        <p className="microcopy">
          {statusCode
            ? `The server responded with ${statusCode}.`
            : 'An unexpected error occurred.'}
        </p>
      </section>
      <section className="card">
        <div className="cta-row">
          <Link className="button primary" href="/">
            Return home
          </Link>
          <Link className="button secondary" href="/sessions/new">
            Start a session
          </Link>
        </div>
      </section>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode;
  return { statusCode };
};
