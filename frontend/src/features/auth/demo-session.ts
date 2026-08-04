/* Demo data mirrors loosely typed API payloads without changing production contracts. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { isDemoCookiePresent } from "@/shared/config";

type DemoRecord = Record<string, any>;

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

function initialState(): DemoState {
  const created = now();
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
    interviews: [],
    questions: [],
    responses: [],
    savedJobs: [],
    jobs: [
      { id: "demo-job-1", title: "Software Engineer", company: "Northstar Labs", location: "Bengaluru", work_mode: "hybrid", description: "Build dependable product experiences with a small engineering team.", is_active: true, latitude: 12.9716, longitude: 77.5946 },
      { id: "demo-job-2", title: "Backend Engineer", company: "Atlas Systems", location: "Hyderabad", work_mode: "remote", description: "Design APIs and data workflows for a growing platform.", is_active: true, latitude: 17.385, longitude: 78.4867 },
    ],
    learningPaths: [
      { id: "demo-path-1", user_id: DEMO_USER_ID, title: "Backend interview readiness", description: "A short practice path for API design and interview communication.", source_type: "candidate_selected", status: "active", progress_percentage: 25, created_at: created, items: [{ id: "demo-item-1", title: "Explain an API design decision", status: "pending" }] },
    ],
  };
}

let state = initialState();

export function isDemoSession() {
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

function bootstrap() {
  const activeResume = state.resumes.find((resume) => resume.is_active) || null;
  const latestAnalysis = state.analyses[0] || null;
  return {
    profile: state.profile,
    active_resume: activeResume ? { id: activeResume.id } : null,
    active_job_description: state.jobDescriptions[0] || null,
    latest_ats_analysis: latestAnalysis,
    latest_actions: { last_resume_upload: null, last_interview: null, last_job_applied: null },
    capabilities: { interview_evaluation: false },
    recent_activity: [],
    counts: {
      resumes: state.resumes.length,
      ats_analyses: state.analyses.length,
      interviews: state.interviews.length,
      saved_jobs: state.savedJobs.length,
    },
    workspace: {
      profile_completion: state.profile.profile_completion || 0,
      profile_missing: state.profile.profile_completion_details?.missing || [],
      profile_completion_details: state.profile.profile_completion_details || {},
      has_active_resume: Boolean(activeResume),
      has_confirmed_resume: state.resumeVersions.some((version) => version.extraction_status === "confirmed"),
      failed_ats_count: 0,
      ready_for_ats: state.resumeVersions.some((version) => version.extraction_status === "confirmed") && state.jobDescriptions.length > 0,
    },
  };
}

function resumeVersion(resumeId: string) {
  return state.resumeVersions.find((version) => version.resume_id === resumeId) || null;
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
    return state.resumes.map((resume) => ({ ...resume, latest_version: resumeVersion(resume.id) })) as T;
  }
  if (parts[0] === "resumes" && parts.length === 1 && method === "POST") {
    const form = init.body instanceof FormData ? init.body : null;
    const file = form?.get("file") as File | null;
    const resumeId = id("demo-resume");
    const versionId = id("demo-version");
    const resume = { id: resumeId, user_id: DEMO_USER_ID, title: file?.name ? `${file.name} demo` : "Demo resume", is_active: state.resumes.length === 0, created_at: now() };
    const version = { id: versionId, resume_id: resumeId, user_id: DEMO_USER_ID, version_number: 1, source_type: "uploaded", original_filename: file?.name || "demo-resume.pdf", mime_type: file?.type || "application/pdf", extraction_status: "review_required", created_at: now(), structured_content: { sections: { summary: ["Software engineer with experience building web products."], skills: ["TypeScript", "Python"], experience: ["Software Engineer · Demo Company"] } } };
    state.resumes.unshift(resume);
    state.resumeVersions.unshift(version);
    return { resume, version } as T;
  }
  if (parts[0] === "resumes" && parts.length === 2 && method === "DELETE") {
    state.resumes = state.resumes.filter((resume) => resume.id !== parts[1]);
    state.resumeVersions = state.resumeVersions.filter((version) => version.resume_id !== parts[1]);
    return undefined as T;
  }
  if (parts[0] === "resumes" && parts.length === 2 && method === "POST") {
    const resume = state.resumes.find((item) => item.id === parts[1]);
    if (resume) state.resumes.forEach((item) => { item.is_active = item.id === resume.id; });
    return resume as T;
  }
  if (parts[0] === "resumes" && parts[2] === "preview") {
    const resume = state.resumes.find((item) => item.id === parts[1]);
    const version = resume ? resumeVersion(resume.id) : null;
    return { resume, version, download_url: null, expires_in: 0, prefer_rendered_pdf: false } as T;
  }
  if (parts[0] === "resume-versions" && parts.length >= 2) {
    const version = state.resumeVersions.find((item) => item.id === parts[1]);
    if (parts[2] === "confirm" && method === "POST" && version) {
      version.extraction_status = "confirmed";
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
  if (parts[0] === "job-descriptions" && parts[1] === "upload" && method === "POST") {
    const form = init.body instanceof FormData ? init.body : null;
    const record = { id: id("demo-jd"), user_id: DEMO_USER_ID, title: String(form?.get("title") || "Demo job description"), company: String(form?.get("company") || "Demo Company"), role_title: String(form?.get("role_title") || "Software Engineer"), original_filename: String((form?.get("file") as File | null)?.name || "demo-job-description.pdf"), input_type: "pdf", extraction_status: "review_required", structured_content: { sections: {} }, created_at: now() };
    state.jobDescriptions.unshift(record);
    return record as T;
  }
  if (path === "/ats-analyses" && method === "GET") return state.analyses as T;
  if (path === "/ats-analyses" && method === "POST") {
    const analysis = { id: id("demo-ats"), user_id: DEMO_USER_ID, resume_version_id: body.resume_version_id, job_description_id: body.job_description_id, status: "completed", overall_score: 78, score_breakdown: { method: "Demo structured ATS scoring", matched_terms: ["TypeScript", "Python"], missing_terms: ["Docker"], total_terms: 3, structured_parameter_scores: { hard_skill_match: 82, experience_relevance: 78, education_match: 75, certifications_match: 70, seniority_alignment: 80 }, domain_gate: { decision: "ALLOW", reason: "Demo structured evidence is in domain." } }, summary: { method: "Demo structured ATS scoring", matched: 2, missing: 1, total: 3, missing_terms: ["Docker"], structured_composite_score: 78, structured_parameter_scores: { hard_skill_match: 82, experience_relevance: 78, education_match: 75, certifications_match: 70, seniority_alignment: 80 }, domain_gate: { decision: "ALLOW", reason: "Demo structured evidence is in domain." }, disclaimer: "Demo result only; not a hiring prediction." }, created_at: now() };
    state.analyses.unshift(analysis);
    state.evidence = [{ id: id("demo-evidence"), analysis_id: analysis.id, requirement_text: "Docker", match_status: "not_found", explanation: "Not found in the demo resume." }];
    return analysis as T;
  }
  if (parts[0] === "ats-analyses" && parts[2] === "evidence") return state.evidence.filter((item) => item.analysis_id === parts[1]) as T;
  if (parts[0] === "ats-analyses" && parts.length === 2 && method === "GET") return state.analyses.find((item) => item.id === parts[1]) as T;
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
    const count = Number(session?.question_count || 3);
    for (let index = 1; index <= count; index += 1) state.questions.push({ id: id("demo-question"), session_id: parts[1], position: index, question: `Tell me about a time you solved a challenging ${session?.target_role || "engineering"} problem.`, question_type: session?.mode || "mixed", source_context: { provider: "template" } });
    return { session, questions: state.questions.filter((item) => item.session_id === parts[1]), question_provider: "template" } as T;
  }
  if (parts[0] === "interviews" && parts[2] === "responses" && method === "POST") {
    state.responses.push({ ...body, id: id("demo-response"), session_id: parts[1], user_id: DEMO_USER_ID });
    return state.responses[state.responses.length - 1] as T;
  }
  if (parts[0] === "interviews" && parts[2] === "complete" && method === "POST") {
    const session = state.interviews.find((item) => item.id === parts[1]);
    if (session) session.status = "completed";
    return { session, report: null, message: "Demo session completed." } as T;
  }
  if (parts[0] === "interviews" && parts.length === 2 && method === "DELETE") {
    state.interviews = state.interviews.filter((item) => item.id !== parts[1]);
    state.questions = state.questions.filter((item) => item.session_id !== parts[1]);
    return undefined as T;
  }
  if (path === "/jobs" && method === "GET") return state.jobs as T;
  if (parts[0] === "jobs" && parts.length === 2 && method === "GET") return state.jobs.find((job) => job.id === parts[1]) as T;
  if (path === "/saved-jobs" && method === "GET") return state.savedJobs.map((saved) => ({ ...saved, jobs: state.jobs.find((job) => job.id === saved.job_id) })) as T;
  if (parts[0] === "saved-jobs" && parts.length === 2 && method === "POST") {
    if (!state.savedJobs.some((item) => item.job_id === parts[1])) state.savedJobs.push({ user_id: DEMO_USER_ID, job_id: parts[1], status: "saved", saved_at: now() });
    return state.savedJobs.find((item) => item.job_id === parts[1]) as T;
  }
  if (path === "/learning-paths" && method === "GET") return state.learningPaths as T;
  if (path === "/learning-paths/generate" && method === "POST") {
    const pathId = id("demo-path");
    const itemId = id("demo-item");
    const resourceId = id("demo-resource");
    const path = {
      id: pathId,
      user_id: DEMO_USER_ID,
      title: "YouTube learning path · Demo ATS gaps",
      description:
        "Demo path grounded in illustrative ATS gaps with free YouTube search links (no invented video IDs).",
      source_type: "ats_analysis",
      status: "active",
      progress_percentage: 0,
      created_at: now(),
      items: [
        {
          id: itemId,
          title: "Learn Docker with guided YouTube practice",
          objective: "Study Docker using free YouTube tutorials, then practise a small container workflow.",
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
              reason_recommended: "Demo exact YouTube video for an illustrative ATS gap (not live API).",
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
    return path as T;
  }
  if (parts[0] === "learning-paths" && parts.length === 2 && method === "DELETE") {
    state.learningPaths = state.learningPaths.filter((item) => item.id !== parts[1]);
    return undefined as T;
  }
  if (parts[0] === "learning-paths" && parts[2] === "items" && method === "PATCH") {
    const path = state.learningPaths.find((item) => item.id === parts[1]);
    const item = path?.items?.find((row: DemoRecord) => row.id === parts[3]);
    if (item) {
      item.status = body.status || item.status;
      const items = path?.items || [];
      const done = items.filter((row: DemoRecord) => row.status === "completed").length;
      if (path) path.progress_percentage = items.length ? Math.round((done / items.length) * 100) : 0;
      return { ...item, progress_percentage: path?.progress_percentage ?? 0 } as T;
    }
  }
  if (parts[0] === "account" && method === "DELETE") {
    state = initialState();
    return undefined as T;
  }

  return {} as T;
}
