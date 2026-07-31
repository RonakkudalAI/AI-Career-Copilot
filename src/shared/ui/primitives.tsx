"use client";
import Link from "next/link";
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

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "quiet" }>(({ className, variant = "primary", ...props }, ref) => <button ref={ref} className={cn("button", `button-${variant}`, className)} {...props} />);
Button.displayName = "Button";
export function ButtonLink({ href, children, variant = "primary", className, onClick }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" | "quiet"; className?: string; onClick?: MouseEventHandler<HTMLAnchorElement> }) { return <Link href={href} className={cn("button", `button-${variant}`, className)} onClick={onClick}>{children}<ArrowRight size={17} aria-hidden /></Link>; }
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => <input ref={ref} className={cn("field", className)} {...props} />); Input.displayName = "Input";
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => <textarea ref={ref} className={cn("field min-h-32", className)} {...props} />); Textarea.displayName = "Textarea";
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn("field", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";
export function Card({ children, className = "", as: Tag = "section", ...props }: { children: React.ReactNode; className?: string; as?: "section" | "article" | "div" } & HTMLAttributes<HTMLElement>) { return <Tag className={cn("panel", className)} {...props}>{children}</Tag>; }
export function Badge({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "success" | "warning" | "danger" | "ai" }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) { return <header className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></div>{action}</header>; }
export function EmptyState({ title, description, href, action }: { title: string; description: string; href?: string; action?: string }) { return <Card className="empty-state"><Inbox aria-hidden /><h2>{title}</h2><p>{description}</p>{href && action && <ButtonLink href={href}>{action}</ButtonLink>}</Card>; }
export function ErrorState({ onRetry }: { onRetry?: () => void }) { return <Card className="empty-state"><AlertTriangle aria-hidden /><h2>We could not load this section</h2><p>Your stored records were not changed. Check the API connection and try again.</p>{onRetry && <Button onClick={onRetry}>Retry</Button>}</Card>; }
export function Skeleton({ lines = 3 }: { lines?: number }) { return <div className="panel skeleton" aria-label="Loading content">{Array.from({ length: lines }, (_, i) => <span key={i} />)}</div>; }
export function Progress({ value, label }: { value: number; label: string }) { return <div className="progress-wrap"><div className="row"><span>{label}</span><strong>{value}%</strong></div><div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><span style={{ width: `${value}%` }} /></div></div>; }
