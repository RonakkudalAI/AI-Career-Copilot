import { Link } from "@/shared/ui/router-link";
import {
  forwardRef,
  InputHTMLAttributes,
  ButtonHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  HTMLAttributes,
  MouseEventHandler,
} from "react";
import { AlertTriangle, ArrowRight, Inbox } from "lucide-react";
import { cn } from "@/shared/utils";
import { AnimatedIcon } from "@/components/ui/animated-icon";

type ButtonVariant = "primary" | "secondary" | "danger" | "quiet" | "destructive" | "ghost" | "outline" | "default";
type BadgeTone = "info" | "success" | "warning" | "danger" | "ai" | "default" | "secondary" | "outline" | "destructive";

function resolveButtonVariant(variant: ButtonVariant = "primary"): "primary" | "secondary" | "danger" | "quiet" {
  if (variant === "destructive" || variant === "danger") return "danger";
  if (variant === "ghost" || variant === "quiet") return "quiet";
  if (variant === "outline" || variant === "secondary") return "secondary";
  if (variant === "default" || variant === "primary") return "primary";
  return "primary";
}

function resolveBadgeTone(tone?: BadgeTone, variant?: BadgeTone): "info" | "success" | "warning" | "danger" | "ai" {
  const raw = tone ?? variant ?? "info";
  if (raw === "destructive" || raw === "danger") return "danger";
  if (raw === "success" || raw === "warning" || raw === "ai") return raw;
  // default / secondary / outline / info
  return "info";
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }
>(({ className, variant = "primary", ...props }, ref) => {
  const resolved = resolveButtonVariant(variant);
  return <button ref={ref} className={cn("button", `button-${resolved}`, className)} {...props} />;
});
Button.displayName = "Button";

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const resolved = resolveButtonVariant(variant);
  return (
    <Link href={href} className={cn("button", `button-${resolved}`, className)} onClick={onClick}>
      {children}
      <AnimatedIcon icon={ArrowRight} size={17} aria-hidden />
    </Link>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("field", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn("field min-h-32", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn("field", className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Card({
  children,
  className = "",
  as: Tag = "section",
  ...props
}: { children: React.ReactNode; className?: string; as?: "section" | "article" | "div" } & HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn("panel", className)} {...props}>
      {children}
    </Tag>
  );
}

export function Badge({
  children,
  tone,
  variant,
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  variant?: BadgeTone;
  className?: string;
}) {
  const resolved = resolveBadgeTone(tone, variant);
  return <span className={cn(`badge badge-${resolved}`, className)}>{children}</span>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="page-heading-actions">{action}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <Card className="empty-state">
      <AnimatedIcon icon={Inbox} aria-hidden />
      <h2>{title}</h2>
      <p>{description}</p>
      {href && action && <ButtonLink href={href}>{action}</ButtonLink>}
    </Card>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <Card className="empty-state">
      <AnimatedIcon icon={AlertTriangle} aria-hidden />
      <h2>We could not load this section</h2>
      <p>Your stored records were not changed. Check the API connection and try again.</p>
      {onRetry && <Button onClick={onRetry}>Retry</Button>}
    </Card>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="panel skeleton" aria-label="Loading content">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return (
    <div className="progress-wrap">
      <div className="row">
        <span>{label}</span>
        <strong>{pct}%</strong>
      </div>
      <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
