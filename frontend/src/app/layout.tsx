import type { Metadata } from "next";
import { Source_Code_Pro, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import "./globals.css";

/**
 * Premium classic type system (site-wide):
 * - Source Sans 3  → UI, body, forms (readable classic grotesque)
 * - Source Serif 4 → headings, brand, display (editorial classic)
 * - Source Code Pro → scores, badges, mono labels
 */
const body = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-body",
  display: "swap",
});

const display = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const mono = Source_Code_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Career Copilot", template: "%s · Career Copilot" },
  description: "Your private career workspace for resumes, interviews, and next steps.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${body.variable} ${display.variable} ${mono.variable}`}>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
