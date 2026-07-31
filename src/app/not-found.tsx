import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="auth-main" style={{ minHeight: "100vh" }}>
      <section className="panel empty-state">
        <p className="eyebrow">404 · Missing route</p>
        <h1>This career path is not mapped.</h1>
        <p>The page may have moved or the link may be incomplete.</p>
        <div className="cluster" style={{ justifyContent: "center" }}>
          <Link className="button button-primary" href="/">
            Go to home
          </Link>
          <Link className="button button-secondary" href="/dashboard">
            Open dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
