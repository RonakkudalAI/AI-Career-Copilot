import type { ReactNode } from "react";
import { Link } from "@/shared/ui/router-link";
import { ArrowRight, RotateCcw } from "lucide-react";
import { AnimatedIcon } from "@/components/ui/animated-icon";
import { Card } from "@/shared/ui/primitives";
import { cn } from "@/shared/utils";

export interface ErrorHeroProps {
  code?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  buttonLabel?: string;
  buttonHref?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  onSecondaryAction?: () => void;
  icon?: ReactNode;
  className?: string;
}

function BackgroundGrid() {
  return (
    <div
      className="error-6-grid-mask absolute inset-0 z-0 overflow-hidden rounded-3xl pointer-events-none"
      style={{
        maskImage:
          "radial-gradient(circle at center, rgba(0,0,0,0.85) 20%, rgba(0,0,0,0.2) 60%, transparent 85%)",
        WebkitMaskImage:
          "radial-gradient(circle at center, rgba(0,0,0,0.85) 20%, rgba(0,0,0,0.2) 60%, transparent 85%)",
      }}
      aria-hidden="true"
    >
      <div className="grid h-full w-full grid-cols-12 grid-rows-6 pointer-events-auto">
        {Array.from({ length: 72 }).map((_, index) => (
          <div
            key={index}
            className="border transition-colors duration-300"
            style={{
              borderColor: "color-mix(in srgb, var(--border) 45%, transparent)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--primary) 22%, transparent)";
              e.currentTarget.style.borderColor = "var(--primary-strong)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.borderColor =
                "color-mix(in srgb, var(--border) 45%, transparent)";
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ErrorContent({
  eyebrow,
  title,
  description,
  buttonLabel,
  buttonHref,
  onAction,
  secondaryLabel,
  secondaryHref,
  onSecondaryAction,
  code,
}: Omit<ErrorHeroProps, "className" | "icon">) {
  const isRetry = Boolean(code && code.startsWith("5"));

  return (
    <div className="relative z-10 flex max-w-lg flex-col items-center justify-center gap-6 text-center sm:items-start sm:text-start">
      <div className="space-y-2">
        {eyebrow ? (
          <span className="badge badge-info text-xs font-semibold uppercase tracking-wider">
            {eyebrow}
          </span>
        ) : null}

        <h1 className="text-3xl font-bold tracking-tight text-[var(--text)] sm:text-4xl lg:text-5xl leading-tight">
          {title}
        </h1>

        <p className="max-w-md text-base leading-relaxed text-[var(--text-muted)]">
          {description}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start pointer-events-auto">
        {buttonHref ? (
          <Link
            href={buttonHref}
            className="button button-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold shadow-sm"
          >
            <span>{buttonLabel}</span>
            <AnimatedIcon
              icon={isRetry ? RotateCcw : ArrowRight}
              size={16}
              aria-hidden
            />
          </Link>
        ) : onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="button button-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold shadow-sm"
          >
            <span>{buttonLabel}</span>
            <AnimatedIcon
              icon={isRetry ? RotateCcw : ArrowRight}
              size={16}
              aria-hidden
            />
          </button>
        ) : null}

        {secondaryHref ? (
          <Link
            href={secondaryHref}
            className="button button-secondary inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium"
          >
            <span>{secondaryLabel}</span>
          </Link>
        ) : onSecondaryAction ? (
          <button
            type="button"
            onClick={onSecondaryAction}
            className="button button-secondary inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium"
          >
            <span>{secondaryLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ErrorCode({ code }: { code: string }) {
  return (
    <div
      className="relative z-10 flex items-center justify-center select-none pointer-events-none"
      aria-hidden="true"
    >
      <span
        className="font-extralight tracking-tighter leading-none"
        style={{
          fontSize: "clamp(6.5rem, 16vw, 12.5rem)",
          color:
            "color-mix(in srgb, var(--primary-strong) 38%, var(--text-muted))",
          textShadow:
            "0 10px 30px color-mix(in srgb, var(--primary-strong) 15%, transparent)",
        }}
      >
        {code}
      </span>
    </div>
  );
}

/**
 * SystemErrorPanel / Error-6
 * Modern, hero-style error panel with interactive background grid and visual consistency.
 */
export function SystemErrorPanel({
  code = "404",
  eyebrow = code === "404" ? "Page Not Found" : "System Notice",
  title = "This destination isn’t accessible.",
  description = "The resource you attempted to open may have been moved, archived, or temporarily disconnected from the network.",
  buttonLabel = "Return to Dashboard",
  buttonHref,
  onAction,
  secondaryLabel = "Go back",
  secondaryHref,
  onSecondaryAction,
  className,
}: ErrorHeroProps) {
  const resolvedHref =
    buttonHref !== undefined ? buttonHref : onAction ? undefined : "/dashboard";

  const handleBack =
    onSecondaryAction ||
    (() => {
      if (typeof window !== "undefined" && window.history.length > 1) {
        window.history.back();
      } else if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    });

  return (
    <main
      className={cn(
        "error-6-screen relative flex min-h-[calc(100vh-140px)] w-full items-center justify-center p-4 sm:p-6 lg:p-10",
        className,
      )}
      role="main"
      aria-label={`${code} ${title}`}
    >
      <Card
        className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-3xl border shadow-lg transition-all"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow:
            "0 20px 50px color-mix(in srgb, var(--text) 6%, transparent)",
        }}
      >
        <BackgroundGrid />

        <div className="relative z-10 grid min-h-[460px] grid-cols-1 items-center gap-8 px-6 py-12 sm:grid-cols-2 sm:px-10 lg:px-14 lg:py-16">
          <div className="order-2 sm:order-1">
            <ErrorContent
              code={code}
              eyebrow={eyebrow}
              title={title}
              description={description}
              buttonLabel={buttonLabel}
              buttonHref={resolvedHref}
              onAction={onAction}
              secondaryLabel={secondaryLabel}
              secondaryHref={secondaryHref}
              onSecondaryAction={handleBack}
            />
          </div>

          <div className="order-1 sm:order-2">
            <ErrorCode code={code} />
          </div>
        </div>
      </Card>
    </main>
  );
}

export default SystemErrorPanel;
export const Error6 = SystemErrorPanel;
