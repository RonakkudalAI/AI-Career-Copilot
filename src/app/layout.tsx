import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const space = localFont({ src: "../../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2", variable: "--font-space", weight: "300 700", display: "swap" });
const mono = localFont({ src: [{ path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", weight: "400" }, { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2", weight: "600" }], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = { title: { default: "Career Copilot", template: "%s · Career Copilot" }, description: "Your private career workspace for resumes, interviews, and next steps." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${space.variable} ${mono.variable}`}>
        <a className="skip-link" href="#main-content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
