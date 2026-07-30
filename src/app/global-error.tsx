"use client";
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html><body><main className="auth-main" style={{ minHeight: "100vh" }}><section className="panel empty-state"><p className="eyebrow">Application error</p><h1>Career Copilot hit an unexpected problem.</h1><p>No stored records were changed by this page error.</p><button className="button button-primary" onClick={reset}>Try again</button></section></main></body></html>;
}
