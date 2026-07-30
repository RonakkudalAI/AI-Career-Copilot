"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

const COMPLETION_LABELS: Record<string, string> = {
  basic: "Name & location",
  career: "Current role & target roles",
  experience: "Work experience",
  skills: "Skills",
  education: "Education",
  preferences: "Work preferences",
  resume: "Confirmed resume",
  links: "Professional links",
};

const COMPLETION_MAX: Record<string, number> = {
  basic: 15,
  career: 15,
  experience: 20,
  skills: 15,
  education: 10,
  preferences: 10,
  resume: 10,
  links: 5,
};

const CAREER_LEVEL_OPTIONS = [
  { value: "", label: "Select career level" },
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
  { value: "", label: "Select work authorization" },
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
  { value: "", label: "Select currency" },
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
  { value: "", label: "Select degree" },
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
  { value: "Other", label: "Other" },
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

function withExtraOptions(
  options: readonly { value: string; label: string }[] | readonly string[],
  extras: Array<string | null | undefined>,
) {
  const normalized = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : { ...option },
  );
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

function MultiOptionGroup({
  legend,
  options,
  selected,
  onChange,
}: {
  legend: string;
  options: readonly { value: string; label: string }[] | readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const normalized = withExtraOptions(options, selected);
  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter((item) => item !== value));
    else onChange([...selected, value]);
  }
  return (
    <fieldset className="stack" style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, margin: 0 }}>
      <legend style={{ padding: "0 6px", fontWeight: 700 }}>{legend}</legend>
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
      </div>
    </fieldset>
  );
}

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
    ])
      .then(([profilePayload, skillRows, experienceRows, educationRows, linkRows]) => {
        if (!active) return;
        applyLoaded(profilePayload, skillRows, experienceRows, educationRows, linkRows);
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
  const details = (form.profile_completion_details || {}) as Record<string, number>;
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
          <Card className="stack">
            <div className="row">
              <h2 style={{ margin: 0 }}>Profile completion</h2>
              <span className="badge badge-info" aria-live="polite">
                {completion}% complete
              </span>
            </div>
            <Progress value={completion} label="Confirmed profile completion" />
            <div className="grid-2">
              {Object.keys(COMPLETION_MAX).map((key) => {
                const earned = Number(details[key] || 0);
                const max = COMPLETION_MAX[key];
                return (
                  <div key={key} className="row" style={{ justifyContent: "space-between" }}>
                    <span>{COMPLETION_LABELS[key] || key}</span>
                    <strong className="mono">
                      {earned}/{max}
                    </strong>
                  </div>
                );
              })}
            </div>
            <p>
              Upload and confirm a resume under{" "}
              <Link href="/resume-analysis/new">Resume Analysis</Link> to earn the resume portion.
            </p>
          </Card>

          <Card className="stack">
            <h2 style={{ margin: 0 }}>Basic details</h2>
            <div className="grid-2">
              <label className="field-label">
                Full name
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
              <label className="field-label">
                Location
                <Select value={form.location || ""} onChange={(e) => updateField("location", e.target.value)}>
                  <option value="">Select location</option>
                  {withExtraOptions(LOCATION_OPTIONS, [form.location]).map((location) => (
                    <option key={location.value} value={location.value}>
                      {location.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field-label">
                Current role
                <Select value={form.current_role || ""} onChange={(e) => updateField("current_role", e.target.value)}>
                  <option value="">Select current role</option>
                  {withExtraOptions(TARGET_ROLE_OPTIONS, [form.current_role]).map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field-label">
                Years of experience
                <Select value={yearsValue} onChange={(e) => updateField("years_experience", e.target.value)}>
                  <option value="">Select years</option>
                  {withExtraOptions(
                    YEARS_OPTIONS.map((years) => ({
                      value: String(years),
                      label: years === 0 ? "0 (Fresher)" : String(years),
                    })),
                    [yearsValue],
                  ).map((years) => (
                    <option key={years.value} value={years.value}>
                      {years.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field-label">
                Career level
                <Select value={form.career_level || ""} onChange={(e) => updateField("career_level", e.target.value)}>
                  {withExtraOptions(CAREER_LEVEL_OPTIONS, [form.career_level]).map((option) => (
                    <option key={option.value || "empty"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field-label">
                Career goal
                <Select value={form.career_goal || ""} onChange={(e) => updateField("career_goal", e.target.value)}>
                  {withExtraOptions(
                    [
                      { value: "", label: "Select career goal" },
                      { value: "switch_role", label: "Switch role" },
                      { value: "get_first_job", label: "Get first job" },
                      { value: "promotion", label: "Get promoted" },
                      { value: "upskill", label: "Upskill in current role" },
                      { value: "relocate", label: "Relocate for work" },
                      { value: "freelance", label: "Move to freelance / contract" },
                    ],
                    [form.career_goal],
                  ).map((option) => (
                    <option key={option.value || "empty"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
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
            <p>These preferences are stored in Supabase and count toward profile completion.</p>
            <MultiOptionGroup
              legend="Target roles"
              options={TARGET_ROLE_OPTIONS}
              selected={prefDraft.target_roles}
              onChange={(target_roles) => setPrefDraft({ ...prefDraft, target_roles })}
            />
            <MultiOptionGroup
              legend="Preferred industries"
              options={INDUSTRY_OPTIONS}
              selected={prefDraft.preferred_industries}
              onChange={(preferred_industries) => setPrefDraft({ ...prefDraft, preferred_industries })}
            />
            <MultiOptionGroup
              legend="Preferred locations"
              options={LOCATION_OPTIONS}
              selected={prefDraft.preferred_locations}
              onChange={(preferred_locations) => setPrefDraft({ ...prefDraft, preferred_locations })}
            />
            <MultiOptionGroup
              legend="Work modes"
              options={WORK_MODE_OPTIONS}
              selected={prefDraft.work_modes}
              onChange={(work_modes) => setPrefDraft({ ...prefDraft, work_modes })}
            />
            <MultiOptionGroup
              legend="Employment types"
              options={EMPLOYMENT_TYPE_OPTIONS}
              selected={prefDraft.employment_types}
              onChange={(employment_types) => setPrefDraft({ ...prefDraft, employment_types })}
            />
            <div className="grid-2">
              <label className="field-label">
                Work authorization
                <Select
                  value={prefDraft.work_authorization}
                  onChange={(e) => setPrefDraft({ ...prefDraft, work_authorization: e.target.value })}
                >
                  {WORK_AUTHORIZATION_OPTIONS.map((option) => (
                    <option key={option.value || "empty"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field-label">
                Notice period
                <Select
                  value={prefDraft.notice_period_days}
                  onChange={(e) => setPrefDraft({ ...prefDraft, notice_period_days: e.target.value })}
                >
                  {NOTICE_PERIOD_OPTIONS.map((option) => (
                    <option key={option.value || "empty"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field-label">
                Salary currency
                <Select
                  value={prefDraft.salary_currency}
                  onChange={(e) => setPrefDraft({ ...prefDraft, salary_currency: e.target.value })}
                >
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option.value || "empty"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field-label">
                Minimum salary
                <Input
                  type="number"
                  min={0}
                  value={prefDraft.salary_min}
                  onChange={(e) => setPrefDraft({ ...prefDraft, salary_min: e.target.value })}
                />
              </label>
              <label className="field-label">
                Maximum salary
                <Input
                  type="number"
                  min={0}
                  value={prefDraft.salary_max}
                  onChange={(e) => setPrefDraft({ ...prefDraft, salary_max: e.target.value })}
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
            <h2 style={{ margin: 0 }}>Skills</h2>
            <div className="cluster">
              <label className="field-label" style={{ flex: 1 }}>
                Skill
                <Select value={skillName} onChange={(e) => setSkillName(e.target.value)}>
                  <option value="">Select a skill</option>
                  {SKILL_OPTIONS.map((skill) => (
                    <option key={skill} value={skill}>
                      {skill}
                    </option>
                  ))}
                </Select>
              </label>
              <Button onClick={addSkill} disabled={!skillName.trim()}>
                Add skill
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
            <h2 style={{ margin: 0 }}>Work experience</h2>
            <div className="grid-2">
              <label className="field-label">
                Company
                <Input
                  value={experienceDraft.company_name}
                  onChange={(e) => setExperienceDraft({ ...experienceDraft, company_name: e.target.value })}
                />
              </label>
              <label className="field-label">
                Role title
                <Select
                  value={experienceDraft.role_title}
                  onChange={(e) => setExperienceDraft({ ...experienceDraft, role_title: e.target.value })}
                >
                  <option value="">Select role title</option>
                  {TARGET_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field-label">
                Location
                <Select
                  value={experienceDraft.location}
                  onChange={(e) => setExperienceDraft({ ...experienceDraft, location: e.target.value })}
                >
                  <option value="">Select location</option>
                  {LOCATION_OPTIONS.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field-label">
                Employment type
                <Select
                  value={experienceDraft.employment_type}
                  onChange={(e) => setExperienceDraft({ ...experienceDraft, employment_type: e.target.value })}
                >
                  <option value="">Select employment type</option>
                  {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
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
            <h2 style={{ margin: 0 }}>Education</h2>
            <div className="grid-2">
              <label className="field-label">
                Institution
                <Input
                  value={educationDraft.institution}
                  onChange={(e) => setEducationDraft({ ...educationDraft, institution: e.target.value })}
                />
              </label>
              <label className="field-label">
                Degree
                <Select
                  value={educationDraft.degree}
                  onChange={(e) => setEducationDraft({ ...educationDraft, degree: e.target.value })}
                >
                  {DEGREE_OPTIONS.map((option) => (
                    <option key={option.value || "empty"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field-label">
                Field of study
                <Select
                  value={educationDraft.field_of_study}
                  onChange={(e) => setEducationDraft({ ...educationDraft, field_of_study: e.target.value })}
                >
                  <option value="">Select field of study</option>
                  <option value="Computer Science">Computer Science</option>
                  <option value="Information Technology">Information Technology</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Data Science">Data Science</option>
                  <option value="Artificial Intelligence">Artificial Intelligence</option>
                  <option value="Mechanical">Mechanical</option>
                  <option value="Business">Business</option>
                  <option value="Other">Other</option>
                </Select>
              </label>
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
            <h2 style={{ margin: 0 }}>Professional links</h2>
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

export function AccountSettings() {
  const router = useRouter();
  const [error, setError] = useState("");
  async function logout() {
    await createClient()?.auth.signOut();
    router.replace("/");
    router.refresh();
  }
  async function change() {
    const email = prompt("Enter your account email to receive a recovery link");
    if (!email) return;
    const result = await createClient()?.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
    });
    if (result?.error) setError(result.error.message);
  }
  return (
    <Frame title="Account & access" description="Supabase Auth manages sign-in and password recovery.">
      <Card className="stack">
        <Button variant="secondary" onClick={change}>
          Send password recovery link
        </Button>
        <Button variant="secondary" onClick={logout}>
          Logout
        </Button>
        <p>Account deletion requires explicit confirmation and the server-side Supabase secret to be configured.</p>
        {error && <p className="field-error">{error}</p>}
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
