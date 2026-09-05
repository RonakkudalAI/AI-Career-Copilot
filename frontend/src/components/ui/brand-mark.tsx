export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-mark${compact ? " brand-mark-compact" : ""}`} aria-hidden="true">
      <img className="brand-mark-image brand-mark-image-light" src="/brand/career-copilot-light.png" alt="" />
      <img className="brand-mark-image brand-mark-image-dark" src="/brand/career-copilot-dark.png" alt="" />
    </span>
  );
}
