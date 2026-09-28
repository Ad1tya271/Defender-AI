# DefenderAI — Hybrid Scanning Agent Specification & Protocol

The **DefenderAI Hybrid Scanning Agent** allows organizations with strict data sovereignty, compliance, or air-gapped requirements to run security scans on their own infrastructure while visualizing results and tracking remediation posture within a centralized DefenderAI platform.

---

## 1. Zero-Source-Exposure Security Model

The primary invariant of the Hybrid Agent architecture is:

> **Proprietary source code NEVER leaves the agent runner.**

```
┌────────────────────────────────────────┐          ┌───────────────────────────┐
│     Corporate Network / Workstation    │          │    DefenderAI Platform    │
│                                        │          │   (Local or Cloud Hosted) │
│  ┌──────────────────────────────────┐  │          │                           │
│  │ Private Code Repository          │  │          │                           │
│  └─────────────────┬────────────────┘  │          │                           │
│                    │ (local scan)      │          │                           │
│                    ▼                   │          │                           │
│  ┌──────────────────────────────────┐  │          │                           │
│  │ Local Scanners (Semgrep / Trivy) │  │          │                           │
│  └─────────────────┬────────────────┘  │          │                           │
│                    │ (metadata only)   │          │                           │
│                    ▼                   │          │                           │
│  ┌──────────────────────────────────┐  │  HTTPS   │  ┌─────────────────────┐  │
│  │ DefenderAI Hybrid Agent Runner   │──┼─────────▶│  │ /agent-gateway      │  │
│  └──────────────────────────────────┘  │ Metadata │  └─────────────────────┘  │
│                                        │  Payload │                           │
└────────────────────────────────────────┘          └───────────────────────────┘
```

1. **Local Execution:** Semgrep and Trivy execute as local subprocesses on the agent machine.
2. **Metadata Sanitization:** Findings are extracted into normalized JSON records containing only:
   - Rule Identifier (e.g. `python.django.security.injection`)
   - Severity level (`critical`, `high`, `medium`, `low`)
   - Relative file path and line numbers
   - CWE / OWASP taxonomy tags
3. **No File Transfers:** File contents, Git histories, and surrounding source lines are omitted from transmissions unless specifically enabled for on-premise review.

---

## 2. Authentication & Credential Lifecycle

1. **Registration:**
   - Authenticated user calls `POST /api/agents/register` with `agent_name`, `hostname`, `os`.
   - The platform generates a 256-bit entropy token: `def_agent_<urlsafe_token>`.
   - The server computes `SHA-256(raw_key)` and stores **only the hash** in the database table `agents`.
   - The raw token is returned to the user **once** and cannot be recovered if lost.
2. **Gateway Authorization:**
   - Every request from the runner to the gateway must include the HTTP header:
     ```http
     X-Agent-Key: def_agent_...
     ```
   - The gateway hashes the incoming header and matches against active agent registrations.
3. **Revocation:**
   - The tenant administrator can revoke any agent runner at any time via `DELETE /api/agents/{agent_id}`.
   - Revoked agents immediately receive `401 Unauthorized` on all subsequent heartbeat and submission calls.

---

## 3. Communication Protocol

### A. Heartbeat & Job Polling
- **Endpoint:** `POST /api/agent-gateway/heartbeat`
- **Request Headers:** `X-Agent-Key: def_agent_...`
- **Request Body:**
  ```json
  {
    "hostname": "runner-internal-node-1",
    "scanner_capabilities": "semgrep,trivy"
  }
  ```
- **Response Body:**
  ```json
  {
    "status": "ok",
    "server_time": "2026-09-28T08:15:00Z",
    "pending_jobs": [
      {
        "job_id": "4b68e988-8dc0-449e-8c3b-7412f718d7f1",
        "project_id": "119e89d2-7ec4-4903-b183-49051ff65d49",
        "scanner": "semgrep"
      }
    ]
  }
  ```

### B. Results & Findings Transmission
- **Endpoint:** `POST /api/agent-gateway/jobs/{job_id}/results`
- **Request Headers:** `X-Agent-Key: def_agent_...`
- **Request Body Schema:**
  ```json
  {
    "status": "completed",
    "summary": "Local Semgrep scan completed in 1.4s.",
    "security_score": 85,
    "findings": [
      {
        "scanner": "semgrep",
        "rule_id": "python.flask.hardcoded-secret",
        "title": "Hardcoded Secret Detected",
        "description": "CWE-798: Use of Hard-coded Credentials",
        "severity": "high",
        "file_path": "backend/app/core/config.py",
        "start_line": 24,
        "end_line": 24
      }
    ]
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "job_id": "4b68e988-8dc0-449e-8c3b-7412f718d7f1",
    "status": "completed",
    "findings_ingested": 1
  }
  ```

---

## 4. Standalone Runner Usage

A reference runner script is provided in `scripts/defenderai_agent.py`:

```bash
python scripts/defenderai_agent.py \
    --gateway http://localhost:8000 \
    --agent-key def_agent_your_secret_token \
    --target-dir C:\Users\Aditya\my-proprietary-codebase \
    --poll-interval 15
```
