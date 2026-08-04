import type { Metadata } from "next";
import "./globals.css";

/**
 * Premium classic type system (site-wide):
 * - Source Sans 3  → UI, body, forms (readable classic grotesque)
 * - Source Serif 4 → headings, brand, display (editorial classic)
 * - Source Code Pro → scores, badges, mono labels
 *
 * The type system intentionally uses local stacks so first load and builds do
 * not depend on an external font server.
 */
export const metadata: Metadata = {
  title: { default: "Career Copilot", template: "%s · Career Copilot" },
  description: "Your private career workspace for resumes, interviews, and next steps.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
