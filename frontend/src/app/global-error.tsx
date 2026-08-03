"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily: '"Source Sans 3", "Segoe UI", system-ui, sans-serif',
          background: "#f5faff",
          color: "#102a43",
        }}
      >
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
        >
          <section
            style={{
              width: "min(520px, 100%)",
              padding: 28,
              border: "1px solid #c7d8e8",
              borderRadius: 16,
              background: "#ffffff",
              boxShadow: "0 6px 18px rgb(16 42 67 / 10%)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#526b80",
                fontFamily: '"Source Code Pro", ui-monospace, monospace',
              }}
            >
              Application error
            </p>
            <h1
              style={{
                margin: "0 0 12px",
                fontSize: "1.5rem",
                lineHeight: 1.2,
                fontFamily: '"Source Serif 4", Georgia, serif',
                fontWeight: 600,
              }}
            >
              Career Copilot hit an unexpected problem.
            </h1>
            <p style={{ margin: "0 0 20px", color: "#526b80" }}>
              No stored records were changed by this page error.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 44,
                padding: "10px 16px",
                border: "1px solid #1769aa",
                borderRadius: 12,
                background: "#1769aa",
                color: "#ffffff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
