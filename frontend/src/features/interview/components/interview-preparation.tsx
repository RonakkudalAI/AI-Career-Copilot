
import { Link } from "@/shared/ui/router-link";
import { useCallback, useEffect, useMemo, useState } from "react";




import { apiRequest } from "@/shared/api/client";
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Progress, Select, Skeleton } from "@/shared/ui/primitives";
import {
  createInterviewPreparation,
  type ConfirmedJobDescription,
  type ConfirmedResume,
  type InterviewPreparation,
  type PreparationQuestion,
} from "@/features/interview/preparation";
import "@/features/interview/interview.css";

function difficultyTone(difficulty: PreparationQuestion["difficulty"]) {
  return difficulty === "hard" ? "destructive" : difficulty === "medium" ? "outline" : "default";
}

function sourceLabel(source: PreparationQuestion["source"]) {
  return source === "ai" ? "Targeted" : source === "question_bank" ? "Practice bank" : "Your context";
}

function QuestionList({ title, description, questions }: { title: string; description: string; questions: PreparationQuestion[] }) {
  return (
    <Card className="stack">
      <div>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <p className="muted" style={{ marginBottom: 0 }}>{description}</p>
      </div>
      {questions.length ? (
        <ol className="stack" style={{ margin: 0, paddingLeft: 20 }}>
          {questions.map((item, index) => (
            <li key={`${item.question}-${index}`} className="suggestion">
              <p style={{ margin: 0 }}>{item.question}</p>
              <div className="cluster" style={{ marginTop: 8 }}>
                {item.skill ? <Badge variant="secondary">{item.skill}</Badge> : null}
                <Badge variant={difficultyTone(item.difficulty)}>{item.difficulty}</Badge>
                <Badge variant="secondary">{sourceLabel(item.source)}</Badge>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="muted" style={{ margin: 0 }}>No evidence-grounded questions are available for this section.</p>}
    </Card>
  );
}

export function InterviewPreparationHome() {
  const [resumes, setResumes] = useState<ConfirmedResume[]>([]);
  const [jobs, setJobs] = useState<ConfirmedJobDescription[]>([]);
  const [resumeVersionId, setResumeVersionId] = useState("");
  const [jobDescriptionId, setJobDescriptionId] = useState("");
  const [sourceLoading, setSourceLoading] = useState(true);
  const [sourceError, setSourceError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<InterviewPreparation | null>(null);

  const confirmedResumes = useMemo(
    () => resumes.filter((resume) => resume.latest_version?.extraction_status === "confirmed"),
    [resumes],
  );
  const confirmedJobs = useMemo(
    () => jobs.filter((job) => job.extraction_status === "confirmed"),
    [jobs],
  );

  const loadSources = useCallback(async () => {
    setSourceLoading(true);
    setSourceError("");
    try {
      const [resumeRows, jobRows] = await Promise.all([
        apiRequest<ConfirmedResume[]>("/resumes"),
        apiRequest<ConfirmedJobDescription[]>("/job-descriptions"),
      ]);
      const availableResumes = resumeRows.filter((resume) => resume.latest_version?.extraction_status === "confirmed");
      const availableJobs = jobRows.filter((job) => job.extraction_status === "confirmed");
      setResumes(resumeRows);
      setJobs(jobRows);
      setResumeVersionId((current) => availableResumes.some((resume) => resume.latest_version?.id === current) ? current : availableResumes.find((resume) => resume.is_active)?.latest_version?.id || availableResumes[0]?.latest_version?.id || "");
      setJobDescriptionId((current) => availableJobs.some((job) => job.id === current) ? current : availableJobs[0]?.id || "");
    } catch (reason) {
      setSourceError(reason instanceof Error ? reason.message : "Your preparation sources could not be loaded.");
    } finally {
      setSourceLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadSources();
    });
  }, [loadSources]);

  async function generate() {
    if (!resumeVersionId || !jobDescriptionId) return;
    setLoading(true);
    setError("");
    try {
      setData(await createInterviewPreparation({ resume_version_id: resumeVersionId, job_description_id: jobDescriptionId }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Interview preparation could not be generated.");
    } finally {
      setLoading(false);
    }
  }

  const setupHref = data
    ? `/mock-interview/setup?resume_version_id=${encodeURIComponent(data.resume_version_id)}&job_description_id=${encodeURIComponent(data.job_description_id)}&target_role=${encodeURIComponent(data.target_role)}`
    : "/mock-interview/setup";

  return (
    <div className="feature-page interview-hub">
      <PageHeader
        title="Prepare with your evidence"
        description="Generate practice material from the confirmed resume, job description, and ATS evidence you select. This does not claim unverified skills or predict hiring outcomes."
        action={<Link className="button button-primary" href="/mock-interview">Start a mock interview</Link>}
      />
      {sourceLoading ? <div className="stack"><Skeleton lines={5} /><Skeleton lines={6} /></div> : sourceError ? <ErrorState onRetry={() => void loadSources()} /> : !confirmedResumes.length || !confirmedJobs.length ? (
        <EmptyState
          title="Start a mock interview without documents"
          description={
            !confirmedResumes.length
              ? "A resume is optional. Start a round from your chosen role and focus, or upload a resume later if you want questions grounded in your work."
              : "A job description is optional. Start a round now, or confirm a job description if you want questions tied to a posting."
          }
          href="/mock-interview"
          action="Start a mock interview"
        />
      ) : (
        <Card className="stack">
          <div>
            <h2 style={{ margin: 0 }}>Preparation context</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Your active confirmed resume is pre-selected when available. Use the same documents as ATS analysis when possible.
            </p>
          </div>
          <div className="grid-2">
            <label className="field-label">Confirmed resume
              <Select value={resumeVersionId} onChange={(event: any) => setResumeVersionId(event.target.value)}>
                {confirmedResumes.map((resume) => <option key={resume.latest_version?.id} value={resume.latest_version?.id}>{resume.title}{resume.is_active ? " (active)" : ""}</option>)}
              </Select>
            </label>
            <label className="field-label">Confirmed job description
              <Select value={jobDescriptionId} onChange={(event: any) => setJobDescriptionId(event.target.value)}>
                {confirmedJobs.map((job) => <option key={job.id} value={job.id}>{job.role_title || job.title}{job.company ? ` · ${job.company}` : ""}</option>)}
              </Select>
            </label>
          </div>
          <div className="cluster">
            <Button disabled={loading || !resumeVersionId || !jobDescriptionId} onClick={() => void generate()}>
              {loading ? "Generating preparation…" : data ? "Generate again" : "Generate preparation"}
            </Button>
            {data ? <Link className="button button-primary" href={setupHref}>Start mock interview</Link> : null}
          </div>
        </Card>
      )}
      {error ? <p role="alert" className="field-error">{error}</p> : null}
      {loading ? <div className="stack" style={{ marginTop: 24 }}><Skeleton lines={7} /><Skeleton lines={8} /></div> : null}
      {data ? (
        <div className="stack" style={{ marginTop: 24 }}>
          <Card className="stack">
            <div className="row">
              <div>
                <h2 style={{ margin: 0 }}>{data.interview_readiness.score}% evidence coverage</h2>
                <p className="muted" style={{ marginBottom: 0 }}>{data.interview_readiness.summary}</p>
              </div>
              <Badge variant={data.interview_readiness.missing_skills.length ? "outline" : "default"}>{data.interview_readiness.source_analysis_id ? "ATS evidence" : "Confirmed documents"}</Badge>
            </div>
            <Progress value={data.interview_readiness.score} label="Preparation readiness" />
            <div className="grid-2">
              <div className="suggestion"><strong>Matched requirements</strong><div className="cluster" style={{ marginTop: 8 }}>{data.interview_readiness.matched_skills.length ? data.interview_readiness.matched_skills.map((skill) => <Badge key={skill} variant="default">{skill}</Badge>) : <span className="muted">No matched requirements were returned.</span>}</div></div>
              <div className="suggestion"><strong>Focus areas</strong><div className="cluster" style={{ marginTop: 8 }}>{data.interview_readiness.missing_skills.length ? data.interview_readiness.missing_skills.map((skill) => <Badge key={skill} variant="outline">{skill}</Badge>) : <span className="muted">No not-found requirements were returned.</span>}</div></div>
            </div>
          </Card>
          <Card className="stack">
            <div><h2 style={{ margin: 0 }}>Study plan</h2><p className="muted" style={{ marginBottom: 0 }}>Focus areas are requirements not found in the selected resume evidence.</p></div>
            {data.study_topics.length ? data.study_topics.map((topic) => <article key={topic.topic} className="suggestion"><div className="row"><strong>{topic.topic}</strong><Badge variant={topic.priority === "high" ? "destructive" : topic.priority === "medium" ? "outline" : "secondary"}>{topic.priority} priority</Badge></div><p className="muted" style={{ margin: "8px 0 0" }}>{topic.reason}</p></article>) : <p className="muted" style={{ margin: 0 }}>No focus areas were identified from the selected evidence.</p>}
          </Card>
          <QuestionList title="Resume questions" description="Explain only skills and experience documented in the selected resume." questions={data.resume_questions} />
          {data.project_questions.map((project) => <QuestionList key={project.project_name} title={`${project.project_name} project questions`} description="Discuss your responsibilities, decisions, and next improvements honestly." questions={project.questions} />)}
          <QuestionList title="Job-description questions" description="Practise questions tied to selected job requirements and ATS evidence." questions={data.jd_questions} />
          <QuestionList title="Focus-area questions" description="Use these requirements to guide preparation; missing means not found in the selected resume, not that you lack the skill." questions={data.missing_skill_questions} />
          <QuestionList title="Coding questions" description="State your approach, edge cases, tests, and complexity before implementation." questions={data.coding_questions} />
          <QuestionList title="HR questions" description="Use concise, truthful examples from your experience." questions={data.hr_questions} />
        </div>
      ) : null}
    </div>
  );
}
