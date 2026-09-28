# DefenderAI — Docker Deployment & Containerization Guide

DefenderAI is designed for **local-first privacy** with multi-container orchestration via Docker Compose.

---

## 1. Architecture Overview

The container topology consists of three primary services running in an isolated bridge network:

```
[ Browser / User ]
       │
       ▼ :3000
┌───────────────────────┐
│  defenderai-frontend  │ (Next.js 16 Production Runner)
└──────────┬────────────┘
           │
           ▼ :8000
┌───────────────────────┐         ┌────────────────────────┐
│  defenderai-backend   │────────▶│  defenderai-postgres   │ (:5432)
└──────────┬────────────┘         └────────────────────────┘
           │
           ▼ host.docker.internal:11434
┌───────────────────────┐
│   Host Ollama Model   │ (qwen2.5-coder:7b)
└───────────────────────┘
```

1. **`defenderai-postgres`**: PostgreSQL 16 container with health check probe. Database schema migrations run automatically via Alembic on backend startup.
2. **`defenderai-backend`**: Python 3.12 container bundled with Semgrep (SAST) and Trivy (SCA/IaC) binaries. Connects to PostgreSQL, executes isolated scans in ephemeral workspace volumes, and exposes REST APIs.
3. **`defenderai-frontend`**: Next.js 16 production server (Node 20 Alpine) providing the UI, Diff Viewer, and Scan Management dashboard.
4. **Ollama Integration**: Uses `host.docker.internal:host-gateway` to communicate with the host machine's local Ollama instance without requiring high-memory GPU container virtualization inside Docker.

---

## 2. Quickstart

### Prerequisites
- Docker Engine 24+ and Docker Compose v2+
- (Optional for AI) Ollama running on host with `qwen2.5-coder:7b`:
  ```bash
  ollama serve
  ollama run qwen2.5-coder:7b
  ```

### Launch All Services

```bash
# Start all containers in the background
docker compose up -d --build
```

Check container status and logs:
```bash
# Check service health
docker compose ps

# Tail live backend logs
docker compose logs -f backend
```

Access the platform:
- **Frontend Dashboard:** http://localhost:3000
- **Backend API & Swagger Docs:** http://localhost:8000/docs
- **Health Diagnostic Probe:** http://localhost:8000/api/health

---

## 3. Environment Variables Reference

| Variable | Default Value | Description |
|---|---|---|
| `EXECUTION_MODE` | `local` | Operational mode (`local`, `cloud`, `hybrid`). |
| `POSTGRES_USER` | `defenderai_user` | Database master username. |
| `POSTGRES_PASSWORD` | `1234` | Database master password. |
| `POSTGRES_DB` | `defenderai` | Database name. |
| `DATABASE_URL` | Auto-constructed | Connection URI used by SQLAlchemy and Alembic. |
| `SECRET_KEY` | (Pre-set demo key) | JWT signing secret for bearer authentication. |
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434` | Bridge endpoint to reach host-side Ollama. |
| `OLLAMA_MODEL` | `qwen2.5-coder:7b` | LLM model for vulnerability analysis & diffs. |
| `AI_PROVIDER` | `ollama` | Provider backend (`ollama`, `mock`). |
| `SCAN_TIMEOUT_SECONDS` | `300` | Scanner timeout threshold. |
| `MAX_UPLOAD_SIZE_BYTES`| `104857600` (100MB) | Maximum project zip archive upload limit. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | API base URL consumed by the web browser. |

---

## 4. Ephemeral Workspace Isolation

- Workspace files and scanned targets reside in the dedicated Docker named volume `defenderai-scan-workspaces`.
- When running patch verifications, DefenderAI creates an ephemeral directory `/app/scan-workspaces/{project_id}/verification-workspaces/{proposal_id}` which is deleted immediately after the scanner completes.
