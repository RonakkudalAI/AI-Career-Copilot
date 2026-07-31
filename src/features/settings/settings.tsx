"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button, Card, Input, PageHeader, Progress, Select, Textarea } from "@/components/ui/primitives";
import { apiRequest } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";

const tabs = [
  ["/settings/profile", "Profile"],
  ["/settings/account", "Account"],
  ["/settings/preferences", "Preferences"],
  ["/settings/privacy", "Privacy"],
] as const;

const PROFILE_EDITABLE_FIELDS = [
  "full_name",
  "headline",
  "bio",
  "phone",
  "location",
  "current_role",
  "years_experience",
  "career_level",
  "career_goal",
] as const;

const CAREER_LEVEL_OPTIONS = [
  { value: "fresher", label: "Fresher / Entry" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid-level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "manager", label: "Manager" },
  { value: "executive", label: "Executive" },
] as const;

const YEARS_OPTIONS = [0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30] as const;

const WORK_MODE_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const;

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "freelance", label: "Freelance" },
] as const;

const WORK_AUTHORIZATION_OPTIONS = [
  { value: "citizen", label: "Citizen / unrestricted" },
  { value: "permanent_resident", label: "Permanent resident" },
  { value: "work_permit", label: "Work permit / visa" },
  { value: "student_visa", label: "Student visa" },
  { value: "sponsorship_required", label: "Sponsorship required" },
] as const;

const NOTICE_PERIOD_OPTIONS = [
  { value: "", label: "Select notice period" },
  { value: "0", label: "Immediate (0 days)" },
  { value: "15", label: "15 days" },
  { value: "30", label: "30 days" },
  { value: "45", label: "45 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
] as const;

const CURRENCY_OPTIONS = [
  { value: "INR", label: "INR" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "AUD", label: "AUD" },
  { value: "CAD", label: "CAD" },
  { value: "SGD", label: "SGD" },
] as const;

const TARGET_ROLE_OPTIONS = [
  "Software Engineer",
  "Backend Engineer",
  "Frontend Engineer",
  "Full Stack Engineer",
  "Data Analyst",
  "Data Scientist",
  "Data Engineer",
  "Machine Learning Engineer",
  "DevOps Engineer",
  "Cloud Engineer",
  "QA Engineer",
  "Product Manager",
  "UI/UX Designer",
  "Business Analyst",
  "Cybersecurity Analyst",
] as const;

const INDUSTRY_OPTIONS = [
  "Technology",
  "Finance",
  "Healthcare",
  "Education",
  "E-commerce",
  "Manufacturing",
  "Consulting",
  "Telecommunications",
  "Government",
  "Media",
  "Startup",
] as const;

const LOCATION_OPTIONS = [
  "Remote",
  "Pune",
  "Bengaluru",
  "Hyderabad",
  "Mumbai",
  "Delhi NCR",
  "Chennai",
  "Kolkata",
  "Ahmedabad",
  "Jaipur",
  "Noida",
  "Gurgaon",
] as const;

const SKILL_OPTIONS = [
  "Python",
  "Java",
  "JavaScript",
  "TypeScript",
  "SQL",
  "React",
  "Node.js",
  "Next.js",
  "Django",
  "FastAPI",
  "Spring Boot",
  "AWS",
  "Azure",
  "Docker",
  "Kubernetes",
  "Git",
  "Power BI",
  "Tableau",
  "Machine Learning",
  "HTML/CSS",
] as const;

const DEGREE_OPTIONS = [
  { value: "B.Tech", label: "B.Tech" },
  { value: "B.E.", label: "B.E." },
  { value: "B.Sc", label: "B.Sc" },
  { value: "BCA", label: "BCA" },
  { value: "M.Tech", label: "M.Tech" },
  { value: "M.Sc", label: "M.Sc" },
  { value: "MCA", label: "MCA" },
  { value: "MBA", label: "MBA" },
  { value: "PG-DAC", label: "PG-DAC" },
  { value: "Diploma", label: "Diploma" },
  { value: "PhD", label: "PhD" },
] as const;

const FIELD_OF_STUDY_OPTIONS = [
  "Computer Science",
  "Information Technology",
  "Electronics",
  "Data Science",
  "Artificial Intelligence",
  "Mechanical",
  "Business",
] as const;

const CAREER_GOAL_OPTIONS = [
  { value: "switch_role", label: "Switch role" },
  { value: "get_first_job", label: "Get first job" },
  { value: "promotion", label: "Get promoted" },
  { value: "upskill", label: "Upskill in current role" },
  { value: "relocate", label: "Relocate for work" },
  { value: "freelance", label: "Move to freelance / contract" },
] as const;

const LINK_TYPE_OPTIONS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "github", label: "GitHub" },
  { value: "portfolio", label: "Portfolio" },
  { value: "website", label: "Website" },
  { value: "other", label: "Other" },
] as const;

type ProfileRecord = Record<string, any>;

type PrefDraft = {
  target_roles: string[];
  preferred_industries: string[];
  preferred_locations: string[];
  work_modes: string[];
  employment_types: string[];
  notice_period_days: string;
  work_authorization: string;
  salary_min: string;
  salary_max: string;
  salary_currency: string;
  willing_to_relocate: boolean;
};

function Frame({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
}) {
  const path = usePathname();
  return (
    <>
      <PageHeader eyebrow="Settings" title={title} description={description} />
      <nav className="settings-nav">
        {tabs.map(([href, label]) => (
          <Link
            key={href}
            className={`button ${path === href ? "button-primary" : "button-secondary"}`}
            href={href}
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function emptyPreferences() {
  return {
    target_roles: [] as string[],
    preferred_industries: [] as string[],
    preferred_locations: [] as string[],
    work_modes: [] as string[],
    employment_types: [] as string[],
    notice_period_days: null as number | null,
    willing_to_relocate: false,
    work_authorization: "",
    salary_min: null as number | null,
    salary_max: null as number | null,
    salary_currency: "",
  };
}

function emptyPrefDraft(): PrefDraft {
  return {
    target_roles: [],
    preferred_industries: [],
    preferred_locations: [],
    work_modes: [],
    employment_types: [],
    notice_period_days: "",
    work_authorization: "",
    salary_min: "",
    salary_max: "",
    salary_currency: "",
    willing_to_relocate: false,
  };
}

function prefsToDraft(prefs: Record<string, any>): PrefDraft {
  return {
    target_roles: asStringArray(prefs.target_roles),
    preferred_industries: asStringArray(prefs.preferred_industries),
    preferred_locations: asStringArray(prefs.preferred_locations),
    work_modes: asStringArray(prefs.work_modes),
    employment_types: asStringArray(prefs.employment_types),
    notice_period_days: prefs.notice_period_days == null ? "" : String(prefs.notice_period_days),
    work_authorization: prefs.work_authorization || "",
    salary_min: prefs.salary_min == null ? "" : String(prefs.salary_min),
    salary_max: prefs.salary_max == null ? "" : String(prefs.salary_max),
    salary_currency: prefs.salary_currency || "",
    willing_to_relocate: Boolean(prefs.willing_to_relocate),
  };
}

const OTHER_VALUE = "__other__";

function normalizeOptions(
  options: readonly { value: string; label: string }[] | readonly string[],
): Array<{ value: string; label: string }> {
  return options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : { value: option.value, label: option.label },
  );
}

function withExtraOptions(
  options: readonly { value: string; label: string }[] | readonly string[],
  extras: Array<string | null | undefined>,
) {
  const normalized = normalizeOptions(options);
  const known = new Set(normalized.map((option) => option.value));
  for (const extra of extras) {
    const value = (extra || "").trim();
    if (value && !known.has(value)) {
      normalized.push({ value, label: `${value} (saved)` });
      known.add(value);
    }
  }
  return normalized;
}

/** Dropdown that supports an Other choice and persists the custom typed value. */
function RequiredMark() {
  return (
    <span className="required-star" aria-hidden="true">
      *
    </span>
  );
}

/**
 * Select + free-text "Other" field (text and numbers).
 *
 * Sticky Other mode for ALL fields: once Other is active (dropdown choice, typing in
 * the custom box, or a non-preset value already saved), typing never snaps back to a
 * matching preset mid-word (e.g. "Pune", "Python", "Java", "0.9").
 * Only choosing another option in the dropdown leaves Other mode.
 * Always uses type="text" so intermediate strings are not coerced.
 */
function SelectWithOther({
  label,
  options,
  value,
  onChange,
  emptyLabel = "Select…",
  otherPlaceholder = "Enter custom value",
  inputType = "text",
  required = false,
}: {
  label: string;
  options: readonly { value: string; label: string }[] | readonly string[];
  value: string;
  onChange: (value: string) => void;
  emptyLabel?: string;
  otherPlaceholder?: string;
  /** Keyboard hint only — the field is always a text input. */
  inputType?: "text" | "number";
  required?: boolean;
}) {
  const optionList = normalizeOptions(options).filter((option) => option.value !== "" && option.value !== OTHER_VALUE);
  const knownKey = optionList.map((option) => option.value).join("\0");
  const known = useMemo(
    () => new Set(optionList.map((option) => option.value)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [knownKey],
  );

  const trimmed = (value || "").trim();
  const isPreset = Boolean(trimmed) && known.has(trimmed);
  const isCustomStored = Boolean(trimmed) && !known.has(trimmed);

  // Sticky lock: set true when entering Other or typing; only cleared by dropdown preset.
  const [otherLocked, setOtherLocked] = useState(isCustomStored);

  // Custom stored values always show Other UI; locked keeps it while typing presets names.
  const inOther = otherLocked || isCustomStored;
  const selectValue = inOther ? OTHER_VALUE : isPreset ? trimmed : "";
  const inputMode = inputType === "number" ? "decimal" : "text";

  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="field-label">
        <span>
          {label}
          {required ? <RequiredMark /> : null}
        </span>
        <Select
          value={selectValue}
          onChange={(e) => {
            const next = e.target.value;
            if (next === OTHER_VALUE) {
              setOtherLocked(true);
              // Fresh custom entry when leaving a preset.
              if (isPreset) onChange("");
            } else {
              setOtherLocked(false);
              onChange(next);
            }
          }}
        >
          <option value="">{emptyLabel}</option>
          {optionList.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value={OTHER_VALUE}>Other</option>
        </Select>
      </label>
      {inOther && (
        <label className="field-label">
          Specify other
          <Input
            type="text"
            inputMode={inputMode}
            autoComplete="off"
            spellCheck={inputType !== "number"}
            value={value ?? ""}
            onChange={(e) => {
              // Keep Other for the entire typing session (text or number).
              setOtherLocked(true);
              onChange(e.target.value);
            }}
            placeholder={otherPlaceholder}
          />
        </label>
      )}
    </div>
  );
}

function MultiOptionGroup({
  legend,
  options,
  selected,
  onChange,
  allowOther = false,
  otherPlaceholder = "Enter custom value",
  required = false,
}: {
  legend: string;
  options: readonly { value: string; label: string }[] | readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  allowOther?: boolean;
  otherPlaceholder?: string;
  required?: boolean;
}) {
  const baseOptions = normalizeOptions(options).filter((option) => option.value !== OTHER_VALUE);
  // Show presets + already-selected custom tags; do not treat the live Other draft as a checkbox.
  const normalized = withExtraOptions(baseOptions, selected);
  const [otherText, setOtherText] = useState("");
  const [showOtherInput, setShowOtherInput] = useState(false);

  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter((item) => item !== value));
    else onChange([...selected, value]);
  }

  function addOtherValue() {
    const text = otherText.trim();
    if (!text) return;
    // Commit only on Add / Enter — never while typing, even if text matches a preset name.
    if (!selected.includes(text)) onChange([...selected, text]);
    setOtherText("");
    // Keep Other open so more custom values can be typed without re-checking the box.
    setShowOtherInput(true);
  }

  return (
    <fieldset className="stack" style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, margin: 0 }}>
      <legend style={{ padding: "0 6px", fontWeight: 700 }}>
        {legend}
        {required ? <RequiredMark /> : null}
      </legend>
      <div className="cluster">
        {normalized.map((option) => (
          <label key={option.value} className="row" style={{ gap: 8, justifyContent: "flex-start" }}>
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => toggle(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
        {allowOther && (
          <label className="row" style={{ gap: 8, justifyContent: "flex-start" }}>
            <input
              type="checkbox"
              checked={showOtherInput}
              onChange={(e) => {
                setShowOtherInput(e.target.checked);
                if (!e.target.checked) setOtherText("");
              }}
            />
            <span>Other</span>
          </label>
        )}
      </div>
      {allowOther && showOtherInput && (
        <div className="cluster">
          <label className="field-label" style={{ flex: 1 }}>
            Specify other
            <Input
              type="text"
              autoComplete="off"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder={otherPlaceholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOtherValue();
                }
              }}
            />
          </label>
          <Button type="button" onClick={addOtherValue} disabled={!otherText.trim()}>
            Add
          </Button>
        </div>
      )}
    </fieldset>
  );
}

type ResumeListItem = {
  id: string;
  title: string;
  latest_version?: { id: string; original_filename?: string; extraction_status?: string } | null;
};

type ProfileDraft = {
  profile: ProfileRecord;
  skills: ProfileRecord[];
  experiences: ProfileRecord[];
  education: ProfileRecord[];
  projects?: ProfileRecord[];
  certifications?: ProfileRecord[];
  languages?: ProfileRecord[];
  links: ProfileRecord[];
  meta?: { warnings?: string[]; email_detected?: string | null; method?: string };
};

export function ProfileSettings() {
  const [form, setForm] = useState<ProfileRecord>({});
  const [prefDraft, setPrefDraft] = useState<PrefDraft>(emptyPrefDraft());
  const [skills, setSkills] = useState<ProfileRecord[]>([]);
  const [experiences, setExperiences] = useState<ProfileRecord[]>([]);
  const [education, setEducation] = useState<ProfileRecord[]>([]);
  const [links, setLinks] = useState<ProfileRecord[]>([]);
  const [skillName, setSkillName] = useState("");
  const [experienceDraft, setExperienceDraft] = useState({
    company_name: "",
    role_title: "",
    location: "",
    employment_type: "",
    summary: "",
  });
  const [educationDraft, setEducationDraft] = useState({ institution: "", degree: "", field_of_study: "" });
  const [linkDraft, setLinkDraft] = useState({ link_type: "linkedin", url: "", label: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [fillBusy, setFillBusy] = useState(false);
  const [fillEmptyOnly, setFillEmptyOnly] = useState(true);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [draftDisclaimer, setDraftDisclaimer] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const AVATAR_MAX_BYTES = 3 * 1024 * 1024;

  const applyProfile = useCallback((profile: ProfileRecord | null | undefined) => {
    setForm(profile || {});
  }, []);

  const applyLoaded = useCallback(
    (
      profilePayload: { profile: ProfileRecord; preferences: ProfileRecord },
      skillRows: ProfileRecord[],
      experienceRows: ProfileRecord[],
      educationRows: ProfileRecord[],
      linkRows: ProfileRecord[],
    ) => {
      applyProfile(profilePayload.profile);
      const prefs = { ...emptyPreferences(), ...(profilePayload.preferences || {}) };
      setPrefDraft(prefsToDraft(prefs));
      setSkills(skillRows || []);
      setExperiences(experienceRows || []);
      setEducation(educationRows || []);
      setLinks(linkRows || []);
    },
    [applyProfile],
  );

  const loadAll = useCallback(async () => {
    const [profilePayload, skillRows, experienceRows, educationRows, linkRows] = await Promise.all([
      apiRequest<{ profile: ProfileRecord; preferences: ProfileRecord }>("/profile"),
      apiRequest<ProfileRecord[]>("/profile/skills"),
      apiRequest<ProfileRecord[]>("/profile/experiences"),
      apiRequest<ProfileRecord[]>("/profile/education"),
      apiRequest<ProfileRecord[]>("/profile/links"),
    ]);
    applyLoaded(profilePayload, skillRows, experienceRows, educationRows, linkRows);
    return profilePayload;
  }, [applyLoaded]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ profile: ProfileRecord; preferences: ProfileRecord }>("/profile"),
      apiRequest<ProfileRecord[]>("/profile/skills"),
      apiRequest<ProfileRecord[]>("/profile/experiences"),
      apiRequest<ProfileRecord[]>("/profile/education"),
      apiRequest<ProfileRecord[]>("/profile/links"),
      apiRequest<ResumeListItem[]>("/resumes").catch(() => [] as ResumeListItem[]),
    ])
      .then(([profilePayload, skillRows, experienceRows, educationRows, linkRows, resumeRows]) => {
        if (!active) return;
        applyLoaded(profilePayload, skillRows, experienceRows, educationRows, linkRows);
        setResumes(resumeRows || []);
        const firstVersion = resumeRows?.find((r) => r.latest_version?.id)?.latest_version?.id || "";
        setSelectedVersionId(firstVersion);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyLoaded]);

  async function previewFromStoredResume() {
    setFillBusy(true);
    setError("");
    setMessage("");
    try {
      const body = selectedVersionId ? { resume_version_id: selectedVersionId } : {};
      const result = await apiRequest<{
        draft: ProfileDraft;
        disclaimer?: string;
        counts?: Record<string, number>;
        ai_used?: boolean;
        method?: string;
      }>("/profile/from-resume/preview", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setDraft(result.draft);
      setDraftDisclaimer(result.disclaimer || "");
      const countText = result.counts
        ? Object.entries(result.counts)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${n} ${k}`)
            .join(", ")
        : "";
      const engine = result.ai_used ? "AI + rules" : "rules only";
      const fields = (result as { fields_extracted?: Record<string, unknown> }).fields_extracted;
      const profileFields = Array.isArray(fields?.profile) ? (fields.profile as string[]).join(", ") : "";
      setMessage(
        [
          countText ? `Draft ready (${engine}): ${countText}.` : `Draft ready (${engine}).`,
          profileFields ? `Profile fields: ${profileFields}.` : "",
          "Review and apply below.",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFillBusy(false);
    }
  }

  async function previewFromUpload(file: File | null) {
    if (!file) return;
    setFillBusy(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiRequest<{
        draft: ProfileDraft;
        disclaimer?: string;
        counts?: Record<string, number>;
        ai_used?: boolean;
      }>("/profile/from-resume/preview-upload", { method: "POST", body: formData });
      setDraft(result.draft);
      setDraftDisclaimer(result.disclaimer || "");
      setMessage(
        result.ai_used
          ? "Draft built with AI structured extraction. Review and apply below."
          : "Draft built with rule-based extraction (AI not configured or unavailable). Review and apply below.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFillBusy(false);
    }
  }

  function toggleDraftItem(section: keyof ProfileDraft, index: number) {
    setDraft((current) => {
      if (!current) return current;
      const rows = [...((current[section] as ProfileRecord[]) || [])];
      if (!rows[index]) return current;
      rows[index] = { ...rows[index], selected: rows[index].selected === false };
      return { ...current, [section]: rows };
    });
  }

  async function applyResumeDraft() {
    if (!draft) return;
    setFillBusy(true);
    setError("");
    setMessage("");
    try {
      const pick = (rows: ProfileRecord[] | undefined) =>
        (rows || []).filter((row) => row.selected !== false);
      const result = await apiRequest<{
        created: Record<string, number>;
        updated_profile_fields: string[];
        profile_completion?: number;
      }>("/profile/from-resume/apply", {
        method: "POST",
        body: JSON.stringify({
          fill_empty_only: fillEmptyOnly,
          profile: draft.profile?.selected === false ? {} : draft.profile || {},
          skills: pick(draft.skills),
          experiences: pick(draft.experiences),
          education: pick(draft.education),
          projects: pick(draft.projects),
          certifications: pick(draft.certifications),
          languages: pick(draft.languages),
          links: pick(draft.links),
        }),
      });
      await loadAll();
      const createdParts = Object.entries(result.created || {})
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k}`);
      const fields = result.updated_profile_fields?.length
        ? `Updated profile fields: ${result.updated_profile_fields.join(", ")}.`
        : "No core profile fields changed (empty-only mode or already filled).";
      setMessage(
        `Profile fill applied. ${fields}${createdParts.length ? ` Added ${createdParts.join(", ")}.` : ""} Completion: ${result.profile_completion ?? "—"}%.`,
      );
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFillBusy(false);
    }
  }

  function updateField(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const yearsRaw = form.years_experience;
      const years =
        yearsRaw === "" || yearsRaw === null || yearsRaw === undefined ? undefined : Number(yearsRaw);
      if (years !== undefined && Number.isNaN(years)) {
        throw new Error("Years of experience must be a number.");
      }
      const editable = Object.fromEntries(
        PROFILE_EDITABLE_FIELDS.map((key) => {
          if (key === "years_experience") return [key, years];
          const value = form[key];
          if (value === undefined || value === null) return [key, undefined];
          if (typeof value === "string" && value.trim() === "" && key !== "bio") return [key, undefined];
          return [key, typeof value === "string" ? value.trim() : value];
        }).filter(([, value]) => value !== undefined),
      );
      await apiRequest<ProfileRecord>("/profile", {
        method: "PATCH",
        body: JSON.stringify(editable),
      });
      // Re-read from API/DB so the UI only shows persisted values.
      await loadAll();
      setMessage("Profile saved to your account.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function savePreferences() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const payload = {
        target_roles: prefDraft.target_roles,
        preferred_industries: prefDraft.preferred_industries,
        preferred_locations: prefDraft.preferred_locations,
        work_modes: prefDraft.work_modes,
        employment_types: prefDraft.employment_types,
        notice_period_days: prefDraft.notice_period_days === "" ? null : Number(prefDraft.notice_period_days),
        willing_to_relocate: Boolean(prefDraft.willing_to_relocate),
        work_authorization: prefDraft.work_authorization || null,
        salary_min: prefDraft.salary_min === "" ? null : Number(prefDraft.salary_min),
        salary_max: prefDraft.salary_max === "" ? null : Number(prefDraft.salary_max),
        salary_currency: prefDraft.salary_currency ? prefDraft.salary_currency.toUpperCase() : null,
      };
      if (payload.notice_period_days !== null && Number.isNaN(payload.notice_period_days)) {
        throw new Error("Notice period must be a number.");
      }
      if (payload.salary_min !== null && Number.isNaN(payload.salary_min)) {
        throw new Error("Minimum salary must be a number.");
      }
      if (payload.salary_max !== null && Number.isNaN(payload.salary_max)) {
        throw new Error("Maximum salary must be a number.");
      }
      if (payload.salary_currency && !/^[A-Z]{3}$/.test(payload.salary_currency)) {
        throw new Error("Currency must be a 3-letter code such as INR or USD.");
      }
      await apiRequest("/profile/preferences", { method: "PUT", body: JSON.stringify(payload) });
      await loadAll();
      setMessage("Career preferences saved to your account.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addSkill() {
    if (!skillName.trim()) return;
    setError("");
    setMessage("");
    try {
      await apiRequest("/profile/skills", {
        method: "POST",
        body: JSON.stringify({ name: skillName.trim(), source: "candidate" }),
      });
      setSkillName("");
      await loadAll();
      setMessage("Skill saved to your account.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function importSkillsFromResume() {
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<{ created_count: number; suggested: string[] }>("/profile/skills/from-resume", {
        method: "POST",
      });
      await loadAll();
      setMessage(
        result.created_count
          ? `Imported ${result.created_count} skill(s) from your confirmed resume.`
          : result.suggested?.length
            ? "No new skills to import — matching skills already exist on your profile."
            : "No known skills were detected in your confirmed resume.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function uploadAvatar(file: File | null) {
    if (!file) return;
    setError("");
    setMessage("");
    if (file.size > AVATAR_MAX_BYTES) {
      setError("Profile picture must be 3 MB or smaller.");
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (file.type && !allowed.includes(file.type)) {
      setError("Only JPEG, PNG, and WebP images are supported.");
      return;
    }
    setAvatarBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await apiRequest<{ profile: ProfileRecord; avatar_url?: string }>("/profile/avatar", {
        method: "POST",
        body,
      });
      applyProfile(result.profile || {});
      setMessage("Profile picture saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setError("");
    setMessage("");
    setAvatarBusy(true);
    try {
      await apiRequest("/profile/avatar", { method: "DELETE" });
      setForm((current) => ({ ...current, avatar_path: null, avatar_url: null }));
      setMessage("Profile picture removed.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeRecord(resource: string, id: string, label: string) {
    setError("");
    setMessage("");
    try {
      await apiRequest(`/profile/${resource}/${id}`, { method: "DELETE" });
      await loadAll();
      setMessage(`${label} removed from your account.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addExperience() {
    if (!experienceDraft.company_name.trim() || !experienceDraft.role_title.trim()) return;
    setError("");
    setMessage("");
    try {
      await apiRequest("/profile/experiences", {
        method: "POST",
        body: JSON.stringify({
          company_name: experienceDraft.company_name.trim(),
          role_title: experienceDraft.role_title.trim(),
          location: experienceDraft.location.trim() || null,
          employment_type: experienceDraft.employment_type || null,
          summary: experienceDraft.summary.trim() || null,
        }),
      });
      setExperienceDraft({ company_name: "", role_title: "", location: "", employment_type: "", summary: "" });
      await loadAll();
      setMessage("Experience saved to your account.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addEducation() {
    if (!educationDraft.institution.trim()) return;
    setError("");
    setMessage("");
    try {
      await apiRequest("/profile/education", {
        method: "POST",
        body: JSON.stringify({
          institution: educationDraft.institution.trim(),
          degree: educationDraft.degree || null,
          field_of_study: educationDraft.field_of_study.trim() || null,
        }),
      });
      setEducationDraft({ institution: "", degree: "", field_of_study: "" });
      await loadAll();
      setMessage("Education saved to your account.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addLink() {
    if (!linkDraft.url.trim()) return;
    setError("");
    setMessage("");
    try {
      await apiRequest("/profile/links", {
        method: "POST",
        body: JSON.stringify({
          link_type: linkDraft.link_type,
          url: linkDraft.url.trim(),
          label: linkDraft.label.trim() || null,
        }),
      });
      setLinkDraft({ link_type: "linkedin", url: "", label: "" });
      await loadAll();
      setMessage("Link saved to your account.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const completion = Number(form.profile_completion || 0);
  const profileComplete = completion >= 100;
  const yearsValue =
    form.years_experience === null || form.years_experience === undefined || form.years_experience === ""
      ? ""
      : String(form.years_experience);

  return (
    <Frame
      title="Candidate profile"
      description="All edits are saved to your private Supabase account. Limited-choice fields use menus so values stay consistent."
    >
      {loading ? (
        <Card>
          <p>Loading profile…</p>
        </Card>
      ) : (
        <div className="stack">
          <Card className={`stack completion-panel ${profileComplete ? "is-complete" : ""}`} aria-hidden={profileComplete}>
            <Progress value={completion} label="Profile completion" />
          </Card>

          <Card className="stack panel-blue">
            <h2 style={{ margin: 0 }}>Fill profile from resume</h2>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              Upload a resume or pick one already saved. When NVIDIA AI is configured, we use structured AI extraction
              plus rules for better accuracy. You always review before anything is saved.
            </p>
            <div className="grid-2">
              <label className="field-label">
                Saved resume
                <Select
                  value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                >
                  <option value="">Latest resume with text</option>
                  {resumes.map((resume) =>
                    resume.latest_version?.id ? (
                      <option key={resume.latest_version.id} value={resume.latest_version.id}>
                        {resume.title}
                        {resume.latest_version.original_filename
                          ? ` · ${resume.latest_version.original_filename}`
                          : ""}
                      </option>
                    ) : null,
                  )}
                </Select>
              </label>
              <label className="field-label">
                Or upload PDF / DOCX
                <Input
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  disabled={fillBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    void previewFromUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <label className="row" style={{ justifyContent: "flex-start", gap: 8 }}>
              <input
                type="checkbox"
                checked={fillEmptyOnly}
                onChange={(e) => setFillEmptyOnly(e.target.checked)}
              />
              <span>Only fill empty profile fields (recommended)</span>
            </label>
            <div className="cluster">
              <Button type="button" disabled={fillBusy} onClick={() => void previewFromStoredResume()}>
                {fillBusy ? "Working…" : "Preview from saved resume"}
              </Button>
              {draft ? (
                <>
                  <Button type="button" disabled={fillBusy} onClick={() => void applyResumeDraft()}>
                    {fillBusy ? "Applying…" : "Apply selected draft"}
                  </Button>
                  <Button type="button" variant="secondary" disabled={fillBusy} onClick={() => setDraft(null)}>
                    Discard draft
                  </Button>
                </>
              ) : null}
            </div>
            {draftDisclaimer ? <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>{draftDisclaimer}</p> : null}
            {draft?.meta?.warnings?.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {draft.meta.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {draft ? (
              <div className="stack" style={{ gap: 12 }}>
                <div className="suggestion stack" style={{ gap: 6 }}>
                  <strong>Profile fields</strong>
                  <label className="row" style={{ justifyContent: "flex-start", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={draft.profile?.selected !== false}
                      onChange={() =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                profile: {
                                  ...current.profile,
                                  selected: current.profile?.selected === false,
                                },
                              }
                            : current,
                        )
                      }
                    />
                    <span>
                      {[
                        draft.profile?.full_name,
                        draft.profile?.current_role,
                        draft.profile?.location,
                        draft.profile?.phone,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No core profile fields detected"}
                    </span>
                  </label>
                  {draft.profile?.headline ? (
                    <p style={{ margin: 0, fontSize: "var(--text-sm)" }}>{draft.profile.headline}</p>
                  ) : null}
                </div>
                {(
                  [
                    ["skills", "Skills", (row: ProfileRecord) => row.name],
                    [
                      "experiences",
                      "Experience",
                      (row: ProfileRecord) => `${row.role_title || "Role"} · ${row.company_name || ""}`,
                    ],
                    [
                      "education",
                      "Education",
                      (row: ProfileRecord) =>
                        [row.degree, row.institution].filter(Boolean).join(" · ") || row.institution,
                    ],
                    ["projects", "Projects", (row: ProfileRecord) => row.title],
                    ["certifications", "Certifications", (row: ProfileRecord) => row.name],
                    ["languages", "Languages", (row: ProfileRecord) => row.language],
                    ["links", "Links", (row: ProfileRecord) => `${row.link_type}: ${row.url}`],
                  ] as Array<[keyof ProfileDraft, string, (row: ProfileRecord) => string]>
                ).map(([key, label, render]) => {
                  const rows = (draft[key] as ProfileRecord[] | undefined) || [];
                  if (!rows.length) return null;
                  return (
                    <div key={key} className="suggestion stack" style={{ gap: 6 }}>
                      <strong>
                        {label} ({rows.length})
                      </strong>
                      {rows.map((row, index) => (
                        <label key={`${key}-${index}`} className="row" style={{ justifyContent: "flex-start", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={row.selected !== false}
                            onChange={() => toggleDraftItem(key, index)}
                          />
                          <span style={{ fontSize: "var(--text-sm)" }}>{render(row)}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </Card>

          {(message || error) && (
            <Card className="stack">
              {error ? (
                <p role="alert" className="field-error" style={{ margin: 0 }}>
                  {error}
                </p>
              ) : null}
              {message ? (
                <p role="status" style={{ margin: 0 }}>
                  {message}
                </p>
              ) : null}
            </Card>
          )}

          <Card className="stack">
            <h2 style={{ margin: 0 }}>Profile picture</h2>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              JPEG, PNG, or WebP · maximum 3 MB. Stored privately in your Supabase account.
            </p>
            <div className="row" style={{ justifyContent: "flex-start", gap: 16, alignItems: "center" }}>
              <div className="profile-avatar-preview" aria-hidden={!form.avatar_url}>
                {form.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.avatar_url} alt="" width={88} height={88} />
                ) : (
                  <span className="profile-avatar-fallback">
                    {(form.full_name || "U")
                      .split(" ")
                      .map((part: string) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                )}
              </div>
              <div className="stack" style={{ gap: 10, flex: 1 }}>
                <label className="field-label">
                  Upload photo
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    disabled={avatarBusy}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      void uploadAvatar(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="cluster">
                  {form.avatar_path || form.avatar_url ? (
                    <Button type="button" variant="secondary" disabled={avatarBusy} onClick={() => void removeAvatar()}>
                      {avatarBusy ? "Working…" : "Remove picture"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>

          <Card className="stack">
            <h2 style={{ margin: 0 }}>Basic details</h2>
            <div className="grid-2">
              <label className="field-label">
                <span>
                  Full name
                  <RequiredMark />
                </span>
                <Input value={form.full_name || ""} onChange={(e) => updateField("full_name", e.target.value)} />
              </label>
              <label className="field-label">
                Headline
                <Input value={form.headline || ""} onChange={(e) => updateField("headline", e.target.value)} />
              </label>
              <label className="field-label">
                Phone
                <Input value={form.phone || ""} onChange={(e) => updateField("phone", e.target.value)} />
              </label>
              <SelectWithOther
                label="Location"
                options={LOCATION_OPTIONS}
                value={form.location || ""}
                onChange={(value) => updateField("location", value)}
                emptyLabel="Select location"
                otherPlaceholder="Enter your location"
                required
              />
              <SelectWithOther
                label="Current role"
                options={TARGET_ROLE_OPTIONS}
                value={form.current_role || ""}
                onChange={(value) => updateField("current_role", value)}
                emptyLabel="Select current role"
                otherPlaceholder="Enter your current role"
                required
              />
              <SelectWithOther
                label="Years of experience"
                options={YEARS_OPTIONS.map((years) => ({
                  value: String(years),
                  label: years === 0 ? "0 (Fresher)" : String(years),
                }))}
                value={yearsValue}
                onChange={(value) => updateField("years_experience", value)}
                emptyLabel="Select years"
                otherPlaceholder="Enter years of experience"
                inputType="number"
                required
              />
              <SelectWithOther
                label="Career level"
                options={CAREER_LEVEL_OPTIONS}
                value={form.career_level || ""}
                onChange={(value) => updateField("career_level", value)}
                emptyLabel="Select career level"
                otherPlaceholder="Enter career level"
              />
              <SelectWithOther
                label="Career goal"
                options={CAREER_GOAL_OPTIONS}
                value={form.career_goal || ""}
                onChange={(value) => updateField("career_goal", value)}
                emptyLabel="Select career goal"
                otherPlaceholder="Describe your career goal"
              />
            </div>
            <label className="field-label">
              Bio
              <Textarea value={form.bio || ""} onChange={(e) => updateField("bio", e.target.value)} />
            </label>
            <p className="mono" style={{ margin: 0 }}>
              Tip: choose 0 years if you are a fresher with no work history yet.
            </p>
            <Button onClick={saveProfile} disabled={saving}>
              Save profile
            </Button>
          </Card>

          <Card className="stack">
            <h2 style={{ margin: 0 }}>Career preferences</h2>
            <p>These preferences are saved to your account.</p>
            <MultiOptionGroup
              legend="Target roles"
              options={TARGET_ROLE_OPTIONS}
              selected={prefDraft.target_roles}
              onChange={(target_roles) => setPrefDraft({ ...prefDraft, target_roles })}
              allowOther
              otherPlaceholder="Enter another target role"
              required
            />
            <MultiOptionGroup
              legend="Preferred industries"
              options={INDUSTRY_OPTIONS}
              selected={prefDraft.preferred_industries}
              onChange={(preferred_industries) => setPrefDraft({ ...prefDraft, preferred_industries })}
              allowOther
              otherPlaceholder="Enter another industry"
            />
            <MultiOptionGroup
              legend="Preferred locations"
              options={LOCATION_OPTIONS}
              selected={prefDraft.preferred_locations}
              onChange={(preferred_locations) => setPrefDraft({ ...prefDraft, preferred_locations })}
              allowOther
              otherPlaceholder="Enter another location"
              required
            />
            <MultiOptionGroup
              legend="Work modes"
              options={WORK_MODE_OPTIONS}
              selected={prefDraft.work_modes}
              onChange={(work_modes) => setPrefDraft({ ...prefDraft, work_modes })}
              required
            />
            <MultiOptionGroup
              legend="Employment types"
              options={EMPLOYMENT_TYPE_OPTIONS}
              selected={prefDraft.employment_types}
              onChange={(employment_types) => setPrefDraft({ ...prefDraft, employment_types })}
              allowOther
              otherPlaceholder="Enter another employment type"
            />
            <div className="grid-2">
              <SelectWithOther
                label="Work authorization"
                options={WORK_AUTHORIZATION_OPTIONS}
                value={prefDraft.work_authorization}
                onChange={(work_authorization) => setPrefDraft({ ...prefDraft, work_authorization })}
                emptyLabel="Select work authorization"
                otherPlaceholder="Describe work authorization"
              />
              <SelectWithOther
                label="Notice period"
                options={NOTICE_PERIOD_OPTIONS.filter((option) => option.value !== "")}
                value={prefDraft.notice_period_days}
                onChange={(notice_period_days) => setPrefDraft({ ...prefDraft, notice_period_days })}
                emptyLabel="Select notice period"
                otherPlaceholder="Enter notice period in days"
                inputType="number"
              />
              <SelectWithOther
                label="Salary currency"
                options={CURRENCY_OPTIONS}
                value={prefDraft.salary_currency}
                onChange={(salary_currency) => setPrefDraft({ ...prefDraft, salary_currency: salary_currency.toUpperCase() })}
                emptyLabel="Select currency"
                otherPlaceholder="Enter 3-letter currency code"
              />
              <label className="field-label">
                Minimum salary
                <Input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={prefDraft.salary_min}
                  onChange={(e) => setPrefDraft({ ...prefDraft, salary_min: e.target.value })}
                  placeholder="e.g. 600000"
                />
              </label>
              <label className="field-label">
                Maximum salary
                <Input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={prefDraft.salary_max}
                  onChange={(e) => setPrefDraft({ ...prefDraft, salary_max: e.target.value })}
                  placeholder="e.g. 1200000"
                />
              </label>
            </div>
            <label className="row">
              <span>Willing to relocate</span>
              <input
                type="checkbox"
                checked={prefDraft.willing_to_relocate}
                onChange={(e) => setPrefDraft({ ...prefDraft, willing_to_relocate: e.target.checked })}
              />
            </label>
            <Button onClick={savePreferences} disabled={saving}>
              Save career preferences
            </Button>
          </Card>

          <Card className="stack">
            <h2 style={{ margin: 0 }}>
              Skills
              <RequiredMark />
            </h2>
            <div className="cluster" style={{ alignItems: "end" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <SelectWithOther
                  label="Skill"
                  options={SKILL_OPTIONS}
                  value={skillName}
                  onChange={setSkillName}
                  emptyLabel="Select a skill"
                  otherPlaceholder="Enter skill name"
                />
              </div>
              <Button onClick={addSkill} disabled={!skillName.trim()}>
                Add skill
              </Button>
              <Button variant="secondary" onClick={importSkillsFromResume}>
                Import from resume
              </Button>
            </div>
            <div className="cluster">
              {skills.length === 0 && <p style={{ margin: 0 }}>No skills saved yet.</p>}
              {skills.map((skill) => (
                <span key={skill.id} className="badge badge-info" style={{ gap: 8 }}>
                  {skill.name}
                  <button
                    type="button"
                    className="button-quiet"
                    style={{ minHeight: "auto", padding: 0, boxShadow: "none", border: "none" }}
                    onClick={() => removeRecord("skills", skill.id, "Skill")}
                    aria-label={`Remove ${skill.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </Card>

          <Card className="stack">
            <h2 style={{ margin: 0 }}>
              Work experience
              <RequiredMark />
            </h2>
            <p className="mono" style={{ margin: 0 }}>
              Add at least one experience, or set years of experience to 0 for fresher credit.
            </p>
            <div className="grid-2">
              <label className="field-label">
                Company
                <Input
                  value={experienceDraft.company_name}
                  onChange={(e) => setExperienceDraft({ ...experienceDraft, company_name: e.target.value })}
                />
              </label>
              <SelectWithOther
                label="Role title"
                options={TARGET_ROLE_OPTIONS}
                value={experienceDraft.role_title}
                onChange={(role_title) => setExperienceDraft({ ...experienceDraft, role_title })}
                emptyLabel="Select role title"
                otherPlaceholder="Enter role title"
              />
              <SelectWithOther
                label="Location"
                options={LOCATION_OPTIONS}
                value={experienceDraft.location}
                onChange={(location) => setExperienceDraft({ ...experienceDraft, location })}
                emptyLabel="Select location"
                otherPlaceholder="Enter location"
              />
              <SelectWithOther
                label="Employment type"
                options={EMPLOYMENT_TYPE_OPTIONS}
                value={experienceDraft.employment_type}
                onChange={(employment_type) => setExperienceDraft({ ...experienceDraft, employment_type })}
                emptyLabel="Select employment type"
                otherPlaceholder="Enter employment type"
              />
              <label className="field-label">
                Summary
                <Input
                  value={experienceDraft.summary}
                  onChange={(e) => setExperienceDraft({ ...experienceDraft, summary: e.target.value })}
                />
              </label>
            </div>
            <Button
              onClick={addExperience}
              disabled={!experienceDraft.company_name.trim() || !experienceDraft.role_title.trim()}
            >
              Add experience
            </Button>
            {experiences.length === 0 ? (
              <p style={{ margin: 0 }}>
                No experience records yet. Add one, or set years of experience to 0 for fresher credit.
              </p>
            ) : (
              experiences.map((item) => (
                <div key={item.id} className="row">
                  <div>
                    <strong>
                      {item.role_title} · {item.company_name}
                    </strong>
                    <p style={{ margin: 0 }}>
                      {[item.employment_type, item.location, item.summary].filter(Boolean).join(" · ") ||
                        "Saved experience"}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => removeRecord("experiences", item.id, "Experience")}>
                    Remove
                  </Button>
                </div>
              ))
            )}
          </Card>

          <Card className="stack">
            <h2 style={{ margin: 0 }}>
              Education
              <RequiredMark />
            </h2>
            <div className="grid-2">
              <label className="field-label">
                Institution
                <Input
                  value={educationDraft.institution}
                  onChange={(e) => setEducationDraft({ ...educationDraft, institution: e.target.value })}
                />
              </label>
              <SelectWithOther
                label="Degree"
                options={DEGREE_OPTIONS}
                value={educationDraft.degree}
                onChange={(degree) => setEducationDraft({ ...educationDraft, degree })}
                emptyLabel="Select degree"
                otherPlaceholder="Enter degree"
              />
              <SelectWithOther
                label="Field of study"
                options={FIELD_OF_STUDY_OPTIONS}
                value={educationDraft.field_of_study}
                onChange={(field_of_study) => setEducationDraft({ ...educationDraft, field_of_study })}
                emptyLabel="Select field of study"
                otherPlaceholder="Enter field of study"
              />
            </div>
            <Button onClick={addEducation} disabled={!educationDraft.institution.trim()}>
              Add education
            </Button>
            {education.length === 0 ? (
              <p style={{ margin: 0 }}>No education records yet.</p>
            ) : (
              education.map((item) => (
                <div key={item.id} className="row">
                  <div>
                    <strong>{item.institution}</strong>
                    <p style={{ margin: 0 }}>
                      {[item.degree, item.field_of_study].filter(Boolean).join(" · ") || "Saved education"}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => removeRecord("education", item.id, "Education")}>
                    Remove
                  </Button>
                </div>
              ))
            )}
          </Card>

          <Card className="stack">
            <h2 style={{ margin: 0 }}>
              Professional links
              <RequiredMark />
            </h2>
            <div className="grid-2">
              <label className="field-label">
                Link type
                <Select
                  value={linkDraft.link_type}
                  onChange={(e) => setLinkDraft({ ...linkDraft, link_type: e.target.value })}
                >
                  {LINK_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field-label">
                URL
                <Input
                  value={linkDraft.url}
                  onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })}
                  placeholder="https://"
                />
              </label>
              <label className="field-label">
                Label
                <Input
                  value={linkDraft.label}
                  onChange={(e) => setLinkDraft({ ...linkDraft, label: e.target.value })}
                  placeholder="Optional label"
                />
              </label>
            </div>
            <Button onClick={addLink} disabled={!linkDraft.url.trim()}>
              Add link
            </Button>
            {links.length === 0 ? (
              <p style={{ margin: 0 }}>No links saved yet.</p>
            ) : (
              links.map((item) => (
                <div key={item.id} className="row">
                  <div>
                    <strong>{item.label || item.link_type}</strong>
                    <p style={{ margin: 0 }}>{item.url}</p>
                  </div>
                  <Button variant="secondary" onClick={() => removeRecord("links", item.id, "Link")}>
                    Remove
                  </Button>
                </div>
              ))
            )}
          </Card>

          {(message || error) && (
            <Card>
              {message && (
                <p role="status" style={{ margin: 0 }}>
                  {message}
                </p>
              )}
              {error && (
                <p role="alert" className="field-error" style={{ margin: 0 }}>
                  {error}
                </p>
              )}
            </Card>
          )}
        </div>
      )}
    </Frame>
  );
}

const DELETE_ACCOUNT_PHRASE = "DELETE MY ACCOUNT";

export function AccountSettings() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeletePanel, setShowDeletePanel] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (active && user?.email) setAccountEmail(user.email);
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    await createClient()?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  async function change() {
    setError("");
    setMessage("");
    const email = prompt("Enter your account email to receive a recovery link");
    if (!email) return;
    const result = await createClient()?.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
    });
    if (result?.error) setError(result.error.message);
    else setMessage("If that email is registered, a recovery link has been sent.");
  }

  async function deleteAccount() {
    setError("");
    setMessage("");
    if (confirmPhrase.trim() !== DELETE_ACCOUNT_PHRASE) {
      setError(`Type exactly ${DELETE_ACCOUNT_PHRASE} to confirm.`);
      return;
    }
    if (accountEmail && confirmEmail.trim().toLowerCase() !== accountEmail.toLowerCase()) {
      setError("Email does not match your signed-in account.");
      return;
    }
    const ok = window.confirm(
      "This permanently deletes your account, profile, resumes, ATS analyses, interviews, jobs, and files. This cannot be undone. Continue?",
    );
    if (!ok) return;

    setDeleting(true);
    try {
      await apiRequest("/account", {
        method: "DELETE",
        body: JSON.stringify({
          confirmation: DELETE_ACCOUNT_PHRASE,
          email: confirmEmail.trim() || accountEmail || null,
        }),
      });
      await createClient()?.auth.signOut();
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  const canDelete =
    confirmPhrase.trim() === DELETE_ACCOUNT_PHRASE &&
    (!accountEmail || confirmEmail.trim().toLowerCase() === accountEmail.toLowerCase());

  return (
    <Frame title="Account & access" description="Supabase Auth manages sign-in and password recovery.">
      <Card className="stack">
        <h2 style={{ margin: 0 }}>Session</h2>
        {accountEmail ? (
          <p style={{ margin: 0 }}>
            Signed in as <strong>{accountEmail}</strong>
          </p>
        ) : null}
        <div className="cluster">
          <Button variant="secondary" onClick={change}>
            Send password recovery link
          </Button>
          <Button variant="secondary" onClick={logout}>
            Logout
          </Button>
        </div>
        {message && (
          <p role="status" style={{ margin: 0 }}>
            {message}
          </p>
        )}
        {error && !showDeletePanel && (
          <p role="alert" className="field-error" style={{ margin: 0 }}>
            {error}
          </p>
        )}
      </Card>

      <Card className="stack" style={{ borderColor: "color-mix(in srgb, var(--danger) 45%, var(--border))" }}>
        <h2 style={{ margin: 0 }}>Delete account</h2>
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          Permanently removes your auth account and all candidate data stored in Supabase: profile, skills, experience,
          education, resumes and files, job descriptions, ATS analyses, interviews, learning paths, saved jobs,
          activity, and preferences. This cannot be undone.
        </p>
        {!showDeletePanel ? (
          <Button variant="danger" onClick={() => setShowDeletePanel(true)}>
            I want to delete my account
          </Button>
        ) : (
          <div className="stack">
            <label className="field-label">
              Confirm your account email
              <Input
                type="email"
                autoComplete="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={accountEmail || "you@example.com"}
                disabled={deleting}
              />
            </label>
            <label className="field-label">
              Type <span className="mono">{DELETE_ACCOUNT_PHRASE}</span> to confirm
              <Input
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder={DELETE_ACCOUNT_PHRASE}
                disabled={deleting}
                autoComplete="off"
              />
            </label>
            <div className="cluster">
              <Button variant="danger" disabled={deleting || !canDelete} onClick={() => void deleteAccount()}>
                {deleting ? "Deleting…" : "Permanently delete account"}
              </Button>
              <Button
                variant="secondary"
                disabled={deleting}
                onClick={() => {
                  setShowDeletePanel(false);
                  setConfirmPhrase("");
                  setConfirmEmail("");
                  setError("");
                }}
              >
                Cancel
              </Button>
            </div>
            {error && (
              <p role="alert" className="field-error" style={{ margin: 0 }}>
                {error}
              </p>
            )}
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
              Requires the API <code>SUPABASE_SECRET_KEY</code> so the server can delete the Auth user (DB rows cascade).
            </p>
          </div>
        )}
      </Card>
    </Frame>
  );
}

function StoredSettings({ kind }: { kind: "notifications" | "privacy" }) {
  const [data, setData] = useState<any>({});
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    apiRequest<any>("/settings")
      .then((r) => setData(r[kind] || {}))
      .catch((e) => setMessage(e.message))
      .finally(() => setLoaded(true));
  }, [kind]);
  async function save() {
    if (!loaded) return;
    try {
      const payload =
        kind === "notifications"
          ? {
              job_alerts: Boolean(data.job_alerts),
              learning_reminders: Boolean(data.learning_reminders),
              interview_reminders: Boolean(data.interview_reminders),
              product_updates: Boolean(data.product_updates),
              email_frequency: data.email_frequency || "weekly",
            }
          : {
              camera_permission: data.camera_permission || "ask",
              microphone_permission: data.microphone_permission || "ask",
              recording_retention_days: Number(data.recording_retention_days || 0),
              resume_processing_consent: Boolean(data.resume_processing_consent),
              job_recommendation_consent: Boolean(data.job_recommendation_consent),
              profile_visibility: data.profile_visibility || "private",
            };
      await apiRequest(`/settings/${kind}`, { method: "PUT", body: JSON.stringify(payload) });
      setMessage("Settings saved.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const fields =
    kind === "notifications"
      ? ["job_alerts", "learning_reminders", "interview_reminders", "product_updates"]
      : ["resume_processing_consent", "job_recommendation_consent"];
  return (
    <Card className="stack">
      {fields.map((key) => (
        <label className="row" key={key}>
          <span>{key.replaceAll("_", " ")}</span>
          <input
            type="checkbox"
            disabled={!loaded}
            checked={Boolean(data[key])}
            onChange={(e) => setData({ ...data, [key]: e.target.checked })}
          />
        </label>
      ))}
      <Button disabled={!loaded} onClick={save}>
        {loaded ? "Save settings" : "Loading settings…"}
      </Button>
      {message && <p role="status">{message}</p>}
    </Card>
  );
}

export function PreferenceSettings() {
  return (
    <Frame title="Notification preferences" description="Stored in your account, not in browser storage.">
      <StoredSettings kind="notifications" />
    </Frame>
  );
}

export function PrivacySettings() {
  return (
    <Frame title="Privacy controls" description="Consent and visibility choices are persisted with row-level ownership.">
      <StoredSettings kind="privacy" />
    </Frame>
  );
}
