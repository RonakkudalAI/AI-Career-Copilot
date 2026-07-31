"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, PageHeader, Textarea } from "@/components/ui/primitives";
import { apiRequest } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";

type OnboardingForm = {
  full_name: string;
  headline: string;
  phone: string;
  location: string;
  current_role: string;
  bio: string;
};

const EMPTY: OnboardingForm = {
  full_name: "",
  headline: "",
  phone: "",
  location: "",
  current_role: "",
  bio: "",
};

function pickNameFromAuthMeta(meta: Record<string, unknown> | undefined | null): string {
  if (!meta) return "";
  for (const key of ["full_name", "name", "fullName"] as const) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function Onboarding() {
  const router = useRouter();
  const [form, setForm] = useState<OnboardingForm>(EMPTY);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // 1) Load persisted profile (also syncs empty full_name from Auth metadata on the API).
        const payload = await apiRequest<{ profile: Record<string, unknown> }>("/profile");
        const profile = payload.profile || {};

        // 2) Fallback: Auth user_metadata from the browser session (sign-up full name).
        let authName = "";
        try {
          const supabase = createClient();
          const {
            data: { user },
          } = (await supabase?.auth.getUser()) || { data: { user: null } };
          authName = pickNameFromAuthMeta(
            (user?.user_metadata || {}) as Record<string, unknown>,
          );
        } catch {
          authName = "";
        }

        if (!active) return;
        setForm({
          full_name: String(profile.full_name || authName || "").trim(),
          headline: String(profile.headline || "").trim(),
          phone: String(profile.phone || "").trim(),
          location: String(profile.location || "").trim(),
          current_role: String(profile.current_role || "").trim(),
          bio: String(profile.bio || "").trim(),
        });
      } catch (e) {
        if (!active) return;
        // Still try Auth metadata so the name is not blank if /profile fails briefly.
        try {
          const supabase = createClient();
          const {
            data: { user },
          } = (await supabase?.auth.getUser()) || { data: { user: null } };
          const authName = pickNameFromAuthMeta(
            (user?.user_metadata || {}) as Record<string, unknown>,
          );
          if (authName) setForm((current) => ({ ...current, full_name: authName }));
        } catch {
          /* ignore */
        }
        setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function updateField<K extends keyof OnboardingForm>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      if (!form.full_name.trim()) {
        throw new Error("Full name is required.");
      }
      await apiRequest("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          headline: form.headline.trim() || null,
          phone: form.phone.trim() || null,
          location: form.location.trim() || null,
          current_role: form.current_role.trim() || null,
          bio: form.bio.trim() || null,
          onboarding_step: 6,
          onboarding_completed: true,
        }),
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main id="main-content" className="section">
      <div className="container">
        <PageHeader
          eyebrow="Candidate onboarding"
          title="Build your profile"
          description="These details are saved to your private profile. Your sign-up name is filled in automatically when available."
        />
        <Card className="stack">
          {loading ? (
            <p style={{ margin: 0 }}>Loading your profile…</p>
          ) : (
            <>
              <div className="grid-2">
                {(
                  [
                    ["full_name", "Full name"],
                    ["headline", "Professional headline"],
                    ["phone", "Phone"],
                    ["location", "Location"],
                    ["current_role", "Current role"],
                  ] as const
                ).map(([key, label]) => (
                  <label className="field-label" key={key}>
                    {label}
                    <Input
                      value={form[key]}
                      onChange={(e) => updateField(key, e.target.value)}
                      required={key === "full_name"}
                    />
                  </label>
                ))}
              </div>
              <label className="field-label">
                Bio
                <Textarea value={form.bio} onChange={(e) => updateField("bio", e.target.value)} />
              </label>
              {error ? (
                <p role="alert" className="field-error">
                  {error}
                </p>
              ) : null}
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
