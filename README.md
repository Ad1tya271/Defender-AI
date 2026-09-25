# DefenderAI

**AI-Powered Software Security Analysis and Remediation Platform**
Final Year B.Tech Engineering Project — Information Technology

DefenderAI is a unified platform that lets developers upload a source code project, scan it for security vulnerabilities and vulnerable dependencies, and (in progress) get AI-assisted explanations and remediation suggestions for what's found — with every AI-generated fix independently re-verified rather than trusted blindly.

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Overview](#api-overview)
- [Team](#team)
- [Roadmap](#roadmap)

---

## Problem Statement

Developers routinely introduce security vulnerabilities through insecure coding practices, vulnerable third-party dependencies, and lack of security expertise. Existing static analysis and dependency-scanning tools surface these issues but often produce output that is difficult for non-specialists to interpret and act on.

DefenderAI combines traditional security scanning (SAST + SCA) with a locally hosted AI assistant that explains findings in plain language and proposes remediation — while keeping a hard separation between **what a scanner found**, **what the AI claims**, and **what has actually been verified**. An AI-suggested fix is never presented as correct or secure merely because the AI produced it; every proposed fix must pass an independent re-scan before it is considered resolved.

---

## Architecture

```
                         ┌─────────────────┐
                         │   Next.js UI     │
                         │  (frontend/)     │
                         └────────┬─────────┘
                                  │ REST (JWT auth)
                                  ▼
                         ┌─────────────────┐
                         │   FastAPI API    │
                         │   (backend/)     │
                         └────────┬─────────┘
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
            ┌───────────┐  ┌───────────┐  ┌───────────┐
            │ PostgreSQL │  │  Semgrep  │  │   Trivy   │
            │ (via SQLA) │  │  (SAST)   │  │   (SCA)   │
            └───────────┘  └───────────┘  └───────────┘

            Planned:  FastAPI ──▶ Ollama (local LLM) ──▶ explain / remediate
                      FastAPI ──▶ Docker (isolated verification workspace)
```

### Data Flow (current)

1. User registers/logs in → receives a JWT
2. User creates a project, uploads a `.zip` archive
3. Archive is extracted into an isolated per-project workspace (`scan-workspaces/{project_id}/source`), with zip-slip path validation
4. User triggers a scan → Semgrep and/or Trivy run against the workspace as a subprocess (argument-list invocation, 5-minute timeout, no shell interpolation)
5. Raw scanner output is parsed and normalized into a common `Finding` schema, stored against the `Scan` record
6. Severity counts and a computed security score are rolled up onto the `Scan`
7. Findings are retrievable with filtering (severity, scanner, keyword search) and on-demand code-snippet extraction around the flagged lines

### Data Flow (planned)

8. User requests an AI explanation of a finding → local Ollama model receives finding + code context, returns a structured explanation
9. User requests a remediation suggestion → AI returns a proposed patch, assumptions, and side effects (Pydantic-validated, never auto-applied)
10. User approves a patch → it is applied only to an isolated working copy, re-scanned, and the before/after findings are compared to produce a verification status (e.g. *verified reduction*, *still detected*, *new findings introduced*)

---

## Tech Stack

**Backend**
- Python 3.12, FastAPI, Pydantic / Pydantic Settings
- SQLAlchemy + Alembic (PostgreSQL)
- `passlib[bcrypt]` for password hashing, `python-jose` for JWT
- Semgrep (SAST) and Trivy (SCA/dependency scanning) as subprocess-invoked scanners

**Frontend**
- Next.js (App Router), React, TypeScript, Tailwind CSS

**Planned**
- Ollama for local LLM inference (finding explanation + remediation)
- Docker for isolated scan/verification workspaces

**Infrastructure**
- PostgreSQL 18 (local, dev)
- Git / GitHub

---

## Project Structure

```
DefenderAI/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app entrypoint
│   │   ├── core/                   # config, security (JWT, hashing)
│   │   ├── api/                    # auth, projects, scans, findings routers
│   │   ├── models/                 # SQLAlchemy models (User, Project, Scan, Finding)
│   │   ├── schemas/                # Pydantic request/response schemas
│   │   ├── database/               # SQLAlchemy session/engine setup
│   │   └── services/
│   │       └── scanners/           # semgrep_scanner.py, trivy_scanner.py
│   ├── alembic/                    # DB migrations
│   ├── tests/                      # test suite
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── app/                        # Next.js App Router pages
│   ├── components/                 # Sidebar, Logo, etc.
│   ├── lib/                        # API client (lib/api.ts)
│   └── ...
│
├── docker/                          # (planned) isolation configs
├── docs/                            # (planned) architecture docs, diagrams
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.12
- PostgreSQL 16+ (developed against 18)
- Node.js 20+ (for the frontend)
- [Semgrep](https://semgrep.dev/) (`pip install semgrep`)
- [Trivy](https://github.com/aquasecurity/trivy) (standalone binary)

### Backend Setup

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate
pip install -r requirements.txt
pip install semgrep

# Create backend/.env from .env.example and fill in:
#   DATABASE_URL, OLLAMA_BASE_URL, OLLAMA_MODEL, SECRET_KEY

alembic upgrade head
uvicorn app.main:app --reload
```

API docs available at `http://localhost:8000/docs`.

### Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```

App available at `http://localhost:3000`.

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Log in, receive JWT |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects` | List your projects |
| GET | `/api/projects/{id}` | Get project details |
| GET | `/api/projects/{id}/stats` | Project rollup (scans, scores, findings) |
| DELETE | `/api/projects/{id}` | Delete a project |
| POST | `/api/projects/{id}/upload` | Upload a `.zip` source archive |
| POST | `/api/projects/{id}/scans` | Trigger a scan (`?scanner=all\|semgrep\|trivy`) |
| GET | `/api/projects/{id}/scans` | List scans for a project |
| GET | `/api/projects/{id}/scans/{scan_id}` | Get a specific scan |
| DELETE | `/api/scans/{scan_id}` | Delete a scan and its findings |
| GET | `/api/scans/{scan_id}/findings` | List findings (filterable by severity/scanner/search) |
| GET | `/api/findings/{id}` | Finding detail, including extracted code snippet |
| GET | `/api/findings/{id}/snippet` | Just the code snippet for a finding |

Full interactive documentation (Swagger UI) is generated automatically by FastAPI at `/docs` once the backend is running.

---

## Team

| Role | Focus |
|---|---|
| Dev A | Backend & database — FastAPI, PostgreSQL, auth, project/scan management |
| Dev B | Security scanning & AI integration — Semgrep, Trivy, findings pipeline |
| Dev C | Frontend — Next.js UI, dashboard, project views |

---

## Roadmap

- [ ] Wire frontend to scan/findings/upload APIs
- [ ] Ollama integration — finding explanation endpoint
- [ ] AI-assisted remediation suggestion endpoint (structured, never auto-applied)
- [ ] Patch review UI (diff view, approve/reject)
- [ ] Secure verification workflow (isolated patch application → re-scan → before/after comparison)
- [ ] Docker-based scan isolation
- [ ] Expanded automated test coverage
- [ ] Architecture diagrams and final report documentation

---

## Security Notes

- Passwords are hashed with bcrypt; plaintext passwords are never stored.
- Authentication uses stateless JWTs (24-hour expiry); there is currently no server-side revocation mechanism.
- Uploaded archives are extracted with explicit zip-slip path validation to prevent writing outside the intended workspace.
- Scanners are invoked via subprocess argument lists (never shell string concatenation) with a hard execution timeout.
- AI-generated remediation (once implemented) will never be applied automatically — all patches require explicit user review and are only ever applied to an isolated working copy pending independent re-scan verification.
