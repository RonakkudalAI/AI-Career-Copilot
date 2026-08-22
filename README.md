<!-- prettier-ignore -->
<div align="center">

<img src="./frontend/public/icon.svg" alt="Career Copilot" height="72" />

# Career Copilot

**Private AI Career Workspace for Candidates** — 2-Stage Hybrid RAG Assistant, LangChain & LangGraph Orchestration, Deterministic ATS Scoring, Voice Mock Interviews, Learning Paths, and Job Matching.

[Features](#features) · [Getting Started](#getting-started) · [Architecture](#architecture) · [RAG & Agent Graph](#rag--agent-graph-subsystem) · [Database Schema](#database-schema) · [API Reference](#api-reference) · [Testing](#testing)

![Version](https://img.shields.io/badge/version-1.0.0-0f3b82?style=flat-square)
![Node](https://img.shields.io/badge/Node.js-20%2B-3c873a?style=flat-square)
![Python](https://img.shields.io/badge/Python-3.11–3.13-3776ab?style=flat-square)
![Stack](https://img.shields.io/badge/Vite%20%2B%20FastAPI%20%2B%20Supabase%20%2B%20Firestore-111827?style=flat-square)
![RAG](https://img.shields.io/badge/RAG-LangChain%20%2B%20LangGraph-6366f1?style=flat-square)

</div>

---

## 🚀 Overview

**Career Copilot** is a production-grade monorepo web platform designed to solve candidate career workflows without AI hallucinations or unverified claims.

### Key Capabilities:
1. **2-Stage Hybrid RAG Assistant** (`rag-semantic-retrieval-v1`): Vectorizes confirmed resumes and job descriptions using **LangChain** text chunking and **Cosine Similarity** matching to deliver grounded, evidence-backed career advice.
2. **LangGraph Agentic Orchestration**: Models multi-agent resume refinement (`GAP_ANALYST` $\rightarrow$ `RESUME_IMPROVER` $\rightarrow$ `EVIDENCE_VALIDATOR`) as a stateful graph with conditional feedback edges.
3. **Deterministic ATS Engine** (`evidence-keyword-coverage-v4`): Calculates 100% reproducible keyword match scores and isolates exact resume line quotes.
4. **Voice Mock Interview Simulator** (`evidence-report-v2`): Real-time speech-to-text (STT) and text-to-speech (TTS) interview practice with STAR method rubrics and webcam gaze tracking.
5. **Personalized Learning Paths** (`ats-mixed-learning-v1`): Converts ATS skill gaps into anti-hallucinated YouTube learning roadmaps.
6. **Evidence-Grounded Job Matching** (`evidence-keyword-match-v1`): Live job discovery synced with Adzuna API and rendered on an interactive Three.js 3D Globe.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend UI** | Vite 8, React 19, TypeScript, Tailwind CSS 4, React Router 7, Framer Motion, Three.js / Cobe 3D Globe |
| **Backend API** | FastAPI, Python 3.12, Uvicorn ASGI Server, Pydantic v2 |
| **RAG & Agent Graph** | LangChain v0.3, LangGraph v0.2 (`StateGraph` DAG), SimpleVectorStore (Cosine Matrix) |
| **Database & Auth** | Firebase Cloud Firestore (NoSQL), Supabase PostgreSQL (29 Tables), PyJWT (HS256) |
| **File Storage** | Private Supabase Storage Buckets (`resumes`, `candidate-avatars`) streamed via authenticated proxy |
| **LLM Providers** | Groq (`llama-3.3-70b-versatile`) as primary, NVIDIA DeepSeek as fallback |

---

## 🌟 Core Subsystems

### 1. 2-Stage Hybrid RAG Assistant (`rag_assistant`)
```text
  User Query ──► Vector Search ──► Retrieved Chunks ──► LLM Synthesis ──► Grounded Response
                     │                      │
       [Confirmed Resume Chunks]   [Confirmed JD Chunks]
```
- **Chunking Engine**: Overlapping text chunking via `RecursiveCharacterTextSplitter`.
- **Vector Search**: Cosine similarity retrieval over term-frequency vector matrices.
- **Evidence Tags**: Every response cites exact retrieved source passages with relevance scores.

### 2. LangGraph Stateful Agent Graph (`agent_graph`)
- **State TypedDict**: Tracks state across execution nodes.
- **Node 1 (`GAP_ANALYST`)**: Extracts missing job keywords.
- **Node 2 (`RESUME_IMPROVER`)**: Drafts bullet point rewrites.
- **Node 3 (`EVIDENCE_VALIDATOR`)**: Verifies suggestions against source text.
- **Conditional Loop Edge**: Automatically routes back to Node 2 if unverified claims are detected.

---

## 🗄️ Database Schema

Career Copilot supports **29 SQL Tables** in Supabase PostgreSQL:

```text
├── Auth & Profiles (users, profiles, candidate_preferences, notification_preferences, privacy_preferences)
├── Portfolio Sections (candidate_skills, candidate_experiences, candidate_projects, candidate_education, candidate_certifications, candidate_languages, candidate_links)
├── Resumes & Jobs (resumes, resume_versions, job_descriptions)
├── ATS & Improvement (ats_analyses, ats_evidence, resume_improvement_runs, resume_suggestions)
├── Mock Interviews (interview_sessions, interview_questions, interview_responses, interview_reports)
└── Learning & Activity (learning_paths, learning_items, learning_resources, jobs, saved_jobs, activity_events)
```

---

## ⚡ Getting Started

### Prerequisites
- **Node.js** 20+
- **Python** 3.11 – 3.13 (Python 3.12 recommended)
- **Supabase** project (URL and API keys)
- **Firebase** project (Firestore credentials JSON)

### 1. Clone & Configure Environment
```bash
git clone https://github.com/RonakkudalAI/career-copilot.git
cd career-copilot
```

Copy `.env.example` to `.env` and fill in your keys:
```env
PUBLIC_API_BASE_URL=http://127.0.0.1:8000
AUTH_SECRET=your-jwt-secret-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_STORAGE_BUCKET=candidate-documents
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_your_groq_api_key
```

### 2. Install Dependencies
```bash
npm run setup
```

### 3. Run Local Dev Servers
```bash
npm run dev
```

- **Frontend App**: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- **Backend API**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 🧪 Testing & Verification

Run backend unit tests (223/223 tests):
```bash
npm run test:backend
```

Run frontend TypeScript check:
```bash
npm run typecheck
```

Run environment verification:
```bash
npm run check:env
```

---

## 📄 License
Distributed under the MIT License. See `LICENSE` for details.