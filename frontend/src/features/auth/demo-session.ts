

import { isDemoCookiePresent } from "@/shared/config";

type DemoRecord = Record<string, unknown>;

type DemoState = {
  profile: DemoRecord;
  preferences: DemoRecord;
  notificationPreferences: DemoRecord;
  privacyPreferences: DemoRecord;
  skills: DemoRecord[];
  experiences: DemoRecord[];
  education: DemoRecord[];
  links: DemoRecord[];
  resumes: DemoRecord[];
  resumeVersions: DemoRecord[];
  jobDescriptions: DemoRecord[];
  analyses: DemoRecord[];
  evidence: DemoRecord[];
  interviews: DemoRecord[];
  questions: DemoRecord[];
  responses: DemoRecord[];
  reports: DemoRecord[];
  savedJobs: DemoRecord[];
  jobs: DemoRecord[];
  learningPaths: DemoRecord[];
};

const DEMO_USER_ID = "demo-user";

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Seed completed mock sessions with an upward score trend for dashboard charts. */
function seedDemoInterviewProgress(): Pick<DemoState, "interviews" | "reports"> {
  const sessions = [
    {
      id: "demo-interview-1",
      label: "Behavioural warm-up",
      mode: "behavioural",
      target_role: "Software Engineer",
      days: 21,
      overall: 52,
      communication: 48,
      structure: 55,
      content: 54,
      eye: 42,
    },
    {
      id: "demo-interview-2",
      label: "Technical fundamentals",
      mode: "technical",
      target_role: "Backend Engineer",
      days: 14,
      overall: 61,
      communication: 58,
      structure: 64,
      content: 62,
      eye: 55,
    },
    {
      id: "demo-interview-3",
      label: "Mixed practice",
      mode: "mixed",
      target_role: "Software Engineer",
      days: 7,
      overall: 68,
      communication: 66,
      structure: 70,
      content: 69,
      eye: 68,
    },
    {
      id: "demo-interview-4",
      label: "Role-focused debrief",
      mode: "mixed",
      target_role: "Backend Engineer",
      days: 2,
      overall: 76,
      communication: 74,
      structure: 78,
      content: 77,
      eye: 82,
    },
  ];

  const interviews = sessions.map((s) => ({
    id: s.id,
    user_id: DEMO_USER_ID,
    mode: s.mode,
    target_role: s.target_role,
    status: "completed",
    question_count: 4,
    created_at: daysAgo(s.days),
    started_at: daysAgo(s.days),
    completed_at: daysAgo(s.days - 0.02),
  }));

  const reports = sessions.map((s) => ({
    id: `${s.id}-report`,
    session_id: s.id,
    user_id: DEMO_USER_ID,
    status: "ready",
    overall_score: s.overall,
    communication_score: s.communication,
    structure_score: s.structure,
    content_score: s.content,
    created_at: daysAgo(s.days - 0.02),
    summary: `Demo debrief for ${s.label}: overall ${s.overall}/100.`,
    report: {
      overall_summary: `Demo debrief for ${s.label}: overall ${s.overall}/100. Practice shows steady improvement.`,
      overall_score: s.overall,
      communication_score: s.communication,
      structure_score: s.structure,
      content_score: s.content,
      strengths: ["Clearer structure than earlier practice", "Stronger examples"],
      improvements: ["Tighten openings", "End with measurable impact"],
      practice_plan: ["Rehearse one STAR story", "Record and review fillers"],
      gaze_summary: {
        average_eye_contact_score: s.eye,
        looking_samples: Math.round(s.eye * 0.4),
        away_samples: Math.round((100 - s.eye) * 0.4),
        answers_with_gaze: 4,
        notes: `Demo camera presence ~${s.eye}% of tracked answer time.`,
      },
      provider: "demo",
    },
    provider: "demo",
  }));

  return { interviews, reports };
}

function initialState(): DemoState {
  const created = now();
  const seeded = seedDemoInterviewProgress();
  return {
    profile: {
      id: DEMO_USER_ID,
      full_name: "Demo Candidate",
      headline: "Software engineer building reliable products",
      current_role: "Software Engineer",
      location: "Bengaluru",
      profile_completion: 62,
      profile_completion_details: {
        missing: [
          { key: "experience", label: "Add your experience" },
          { key: "links", label: "Add a professional link" },
        ],
      },
    },
    preferences: {
      user_id: DEMO_USER_ID,
      target_roles: ["Software Engineer"],
      preferred_industries: ["Technology"],
      preferred_locations: ["Bengaluru"],
      work_modes: ["hybrid"],
      employment_types: ["full_time"],
      willing_to_relocate: false,
    },
    notificationPreferences: {
      user_id: DEMO_USER_ID,
      job_alerts: true,
      learning_reminders: true,
      interview_reminders: true,
      product_updates: false,
      email_frequency: "weekly",
    },
    privacyPreferences: {
      user_id: DEMO_USER_ID,
      camera_permission: "ask",
      microphone_permission: "ask",
      recording_retention_days: 0,
      resume_processing_consent: false,
      job_recommendation_consent: false,
      profile_visibility: "private",
    },
    skills: [
      { id: id("skill"), user_id: DEMO_USER_ID, name: "TypeScript", source: "demo" },
      { id: id("skill"), user_id: DEMO_USER_ID, name: "Python", source: "demo" },
    ],
    experiences: [],
    education: [],
    links: [],
    resumes: [],
    resumeVersions: [],
    jobDescriptions: [],
    analyses: [],
    evidence: [],
    interviews: seeded.interviews,
    questions: [],
    responses: [],
    reports: seeded.reports,
    savedJobs: [],
    jobs: [
      { id: "demo-job-1", title: "Software Engineer", company: "Northstar Labs", location: "Bengaluru", work_mode: "hybrid", description: "Build dependable product experiences with a small engineering team.", is_active: true, latitude: 12.9716, longitude: 77.5946 },
      { id: "demo-job-2", title: "Backend Engineer", company: "Atlas Systems", location: "Hyderabad", work_mode: "remote", description: "Design APIs and data workflows for a growing platform.", is_active: true, latitude: 17.385, longitude: 78.4867 },
    ],
    learningPaths: [
      {
        id: "demo-path-1",
        user_id: DEMO_USER_ID,
        title: "Backend interview readiness",
        description: "A short practice path for API design and interview communication, grounded in sample skill gaps.",
        source_type: "candidate_selected",
        status: "active",
        progress_percentage: 25,
        item_count: 1,
        created_at: created,
        items: [
          {
            id: "demo-item-1",
            title: "Explain an API design decision",
            objective: "Practice structuring a clear API design explanation with trade-offs and a concrete example.",
            status: "pending",
            estimated_minutes: 45,
            difficulty: "foundational",
            learning_resources: [
              {
                id: "demo-resource-1",
                title: "REST API design fundamentals",
                resource_type: "youtube_video",
                provider: "freeCodeCamp.org",
                url: "https://www.youtube.com/watch?v=Q-BpqyOT3a8",
                reason_recommended: "Free lesson for practicing clear API design explanations (demo sample).",
                metadata: {
                  video_id: "Q-BpqyOT3a8",
                  channel_title: "freeCodeCamp.org",
                  source: "demo",
                  video_id_policy: "demo_known_public_video",
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

let state = initialState();

/**
 * Demo mode is development-only. Production builds never honor the demo cookie
 * (no invented ATS scores / offline API shim).
 */
export function isDemoSession() {
  if (import.meta.env.PROD) return false;
  return isDemoCookiePresent();
}

function jsonBody(init: RequestInit) {
  if (typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body) as DemoRecord;
  } catch {
    return {};
  }
}

function buildDemoReport(session: DemoRecord, responses: DemoRecord[]): DemoRecord {
  const reviews: DemoRecord[] = responses.map((response, index) => {
    const evaluation = (response.evaluation || {}) as DemoRecord;
    const answer = String(response.transcript || response.typed_response || "").trim();
    return {
      question: String(state.questions.find((q) => q.id === response.question_id)?.question || `Question ${index + 1}`),
      answer,
      score: Number(evaluation.score || 0),
      verdict: String(evaluation.verdict || "unreviewed"),
      interviewer_feedback: String(evaluation.interviewer_feedback || "No interviewer feedback was recorded."),
      strengths: Array.isArray(evaluation.strengths) ? evaluation.strengths : [],
      improvements: Array.isArray(evaluation.improvements) ? evaluation.improvements : [],
      better_approach: evaluation.better_approach,
      filler_analysis: evaluation.filler_analysis || {},
      speaking_delivery: evaluation.speaking_delivery || {},
    };
  });
  const scores = reviews.map((review) => Number(review.score)).filter(Number.isFinite);
  const overall = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  const allImprovements = reviews.flatMap((review) => review.improvements as string[]).filter(Boolean);
  const allStrengths = reviews.flatMap((review) => review.strengths as string[]).filter(Boolean);
  const fillers = reviews.reduce((sum, review) => sum + Number((review.filler_analysis as DemoRecord).total_count || 0), 0);
  const words = reviews.reduce((sum, review) => sum + Number((review.filler_analysis as DemoRecord).word_count || 0), 0);
  const lowest = reviews.reduce<DemoRecord | null>((current, review) =>
    !current || Number(review.score) < Number(current.score) ? review : current, null);
  const role = String(session.target_role || "this role");
  const summary = reviews.length
    ? `Evidence-only demo debrief for ${role}: ${reviews.length} recorded answer(s) averaged ${overall}/100. The feedback below is derived from those answers; no employer decision is implied.`
    : "No answers were recorded for this demo session, so no performance report was generated.";
  return {
    overall_summary: summary,
    overall_score: overall,
    communication_score: words ? Math.max(0, Math.min(100, 88 - Math.round((fillers / words) * 400))) : 0,
    structure_score: overall,
    content_score: overall,
    strengths: [...new Set(allStrengths)].slice(0, 8),
    improvements: [...new Set(allImprovements)].slice(0, 8),
    practice_plan: lowest ? [`Re-answer question ${reviews.indexOf(lowest) + 1} and address the recorded feedback: ${String((lowest.improvements as string[])[0] || "add a specific result")}.`] : [],
    filler_summary: words ? `${fillers} filler token(s) across ~${words} recorded words.` : "No transcript words were recorded.",
    speaking_summary: {
      average_words_per_minute: null,
      total_fillers: fillers,
      total_words: words,
      filler_rate: words ? fillers / words : 0,
    },
    score_series: reviews.map((review, index) => ({ position: index + 1, score: review.score, label: `Q${index + 1}` })),
    question_reviews: reviews,
    provider: "demo_evidence",
    generation_status: "evidence_only",
    report_version: "evidence-report-v2",
  };
}

function resource(resource: string) {
  const table: Record<string, DemoRecord[]> = {
    skills: state.skills,
    experiences: state.experiences,
    education: state.education,
    links: state.links,
  };
  return table[resource];
}

function profileResponse() {
  return { profile: state.profile, preferences: state.preferences };
}

function buildDemoInterviewProgress() {
  const sessionById = new Map(state.interviews.map((row) => [String(row.id), row]));
  const bestBySession = new Map<string, DemoRecord>();
  const sortedReports = [...state.reports].sort((a, b) =>
    String(b.created_at || "").localeCompare(String(a.created_at || "")),
  );
  for (const report of sortedReports) {
    const sid = String(report.session_id || "");
    if (!sid || bestBySession.has(sid)) continue;
    if (report.overall_score == null) continue;
    bestBySession.set(sid, report);
  }

  const history = [...bestBySession.entries()]
    .map(([sid, report]) => {
      const session = sessionById.get(sid) || {};
      const labelParts = [session.target_role, session.target_company].filter(Boolean);
      return {
        session_id: sid,
        label: labelParts.length
          ? labelParts.join(" · ")
          : String(session.mode || "Mock interview").replaceAll("_", " "),
        mode: session.mode || null,
        status: session.status || "completed",
        at: session.completed_at || report.created_at || session.created_at || null,
        overall_score: report.overall_score ?? null,
        communication_score: report.communication_score ?? null,
        structure_score: report.structure_score ?? null,
        content_score: report.content_score ?? null,
        eye_contact_score:
          (report.report as DemoRecord | undefined)?.gaze_summary &&
          typeof (report.report as DemoRecord).gaze_summary === "object"
            ? Number(
                ((report.report as DemoRecord).gaze_summary as DemoRecord)
                  .average_eye_contact_score,
              ) || null
            : null,
      };
    })
    .sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));

  const overalls = history
    .map((h) => h.overall_score)
    .filter((v): v is number => typeof v === "number");
  const latest = overalls.length ? overalls[overalls.length - 1] : null;
  const previous = overalls.length >= 2 ? overalls[overalls.length - 2] : null;
  const delta = latest != null && previous != null ? latest - previous : null;

  const dim = (
    key: "communication_score" | "structure_score" | "content_score" | "eye_contact_score",
  ) => {
    const values = history
      .map((h) => h[key])
      .filter((v): v is number => typeof v === "number");
    if (!values.length) return { latest: null, previous: null, average: null };
    return {
      latest: values[values.length - 1],
      previous: values.length >= 2 ? values[values.length - 2] : null,
      average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
    };
  };

  return {
    sessions_total: state.interviews.length,
    sessions_completed: state.interviews.filter((s) => s.status === "completed").length,
    sessions_with_scores: history.length,
    latest_overall: latest,
    previous_overall: previous,
    delta,
    best_overall: overalls.length ? Math.max(...overalls) : null,
    average_overall: overalls.length
      ? Math.round((overalls.reduce((a, b) => a + b, 0) / overalls.length) * 10) / 10
      : null,
    trend: delta == null ? "none" : delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    history,
    dimensions: {
      communication: dim("communication_score"),
      structure: dim("structure_score"),
      content: dim("content_score"),
      eye_contact: dim("eye_contact_score"),
    },
  };
}

function bootstrap() {
  const activeResume = state.resumes.find((resume) => resume.is_active) || null;
  const latestAnalysis = state.analyses[0] || null;
  const completedInterviews = state.interviews
    .filter((row) => row.status === "completed")
    .sort((a, b) => String(b.completed_at || b.created_at || "").localeCompare(String(a.completed_at || a.created_at || "")));
  const lastInterview = completedInterviews[0] || state.interviews[0] || null;
  return {
    profile: state.profile,
    active_resume: activeResume ? { id: activeResume.id } : null,
    active_job_description: state.jobDescriptions[0] || null,
    latest_ats_analysis: latestAnalysis,
    latest_actions: {
      last_resume_upload: null,
      last_interview: lastInterview
        ? {
            id: lastInterview.id,
            label: String(lastInterview.target_role || lastInterview.mode || "Mock interview"),
            status: lastInterview.status,
            at: lastInterview.completed_at || lastInterview.created_at,
          }
        : null,
      last_job_applied: null,
    },
    interview_progress: buildDemoInterviewProgress(),
    capabilities: { interview_evaluation: true },
    recent_activity: [],
    counts: {
      resumes: state.resumes.length,
      ats_analyses: state.analyses.length,
      interviews: state.interviews.length,
      saved_jobs: state.savedJobs.length,
    },
    workspace: {
      profile_completion: Number(state.profile.profile_completion || 0),
      profile_missing:
        ((state.profile.profile_completion_details as { missing?: Array<{ key: string; label: string }> } | undefined)
          ?.missing) || [],
      profile_completion_details: state.profile.profile_completion_details || {},
      has_active_resume: Boolean(activeResume),
      has_confirmed_resume: state.resumeVersions.some((version) => version.extraction_status === "confirmed"),
      failed_ats_count: 0,
      ready_for_ats:
        state.resumeVersions.some((version) => version.extraction_status === "confirmed") &&
        state.jobDescriptions.some((jd) => jd.extraction_status === "confirmed"),
    },
  };
}

function resumeVersion(resumeId: string) {
  return state.resumeVersions.find((version) => String(version.resume_id || "") === resumeId) || null;
}

/** Mirror backend _enrich_ats_analysis so demo history shows resume + JD used. */
function enrichDemoAnalysis(analysis: DemoRecord, includeParsed = false): DemoRecord {
  const version = state.resumeVersions.find(
    (item) => String(item.id || "") === String(analysis.resume_version_id || ""),
  );
  const resume = version
    ? state.resumes.find((item) => String(item.id || "") === String(version.resume_id || ""))
    : null;
  const job = state.jobDescriptions.find(
    (item) => String(item.id || "") === String(analysis.job_description_id || ""),
  );

  const enriched: DemoRecord = {
    ...analysis,
    resume: resume
      ? {
          id: resume.id,
          title: resume.title,
          original_filename: version?.original_filename || null,
          version_number: version?.version_number ?? null,
          created_at: version?.created_at || resume.created_at || null,
          unavailable: false,
        }
      : version
        ? {
            id: version.resume_id,
            title: "Resume unavailable",
            original_filename: version.original_filename || null,
            version_number: version.version_number ?? null,
            created_at: version.created_at || null,
            unavailable: true,
          }
        : {
            id: null,
            title: "Resume unavailable",
            original_filename: null,
            version_number: null,
            created_at: null,
            unavailable: true,
          },
    job_description: job
      ? {
          id: job.id,
          title: job.title,
          company: job.company || null,
          role_title: job.role_title || null,
          input_type: job.input_type || null,
          original_filename: job.original_filename || null,
          created_at: job.created_at || null,
          unavailable: false,
        }
      : {
          id: null,
          title: "Job description unavailable",
          company: null,
          role_title: null,
          input_type: null,
          original_filename: null,
          created_at: null,
          unavailable: true,
        },
  };

  if (includeParsed) {
    enriched.parsed_inputs = {
      resume: version
        ? {
            filename: version.original_filename || null,
            extraction_status: version.extraction_status || null,
            plain_text: "Demo resume plain text.",
            structured_content: version.structured_content || { sections: {} },
          }
        : null,
      job_description: job
        ? {
            filename: job.original_filename || null,
            extraction_status: job.extraction_status || null,
            plain_text: job.raw_text || "",
            structured_content: job.structured_content || { sections: {} },
          }
        : null,
    };
  }
  return enriched;
}

function parsePath(path: string) {
  return path.split("?")[0].split("/").filter(Boolean);
}

export async function demoApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const parts = parsePath(path);
  const body = jsonBody(init);

  if (path === "/me/bootstrap") return bootstrap() as T;
  if (path === "/profile" && method === "GET") return profileResponse() as T;
  if (path === "/profile" && method === "PATCH") {
    state.profile = { ...state.profile, ...body };
    return state.profile as T;
  }
  if (path === "/profile/preferences" && method === "PUT") {
    state.preferences = { ...state.preferences, ...body };
    return state.preferences as T;
  }
  if (path === "/settings" && method === "GET") {
    return { notifications: state.notificationPreferences, privacy: state.privacyPreferences } as T;
  }
  if (parts[0] === "settings" && method === "PUT") {
    if (parts[1] === "notifications") state.notificationPreferences = { ...state.notificationPreferences, ...body };
    if (parts[1] === "privacy") state.privacyPreferences = { ...state.privacyPreferences, ...body };
    return (parts[1] === "notifications" ? state.notificationPreferences : state.privacyPreferences) as T;
  }
  if (parts[0] === "profile" && parts.length === 2) {
    const rows = resource(parts[1]);
    if (method === "GET") return (rows || []) as T;
    if (method === "POST" && rows) {
      const created = { ...body, id: id(parts[1].slice(0, -1)), user_id: DEMO_USER_ID };
      rows.push(created);
      return created as T;
    }
  }
  if (parts[0] === "profile" && parts.length === 3) {
    const rows = resource(parts[1]);
    const index = rows?.findIndex((row) => row.id === parts[2]) ?? -1;
    if (rows && index >= 0 && method === "PATCH") {
      rows[index] = { ...rows[index], ...body };
      return rows[index] as T;
    }
    if (rows && index >= 0 && method === "DELETE") {
      rows.splice(index, 1);
      return undefined as T;
    }
  }
  if (path === "/profile/avatar" && method === "DELETE") {
    state.profile = { ...state.profile, avatar_path: null, avatar_url: null };
    return undefined as T;
  }
  if (path === "/profile/avatar" && method === "POST") {
    const file = init.body instanceof FormData ? init.body.get("file") as File | null : null;
    const avatarUrl = file ? URL.createObjectURL(file) : null;
    state.profile = { ...state.profile, avatar_path: file?.name || "demo-avatar", avatar_url: avatarUrl };
    return { profile: state.profile, avatar_url: avatarUrl } as T;
  }
  if (path === "/profile/skills/from-resume" && method === "POST") {
    return { suggested: state.skills.map((skill) => skill.name), created: [], created_count: 0, profile_completion: state.profile.profile_completion } as T;
  }
  if (parts[0] === "resumes" && parts.length === 1 && method === "GET") {
    return state.resumes.map((resume) => ({
      ...resume,
      latest_version: resumeVersion(String(resume.id || "")),
    })) as T;
  }
  if (parts[0] === "resumes" && parts.length === 1 && method === "POST") {
    const form = init.body instanceof FormData ? init.body : null;
    const file = form?.get("file") as File | null;
    const resumeId = id("demo-resume");
    const versionId = id("demo-version");
    const resume = { id: resumeId, user_id: DEMO_USER_ID, title: file?.name ? `${file.name} demo` : "Demo resume", is_active: state.resumes.length === 0, created_at: now() };
    const version = { id: versionId, resume_id: resumeId, user_id: DEMO_USER_ID, version_number: 1, source_type: "uploaded", original_filename: file?.name || "demo-resume.pdf", mime_type: file?.type || "application/pdf", extraction_status: "review_required", created_at: now(), structured_content: { sections: { summary: ["Software engineer with experience building web products."], skills: ["TypeScript", "Python"], experience: ["Software Engineer  -  Demo Company"] } } };
    state.resumes.unshift(resume);
    state.resumeVersions.unshift(version);
    return { resume, version } as T;
  }
  if (parts[0] === "resumes" && parts.length === 2 && method === "DELETE") {
    state.resumes = state.resumes.filter((resume) => resume.id !== parts[1]);
    state.resumeVersions = state.resumeVersions.filter((version) => version.resume_id !== parts[1]);
    return undefined as T;
  }
  // POST /resumes/{id}/activate
  if (parts[0] === "resumes" && parts[2] === "activate" && method === "POST") {
    const resume = state.resumes.find((item) => item.id === parts[1]);
    if (resume) state.resumes.forEach((item) => { item.is_active = item.id === resume.id; });
    return resume as T;
  }
  // Legacy shape still used in older demo paths
  if (parts[0] === "resumes" && parts.length === 2 && method === "POST") {
    const resume = state.resumes.find((item) => item.id === parts[1]);
    if (resume) state.resumes.forEach((item) => { item.is_active = item.id === resume.id; });
    return resume as T;
  }
  if (parts[0] === "resumes" && parts[2] === "preview") {
    const resume = state.resumes.find((item) => item.id === parts[1]);
    const version = resume ? resumeVersion(String(resume.id || "")) : null;
    return { resume, version, download_url: null, expires_in: 0, prefer_rendered_pdf: false } as T;
  }
  if (parts[0] === "resume-versions" && parts.length >= 2) {
    const version = state.resumeVersions.find((item) => item.id === parts[1]);
    if (parts[2] === "confirm" && method === "POST" && version) {
      version.extraction_status = "confirmed";
      return version as T;
    }
    // PATCH extraction review (structured_content) before confirm
    if (parts[2] === "extraction" && method === "PATCH" && version) {
      if ((body as DemoRecord)?.structured_content) {
        version.structured_content = (body as DemoRecord).structured_content;
      }
      version.extraction_status = "review_required";
      return version as T;
    }
    if (method === "GET") return version as T;
  }
  if (path === "/job-descriptions" && method === "GET") return state.jobDescriptions as T;
  if (path === "/job-descriptions" && method === "POST") {
    const record = { id: id("demo-jd"), user_id: DEMO_USER_ID, title: body.title || "Demo job description", company: body.company || "Demo Company", role_title: body.role_title || "Software Engineer", raw_text: body.raw_text || "Build reliable software products.", input_type: "text", extraction_status: "review_required", structured_content: { sections: {} }, created_at: now() };
    state.jobDescriptions.unshift(record);
    return record as T;
  }
  if (parts[0] === "job-descriptions" && parts[2] === "confirm" && method === "POST") {
    const record = state.jobDescriptions.find((item) => item.id === parts[1]);
    if (record) record.extraction_status = "confirmed";
    return record as T;
  }
  if (parts[0] === "job-descriptions" && parts[2] === "extraction" && method === "PATCH") {
    const record = state.jobDescriptions.find((item) => item.id === parts[1]);
    if (record) {
      if ((body as DemoRecord)?.structured_content) {
        record.structured_content = (body as DemoRecord).structured_content;
      }
      record.extraction_status = "review_required";
      return record as T;
    }
  }
  if (path === "/jobs/external/sync" && method === "POST") {
    return { synced: 0, created: 0, updated: 0, message: "Demo mode — external job sync is simulated." } as T;
  }
  if (parts[0] === "job-descriptions" && parts[1] === "upload" && method === "POST") {
    const form = init.body instanceof FormData ? init.body : null;
    const record = { id: id("demo-jd"), user_id: DEMO_USER_ID, title: String(form?.get("title") || "Demo job description"), company: String(form?.get("company") || "Demo Company"), role_title: String(form?.get("role_title") || "Software Engineer"), original_filename: String((form?.get("file") as File | null)?.name || "demo-job-description.pdf"), input_type: "pdf", extraction_status: "review_required", structured_content: { sections: {} }, created_at: now() };
    state.jobDescriptions.unshift(record);
    return record as T;
  }
  if (path === "/ats-analyses" && method === "GET") {
    return state.analyses.map((row) => enrichDemoAnalysis(row)) as T;
  }
  if (path === "/ats-analyses" && method === "POST") {
    const analysis = {
      id: id("demo-ats"),
      user_id: DEMO_USER_ID,
      resume_version_id: body.resume_version_id,
      job_description_id: body.job_description_id,
      status: "completed",
      overall_score: 78,
      score_breakdown: {
        method: "Demo structured ATS scoring",
        matched_terms: ["TypeScript", "Python"],
        missing_terms: ["Docker"],
        total_terms: 3,
        structured_parameter_scores: {
          hard_skill_match: 82,
          experience_relevance: 78,
          education_match: 75,
          certifications_match: 70,
          seniority_alignment: 80,
        },
        domain_gate: { decision: "ALLOW", reason: "Demo structured evidence is in domain." },
      },
      summary: {
        method: "Demo structured ATS scoring",
        matched: 2,
        missing: 1,
        total: 3,
        missing_terms: ["Docker"],
        structured_composite_score: 78,
        structured_parameter_scores: {
          hard_skill_match: 82,
          experience_relevance: 78,
          education_match: 75,
          certifications_match: 70,
          seniority_alignment: 80,
        },
        domain_gate: { decision: "ALLOW", reason: "Demo structured evidence is in domain." },
        disclaimer: "Demo result only; not a hiring prediction.",
      },
      created_at: now(),
    };
    state.analyses.unshift(analysis);
    state.evidence = [
      {
        id: id("demo-evidence"),
        analysis_id: analysis.id,
        requirement_text: "Docker",
        match_status: "not_found",
        explanation: "Not found in the demo resume.",
      },
    ];
    return enrichDemoAnalysis(analysis) as T;
  }
  if (parts[0] === "ats-analyses" && parts[2] === "evidence") return state.evidence.filter((item) => item.analysis_id === parts[1]) as T;
  if (parts[0] === "ats-analyses" && parts.length === 2 && method === "GET") {
    const row = state.analyses.find((item) => item.id === parts[1]);
    return (row ? enrichDemoAnalysis(row, true) : undefined) as T;
  }
  if (parts[0] === "ats-analyses" && parts.length === 2 && method === "DELETE") {
    state.analyses = state.analyses.filter((item) => item.id !== parts[1]);
    return undefined as T;
  }

  if (path === "/interview-preparation" && method === "POST") {
    const resume = state.resumeVersions.find((item) => item.id === body.resume_version_id);
    const job = state.jobDescriptions.find((item) => item.id === body.job_description_id);
    if (!resume || !job || resume.extraction_status !== "confirmed" || job.extraction_status !== "confirmed") {
      throw new Error("Confirm both the demo resume and job description before preparing for an interview.");
    }
    const matched = ["Python", "TypeScript"];
    const missing = ["Docker"];
    return {
      resume_version_id: resume.id,
      job_description_id: job.id,
      target_role: job.role_title || job.title || "Software Engineer",
      resume_questions: [{ question: "Explain a documented technical decision from your resume.", skill: "Python", difficulty: "medium", source: "candidate_context" }],
      project_questions: [],
      technical_questions: [{ question: "How would you design and test a reliable API boundary?", skill: "TypeScript", difficulty: "medium", source: "question_bank" }],
      jd_questions: [{ question: "How would you use Docker to package and run this service?", skill: "Docker", difficulty: "medium", source: "question_bank" }],
      missing_skill_questions: [{ question: "Describe how you would build a small Docker image and validate it locally.", skill: "Docker", difficulty: "easy", source: "question_bank" }],
      coding_questions: [{ question: "Write a small Python solution and explain its edge cases and complexity.", skill: "Python", difficulty: "easy", source: "candidate_context" }],
      hr_questions: [{ question: "Tell me about yourself and connect your documented experience to this role.", skill: null, difficulty: "easy", source: "candidate_context" }],
      study_topics: [{ topic: "Docker", priority: "high", reason: "Demo focus area: not found in the demo resume evidence." }],
      interview_readiness: { score: 78, ats_score: 78, matched_skills: matched, missing_skills: missing, summary: "Demo preparation uses the demo ATS evidence.", source_analysis_id: state.analyses[0]?.id || null },
    } as T;
  }

  if (path === "/interviews" && method === "GET") return state.interviews as T;
  if (path === "/interviews" && method === "POST") {
    const session = { ...body, id: id("demo-interview"), user_id: DEMO_USER_ID, status: "draft", created_at: now() };
    state.interviews.unshift(session);
    return session as T;
  }
  if (parts[0] === "interviews" && parts.length === 2 && method === "GET") {
    return { session: state.interviews.find((item) => item.id === parts[1]), questions: state.questions.filter((item) => item.session_id === parts[1]) } as T;
  }
  if (parts[0] === "interviews" && parts[2] === "start" && method === "POST") {
    const session = state.interviews.find((item) => item.id === parts[1]);
    if (session) session.status = "in_progress";
    const existingQuestions = state.questions.filter((item) => item.session_id === parts[1]);
    if (existingQuestions.length) {
      return { session, questions: existingQuestions, question_provider: "template" } as T;
    }
    const count = Number(session?.question_count || 3);
    for (let index = 1; index <= count; index += 1) state.questions.push({ id: id("demo-question"), session_id: parts[1], position: index, question: `Tell me about a time you solved a challenging ${session?.target_role || "engineering"} problem.`, question_type: session?.mode || "mixed", source_context: { provider: "template" } });
    return { session, questions: state.questions.filter((item) => item.session_id === parts[1]), question_provider: "template" } as T;
  }
  if (parts[0] === "interviews" && parts[2] === "responses" && method === "POST") {
    const answer = String((body as DemoRecord)?.transcript || (body as DemoRecord)?.typed_response || "");
    const fillers = (answer.toLowerCase().match(/\b(um|uh|like|you know)\b/g) || []).length;
    const wordCount = answer.split(/\s+/).filter(Boolean).length;
    const duration = Number((body as DemoRecord)?.duration_seconds || 0);
    const wpm = duration >= 1 && wordCount > 0 ? Math.round((wordCount / duration) * 60 * 10) / 10 : null;
    const evaluation = {
      verdict: answer.length > 80 ? "solid" : "partial",
      score: Math.min(92, 40 + Math.floor(answer.length / 4) - fillers * 3),
      interviewer_feedback:
        "Demo interviewer: cover situation, action, and result more clearly. Reduce fillers if you used them.",
      strengths: answer.length > 40 ? ["Enough detail to discuss"] : ["You responded"],
      improvements: ["Add a measurable result", fillers ? "Cut filler words" : "Keep pauses intentional"],
      better_approach: "Open with context, own the action, close with impact.",
      filler_notes: fillers ? `Detected ~${fillers} common fillers in demo mode.` : "No common fillers detected (demo).",
      filler_analysis: {
        total_count: fillers,
        unique: fillers ? ["um/uh/like/you know"] : [],
        counts: fillers ? { filler: fillers } : {},
        word_count: wordCount,
        filler_rate: wordCount ? fillers / wordCount : 0,
        notes: fillers ? "Practice pausing instead of fillers." : "Clean delivery.",
      },
      speaking_delivery: {
        word_count: wordCount,
        duration_seconds: duration || null,
        words_per_minute: wpm,
        pace_band: wpm == null ? "unknown" : wpm < 90 ? "slow" : wpm <= 165 ? "steady" : "fast",
        pace_notes:
          wpm == null
            ? "Demo mode: pace needs a timed spoken answer."
            : `Demo pace ~${wpm} wpm.`,
        filler_count: fillers,
        filler_rate: wordCount ? fillers / wordCount : 0,
      },
      provider: "demo",
    };
    const response = {
      ...body,
      id: id("demo-response"),
      session_id: parts[1],
      user_id: DEMO_USER_ID,
      evaluation,
      created_at: now(),
    };
    state.responses.push(response);
    return { response, evaluation, question: state.questions.find((q) => q.id === (body as DemoRecord)?.question_id) } as T;
  }
  if (parts[0] === "interviews" && parts[2] === "complete" && method === "POST") {
    const session = state.interviews.find((item) => item.id === parts[1]);
    if (session) session.status = "completed";
    const sessionResponses = state.responses.filter((r) => r.session_id === parts[1]);
    const reportBody = buildDemoReport(session || {}, sessionResponses);
    const report = {
      id: id("demo-report"),
      session_id: parts[1],
      user_id: DEMO_USER_ID,
      overall_score: 72,
      communication_score: 70,
      structure_score: 74,
      content_score: 73,
      summary: "Demo debrief: solid practice set. Focus on clearer results and fewer fillers.",
      report: {
        overall_summary: "Demo debrief: solid practice set. Focus on clearer results and fewer fillers.",
        overall_score: 72,
        communication_score: 70,
        structure_score: 74,
        content_score: 73,
        strengths: ["Completed the demo questions", "Engaged with the prompt"],
        improvements: ["Add measurable outcomes", "Tighten openings"],
        practice_plan: ["Re-answer one question with STAR", "Record and count fillers"],
        filler_summary: "Demo filler summary for this session.",
        speaking_summary: {
          average_words_per_minute: 130,
          total_fillers: 2,
          total_words: 80,
          filler_rate: 0.025,
        },
        practice_readiness: {
          band: "needs_targeted_practice",
          label: "Developing — targeted practice recommended",
          composite_score: 72,
          next_step: "Close the gap on structure and results before real interviews.",
          disclaimer:
            "Practice coaching only. This is not a hiring decision and does not predict whether any employer will hire the candidate.",
        },
        score_series: sessionResponses.map((r, index) => ({
          position: index + 1,
          score: Number(((r.evaluation || {}) as DemoRecord).score || 70),
          label: `Q${index + 1}`,
        })),
        question_reviews: sessionResponses.map((r, index) => {
          const evaluation = (r.evaluation || {}) as DemoRecord;
          return {
            question: state.questions.find((q) => q.id === r.question_id)?.question || `Question ${index + 1}`,
            answer: r.transcript || r.typed_response || "",
            score: evaluation.score,
            verdict: evaluation.verdict,
            interviewer_feedback: evaluation.interviewer_feedback,
            strengths: (evaluation.strengths as string[]) || [],
            improvements: (evaluation.improvements as string[]) || [],
            better_approach: evaluation.better_approach,
            filler_analysis: evaluation.filler_analysis,
            speaking_delivery: evaluation.speaking_delivery,
          };
        }),
        provider: "demo",
      },
      provider: "demo",
    };
    Object.assign(report, {
      overall_score: reportBody.overall_score,
      communication_score: reportBody.communication_score,
      structure_score: reportBody.structure_score,
      content_score: reportBody.content_score,
      summary: reportBody.overall_summary,
      report: reportBody,
      provider: "demo_evidence",
    });
    state.reports = state.reports.filter((item) => item.session_id !== parts[1]);
    state.reports.push(report);
    return { session, report, message: "Demo session completed with debrief report." } as T;
  }
  if (parts[0] === "interviews" && parts[2] === "report" && method === "GET") {
    const session = state.interviews.find((item) => item.id === parts[1]);
    const sessionResponses = state.responses.filter((r) => r.session_id === parts[1]);
    if (!session) throw new Error("Session not found.");
    if (session.status !== "completed") throw new Error("Complete the demo session before viewing its report.");
    const storedReport = state.reports.find((item) => item.session_id === parts[1]);
    if (storedReport) {
      const generatedReport = buildDemoReport(session, sessionResponses);
      const refreshed = { ...storedReport, ...generatedReport, report: generatedReport };
      state.reports = state.reports.map((item) => item.session_id === parts[1] ? refreshed : item);
      return { session, report: refreshed } as T;
    }
    return {
      session,
      report: {
        id: id("demo-report"),
        session_id: parts[1],
        overall_score: 72,
        communication_score: 70,
        structure_score: 74,
        content_score: 73,
        summary: "Demo debrief report.",
        report: {
          overall_summary: "Demo debrief report for completed practice.",
          overall_score: 72,
          communication_score: 70,
          structure_score: 74,
          content_score: 73,
          strengths: ["Completed answers"],
          improvements: ["Add results"],
          practice_plan: ["Practice STAR"],
          filler_summary: "Demo filler summary.",
          question_reviews: sessionResponses.map((r, index) => {
            const evaluation = (r.evaluation || {}) as DemoRecord;
            return {
              question: state.questions.find((q) => q.id === r.question_id)?.question || `Question ${index + 1}`,
              answer: r.transcript || r.typed_response || "",
              score: evaluation.score ?? 70,
              verdict: evaluation.verdict || "solid",
              interviewer_feedback: evaluation.interviewer_feedback || "Demo feedback.",
              strengths: (evaluation.strengths as string[]) || [],
              improvements: (evaluation.improvements as string[]) || [],
              better_approach: evaluation.better_approach,
              filler_analysis: evaluation.filler_analysis,
            };
          }),
          provider: "demo",
        },
      },
    } as T;
  }
  if (parts[0] === "interviews" && parts.length === 2 && method === "DELETE") {
    state.interviews = state.interviews.filter((item) => item.id !== parts[1]);
    state.questions = state.questions.filter((item) => item.session_id !== parts[1]);
    state.responses = state.responses.filter((item) => item.session_id !== parts[1]);
    state.reports = state.reports.filter((item) => item.session_id !== parts[1]);
    return undefined as T;
  }
  if (path === "/jobs" && method === "GET") return state.jobs as T;
  if (path === "/job-recommendations/generate" && method === "POST") {
    const requested = (body || {}) as DemoRecord;
    const location = String(requested.location || "").toLowerCase();
    const workMode = String(requested.work_mode || "").toLowerCase();
    const recommendations = state.jobs
      .filter((job) => (!location || String(job.location || "").toLowerCase().includes(location)))
      .filter((job) => (!workMode || String(job.work_mode || "").toLowerCase() === workMode))
      .map((job, index) => ({
        id: `demo-recommendation-${job.id}`,
        job,
        match_score: Math.max(0, 82 - index * 7),
        match_breakdown: { matched_requirements: [], missing_requirements: [] },
        evidence: { note: "Illustrative demo result; no candidate evidence was scored." },
      }));
    return { resume_version_id: null, algorithm_version: "demo", recommendations } as T;
  }
  if (parts[0] === "jobs" && parts.length === 2 && method === "GET") return state.jobs.find((job) => job.id === parts[1]) as T;
  if (path === "/saved-jobs" && method === "GET") {
    // Return full pipeline (saved / applied / rejected / …), matching backend list_saved_jobs.
    return state.savedJobs.map((saved) => ({
      ...saved,
      jobs: state.jobs.find((job) => job.id === saved.job_id),
    })) as T;
  }
  if (parts[0] === "saved-jobs" && parts.length === 2 && method === "POST") {
    const existing = state.savedJobs.find((item) => item.job_id === parts[1]);
    const protectedStatus = new Set(["applied", "interviewing", "offer"]);
    if (existing) {
      // Do not downgrade applied/interview/offer when re-saving.
      if (!protectedStatus.has(String(existing.status || ""))) {
        existing.status = "saved";
        existing.updated_at = now();
      }
    } else {
      state.savedJobs.push({
        user_id: DEMO_USER_ID,
        job_id: parts[1],
        status: "saved",
        saved_at: now(),
        updated_at: now(),
      });
    }
    return state.savedJobs.find((item) => item.job_id === parts[1]) as T;
  }
  if (parts[0] === "saved-jobs" && parts.length === 2 && method === "PATCH") {
    const stamp = now();
    const existing = state.savedJobs.find((item) => item.job_id === parts[1]);
    const nextStatus = String((body as DemoRecord)?.status || existing?.status || "saved");
    if (existing) {
      existing.status = nextStatus;
      existing.notes = (body as DemoRecord)?.notes ?? existing.notes;
      existing.updated_at = stamp;
      return existing as T;
    }
    // Upsert: mark applied/rejected without a prior save.
    const created: DemoRecord = {
      user_id: DEMO_USER_ID,
      job_id: parts[1],
      status: nextStatus,
      notes: (body as DemoRecord)?.notes ?? null,
      saved_at: stamp,
      updated_at: stamp,
    };
    state.savedJobs.push(created);
    return created as T;
  }
  if (parts[0] === "saved-jobs" && parts.length === 2 && method === "DELETE") {
    state.savedJobs = state.savedJobs.filter((item) => item.job_id !== parts[1]);
    return undefined as T;
  }
  if (path === "/learning-paths" && method === "GET") {
    return state.learningPaths.map((row) => {
      const items = Array.isArray(row.items) ? (row.items as DemoRecord[]) : [];
      return {
        ...row,
        item_count: typeof row.item_count === "number" ? row.item_count : items.length,
        // List payload keeps lightweight item summaries (matches backend list_learning).
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status || "pending",
          position: item.position,
        })),
      };
    }) as T;
  }
  if (path === "/learning-paths/generate" && method === "POST") {
    const pathId = id("demo-path");
    const itemId = id("demo-item");
    const resourceId = id("demo-resource");
    const path = {
      id: pathId,
      user_id: DEMO_USER_ID,
      title: "Skill gap path · Demo ATS gaps",
      description:
        "Demo path grounded in illustrative ATS gaps with free lesson resources (no invented skills).",
      source_type: "ats_analysis",
      status: "active",
      progress_percentage: 0,
      item_count: 1,
      created_at: now(),
      items: [
        {
          id: itemId,
          title: "Learn Docker with guided practice",
          objective: "Study Docker using free tutorials, then practise a small container workflow.",
          status: "pending",
          estimated_minutes: 60,
          difficulty: "foundational",
          learning_resources: [
            {
              id: resourceId,
              title: "Docker Tutorial for Beginners — Demo",
              resource_type: "youtube_video",
              provider: "freeCodeCamp.org",
              url: "https://www.youtube.com/watch?v=fqMOX6JJhGo",
              reason_recommended: "Demo lesson for an illustrative ATS gap (not live API).",
              metadata: {
                video_id: "fqMOX6JJhGo",
                channel_title: "freeCodeCamp.org",
                source: "demo",
                video_id_policy: "demo_known_public_video",
              },
            },
          ],
        },
      ],
      algorithm_version: "ats-youtube-api-v1",
    };
    state.learningPaths.unshift(path);
    return path as T;
  }
  if (parts[0] === "learning-paths" && parts.length === 2 && method === "GET") {
    const path = state.learningPaths.find((item) => item.id === parts[1]);
    if (!path) {
      throw new Error("The requested record was not found.");
    }
    return path as T;
  }
  if (parts[0] === "learning-paths" && parts.length === 2 && method === "DELETE") {
    const before = state.learningPaths.length;
    state.learningPaths = state.learningPaths.filter((item) => item.id !== parts[1]);
    if (state.learningPaths.length === before) {
      throw new Error("The requested record was not found.");
    }
    return undefined as T;
  }
  if (parts[0] === "learning-paths" && parts[2] === "items" && method === "PATCH") {
    const path = state.learningPaths.find((item) => item.id === parts[1]);
    if (!path) {
      throw new Error("The learning path was not found.");
    }
    const items = Array.isArray(path.items) ? (path.items as DemoRecord[]) : [];
    const item = items.find((row) => row.id === parts[3]);
    if (!item) {
      throw new Error("The learning item was not found.");
    }
    item.status = body.status || item.status;
    const done = items.filter((row) => row.status === "completed").length;
    path.progress_percentage = items.length ? Math.round((done / items.length) * 100) : 0;
    path.item_count = items.length;
    path.status = path.progress_percentage === 100 && items.length ? "completed" : "active";
    return { ...item, progress_percentage: path.progress_percentage } as T;
  }
  if (parts[0] === "account" && method === "DELETE") {
    state = initialState();
    return undefined as T;
  }

  // Fail closed: unknown demo routes must not return {} (callers treat that as success).
  throw new Error(`Demo session has no handler for ${method} ${path}`);
}
