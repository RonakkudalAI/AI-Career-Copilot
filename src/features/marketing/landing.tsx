"use client";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { BookOpenCheck, BriefcaseBusiness, FileSearch, Menu, ShieldCheck, Sparkles, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/theme-toggle";

const CareerGlobe = dynamic(() => import("./career-globe"), {
  ssr: false,
  loading: () => <div className="globe-loading">Loading map…</div>,
});

const journey = [
  { title: "Resume", text: "Upload your PDF or DOCX and review what was extracted." },
  { title: "Analysis", text: "See keyword coverage against a job description and clear next steps." },
  { title: "Interview", text: "Practice with saved sessions and answers you control." },
  { title: "Learning", text: "Follow paths linked to skills you already have." },
  { title: "Jobs", text: "Browse and save roles that appear in your account." },
];

export function LandingPage() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <nav className="marketing-nav">
        <div className="container nav-inner">
          <Link className="brand" href="/">
            <Image src="/brand/logo-mark.svg" width={40} height={40} alt="" />
            Career Copilot
          </Link>
          <div className="nav-links">
            <a href="#journey">How it works</a>
            <a href="#modules">Features</a>
            <ButtonLink href="/sign-up">Get started</ButtonLink>
            <ThemeToggle />
          </div>
          <button className="icon-button mobile-menu-button" onClick={() => setOpen(!open)} aria-label="Toggle navigation">
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="mobile-drawer">
          <a href="#journey">How it works</a>
          <ButtonLink href="/sign-up">Get started</ButtonLink>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
            <ThemeToggle />
          </div>
        </div>
      )}
      <main id="main-content">
        <section className="container hero">
          <div className="hero-copy">
            <span className="badge badge-info">One profile. Every next step.</span>
            <h1>Build a career plan from your real experience.</h1>
            <p>
              Keep your resume, analysis, interview practice, learning paths, and job list in one private place — with
              results you can review before they are used.
            </p>
            <div className="cluster">
              <ButtonLink href="/sign-up">Build my profile</ButtonLink>
            </div>
            <p className="hero-note">
              <ShieldCheck size={16} />
              Private by default. You stay in control of what is saved.
            </p>
          </div>
          <div className="globe-frame">
            <CareerGlobe />
            <div className="job-preview">
              <span className="badge badge-info">How it works</span>
              <h3>Upload → review → improve</h3>
              <p>Start from your real resume and a target role.</p>
            </div>
          </div>
        </section>
        <section id="journey" className="section">
          <div className="container">
            <p className="eyebrow">How it works</p>
            <h2>A clear path from resume to next opportunity.</h2>
            <div className="journey">
              {journey.map((item, index) => (
                <article key={item.title}>
                  <span className="mono">0{index + 1}</span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section id="modules" className="section">
          <div className="container">
            <p className="eyebrow">Features</p>
            <h2>Everything you need for the next step.</h2>
            <div className="module-stripe">
              <FileSearch size={64} />
              <div>
                <h3>Resume analysis</h3>
                <p>Upload, review extraction, score against a job description, and improve your resume in place.</p>
              </div>
            </div>
            <div className="module-stripe">
              <div>
                <h3>Interview practice</h3>
                <p>Create sessions, answer questions, and keep your practice history in one place.</p>
              </div>
              <Sparkles size={64} />
            </div>
            <div className="module-stripe">
              <BookOpenCheck size={64} />
              <div>
                <h3>Learning paths</h3>
                <p>Track progress on paths tied to your goals and experience.</p>
              </div>
            </div>
            <div className="module-stripe">
              <div>
                <h3>Job list</h3>
                <p>Save roles you care about and return when you are ready to apply.</p>
              </div>
              <BriefcaseBusiness size={64} />
            </div>
          </div>
        </section>
        <section className="section">
          <div className="container panel panel-blue row">
            <div>
              <Sparkles size={36} />
              <h2>Make your next move with confidence.</h2>
            </div>
            <ButtonLink href="/sign-up">Create account</ButtonLink>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="container row">
          <div className="brand">
            <Image src="/brand/logo-mark.svg" width={38} height={38} alt="" />
            Career Copilot
          </div>
          <div className="cluster">
            <Link href="/settings/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
