import type { Metadata } from "next";
import "./globals.css";

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
