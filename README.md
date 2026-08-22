<!-- prettier-ignore -->
<div align="center">

<img src="./frontend/public/icon.svg" alt="Career Copilot" height="80" />

# 🚀 Career Copilot — Ultimate Master Documentation

**Production-Grade Private AI Career Workspace for Candidates** — 2-Stage Hybrid RAG Assistant, LangChain & LangGraph Stateful Orchestration, Deterministic ATS Scoring, Voice Mock Interviews with Gaze Tracking, Learning Path Generation, and 3D Globe Job Discovery.

[Core Philosophy](#-core-philosophy) · [Architecture](#-system-architecture) · [RAG & Agent Graph](#-rag--langgraph-subsystems) · [ATS Engine](#-deterministic-ats-engine) · [Mock Interviews](#-voice-mock-interview-engine) · [Learning & Jobs](#-learning-paths--job-matching) · [Database Schema](#-29-table-database-schema) · [API Reference](#-complete-api-reference) · [Getting Started](#-getting-started)

![Version](https://img.shields.io/badge/version-1.0.0-0f3b82?style=flat-square)
![Node](https://img.shields.io/badge/Node.js-20%2B-3c873a?style=flat-square)
![Python](https://img.shields.io/badge/Python-3.11–3.13-3776ab?style=flat-square)
![Frontend](https://img.shields.io/badge/Vite%208%20%2B%20React%2019%20%2B%20Tailwind%204-6366f1?style=flat-square)
![Backend](https://img.shields.io/badge/FastAPI%20%2B%20Pydantic%20v2-009688?style=flat-square)
![Orchestration](https://img.shields.io/badge/LangChain%20%2B%20LangGraph%20%2B%20CrewAI-ff6b6b?style=flat-square)
![Database](https://img.shields.io/badge/Supabase%20PostgreSQL%20%2B%20Cloud%20Firestore-3ecf8e?style=flat-square)

</div>

---

## 🎯 Core Philosophy

In traditional AI applications, LLMs frequently **hallucinate candidate history, invent non-existent employers, or output non-deterministic ATS scores**. 

**Career Copilot** solves this by strictly enforcing **4 Architectural Safeguards**:

1. **Evidence over Invention**: Only text explicitly uploaded, parsed, and **confirmed by the candidate** is allowed to drive ATS analysis or interview prep.
2. **Deterministic ATS Scoring**: Scores are calculated using a 100% reproducible mathematical algorithm (`evidence-keyword-coverage-v4`). LLMs do *not* decide ATS scores; they only enrich feedback based on missing terms.
3. **2-Stage Hybrid RAG**: Combines exact keyword matching with **LangChain & Vector Similarity Search** to bridge semantic gaps (e.g. matching *"Apache Kafka"* to *"Distributed Streaming"*).
4. **Server-Enforced Multitenancy**: Service keys and Firestore/Storage credentials remain on the backend. Every database row and storage file path is isolated to the signed-in candidate's user ID.

---

## 🏗️ System Architecture

```text
               ┌─────────────────────────────────────────────────────────┐
               │              BROWSER UI (Vite 8 + React 19)             │
               │   Tailwind 4 · Framer Motion · Three.js 3D Globe        │
               └────────────────────────────┬────────────────────────────┘
                                            │ Authorization: Bearer <JWT>
                                            ▼
               ┌─────────────────────────────────────────────────────────┐
               │             FASTAPI BACKEND GATEWAY (/api/v1)           │
               │   Async Uvicorn Server · Pydantic v2 · CORS Protection  │
               └──────┬─────────────────────┬─────────────────────┬──────┘
                      │                     │                     │
                      ▼                     ▼                     ▼
         ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
         │ DATABASE LAYER   │  │ RAG & GRAPH      │  │ AI PROVIDERS     │
         │ Supabase (29 DB) │  │ LangChain RAG    │  │ Groq (Primary)   │
         │ Cloud Firestore  │  │ LangGraph DAG    │  │ NVIDIA (Fallback)│
         │ Supabase Storage │  │ CrewAI 3-Agent   │  │ Fish Audio TTS   │
         └──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 🤖 RAG & LangGraph Subsystems

### 1. 2-Stage Hybrid RAG Assistant (`rag-semantic-retrieval-v1`)
* **Location**: [`backend/app/features/rag_assistant/`](file:///C:/Users/Admin/OneDrive/Desktop/New%20folder/career-copilot/backend/app/features/rag_assistant/)
* **Flow**:
  1. **Chunking Engine**: Uses `RecursiveCharacterTextSplitter` (chunk size 400, overlap 50) to segment confirmed resumes and job descriptions.
  2. **Vector Indexing**: Builds normalized term-frequency matrices in `SimpleVectorStore`.
  3. **Cosine Similarity Search**: Computes dot-product similarity matrix ($\text{Similarity} = \frac{v_1 \cdot v_2}{\|v_1\| \|v_2\|}$) to retrieve top-$k$ relevant passages.
  4. **Grounded Synthesis**: Passes retrieved passages to Groq LLaMA-3 to generate evidence-backed advice with exact source citation tags.

### 2. LangGraph Stateful Agent Graph (`agent_graph`)
* **Location**: [`backend/app/features/agent_graph/`](file:///C:/Users/Admin/OneDrive/Desktop/New%20folder/career-copilot/backend/app/features/agent_graph/)
* **Flow**:
  * **State TypedDict**: Maintains state across stateful graph nodes.
  * **Node 1 (`GAP_ANALYST`)**: Isolates missing job description keywords.
  * **Node 2 (`RESUME_IMPROVER`)**: Drafts bullet point rewrites using action verbs.
  * **Node 3 (`EVIDENCE_VALIDATOR`)**: Verifies suggestions against source text to prevent hallucinated claims.
  * **Conditional Feedback Loop**: If Node 3 detects unverified skills, a conditional edge routes state *back* to Node 2 for re-prompting.

---

## 📊 Deterministic ATS Engine

* **Algorithm**: **`evidence-keyword-coverage-v4`**
* **Location**: [`backend/app/features/ats/ats_score.py`](file:///C:/Users/Admin/OneDrive/Desktop/New%20folder/career-copilot/backend/app/features/ats/ats_score.py)

### Scoring Formula:
$$\text{ATS Score} = \left( \frac{\sum \text{Matched Required Weight} + \sum \text{Matched Preferred Weight}}{\text{Total Possible Weight}} \right) \times 100$$

* **Required Skill Weight**: **2.0**
* **Preferred Skill Weight**: **1.0**
* **Match Status Credits**:
  * `strong_match`: **1.0 credit** (plus exact resume line quote extraction)
  * `partial_match`: **0.5 credit**
  * `not_found`: **0.0 credit**

---

## 🎙️ Voice Mock Interview Engine

* **Algorithm**: **`evidence-report-v2`**
* **Location**: [`backend/app/features/interview/`](file:///C:/Users/Admin/OneDrive/Desktop/New%20folder/career-copilot/backend/app/features/interview/)

### Capabilities:
1. **Speech-to-Text (STT)**: Real-time browser Web Speech API audio transcription.
2. **Text-to-Speech (TTS)**: Multi-speaker synthesis via Fish Audio API (`s2.1-pro-free`) with fallback to browser SpeechSynthesis.
3. **STAR Rubric Evaluation**: Evaluates answers for Situation, Task, Action, Result structure, technical clarity, and relevant candidate experience.
4. **Webcam Gaze Tracking**: Evaluates candidate eye contact and focus during live interview practice.

---

## 📚 Learning Paths & Job Matching

### 1. Personalized Learning Path Generator (`ats-mixed-learning-v1`)
* **Location**: [`backend/app/features/learning/`](file:///C:/Users/Admin/OneDrive/Desktop/New%20folder/career-copilot/backend/app/features/learning/)
* Converts ATS skill gaps into structured learning modules.
* **Anti-Hallucination Guardrail**: Video links are fetched strictly from YouTube Data API v3 or allowlisted educational search URLs. LLMs are strictly forbidden from generating fake YouTube video IDs.

### 2. Evidence-Grounded Job Matching (`evidence-keyword-match-v1`)
* **Location**: [`backend/app/features/career_matching.py`](file:///C:/Users/Admin/OneDrive/Desktop/New%20folder/career-copilot/backend/app/features/career_matching.py)
* Matches candidate confirmed skills against live Adzuna job listings.
* **3D Globe Visualization**: Interactive Three.js + Cobe 3D Globe on the frontend displaying global job distribution.

---

## 🗄️ 29-Table Database Schema

Career Copilot supports **29 SQL Tables** in Supabase PostgreSQL:

```sql
-- 1. Auth & Profiles
users, profiles, candidate_preferences, notification_preferences, privacy_preferences

-- 2. Portfolio Breakdown
candidate_skills, candidate_experiences, candidate_projects, candidate_education, candidate_certifications, candidate_languages, candidate_links

-- 3. Document Processing
resumes, resume_versions, job_descriptions

-- 4. ATS & Improvement Agents
ats_analyses, ats_evidence, resume_improvement_runs, resume_suggestions

-- 5. Mock Interviews
interview_sessions, interview_questions, interview_responses, interview_reports

-- 6. Learning Paths & Jobs
learning_paths, learning_items, learning_resources, jobs, saved_jobs, activity_events
```

---

## 🌐 Complete API Reference

Base Endpoint: `/api/v1` (Proxied in frontend via `/api/backend`)

| Area | HTTP Method | Endpoint | Description |
|---|---|---|---|
| **Auth** | `POST` | `/api/v1/auth/sign-up` | Create new candidate account |
| **Auth** | `POST` | `/api/v1/auth/sign-in` | Authenticate and issue 7-day JWT access token |
| **Auth** | `POST` | `/api/v1/auth/session` | Validate current session identity |
| **Auth** | `POST` | `/api/v1/auth/sign-out` | Revoke session cookie & storage token |
| **RAG Assistant** | `POST` | `/api/v1/rag/index` | Chunk & index confirmed resume and JD text |
| **RAG Assistant** | `POST` | `/api/v1/rag/chat` | Cosine vector search & synthesis RAG response |
| **Agent Graph** | `POST` | `/api/v1/agent-graph/run` | Execute LangGraph multi-agent DAG workflow |
| **Resumes** | `POST` | `/api/v1/resumes` | Upload new PDF/DOCX resume file |
| **Resumes** | `POST` | `/api/v1/resumes/{id}/confirm` | Confirm extracted sections gate |
| **ATS** | `POST` | `/api/v1/ats-analyses` | Calculate deterministic ATS score & evidence |
| **Interview** | `POST` | `/api/v1/interviews` | Create mock interview session |
| **Interview** | `POST` | `/api/v1/interviews/{id}/responses` | Submit speech transcript & evaluate STAR rubric |
| **Learning** | `POST` | `/api/v1/learning-paths/generate` | Generate YouTube roadmap from ATS gaps |
| **Jobs** | `GET` | `/api/v1/jobs/recommendations` | Get job matches grounded in resume evidence |
| **Files** | `GET` | `/api/v1/files/{bucket}/{path}` | Stream private user file from Supabase Storage |

---

## ⚡ Getting Started

### Prerequisites
- **Node.js** 20+
- **Python** 3.11 – 3.13 (Python 3.12 recommended)
- **Supabase Project** (Database & Storage)
- **Firebase Project** (Cloud Firestore)

### 1. Installation
```bash
git clone https://github.com/RonakkudalAI/career-copilot.git
cd career-copilot
npm run setup
```

### 2. Environment Setup (`.env`)
```env
PUBLIC_API_BASE_URL=http://127.0.0.1:8000
AUTH_SECRET=fVYHCLthk5xoxBkf4UkAWky8DVQ7Db0HfaAD2v1UadBSn4QOPOFqHjfqzQJ1QFeZ
FIREBASE_PROJECT_ID=career-copilot-app
FIREBASE_CREDENTIALS_PATH=./secrets/career-copilot05-firebase-adminsdk-fbsvc-62f08f3eea.json
SUPABASE_URL=https://zvjjknnxcljydmapqwyv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_secret_key
SUPABASE_STORAGE_BUCKET=candidate-documents
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_your_groq_api_key
```

### 3. Launch Development Server
```bash
npm run dev
```

* **Frontend**: [http://127.0.0.1:3000](http://127.0.0.1:3000)
* **Backend API**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
* **Swagger API Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 🧪 Verification & Diagnostics

```bash
# Run full backend test suite (223 / 223 passed)
npm run test:backend

# Run frontend TypeScript typecheck (0 errors)
npm run typecheck

# Verify environment variables
npm run check:env
```

---

## 📄 License
Distributed under the MIT License. See `LICENSE` for details.