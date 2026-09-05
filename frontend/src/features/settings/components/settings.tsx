import { usePathname } from "@/shared/router";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Link } from "@/shared/ui/router-link";
import LoadingState from "@/components/ui/loading-state";
import {
  PhoneField,
  parsePhone,
  composePhone,
  type PhoneValue,
} from "@/shared/ui/phone-field";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "@/shared/api/client";
import { createClient } from "@/features/auth/api/client";
import {
  Button,
  Card,
  Input,
  PageHeader,
  Progress,
  Select,
  Textarea,
} from "@/shared/ui/primitives";
import { CareerIcon, type CareerIconName } from "@/components/ui/career-icons";
import { AnimatedIcon } from "@/components/ui/animated-icon";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/shared/utils";
import {
  clampCompletion,
  extractMissing,
  notifyProfileUpdated,
} from "@/features/profile/model/profile-completion";
import "../profile-v2.css";

const tabs = [
  ["/settings/account", "Account"],
  ["/settings/preferences", "Preferences"],
  ["/settings/privacy", "Privacy"],
] as const;

const PROFILE_NAV = [
  {
    id: "profile-details",
    label: "Details",
    icon: "profile" as CareerIconName,
  },
  { id: "profile-resume", label: "Resume", icon: "resume" as CareerIconName },
  {
    id: "profile-preferences",
    label: "Preferences",
    icon: "opportunities" as CareerIconName,
  },
  { id: "profile-skills", label: "Skills", icon: "signal" as CareerIconName },
  {
    id: "profile-experience",
    label: "Experience",
    icon: "evidence" as CareerIconName,
  },
  {
    id: "profile-education",
    label: "Education",
    icon: "learning" as CareerIconName,
  },
  { id: "profile-links", label: "Links", icon: "confidence" as CareerIconName },
] as const;

function sectionForMissingKey(key: string): string {
  const k = String(key || "").toLowerCase();
  if (k.includes("skill")) return "profile-skills";
  if (k.includes("experience") || k.includes("employment"))
    return "profile-experience";
  if (
    k.includes("education") ||
    k.includes("degree") ||
    k.includes("institution")
  )
    return "profile-education";
  if (
    k.includes("link") ||
    k.includes("linkedin") ||
    k.includes("github") ||
    k.includes("portfolio")
  ) {
    return "profile-links";
  }
  if (k.includes("resume")) return "profile-resume";
  if (
    k.includes("prefer") ||
    k.includes("target_role") ||
    k.includes("industry") ||
    k.includes("salary") ||
    k.includes("relocat") ||
    k.includes("work_mode") ||
    k.includes("authorization")
  ) {
    return "profile-preferences";
  }
  return "profile-details";
}

const PROFILE_EDITABLE_FIELDS = [
  "full_name",
  "username",
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

const YEARS_OPTIONS = [
  0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30,
] as const;

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

function experienceDateLabel(row: ProfileRecord): string {
  if (!row.start_date && !row.end_date && !row.is_current) return "";
  const display = (value: unknown) => {
    const text = String(value || "");
    if (!/^\d{4}-\d{2}/.test(text)) return text;
    const [year, month] = text.split("-");
    return new Intl.DateTimeFormat("en", {
      month: "short",
      year: "numeric",
    }).format(new Date(Number(year), Number(month) - 1, 1));
  };
  return `${display(row.start_date) || "Unknown start"} – ${row.is_current ? "Present" : display(row.end_date) || "Unknown end"}`;
}

function profileInitials(name: unknown): string {
  const initials = String(name || "U")
    .split(" ")
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "U";
}

type PrefDraft = {
  target_roles: string[];
  preferred_industries: string[];
  preferred_locations: string[];
  work_modes: string[];
  employment_types: string[];
  notice_period_days: string;
  work_authorization: string;
  salary_min: string;
  salary_currency: string;
  willing_to_relocate: boolean;
};

function Frame({
  children,
  title,
  description,
  className,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}) {
  const path = usePathname();
  return (
    <div className={cn("feature-page settings-page", className)}>
      <PageHeader title={title} description={description} />
      {path !== "/settings/profile" ? (
        <nav className="settings-nav" aria-label="Settings sections">
          {tabs.map(([href, label]) => {
            const active = path === href;
            return (
              <Link
                key={href}
                className={`button ${active ? "button-primary is-active" : "button-secondary"}`}
                href={href}
                aria-current={active ? "page" : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      ) : null}
      {children}
    </div>
  );
}

function ProfileSectionHead({
  icon,
  title,
  lede,
  required,
}: {
  icon: CareerIconName;
  title: string;
  lede?: string;
  required?: boolean;
}) {
  return (
    <div className="profile-section-head">
      <div className="profile-section-kicker">
        <span className="profile-section-icon" aria-hidden="true">
          <CareerIcon name={icon} size={18} />
        </span>
        <h2>
          {title}
          {required ? <RequiredMark /> : null}
        </h2>
      </div>
      {lede ? <p className="profile-section-lede">{lede}</p> : null}
    </div>
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
    notice_period_days:
      prefs.notice_period_days == null ? "" : String(prefs.notice_period_days),
    work_authorization: prefs.work_authorization || "",
    salary_min: prefs.salary_min == null ? "" : String(prefs.salary_min),
    salary_currency: prefs.salary_currency || "",
    willing_to_relocate: Boolean(prefs.willing_to_relocate),
  };
}

const OTHER_VALUE = "__other__";

function normalizeOptions(
  options: readonly { value: string; label: string }[] | readonly string[],
): Array<{ value: string; label: string }> {
  return options.map((option) =>
    typeof option === "string"
      ? { value: option, label: option }
      : { value: option.value, label: option.label },
  );
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
  const optionList = normalizeOptions(options).filter(
    (option) => option.value !== "" && option.value !== OTHER_VALUE,
  );
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
  // Fix producer: sync to value so external load (profile fetch) does not leave stale lock.
  const [otherLocked, setOtherLocked] = useState(isCustomStored);
  useEffect(() => {
    if (isCustomStored) setOtherLocked(true);
    else if (isPreset) setOtherLocked(false);
  }, [isCustomStored, isPreset]);
  // Custom stored values always show Other UI; locked keeps it while typing presets names.
  const inOther = otherLocked || isCustomStored;
  const selectValue = inOther ? OTHER_VALUE : isPreset ? trimmed : "";
  const inputMode = inputType === "number" ? "decimal" : "text";

  return (
    <div className="profile-field">
      <label className="field-label">
        <span>
          {label}
          {required ? <RequiredMark /> : null}
        </span>
        <Select
          value={selectValue}
          onChange={(e: any) => {
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
            onChange={(e: any) => {
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

/**
 * Multi-select via dropdown (not a checkbox grid).
 * Same string[] contract as before — only the UI is compact.
 */
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
  const baseOptions = normalizeOptions(options).filter(
    (option) => option.value !== OTHER_VALUE,
  );
  const labelByValue = new Map(
    baseOptions.map((option) => [option.value, option.label]),
  );
  for (const value of selected) {
    if (!labelByValue.has(value)) labelByValue.set(value, value);
  }
  const available = baseOptions.filter(
    (option) => !selected.includes(option.value),
  );
  const [pickerValue, setPickerValue] = useState("");
  const [otherText, setOtherText] = useState("");
  const [showOtherInput, setShowOtherInput] = useState(false);

  function addValue(value: string) {
    const next = value.trim();
    if (!next || selected.includes(next)) return;
    onChange([...selected, next]);
  }

  function removeValue(value: string) {
    onChange(selected.filter((item) => item !== value));
  }

  function addOtherValue() {
    const text = otherText.trim();
    if (!text) return;
    // Commit only on Add / Enter — never while typing.
    addValue(text);
    setOtherText("");
    setShowOtherInput(false);
    setPickerValue("");
  }

  return (
    <fieldset className="profile-choice-group">
      <legend>
        {legend}
        {required ? <RequiredMark /> : null}
      </legend>

      <label className="field-label">
        Add {legend.toLowerCase()}
        <Select
          value={pickerValue}
          onChange={(e: any) => {
            const next = e.target.value;
            if (!next) {
              setPickerValue("");
              return;
            }
            if (next === OTHER_VALUE) {
              setPickerValue(OTHER_VALUE);
              setShowOtherInput(true);
              return;
            }
            addValue(next);
            setPickerValue("");
            setShowOtherInput(false);
            setOtherText("");
          }}
        >
          <option value="">
            {available.length === 0 && !allowOther
              ? "All options selected"
              : `Select ${legend.toLowerCase()}…`}
          </option>
          {available.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          {allowOther ? <option value={OTHER_VALUE}>Other…</option> : null}
        </Select>
      </label>

      {allowOther && showOtherInput && (
        <div className="profile-composer">
          <label className="field-label">
            Specify other
            <Input
              type="text"
              autoComplete="off"
              value={otherText}
              onChange={(e: any) => setOtherText(e.target.value)}
              placeholder={otherPlaceholder}
              onKeyDown={(e: any) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOtherValue();
                }
              }}
            />
          </label>
          <div className="profile-composer-actions">
            <Button
              type="button"
              onClick={addOtherValue}
              disabled={!otherText.trim()}
            >
              Add
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowOtherInput(false);
                setOtherText("");
                setPickerValue("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {selected.length > 0 ? (
        <div
          className="cluster"
          role="list"
          aria-label={`Selected ${legend.toLowerCase()}`}
        >
          {selected.map((value) => (
            <span
              key={value}
              className="badge badge-info"
              role="listitem"
              style={{ gap: 8 }}
            >
              {labelByValue.get(value) || value}
              <button
                type="button"
                className="button-quiet"
                style={{
                  minHeight: "auto",
                  padding: 0,
                  boxShadow: "none",
                  border: "none",
                  fontWeight: 600,
                }}
                onClick={() => removeValue(value)}
                aria-label={`Remove ${labelByValue.get(value) || value}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mono" style={{ margin: 0, opacity: 0.8 }}>
          None selected yet{required ? " (required)" : ""}.
        </p>
      )}
    </fieldset>
  );
}

type ResumeListItem = {
  id: string;
  title: string;
  is_active?: boolean;
  latest_version?: {
    id: string;
    original_filename?: string;
    extraction_status?: string;
  } | null;
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
  meta?: {
    warnings?: string[];
    email_detected?: string | null;
    method?: string;
  };
};

export function ProfileSettings() {
  const [form, setForm] = useState<ProfileRecord>({});
  const [prefDraft, setPrefDraft] = useState<PrefDraft>(emptyPrefDraft());
  const [skills, setSkills] = useState<ProfileRecord[]>([]);
  const [experiences, setExperiences] = useState<ProfileRecord[]>([]);
  const [education, setEducation] = useState<ProfileRecord[]>([]);
  const [links, setLinks] = useState<ProfileRecord[]>([]);
  const [skillName, setSkillName] = useState("");
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const emptyExperienceDraft = {
    company_name: "",
    role_title: "",
    location: "",
    employment_type: "",
    start_date: "",
    end_date: "",
    is_current: false,
    summary: "",
  };
  const [experienceDraft, setExperienceDraft] = useState(emptyExperienceDraft);
  const [editingExperienceId, setEditingExperienceId] = useState<string | null>(
    null,
  );
  const emptyEducationDraft = {
    institution: "",
    degree: "",
    field_of_study: "",
  };
  const [educationDraft, setEducationDraft] = useState(emptyEducationDraft);
  const [editingEducationId, setEditingEducationId] = useState<string | null>(
    null,
  );
  const emptyLinkDraft = { link_type: "linkedin", url: "", label: "" };
  const [linkDraft, setLinkDraft] = useState(emptyLinkDraft);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [recordBusy, setRecordBusy] = useState(false);
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [resumeTitle, setResumeTitle] = useState("");
  const [renamingResumeId, setRenamingResumeId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [fillBusy, setFillBusy] = useState(false);
  const [fillEmptyOnly, setFillEmptyOnly] = useState(true);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [phoneParts, setPhoneParts] = useState<PhoneValue>(() =>
    parsePhone(""),
  );
  const [usernameAvailability, setUsernameAvailability] = useState<{
    available: boolean;
    reason?: string | null;
  } | null>(null);

  // Keep the structured phone editor in sync whenever the stored value
  // changes (profile load, draft apply) — avoid overwriting user typing.
  // Only sync when form.phone differs from composed phoneParts (idempotent).
  useEffect(() => {
    const parsed = parsePhone(form.phone);
    setPhoneParts((prev) => {
      const currentComposed = composePhone(prev);
      if ((form.phone || "") !== currentComposed) {
        if (parsed.iso2 !== prev.iso2 || parsed.national !== prev.national) {
          return parsed;
        }
      }
      return prev;
    });
  }, [form.phone]);

  useEffect(() => {
    const value = String(form.username || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/\s+/g, "_");
    if (!value) {
      setUsernameAvailability(null);
      return;
    }
    if (value.length < 3) {
      setUsernameAvailability({
        available: false,
        reason: "Use at least 3 characters.",
      });
      return;
    }
    if (value.length > 30) {
      setUsernameAvailability({
        available: false,
        reason: "Use at most 30 characters.",
      });
      return;
    }
    if (!/^[a-z0-9](?:[a-z0-9_]{1,28}[a-z0-9])?$/.test(value)) {
      setUsernameAvailability({
        available: false,
        reason:
          "Use only lowercase letters, numbers, and underscores (cannot start or end with _).",
      });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void apiRequest<{
        available?: boolean;
        reason?: string | null;
        username?: string;
      }>(`/profile/username/availability?username=${encodeURIComponent(value)}`)
        .then((result) =>
          setUsernameAvailability({
            available: Boolean(result.available),
            reason: result.reason,
          }),
        )
        .catch(() => undefined);
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.username]);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const AVATAR_MAX_BYTES = 3 * 1024 * 1024;

  const [activeProfileSection, setActiveProfileSection] = useState<string>(
    () => {
      if (typeof window === "undefined") return "profile-details";
      const hash = window.location.hash.replace(/^#/, "");
      return PROFILE_NAV.some((item) => item.id === hash)
        ? hash
        : "profile-details";
    },
  );

  function openProfileSection(id: string) {
    setActiveProfileSection(id);
    history.replaceState(null, "", `#${id}`);
  }

  const applyProfile = useCallback(
    (profile: ProfileRecord | null | undefined) => {
      setForm(profile || {});
    },
    [],
  );

  const applyLoaded = useCallback(
    (
      profilePayload: { profile: ProfileRecord; preferences: ProfileRecord },
      skillRows: ProfileRecord[],
      experienceRows: ProfileRecord[],
      educationRows: ProfileRecord[],
      linkRows: ProfileRecord[],
    ) => {
      applyProfile(profilePayload.profile);
      const prefs = {
        ...emptyPreferences(),
        ...(profilePayload.preferences || {}),
      };
      setPrefDraft(prefsToDraft(prefs));
      setSkills(skillRows || []);
      setExperiences(experienceRows || []);
      setEducation(educationRows || []);
      setLinks(linkRows || []);
    },
    [applyProfile],
  );

  const loadAll = useCallback(async () => {
    const [profilePayload, skillRows, experienceRows, educationRows, linkRows] =
      await Promise.all([
        apiRequest<{ profile: ProfileRecord; preferences: ProfileRecord }>(
          "/profile",
        ),
        apiRequest<ProfileRecord[]>("/profile/skills"),
        apiRequest<ProfileRecord[]>("/profile/experiences"),
        apiRequest<ProfileRecord[]>("/profile/education"),
        apiRequest<ProfileRecord[]>("/profile/links"),
      ]);
    applyLoaded(
      profilePayload,
      skillRows,
      experienceRows,
      educationRows,
      linkRows,
    );
    const profile = profilePayload?.profile || {};
    const details = profile.profile_completion_details as
      | { missing?: Array<{ key: string; label: string; points?: number }> }
      | undefined;
    notifyProfileUpdated({
      profile_completion: Number(profile.profile_completion ?? 0),
      profile_completion_details: details || null,
      profile_missing: extractMissing(details, null),
    });
    return profilePayload;
  }, [applyLoaded]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // The profile record controls the first paint. Secondary collections
        // must not keep the whole editor blank when one of them is slow.
        const profilePayload = await apiRequest<{
          profile: ProfileRecord;
          preferences: ProfileRecord;
        }>("/profile");
        if (!active) return;
        applyLoaded(profilePayload, [], [], [], []);
        setLoading(false);
        const profile = profilePayload?.profile || {};
        const details = profile.profile_completion_details as
          | { missing?: Array<{ key: string; label: string; points?: number }> }
          | undefined;
        notifyProfileUpdated({
          profile_completion: Number(profile.profile_completion ?? 0),
          profile_completion_details: details || null,
          profile_missing: extractMissing(details, null),
        });

        const [skillRows, experienceRows, educationRows, linkRows, resumeRows] =
          await Promise.all([
            apiRequest<ProfileRecord[]>("/profile/skills").catch(
              () => [] as ProfileRecord[],
            ),
            apiRequest<ProfileRecord[]>("/profile/experiences").catch(
              () => [] as ProfileRecord[],
            ),
            apiRequest<ProfileRecord[]>("/profile/education").catch(
              () => [] as ProfileRecord[],
            ),
            apiRequest<ProfileRecord[]>("/profile/links").catch(
              () => [] as ProfileRecord[],
            ),
            apiRequest<ResumeListItem[]>("/resumes").catch(
              () => [] as ResumeListItem[],
            ),
          ]);
        if (!active) return;
        setSkills(skillRows || []);
        setExperiences(experienceRows || []);
        setEducation(educationRows || []);
        setLinks(linkRows || []);
        setResumes(resumeRows || []);
        const preferred =
          resumeRows?.find((r) => r.is_active && r.latest_version?.id) ||
          resumeRows?.find((r) => r.latest_version?.id);
        setSelectedVersionId(preferred?.latest_version?.id || "");
      } catch (e) {
        if (!active) return;
        setError((e as Error).message);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [applyLoaded]);

  async function previewFromStoredResume() {
    setFillBusy(true);
    setError("");
    setMessage("");
    try {
      const body = selectedVersionId
        ? { resume_version_id: selectedVersionId }
        : {};
      const result = await apiRequest<{
        draft: ProfileDraft;
        counts?: Record<string, number>;
        ai_used?: boolean;
        method?: string;
      }>("/profile/from-resume/preview", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setDraft(result.draft);
      const countText = result.counts
        ? Object.entries(result.counts)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${n} ${k}`)
            .join(", ")
        : "";
      const fields = (result as { fields_extracted?: Record<string, unknown> })
        .fields_extracted;
      const profileFields = Array.isArray(fields?.profile)
        ? (fields.profile as string[]).join(", ")
        : "";
      setMessage(
        [
          countText ? `Draft ready: ${countText}.` : "Draft ready.",
          profileFields ? `Profile fields: ${profileFields}.` : "",
          "Review and apply only what is true for you.",
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

  async function refreshResumes(preferVersionId?: string) {
    try {
      const resumeRows = await apiRequest<ResumeListItem[]>("/resumes");
      setResumes(resumeRows || []);
      if (preferVersionId) {
        setSelectedVersionId(preferVersionId);
        return;
      }
      const preferred =
        resumeRows?.find((r) => r.is_active && r.latest_version?.id) ||
        resumeRows?.find((r) => r.latest_version?.id);
      setSelectedVersionId(preferred?.latest_version?.id || "");
    } catch {
      // Non-blocking: profile fill can still proceed with the draft in memory.
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
      if (resumeTitle.trim()) formData.append("title", resumeTitle.trim());
      const result = await apiRequest<{
        draft: ProfileDraft;
        counts?: Record<string, number>;
        ai_used?: boolean;
        resume?: {
          id?: string | null;
          resume_id?: string | null;
          original_filename?: string | null;
          extraction_status?: string | null;
          source?: string | null;
          title?: string | null;
        };
      }>("/profile/from-resume/preview-upload", {
        method: "POST",
        body: formData,
      });
      setDraft(result.draft);
      const storedVersionId = result.resume?.id || "";
      if (storedVersionId) {
        await refreshResumes(storedVersionId);
      }
      setResumeTitle("");
      await applyResumeDraft(result.draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFillBusy(false);
    }
  }

  async function renameResume(resumeId: string) {
    const title = renameValue.trim();
    if (!title) return;
    setFillBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/resumes/${resumeId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      await refreshResumes();
      setRenamingResumeId(null);
      setRenameValue("");
      setMessage("Resume name updated.");
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
      rows[index] = {
        ...rows[index],
        selected: rows[index].selected === false,
      };
      return { ...current, [section]: rows };
    });
  }

  async function applyResumeDraft(candidateDraft: ProfileDraft | null = draft) {
    if (!candidateDraft) return;
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
          profile:
            candidateDraft.profile?.selected === false
              ? {}
              : candidateDraft.profile || {},
          skills: pick(candidateDraft.skills),
          experiences: pick(candidateDraft.experiences),
          education: pick(candidateDraft.education),
          projects: pick(candidateDraft.projects),
          certifications: pick(candidateDraft.certifications),
          languages: pick(candidateDraft.languages),
          links: pick(candidateDraft.links),
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
    setProfileSaving(true);
    setMessage("");
    setError("");
    try {
      const yearsRaw = form.years_experience;
      const years =
        yearsRaw === "" || yearsRaw === null || yearsRaw === undefined
          ? undefined
          : Number(yearsRaw);
      if (years !== undefined && Number.isNaN(years)) {
        throw new Error("Years of experience must be a number.");
      }
      const username = String(form.username || "")
        .trim()
        .toLowerCase()
        .replace(/^@/, "")
        .replace(/\s+/g, "_");
      if (username) {
        if (username.length < 3 || username.length > 30) {
          throw new Error("Username must be between 3 and 30 characters.");
        }
        if (!/^[a-z0-9](?:[a-z0-9_]{1,28}[a-z0-9])?$/.test(username)) {
          throw new Error(
            "Username must use only lowercase letters, numbers, and underscores (cannot start or end with _).",
          );
        }
        if (usernameAvailability && usernameAvailability.available === false) {
          throw new Error(
            usernameAvailability.reason || "That username is not available.",
          );
        }
      }
      const editable = Object.fromEntries(
        PROFILE_EDITABLE_FIELDS.map((key) => {
          if (key === "years_experience") return [key, years];
          if (key === "username") return [key, username || undefined];
          const value = form[key];
          if (value === undefined || value === null) return [key, undefined];
          if (typeof value === "string" && value.trim() === "" && key !== "bio")
            return [key, undefined];
          return [key, typeof value === "string" ? value.trim() : value];
        }).filter(([, value]) => value !== undefined),
      );
      const savedProfile = await apiRequest<ProfileRecord>("/profile", {
        method: "PATCH",
        body: JSON.stringify(editable),
      });
      // The form is already the optimistic source of truth. Do not re-read all
      // profile resources here: that adds five requests and can overwrite a
      // newer local edit with an older response. The API response is used only
      // for completion metadata shared with the rest of the app.
      const details = savedProfile?.profile_completion_details as
        | { missing?: Array<{ key: string; label: string; points?: number }> }
        | undefined;
      notifyProfileUpdated({
        profile_completion: Number(
          savedProfile?.profile_completion ?? form.profile_completion ?? 0,
        ),
        profile_completion_details: details || null,
        profile_missing: extractMissing(details, null),
      });
      if (savedProfile) {
        setForm((current) => ({
          ...current,
          ...editable,
          username: savedProfile.username ?? (username || current.username),
          profile_completion:
            savedProfile.profile_completion ?? current.profile_completion,
          profile_completion_details:
            savedProfile.profile_completion_details ??
            current.profile_completion_details,
        }));
      }
      setMessage("Profile saved to your account.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProfileSaving(false);
    }
  }

  async function savePreferences() {
    setPreferencesSaving(true);
    setMessage("");
    setError("");
    try {
      const payload = {
        target_roles: prefDraft.target_roles,
        preferred_industries: prefDraft.preferred_industries,
        preferred_locations: prefDraft.preferred_locations,
        work_modes: prefDraft.work_modes,
        employment_types: prefDraft.employment_types,
        notice_period_days:
          prefDraft.notice_period_days === ""
            ? null
            : Number(prefDraft.notice_period_days),
        willing_to_relocate: Boolean(prefDraft.willing_to_relocate),
        work_authorization: prefDraft.work_authorization || null,
        salary_min:
          prefDraft.salary_min === "" ? null : Number(prefDraft.salary_min),
        salary_currency: prefDraft.salary_currency
          ? prefDraft.salary_currency.toUpperCase()
          : null,
      };
      if (
        payload.notice_period_days !== null &&
        Number.isNaN(payload.notice_period_days)
      ) {
        throw new Error("Notice period must be a number.");
      }
      if (payload.salary_min !== null && Number.isNaN(payload.salary_min)) {
        throw new Error("Minimum salary must be a number.");
      }
      if (
        payload.salary_currency &&
        !/^[A-Z]{3}$/.test(payload.salary_currency)
      ) {
        throw new Error("Currency must be a 3-letter code such as INR or USD.");
      }
      await apiRequest("/profile/preferences", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      // Keep the edited draft visible immediately. The PUT above is the single
      // persistence request; a full profile reload here caused stale fields to
      // replace edits made in the meantime.
      setMessage("Career preferences saved to your account.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreferencesSaving(false);
    }
  }

  function startEditSkill(skill: ProfileRecord) {
    setEditingSkillId(String(skill.id));
    setSkillName(String(skill.name || ""));
    setError("");
    setMessage("");
  }

  function cancelEditSkill() {
    setEditingSkillId(null);
    setSkillName("");
  }

  async function saveSkill() {
    if (!skillName.trim()) return;
    setError("");
    setMessage("");
    setRecordBusy(true);
    try {
      if (editingSkillId) {
        const savedSkill = await apiRequest<ProfileRecord>(
          `/profile/skills/${editingSkillId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ name: skillName.trim() }),
          },
        );
        setSkills((current) =>
          current.map((item) =>
            String(item.id) === editingSkillId ? savedSkill : item,
          ),
        );
        setMessage("Skill updated.");
      } else {
        const savedSkill = await apiRequest<ProfileRecord>("/profile/skills", {
          method: "POST",
          body: JSON.stringify({ name: skillName.trim(), source: "candidate" }),
        });
        setSkills((current) => [...current, savedSkill]);
        setMessage("Skill saved to your account.");
      }
      setSkillName("");
      setEditingSkillId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecordBusy(false);
    }
  }

  async function importSkillsFromResume() {
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<{
        created_count: number;
        suggested: string[];
        created?: ProfileRecord[];
      }>("/profile/skills/from-resume", {
        method: "POST",
      });
      const importedSkills = result.created || [];
      if (importedSkills.length)
        setSkills((current) => [...current, ...importedSkills]);
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
      const result = await apiRequest<{
        profile: ProfileRecord;
        avatar_url?: string;
      }>("/profile/avatar", {
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
      setForm((current) => ({
        ...current,
        avatar_path: null,
        avatar_url: null,
      }));
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
    setRecordBusy(true);

    // Preserve original index for correct order restoration on failure.
    let removed: ProfileRecord | undefined;
    let removedIndex = -1;
    if (resource === "skills") {
      removedIndex = skills.findIndex((item) => String(item.id) === id);
      removed = removedIndex >= 0 ? skills[removedIndex] : undefined;
    } else if (resource === "experiences") {
      removedIndex = experiences.findIndex((item) => String(item.id) === id);
      removed = removedIndex >= 0 ? experiences[removedIndex] : undefined;
    } else if (resource === "education") {
      removedIndex = education.findIndex((item) => String(item.id) === id);
      removed = removedIndex >= 0 ? education[removedIndex] : undefined;
    } else if (resource === "links") {
      removedIndex = links.findIndex((item) => String(item.id) === id);
      removed = removedIndex >= 0 ? links[removedIndex] : undefined;
    }

    // Remove from the visible collection before waiting for the network. The
    // API call remains authoritative; the original row is restored on failure at same index.
    if (resource === "skills")
      setSkills((current) => current.filter((item) => String(item.id) !== id));
    if (resource === "experiences")
      setExperiences((current) =>
        current.filter((item) => String(item.id) !== id),
      );
    if (resource === "education")
      setEducation((current) =>
        current.filter((item) => String(item.id) !== id),
      );
    if (resource === "links")
      setLinks((current) => current.filter((item) => String(item.id) !== id));
    if (resource === "skills" && editingSkillId === id) cancelEditSkill();
    if (resource === "experiences" && editingExperienceId === id)
      cancelEditExperience();
    if (resource === "education" && editingEducationId === id)
      cancelEditEducation();
    if (resource === "links" && editingLinkId === id) cancelEditLink();

    try {
      await apiRequest(`/profile/${resource}/${id}`, { method: "DELETE" });
      setMessage(`${label} removed from your account.`);
    } catch (e) {
      if (removed && removedIndex >= 0) {
        if (resource === "skills")
          setSkills((current) => {
            const next = [...current];
            next.splice(Math.min(removedIndex, next.length), 0, removed);
            return next;
          });
        if (resource === "experiences")
          setExperiences((current) => {
            const next = [...current];
            next.splice(Math.min(removedIndex, next.length), 0, removed);
            return next;
          });
        if (resource === "education")
          setEducation((current) => {
            const next = [...current];
            next.splice(Math.min(removedIndex, next.length), 0, removed);
            return next;
          });
        if (resource === "links")
          setLinks((current) => {
            const next = [...current];
            next.splice(Math.min(removedIndex, next.length), 0, removed);
            return next;
          });
      }
      setError((e as Error).message);
    } finally {
      setRecordBusy(false);
    }
  }

  function toDateInput(value: unknown) {
    if (!value) return "";
    const text = String(value);
    return text.length >= 10 ? text.slice(0, 10) : text;
  }

  function startEditExperience(item: ProfileRecord) {
    setEditingExperienceId(String(item.id));
    setExperienceDraft({
      company_name: String(item.company_name || ""),
      role_title: String(item.role_title || ""),
      location: String(item.location || ""),
      employment_type: String(item.employment_type || ""),
      start_date: toDateInput(item.start_date),
      end_date: toDateInput(item.end_date),
      is_current: Boolean(item.is_current),
      summary: String(item.summary || ""),
    });
    setError("");
    setMessage("");
  }

  function cancelEditExperience() {
    setEditingExperienceId(null);
    setExperienceDraft(emptyExperienceDraft);
  }

  async function saveExperience() {
    if (
      !experienceDraft.company_name.trim() ||
      !experienceDraft.role_title.trim()
    )
      return;
    setError("");
    setMessage("");
    setRecordBusy(true);
    const body = {
      company_name: experienceDraft.company_name.trim(),
      role_title: experienceDraft.role_title.trim(),
      location: experienceDraft.location.trim() || null,
      employment_type: experienceDraft.employment_type || null,
      start_date: experienceDraft.start_date || null,
      end_date: experienceDraft.is_current
        ? null
        : experienceDraft.end_date || null,
      is_current: experienceDraft.is_current,
      summary: experienceDraft.summary.trim() || null,
    };
    try {
      if (editingExperienceId) {
        const savedExperience = await apiRequest<ProfileRecord>(
          `/profile/experiences/${editingExperienceId}`,
          {
            method: "PATCH",
            body: JSON.stringify(body),
          },
        );
        setExperiences((current) =>
          current.map((item) =>
            String(item.id) === editingExperienceId ? savedExperience : item,
          ),
        );
        setMessage("Experience updated.");
      } else {
        const savedExperience = await apiRequest<ProfileRecord>(
          "/profile/experiences",
          {
            method: "POST",
            body: JSON.stringify(body),
          },
        );
        setExperiences((current) => [...current, savedExperience]);
        setMessage("Experience saved to your account.");
      }
      cancelEditExperience();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecordBusy(false);
    }
  }

  function startEditEducation(item: ProfileRecord) {
    setEditingEducationId(String(item.id));
    setEducationDraft({
      institution: String(item.institution || ""),
      degree: String(item.degree || ""),
      field_of_study: String(item.field_of_study || ""),
    });
    setError("");
    setMessage("");
  }

  function cancelEditEducation() {
    setEditingEducationId(null);
    setEducationDraft(emptyEducationDraft);
  }

  async function saveEducation() {
    if (!educationDraft.institution.trim()) return;
    setError("");
    setMessage("");
    setRecordBusy(true);
    const body = {
      institution: educationDraft.institution.trim(),
      degree: educationDraft.degree || null,
      field_of_study: educationDraft.field_of_study.trim() || null,
    };
    try {
      if (editingEducationId) {
        const savedEducation = await apiRequest<ProfileRecord>(
          `/profile/education/${editingEducationId}`,
          {
            method: "PATCH",
            body: JSON.stringify(body),
          },
        );
        setEducation((current) =>
          current.map((item) =>
            String(item.id) === editingEducationId ? savedEducation : item,
          ),
        );
        setMessage("Education updated.");
      } else {
        const savedEducation = await apiRequest<ProfileRecord>(
          "/profile/education",
          {
            method: "POST",
            body: JSON.stringify(body),
          },
        );
        setEducation((current) => [...current, savedEducation]);
        setMessage("Education saved to your account.");
      }
      cancelEditEducation();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecordBusy(false);
    }
  }

  function startEditLink(item: ProfileRecord) {
    setEditingLinkId(String(item.id));
    setLinkDraft({
      link_type: String(item.link_type || "other"),
      url: String(item.url || ""),
      label: String(item.label || ""),
    });
    setError("");
    setMessage("");
  }

  function cancelEditLink() {
    setEditingLinkId(null);
    setLinkDraft(emptyLinkDraft);
  }

  async function saveLink() {
    if (!linkDraft.url.trim()) return;
    setError("");
    setMessage("");
    setRecordBusy(true);
    const body = {
      link_type: linkDraft.link_type,
      url: linkDraft.url.trim(),
      label: linkDraft.label.trim() || null,
    };
    try {
      if (editingLinkId) {
        const savedLink = await apiRequest<ProfileRecord>(
          `/profile/links/${editingLinkId}`,
          {
            method: "PATCH",
            body: JSON.stringify(body),
          },
        );
        setLinks((current) =>
          current.map((item) =>
            String(item.id) === editingLinkId ? savedLink : item,
          ),
        );
        setMessage("Link updated.");
      } else {
        const savedLink = await apiRequest<ProfileRecord>("/profile/links", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setLinks((current) => [...current, savedLink]);
        setMessage("Link saved to your account.");
      }
      cancelEditLink();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecordBusy(false);
    }
  }

  const completion = clampCompletion(form.profile_completion);
  const profileComplete = completion >= 100;
  const missingFromDetails = extractMissing(
    form.profile_completion_details as
      | { missing?: Array<{ key: string; label: string; points?: number }> }
      | undefined,
    null,
  );
  const yearsValue =
    form.years_experience === null ||
    form.years_experience === undefined ||
    form.years_experience === ""
      ? ""
      : String(form.years_experience);

  return (
    <Frame
      className="profile-v2"
      title="Candidate profile"
      description="Keep your experience, strengths, and goals ready for every interview."
    >
      {loading ? (
        <div className="profile-studio">
          <div className="profile-loading">
            <LoadingState label="Loading profile" variant="Dots" />
          </div>
        </div>
      ) : (
        <div className="profile-studio">
          <header
            className={`profile-masthead${profileComplete ? " is-complete" : ""}`}
            aria-label="Profile summary"
          >
            <div className="profile-masthead-photo">
              <div
                className="profile-avatar-preview"
                aria-hidden={!form.avatar_url}
              >
                {form.avatar_url ? (
                  <img
                    src={form.avatar_url}
                    alt=""
                    width={72}
                    height={72}
                    onError={() =>
                      setForm((current) => ({
                        ...current,
                        avatar_path: null,
                        avatar_url: null,
                      }))
                    }
                  />
                ) : (
                  <span className="profile-avatar-fallback">
                    {profileInitials(form.full_name)}
                  </span>
                )}
              </div>
            </div>
            <div className="profile-masthead-copy">
              <h2 id="profile-overview-title">
                {form.full_name || "Your profile"}
              </h2>
              {form.username ? (
                <p className="profile-masthead-handle">
                  <Link href={`/${encodeURIComponent(String(form.username))}`}>
                    @{String(form.username)}
                  </Link>
                </p>
              ) : (
                <p className="profile-masthead-handle is-missing">
                  <button
                    type="button"
                    className="profile-missing-link"
                    style={{
                      padding: 0,
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      font: "inherit",
                      color: "var(--ps-accent)",
                      textDecoration: "underline",
                    }}
                    onClick={() => {
                      openProfileSection("profile-details");
                      window.setTimeout(() => {
                        document
                          .getElementById("profile-username-input")
                          ?.focus();
                      }, 60);
                    }}
                  >
                    + Set username
                  </button>
                </p>
              )}
              <p className="profile-masthead-headline">
                {form.headline ||
                  "Add a headline to tell employers what you do."}
              </p>
              {form.location ||
              form.current_role ||
              (form.years_experience !== null &&
                form.years_experience !== undefined) ? (
                <p className="profile-masthead-facts">
                  {[
                    form.location,
                    form.current_role,
                    form.years_experience !== null &&
                    form.years_experience !== undefined
                      ? `${form.years_experience} years experience`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
              <div className="profile-identity-actions">
                <label className="profile-photo-upload">
                  <span>Choose photo</span>
                  <Input
                    className="file-picker-input"
                    type="file"
                    aria-label="Choose profile photo"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    disabled={avatarBusy}
                    onChange={(e: any) => {
                      const file = e.target.files?.[0] || null;
                      void uploadAvatar(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {form.avatar_path || form.avatar_url ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={avatarBusy}
                    onClick={() => void removeAvatar()}
                  >
                    {avatarBusy ? "Working…" : "Remove"}
                  </Button>
                ) : (
                  <p className="muted profile-photo-hint">
                    JPEG, PNG, or WebP · 3 MB
                  </p>
                )}
              </div>
            </div>
            <div
              className={`profile-masthead-meter${profileComplete ? " is-complete" : ""}`}
              aria-hidden={profileComplete}
            >
              <div className="profile-masthead-meter-head">
                <strong>{completion}%</strong>
                <span>complete</span>
              </div>
              <Progress value={completion} label="Profile completion" />
            </div>
            {!profileComplete && missingFromDetails.length > 0 ? (
              <p className="profile-masthead-missing">
                <span>Still needed</span>
                {missingFromDetails.slice(0, 4).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="profile-missing-link"
                    onClick={() =>
                      openProfileSection(sectionForMissingKey(item.key))
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </p>
            ) : null}
          </header>

          <nav className="profile-tabs" aria-label="Profile sections">
            <div className="profile-tabs-track">
              {PROFILE_NAV.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`profile-tab ${activeProfileSection === item.id ? "is-active" : ""}`}
                  aria-current={
                    activeProfileSection === item.id ? "page" : undefined
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    openProfileSection(item.id);
                  }}
                >
                  <CareerIcon name={item.icon} size={15} aria-hidden />
                  {item.label}
                </a>
              ))}
            </div>
          </nav>

          <div className="profile-editor">
            <Card
              id="profile-resume"
              className="profile-resume-studio profile-card"
              hidden={activeProfileSection !== "profile-resume"}
            >
              <div className="profile-resume-studio-head">
                <div>
                  <ProfileSectionHead
                    icon="resume"
                    title="Resume workspace"
                    lede="Keep named versions of your resume here. Select the source you want to use, preview the draft, and review every change before it is applied."
                  />
                </div>
                <div className="profile-resume-studio-count">
                  <strong>{resumes.length}</strong>
                  <span>saved resume{resumes.length === 1 ? "" : "s"}</span>
                </div>
              </div>
              <div className="profile-resume-studio-grid">
                <section
                  className="profile-resume-library"
                  aria-labelledby="saved-resumes-title"
                >
                  <div className="profile-resume-section-head">
                    <div>
                      <p className="eyebrow" id="saved-resumes-title">
                        Your library
                      </p>
                      <p className="muted" style={{ margin: 0 }}>
                        Choose the resume that best fits this profile.
                      </p>
                    </div>
                    <span className="profile-resume-count">
                      {
                        resumes.filter((resume) => resume.latest_version?.id)
                          .length
                      }{" "}
                      ready
                    </span>
                  </div>
                  {resumes.some((resume) => resume.latest_version?.id) ? (
                    <div
                      className="profile-resume-list"
                      role="listbox"
                      aria-label="Saved resumes"
                    >
                      {resumes.map((resume) =>
                        resume.latest_version?.id ? (
                          <div
                            className={`profile-resume-row ${selectedVersionId === resume.latest_version.id ? "is-selected" : ""}`}
                            key={resume.id}
                            role="option"
                            aria-selected={
                              selectedVersionId === resume.latest_version.id
                            }
                          >
                            <button
                              type="button"
                              className="profile-resume-select"
                              onClick={() =>
                                setSelectedVersionId(
                                  resume.latest_version?.id || "",
                                )
                              }
                            >
                              <span
                                className="profile-resume-file-icon"
                                aria-hidden="true"
                              >
                                PDF
                              </span>
                              <span className="profile-resume-row-copy">
                                <strong>{resume.title}</strong>
                                <small>
                                  {resume.latest_version.original_filename ||
                                    "Stored resume"}{" "}
                                  ·{" "}
                                  {resume.latest_version.extraction_status ||
                                    "ready"}
                                </small>
                              </span>
                              {resume.is_active ? (
                                <span className="profile-resume-active">
                                  Active
                                </span>
                              ) : null}
                            </button>
                            <button
                              type="button"
                              className="profile-resume-rename"
                              onClick={() => {
                                setRenamingResumeId(resume.id);
                                setRenameValue(resume.title);
                              }}
                            >
                              Rename
                            </button>
                            {renamingResumeId === resume.id ? (
                              <form
                                className="profile-resume-rename-form"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  void renameResume(resume.id);
                                }}
                              >
                                <Input
                                  aria-label={`New name for ${resume.title}`}
                                  value={renameValue}
                                  maxLength={200}
                                  onChange={(event) =>
                                    setRenameValue(event.target.value)
                                  }
                                  autoFocus
                                />
                                <Button
                                  type="submit"
                                  disabled={fillBusy || !renameValue.trim()}
                                >
                                  Save name
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => setRenamingResumeId(null)}
                                >
                                  Cancel
                                </Button>
                              </form>
                            ) : null}
                          </div>
                        ) : null,
                      )}
                    </div>
                  ) : (
                    <div className="profile-resume-empty">
                      <strong>No saved resumes yet.</strong>
                      <span>
                        Upload one on the right and give it a name you will
                        recognize later.
                      </span>
                    </div>
                  )}
                </section>
                <section
                  className="profile-resume-upload"
                  aria-labelledby="upload-resume-title"
                >
                  <p className="eyebrow" id="upload-resume-title">
                    Add a source
                  </p>
                  <h3>Upload a new resume</h3>
                  <p className="muted">
                    Name it by role, company, or version before it enters your
                    private library.
                  </p>
                  <label className="field-label">
                    Resume name
                    <Input
                      value={resumeTitle}
                      maxLength={200}
                      placeholder="e.g. Backend roles · August 2026"
                      onChange={(event) => setResumeTitle(event.target.value)}
                    />
                  </label>
                  <label className="profile-resume-upload-control">
                    <span className="profile-resume-upload-button">
                      Choose PDF or DOCX
                    </span>
                    <span className="profile-resume-upload-hint">
                      Saved privately and available across the workspace
                    </span>
                    <Input
                      className="file-picker-input"
                      type="file"
                      aria-label="Upload PDF or DOCX"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      disabled={fillBusy}
                      onChange={(event: any) => {
                        const file = event.target.files?.[0] || null;
                        void previewFromUpload(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </section>
              </div>
              <div className="profile-resume-actions">
                <label className="profile-check-row">
                  <input
                    type="checkbox"
                    checked={fillEmptyOnly}
                    onChange={(e: any) => setFillEmptyOnly(e.target.checked)}
                  />
                  <span>Only fill empty profile fields (recommended)</span>
                </label>
                <Select
                  value={selectedVersionId}
                  onChange={(e: any) => setSelectedVersionId(e.target.value)}
                  aria-label="Selected resume version"
                >
                  <option value="">Choose a saved resume</option>
                  {resumes.map((resume) =>
                    resume.latest_version?.id ? (
                      <option
                        key={resume.latest_version.id}
                        value={resume.latest_version.id}
                      >
                        {resume.title}
                      </option>
                    ) : null,
                  )}
                </Select>
              </div>
              <div className="profile-section-actions">
                <Button
                  type="button"
                  disabled={fillBusy}
                  onClick={() => void previewFromStoredResume()}
                >
                  {fillBusy ? "Working…" : "Preview from saved resume"}
                </Button>
                {draft ? (
                  <>
                    <Button
                      type="button"
                      disabled={fillBusy}
                      onClick={() => void applyResumeDraft()}
                    >
                      {fillBusy ? "Applying…" : "Apply selected draft"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={fillBusy}
                      onClick={() => setDraft(null)}
                    >
                      Discard draft
                    </Button>
                  </>
                ) : null}
              </div>
              {fillBusy && !draft ? (
                <LoadingState
                  label="Extracting profile from resume"
                  variant="Dots"
                />
              ) : null}
              {draft ? (
                <div className="profile-draft">
                  <div className="profile-draft-group">
                    <strong>Profile fields</strong>
                    <label className="profile-check-row">
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
                                    selected:
                                      current.profile?.selected === false,
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
                      <p className="profile-draft-note">
                        {draft.profile.headline}
                      </p>
                    ) : null}
                  </div>
                  {(
                    [
                      ["skills", "Skills", (row: ProfileRecord) => row.name],
                      [
                        "experiences",
                        "Experience",
                        (row: ProfileRecord) =>
                          [
                            row.role_title || "Role",
                            row.company_name || "",
                            experienceDateLabel(row),
                          ]
                            .filter(Boolean)
                            .join(" · "),
                      ],
                      [
                        "education",
                        "Education",
                        (row: ProfileRecord) =>
                          [row.degree, row.institution]
                            .filter(Boolean)
                            .join(" · ") || row.institution,
                      ],
                      [
                        "projects",
                        "Projects",
                        (row: ProfileRecord) => row.title,
                      ],
                      [
                        "certifications",
                        "Certifications",
                        (row: ProfileRecord) => row.name,
                      ],
                      [
                        "languages",
                        "Languages",
                        (row: ProfileRecord) => row.language,
                      ],
                      [
                        "links",
                        "Links",
                        (row: ProfileRecord) => `${row.link_type}: ${row.url}`,
                      ],
                    ] as Array<
                      [
                        keyof ProfileDraft,
                        string,
                        (row: ProfileRecord) => string,
                      ]
                    >
                  ).map(([key, label, render]) => {
                    const rows =
                      (draft[key] as ProfileRecord[] | undefined) || [];
                    if (!rows.length) return null;
                    return (
                      <div key={key} className="profile-draft-group">
                        <strong>
                          {label} ({rows.length})
                        </strong>
                        {rows.map((row, index) => (
                          <label
                            key={`${key}-${index}`}
                            className="profile-check-row"
                          >
                            <input
                              type="checkbox"
                              checked={row.selected !== false}
                              onChange={() => toggleDraftItem(key, index)}
                            />
                            <span>{render(row)}</span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </Card>

            {(message || error) && (
              <Card className="stack profile-feedback-card">
                {error ? (
                  <p role="alert" className="field-error">
                    {error}
                  </p>
                ) : null}
                {message ? <p role="status">{message}</p> : null}
              </Card>
            )}

            <Card
              id="profile-details"
              className="stack profile-card profile-details-card"
              hidden={activeProfileSection !== "profile-details"}
            >
              <ProfileSectionHead
                icon="profile"
                title="Basic details"
                lede="Name, location, and career context used across interviews and job matching."
              />
              <div className="profile-fields">
                <label className="field-label">
                  <span>
                    Full name
                    <RequiredMark />
                  </span>
                  <Input
                    value={form.full_name || ""}
                    onChange={(e: any) =>
                      updateField("full_name", e.target.value)
                    }
                  />
                </label>
                <label className="field-label">
                  <span>Username</span>
                  <Input
                    id="profile-username-input"
                    autoComplete="username"
                    minLength={3}
                    maxLength={30}
                    value={form.username || ""}
                    onChange={(e: any) =>
                      updateField("username", e.target.value)
                    }
                    placeholder="your_name"
                    aria-describedby="profile-username-hint"
                  />
                  <span
                    id="profile-username-hint"
                    className={
                      usernameAvailability && !usernameAvailability.available
                        ? "field-error"
                        : "field-hint"
                    }
                  >
                    {usernameAvailability
                      ? usernameAvailability.available
                        ? `Available. Public profile: /${String(
                            form.username || "",
                          )
                            .trim()
                            .replace(/^@/, "")
                            .toLowerCase()}`
                        : usernameAvailability.reason ||
                          "That username is not available."
                      : form.username
                        ? `Public profile: /${String(form.username).replace(/^@/, "")}`
                        : "Google and existing accounts can set a username here. 3–30 letters, numbers, underscores."}
                  </span>
                </label>
                <label className="field-label">
                  Headline
                  <Input
                    value={form.headline || ""}
                    onChange={(e: any) =>
                      updateField("headline", e.target.value)
                    }
                  />
                </label>
                <div className="profile-field">
                  <PhoneField
                    label="Phone"
                    value={phoneParts}
                    onChange={(next) => {
                      setPhoneParts(next);
                      updateField("phone", composePhone(next));
                    }}
                  />
                </div>
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
                <label className="field-label profile-field-span">
                  Bio
                  <Textarea
                    value={form.bio || ""}
                    onChange={(e: any) => updateField("bio", e.target.value)}
                  />
                </label>
              </div>
              <p className="profile-hint">
                Tip: choose 0 years if you are a fresher with no work history
                yet.
              </p>
              <div className="profile-section-actions">
                <Button onClick={saveProfile} disabled={profileSaving}>
                  {profileSaving ? "Saving profile…" : "Save profile"}
                </Button>
              </div>
            </Card>

            <Card
              id="profile-preferences"
              className="stack profile-card profile-preferences-card"
              hidden={activeProfileSection !== "profile-preferences"}
            >
              <ProfileSectionHead
                icon="opportunities"
                title="Career preferences"
                lede="These preferences are saved to your account. Use each dropdown to add options; remove tags with ×."
              />
              <div className="profile-fields">
                <MultiOptionGroup
                  legend="Target roles"
                  options={TARGET_ROLE_OPTIONS}
                  selected={prefDraft.target_roles}
                  onChange={(target_roles) =>
                    setPrefDraft({ ...prefDraft, target_roles })
                  }
                  allowOther
                  otherPlaceholder="Enter another target role"
                  required
                />
                <MultiOptionGroup
                  legend="Preferred industries"
                  options={INDUSTRY_OPTIONS}
                  selected={prefDraft.preferred_industries}
                  onChange={(preferred_industries) =>
                    setPrefDraft({ ...prefDraft, preferred_industries })
                  }
                  allowOther
                  otherPlaceholder="Enter another industry"
                />
                <MultiOptionGroup
                  legend="Preferred locations"
                  options={LOCATION_OPTIONS}
                  selected={prefDraft.preferred_locations}
                  onChange={(preferred_locations) =>
                    setPrefDraft({ ...prefDraft, preferred_locations })
                  }
                  allowOther
                  otherPlaceholder="Enter another location"
                  required
                />
                <MultiOptionGroup
                  legend="Work modes"
                  options={WORK_MODE_OPTIONS}
                  selected={prefDraft.work_modes}
                  onChange={(work_modes) =>
                    setPrefDraft({ ...prefDraft, work_modes })
                  }
                  required
                />
                <MultiOptionGroup
                  legend="Employment types"
                  options={EMPLOYMENT_TYPE_OPTIONS}
                  selected={prefDraft.employment_types}
                  onChange={(employment_types) =>
                    setPrefDraft({ ...prefDraft, employment_types })
                  }
                  allowOther
                  otherPlaceholder="Enter another employment type"
                />
              </div>
              <div className="profile-fields">
                <SelectWithOther
                  label="Work authorization"
                  options={WORK_AUTHORIZATION_OPTIONS}
                  value={prefDraft.work_authorization}
                  onChange={(work_authorization) =>
                    setPrefDraft({ ...prefDraft, work_authorization })
                  }
                  emptyLabel="Select work authorization"
                  otherPlaceholder="Describe work authorization"
                />
                <SelectWithOther
                  label="Notice period"
                  options={NOTICE_PERIOD_OPTIONS.filter(
                    (option) => option.value !== "",
                  )}
                  value={prefDraft.notice_period_days}
                  onChange={(notice_period_days) =>
                    setPrefDraft({ ...prefDraft, notice_period_days })
                  }
                  emptyLabel="Select notice period"
                  otherPlaceholder="Enter notice period in days"
                  inputType="number"
                />
                <SelectWithOther
                  label="Salary currency"
                  options={CURRENCY_OPTIONS}
                  value={prefDraft.salary_currency}
                  onChange={(salary_currency) =>
                    setPrefDraft({
                      ...prefDraft,
                      salary_currency: salary_currency.toUpperCase(),
                    })
                  }
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
                    onChange={(e: any) =>
                      setPrefDraft({ ...prefDraft, salary_min: e.target.value })
                    }
                    placeholder="e.g. 600000"
                  />
                </label>
              </div>
              <label className="profile-check-row">
                <input
                  type="checkbox"
                  checked={prefDraft.willing_to_relocate}
                  onChange={(e: any) =>
                    setPrefDraft({
                      ...prefDraft,
                      willing_to_relocate: e.target.checked,
                    })
                  }
                />
                <span>Willing to relocate</span>
              </label>
              <div className="profile-section-actions">
                <Button onClick={savePreferences} disabled={preferencesSaving}>
                  {preferencesSaving
                    ? "Saving preferences…"
                    : "Save career preferences"}
                </Button>
              </div>
            </Card>

            <Card
              id="profile-skills"
              className="stack profile-card profile-skills-card"
              hidden={activeProfileSection !== "profile-skills"}
            >
              <ProfileSectionHead icon="signal" title="Skills" required />
              <div className="profile-composer">
                <SelectWithOther
                  label={editingSkillId ? "Edit skill" : "Skill"}
                  options={SKILL_OPTIONS}
                  value={skillName}
                  onChange={setSkillName}
                  emptyLabel="Select a skill"
                  otherPlaceholder="Enter skill name"
                />
                <div className="profile-composer-actions">
                  <Button
                    onClick={() => void saveSkill()}
                    disabled={!skillName.trim() || recordBusy}
                  >
                    <AnimatedIcon icon={Plus} size={16} aria-hidden />
                    {editingSkillId ? "Save skill" : "Add skill"}
                  </Button>
                  {editingSkillId ? (
                    <Button
                      variant="secondary"
                      onClick={cancelEditSkill}
                      disabled={recordBusy}
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={importSkillsFromResume}
                      disabled={recordBusy}
                    >
                      Import from resume
                    </Button>
                  )}
                </div>
              </div>
              <div className="profile-chip-list">
                {skills.length === 0 && (
                  <p className="profile-empty">No skills saved yet.</p>
                )}
                {skills.map((skill) => (
                  <span
                    key={skill.id}
                    className={`badge ${editingSkillId === skill.id ? "badge-warning" : "badge-info"}`}
                    style={{ gap: 8 }}
                  >
                    {skill.name}
                    <button
                      type="button"
                      className="button-quiet profile-chip-action"
                      onClick={() => startEditSkill(skill)}
                      aria-label={`Edit ${skill.name}`}
                    >
                      <AnimatedIcon icon={Pencil} size={13} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="button-quiet profile-chip-action"
                      onClick={() => removeRecord("skills", skill.id, "Skill")}
                      aria-label={`Remove ${skill.name}`}
                    >
                      <AnimatedIcon icon={Trash2} size={13} aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            </Card>

            <Card
              id="profile-experience"
              className="stack profile-card profile-experience-card"
              hidden={activeProfileSection !== "profile-experience"}
            >
              <ProfileSectionHead
                icon="evidence"
                title="Work experience"
                lede="Add at least one experience, or set years of experience to 0 for fresher credit."
                required
              />
              <div className="profile-fields">
                <label className="field-label">
                  Company
                  <Input
                    value={experienceDraft.company_name}
                    onChange={(e: any) =>
                      setExperienceDraft({
                        ...experienceDraft,
                        company_name: e.target.value,
                      })
                    }
                  />
                </label>
                <SelectWithOther
                  label="Role title"
                  options={TARGET_ROLE_OPTIONS}
                  value={experienceDraft.role_title}
                  onChange={(role_title) =>
                    setExperienceDraft({ ...experienceDraft, role_title })
                  }
                  emptyLabel="Select role title"
                  otherPlaceholder="Enter role title"
                />
                <SelectWithOther
                  label="Location"
                  options={LOCATION_OPTIONS}
                  value={experienceDraft.location}
                  onChange={(location) =>
                    setExperienceDraft({ ...experienceDraft, location })
                  }
                  emptyLabel="Select location"
                  otherPlaceholder="Enter location"
                />
                <SelectWithOther
                  label="Employment type"
                  options={EMPLOYMENT_TYPE_OPTIONS}
                  value={experienceDraft.employment_type}
                  onChange={(employment_type) =>
                    setExperienceDraft({ ...experienceDraft, employment_type })
                  }
                  emptyLabel="Select employment type"
                  otherPlaceholder="Enter employment type"
                />
                <label className="field-label">
                  Start date
                  <Input
                    type="date"
                    value={experienceDraft.start_date}
                    onChange={(e: any) =>
                      setExperienceDraft({
                        ...experienceDraft,
                        start_date: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  End date
                  <Input
                    type="date"
                    value={experienceDraft.end_date}
                    disabled={experienceDraft.is_current}
                    onChange={(e: any) =>
                      setExperienceDraft({
                        ...experienceDraft,
                        end_date: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="profile-check-row profile-field-span">
                  <input
                    type="checkbox"
                    checked={experienceDraft.is_current}
                    onChange={(e: any) =>
                      setExperienceDraft({
                        ...experienceDraft,
                        is_current: e.target.checked,
                        end_date: e.target.checked
                          ? ""
                          : experienceDraft.end_date,
                      })
                    }
                  />
                  <span>Currently working here</span>
                </label>
                <label className="field-label profile-field-span">
                  Summary
                  <Input
                    value={experienceDraft.summary}
                    onChange={(e: any) =>
                      setExperienceDraft({
                        ...experienceDraft,
                        summary: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <div className="profile-section-actions">
                <Button
                  onClick={() => void saveExperience()}
                  disabled={
                    !experienceDraft.company_name.trim() ||
                    !experienceDraft.role_title.trim() ||
                    recordBusy
                  }
                >
                  {editingExperienceId ? "Save experience" : "Add experience"}
                </Button>
                {editingExperienceId ? (
                  <Button
                    variant="secondary"
                    onClick={cancelEditExperience}
                    disabled={recordBusy}
                  >
                    Cancel edit
                  </Button>
                ) : null}
              </div>
              {experiences.length === 0 ? (
                <p className="profile-empty">
                  No experience records yet. Add one, or set years of experience
                  to 0 for fresher credit.
                </p>
              ) : (
                experiences.map((item) => (
                  <div key={item.id} className="profile-record-row">
                    <div>
                      <strong>
                        {item.role_title} · {item.company_name}
                        {editingExperienceId === item.id ? " · editing" : ""}
                      </strong>
                      <p>
                        {[
                          experienceDateLabel(item),
                          item.employment_type,
                          item.location,
                          item.summary,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Saved experience"}
                      </p>
                    </div>
                    <div className="profile-record-actions">
                      <Button
                        variant="secondary"
                        onClick={() => startEditExperience(item)}
                        disabled={recordBusy}
                      >
                        <AnimatedIcon icon={Pencil} size={15} aria-hidden />
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          removeRecord("experiences", item.id, "Experience")
                        }
                        disabled={recordBusy}
                      >
                        <AnimatedIcon icon={Trash2} size={15} aria-hidden />
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </Card>

            <Card
              id="profile-education"
              className="stack profile-card profile-education-card"
              hidden={activeProfileSection !== "profile-education"}
            >
              <ProfileSectionHead icon="learning" title="Education" required />
              <div className="profile-fields">
                <label className="field-label profile-field-span">
                  Institution
                  <Input
                    value={educationDraft.institution}
                    onChange={(e: any) =>
                      setEducationDraft({
                        ...educationDraft,
                        institution: e.target.value,
                      })
                    }
                  />
                </label>
                <SelectWithOther
                  label="Degree"
                  options={DEGREE_OPTIONS}
                  value={educationDraft.degree}
                  onChange={(degree) =>
                    setEducationDraft({ ...educationDraft, degree })
                  }
                  emptyLabel="Select degree"
                  otherPlaceholder="Enter degree"
                />
                <SelectWithOther
                  label="Field of study"
                  options={FIELD_OF_STUDY_OPTIONS}
                  value={educationDraft.field_of_study}
                  onChange={(field_of_study) =>
                    setEducationDraft({ ...educationDraft, field_of_study })
                  }
                  emptyLabel="Select field of study"
                  otherPlaceholder="Enter field of study"
                />
              </div>
              <div className="profile-section-actions">
                <Button
                  onClick={() => void saveEducation()}
                  disabled={!educationDraft.institution.trim() || recordBusy}
                >
                  {editingEducationId ? "Save education" : "Add education"}
                </Button>
                {editingEducationId ? (
                  <Button
                    variant="secondary"
                    onClick={cancelEditEducation}
                    disabled={recordBusy}
                  >
                    Cancel edit
                  </Button>
                ) : null}
              </div>
              {education.length === 0 ? (
                <p className="profile-empty">No education records yet.</p>
              ) : (
                education.map((item) => (
                  <div key={item.id} className="profile-record-row">
                    <div>
                      <strong>
                        {item.institution}
                        {editingEducationId === item.id ? " · editing" : ""}
                      </strong>
                      <p>
                        {[item.degree, item.field_of_study]
                          .filter(Boolean)
                          .join(" · ") || "Saved education"}
                      </p>
                    </div>
                    <div className="profile-record-actions">
                      <Button
                        variant="secondary"
                        onClick={() => startEditEducation(item)}
                        disabled={recordBusy}
                      >
                        <AnimatedIcon icon={Pencil} size={15} aria-hidden />
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          removeRecord("education", item.id, "Education")
                        }
                        disabled={recordBusy}
                      >
                        <AnimatedIcon icon={Trash2} size={15} aria-hidden />
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </Card>

            <Card
              id="profile-links"
              className="stack profile-card profile-links-card"
              hidden={activeProfileSection !== "profile-links"}
            >
              <ProfileSectionHead
                icon="confidence"
                title="Professional links"
                required
              />
              <div className="profile-fields">
                <label className="field-label">
                  Link type
                  <Select
                    value={linkDraft.link_type}
                    onChange={(e: any) =>
                      setLinkDraft({ ...linkDraft, link_type: e.target.value })
                    }
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
                    onChange={(e: any) =>
                      setLinkDraft({ ...linkDraft, url: e.target.value })
                    }
                    placeholder="https://"
                  />
                </label>
                <label className="field-label profile-field-span">
                  Label
                  <Input
                    value={linkDraft.label}
                    onChange={(e: any) =>
                      setLinkDraft({ ...linkDraft, label: e.target.value })
                    }
                    placeholder="Optional label"
                  />
                </label>
              </div>
              <div className="profile-section-actions">
                <Button
                  onClick={() => void saveLink()}
                  disabled={!linkDraft.url.trim() || recordBusy}
                >
                  {editingLinkId ? "Save link" : "Add link"}
                </Button>
                {editingLinkId ? (
                  <Button
                    variant="secondary"
                    onClick={cancelEditLink}
                    disabled={recordBusy}
                  >
                    Cancel edit
                  </Button>
                ) : null}
              </div>
              {links.length === 0 ? (
                <p className="profile-empty">No links saved yet.</p>
              ) : (
                links.map((item) => (
                  <div key={item.id} className="profile-record-row">
                    <div>
                      <strong>
                        {item.label || item.link_type}
                        {editingLinkId === item.id ? " · editing" : ""}
                      </strong>
                      <p>{item.url}</p>
                    </div>
                    <div className="profile-record-actions">
                      <Button
                        variant="secondary"
                        onClick={() => startEditLink(item)}
                        disabled={recordBusy}
                      >
                        <AnimatedIcon icon={Pencil} size={15} aria-hidden />
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => removeRecord("links", item.id, "Link")}
                        disabled={recordBusy}
                      >
                        <AnimatedIcon icon={Trash2} size={15} aria-hidden />
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        </div>
      )}
    </Frame>
  );
}

const DELETE_ACCOUNT_PHRASE = "DELETE MY ACCOUNT";

export function AccountSettings() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [authProvider, setAuthProvider] = useState<
    "email" | "google" | "unknown"
  >("unknown");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeletePanel, setShowDeletePanel] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const authClient = createClient();
      if (!authClient) return;
      const {
        data: { user },
      } = await authClient.auth.getUser();
      if (active && user?.email) {
        setAccountEmail(user.email);
        setAuthProvider(user.auth_provider || "unknown");
      }
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    await createClient()?.auth.signOut();
    navigate("/");
  }

  async function deleteAccount() {
    setError("");
    setMessage("");
    if (confirmPhrase.trim() !== DELETE_ACCOUNT_PHRASE) {
      setError(`Type exactly ${DELETE_ACCOUNT_PHRASE} to confirm.`);
      return;
    }
    if (
      accountEmail &&
      confirmEmail.trim().toLowerCase() !== accountEmail.toLowerCase()
    ) {
      setError("Email does not match your signed-in account.");
      return;
    }

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
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  const canDelete =
    confirmPhrase.trim() === DELETE_ACCOUNT_PHRASE &&
    (!accountEmail ||
      confirmEmail.trim().toLowerCase() === accountEmail.toLowerCase());

  const providerLabel =
    authProvider === "google"
      ? "Google"
      : authProvider === "email"
        ? "Email and password"
        : "Account session";

  return (
    <Frame
      title="Account & access"
      description="Manage your active session securely."
    >
      <div className="settings-canvas">
        <Card className="stack settings-card settings-session-card">
          <h2 style={{ margin: 0 }}>Session</h2>
          <div className="settings-session-identity">
            <span className="settings-session-mark" aria-hidden="true">
              {profileInitials(accountEmail.split("@")[0] || "A")}
            </span>
            <div>
              <strong>{providerLabel}</strong>
              {accountEmail ? (
                <p className="muted">{accountEmail}</p>
              ) : (
                <p className="muted">Email is still loading.</p>
              )}
            </div>
          </div>
          <div className="cluster">
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

        <Card className="stack settings-card settings-danger-card">
          <p className="eyebrow">Danger zone</p>
          <h2 style={{ margin: 0 }}>Delete account</h2>
          <p
            className="muted"
            style={{ margin: 0, fontSize: "var(--text-sm)" }}
          >
            Permanently removes your account and all candidate data stored with
            us: profile, skills, experience, education, resumes and files, job
            descriptions, ATS analyses, interviews, learning paths, saved jobs,
            activity, and preferences. This cannot be undone.
          </p>
          {!showDeletePanel ? (
            <Button
              variant="destructive"
              onClick={() => setShowDeletePanel(true)}
            >
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
                  onChange={(e: any) => setConfirmEmail(e.target.value)}
                  placeholder={accountEmail || "you@example.com"}
                  disabled={deleting}
                />
              </label>
              <label className="field-label">
                <span>
                  Type <span className="mono">{DELETE_ACCOUNT_PHRASE}</span> to
                  confirm
                </span>
                <Input
                  value={confirmPhrase}
                  onChange={(e: any) => setConfirmPhrase(e.target.value)}
                  placeholder={DELETE_ACCOUNT_PHRASE}
                  disabled={deleting}
                  autoComplete="off"
                />
              </label>
              <div className="cluster">
                <Button
                  variant="destructive"
                  disabled={deleting || !canDelete}
                  onClick={() => void deleteAccount()}
                >
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
              <p
                className="muted"
                style={{ margin: 0, fontSize: "var(--text-xs)" }}
              >
                Account deletion is permanent. Make sure you really want to
                remove everything.
              </p>
            </div>
          )}
        </Card>
      </div>
    </Frame>
  );
}

function StoredSettings({ kind }: { kind: "notifications" | "privacy" }) {
  const [data, setData] = useState<any>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    apiRequest<any>("/settings")
      .then((r) => {
        if (!active) return;
        setData(r[kind] || {});
        setError("");
      })
      .catch((e: any) => {
        if (!active) return;
        setError(e.message);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [kind]);
  async function save() {
    if (!loaded) return;
    setSaving(true);
    setMessage("");
    setError("");
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
              recording_retention_days: Number(
                data.recording_retention_days || 0,
              ),
              resume_processing_consent: Boolean(
                data.resume_processing_consent,
              ),
              job_recommendation_consent: Boolean(
                data.job_recommendation_consent,
              ),
              profile_visibility: data.profile_visibility || "private",
            };
      if (kind === "privacy") {
        const days = Number(payload.recording_retention_days ?? 0);
        if (Number.isNaN(days) || days < 0 || days > 365) {
          throw new Error(
            "Recording retention must be between 0 and 365 days.",
          );
        }
      }
      await apiRequest(`/settings/${kind}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setMessage("Settings saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const notificationToggles = [
    {
      key: "job_alerts",
      label: "Job alerts",
      hint: "Email when new matching roles are available.",
    },
    {
      key: "learning_reminders",
      label: "Learning reminders",
      hint: "Reminders for paths generated from ATS gaps.",
    },
    {
      key: "interview_reminders",
      label: "Interview reminders",
      hint: "Reminders for unfinished practice sessions.",
    },
    {
      key: "product_updates",
      label: "Product updates",
      hint: "Occasional notes about Career Copilot itself.",
    },
  ] as const;

  const consentToggles = [
    {
      key: "resume_processing_consent",
      label: "Allow resume processing",
      hint: "Extract and score resumes you upload and confirm.",
    },
    {
      key: "job_recommendation_consent",
      label: "Allow job recommendations",
      hint: "Rank jobs using confirmed resume evidence.",
    },
  ] as const;

  if (!loaded) {
    return (
      <div className="settings-canvas">
        <Card className="settings-card">
          <LoadingState label="Loading settings" variant="Dots" />
        </Card>
      </div>
    );
  }

  return (
    <div className="settings-canvas">
      {kind === "notifications" ? (
        <Card className="stack settings-card">
          <h2 style={{ margin: 0 }}>Notification preferences</h2>
          <p className="muted" style={{ margin: 0 }}>
            These choices are stored on your account, not in this browser.
          </p>
          <label className="field-label">
            Email frequency
            <Select
              value={data.email_frequency || "weekly"}
              onChange={(e: any) =>
                setData({ ...data, email_frequency: e.target.value })
              }
            >
              <option value="never">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </Select>
          </label>
          <div className="settings-toggle-list">
            {notificationToggles.map((item) => (
              <label className="settings-toggle" key={item.key}>
                <span className="settings-toggle-copy">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(data[item.key])}
                  onChange={(e: any) =>
                    setData({ ...data, [item.key]: e.target.checked })
                  }
                />
              </label>
            ))}
          </div>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Saving settings…" : "Save settings"}
          </Button>
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
      ) : (
        <>
          <Card className="stack settings-card">
            <h2 style={{ margin: 0 }}>Profile visibility</h2>
            <label className="field-label">
              Who can see your profile
              <Select
                value={data.profile_visibility || "private"}
                onChange={(e: any) =>
                  setData({ ...data, profile_visibility: e.target.value })
                }
              >
                <option value="private">Private — only this account</option>
                <option value="limited">
                  Limited — only features you enable
                </option>
              </Select>
            </label>
            <div className="settings-toggle-list">
              {consentToggles.map((item) => (
                <label className="settings-toggle" key={item.key}>
                  <span className="settings-toggle-copy">
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(data[item.key])}
                    onChange={(e: any) =>
                      setData({ ...data, [item.key]: e.target.checked })
                    }
                  />
                </label>
              ))}
            </div>
          </Card>
          <Card className="stack settings-card">
            <h2 style={{ margin: 0 }}>Camera and microphone</h2>
            <p className="muted" style={{ margin: 0 }}>
              These apply to mock-interview practice. The server does not invent
              camera data.
            </p>
            <div className="grid-2">
              <label className="field-label">
                Camera
                <Select
                  value={data.camera_permission || "ask"}
                  onChange={(e: any) =>
                    setData({ ...data, camera_permission: e.target.value })
                  }
                >
                  <option value="ask">Ask each session</option>
                  <option value="allowed">Allowed</option>
                  <option value="disabled">Disabled</option>
                </Select>
              </label>
              <label className="field-label">
                Microphone
                <Select
                  value={data.microphone_permission || "ask"}
                  onChange={(e: any) =>
                    setData({ ...data, microphone_permission: e.target.value })
                  }
                >
                  <option value="ask">Ask each session</option>
                  <option value="allowed">Allowed</option>
                  <option value="disabled">Disabled</option>
                </Select>
              </label>
              <label className="field-label">
                Recording retention (days)
                <Select
                  value={String(data.recording_retention_days ?? 0)}
                  onChange={(e: any) =>
                    setData({
                      ...data,
                      recording_retention_days: Number(e.target.value),
                    })
                  }
                >
                  {Array.from(
                    new Set([
                      0,
                      7,
                      30,
                      90,
                      180,
                      365,
                      Number(data.recording_retention_days ?? 0),
                    ]),
                  )
                    .filter(
                      (days) =>
                        Number.isFinite(days) && days >= 0 && days <= 365,
                    )
                    .sort((a, b) => a - b)
                    .map((days) => (
                      <option key={days} value={days}>
                        {days === 0
                          ? "0 — do not keep recordings"
                          : `${days} days`}
                      </option>
                    ))}
                </Select>
              </label>
            </div>
          </Card>
          <Card className="stack settings-card settings-save-card">
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Saving settings…" : "Save settings"}
            </Button>
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
        </>
      )}
    </div>
  );
}

export function PreferenceSettings() {
  return (
    <Frame
      title="Notification preferences"
      description="Stored in your account, not in browser storage."
    >
      <StoredSettings kind="notifications" />
    </Frame>
  );
}

export function PrivacySettings() {
  return (
    <Frame
      title="Privacy controls"
      description="Consent and visibility choices are saved to your private account."
    >
      <StoredSettings kind="privacy" />
    </Frame>
  );
}
