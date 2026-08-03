"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import {
  clampCompletion,
  extractMissing,
  type ProfileMissingItem,
} from "@/features/profile/model/profile-completion";

export type { ProfileMissingItem };

type Props = {
  completion: number;
  missing: ProfileMissingItem[];
};

const DISMISS_KEY = "career-copilot-profile-toast-dismissed";
const DISMISS_EVENT = "career-copilot-profile-toast-dismissed";

function readDismissedPercent(): string | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function subscribeDismissed(listener: () => void): () => void {
  window.addEventListener(DISMISS_EVENT, listener);
  return () => window.removeEventListener(DISMISS_EVENT, listener);
}

export function ProfileCompletionToast({ completion, missing }: Props) {
  const dismissedPercent = useSyncExternalStore(
    subscribeDismissed,
    readDismissedPercent,
    () => null,
  );
  const safeMissing = useMemo(() => extractMissing(null, missing), [missing]);
  const percent = clampCompletion(completion);
  const open = percent < 100 && safeMissing.length > 0 && dismissedPercent !== String(percent);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, String(percent));
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }

  if (!open || percent >= 100 || safeMissing.length === 0) return null;

  const shown = safeMissing.slice(0, 6);
  const extra = safeMissing.length - shown.length;

  return (
    <div className="profile-toast" role="status" aria-live="polite">
      <div className="profile-toast-header">
        <div>
          <strong>Please complete your profile</strong>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--text-sm)" }}>
            {percent}% complete · {safeMissing.length} remaining
          </p>
        </div>
        <button type="button" className="icon-button" onClick={dismiss} aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
      <ul className="profile-toast-list">
        {shown.map((item) => (
          <li key={item.key}>
            <Link href={item.href || "/settings/profile"} onClick={dismiss}>
              {item.label}
              {item.points != null ? ` (+${item.points}%)` : ""}
            </Link>
          </li>
        ))}
      </ul>
      {extra > 0 ? (
        <p className="muted" style={{ margin: "8px 0 0", fontSize: "var(--text-xs)" }}>
          +{extra} more on your profile page
        </p>
      ) : null}
      <Link className="button button-primary profile-toast-cta" href="/settings/profile" onClick={dismiss}>
        Complete profile
      </Link>
    </div>
  );
}
