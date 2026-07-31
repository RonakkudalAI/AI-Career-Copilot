/** Lightweight page shell — avoid motion on every navigation (was a major source of sticky lag). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
