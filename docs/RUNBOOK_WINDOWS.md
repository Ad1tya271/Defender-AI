# DefenderAI — Windows 11 Local Runbook

This guide details the step-by-step procedure to run DefenderAI natively on Windows 11 with PowerShell.

---

## 1. Prerequisites Checklist

| Component | Minimum Version | Verification Command |
|---|---|---|
| **Python** | 3.12+ (64-bit) | `python --version` |
| **Node.js** | 20+ (LTS) | `node --version; npm --version` |
| **PostgreSQL** | 15+ | `psql -U postgres -c "SELECT version();"` |
| **Ollama** | 0.5+ | `ollama --version` |
| **Semgrep** | 1.170+ | `semgrep --version` |
| **Trivy** | 0.58+ | `trivy --version` |

---

## 2. PostgreSQL Database Setup

1. Open PowerShell and verify PostgreSQL service is running:
   ```powershell
   Get-Service -Name postgresql*
   ```
2. Create the DefenderAI user and database (if not already created):
   ```powershell
   psql -U postgres -c "CREATE USER defenderai_user WITH PASSWORD '1234';"
   psql -U postgres -c "CREATE DATABASE defenderai OWNER defenderai_user;"
   ```

---

## 3. Local AI Engine (Ollama) Setup

1. Start the Ollama background daemon:
   ```powershell
   ollama serve
   ```
2. Pull the optimized code analysis model:
   ```powershell
   ollama pull qwen2.5-coder:7b
   ```
3. Test that the model is loaded:
   ```powershell
   ollama list
   ```

---

## 4. Backend API Setup

1. Open a new PowerShell terminal and navigate to the backend directory:
   ```powershell
   cd C:\Users\Aditya\DefenderAI\backend
   ```
2. Activate the virtual environment:
   ```powershell
   .\venv\Scripts\Activate.ps1
   ```
3. Ensure `.env` is configured (copy from `.env.example` if needed):
   ```powershell
   # Confirm environment variables
   Get-Content .env
   ```
4. Run database migrations to head:
   ```powershell
   alembic upgrade head
   ```
5. Launch the FastAPI server:
   ```powershell
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
6. Verify live health diagnostics in your browser:
   - http://127.0.0.1:8000/api/health
   - http://127.0.0.1:8000/docs

---

## 5. Frontend Dashboard Setup

1. Open a new PowerShell terminal and navigate to the frontend directory:
   ```powershell
   cd C:\Users\Aditya\DefenderAI\frontend
   ```
2. Start the Next.js development server:
   ```powershell
   npm run dev
   ```
3. Access the dashboard:
   - Open your browser to **http://localhost:3000**
   - Register a user account (e.g. `analyst@example.com` / `password123`)
   - Create a project and upload `sample_vulnerable_app.zip` to run your first multi-scanner security analysis.

---

## 6. Running Backend Verification Tests

To run the complete automated test suite (33 unit, integration, and E2E scanner tests):

```powershell
cd C:\Users\Aditya\DefenderAI\backend
.\venv\Scripts\Activate.ps1
pytest -v
```

To run a specific test suite:
```powershell
# Scanners & Normalization
pytest -v tests/test_scanners_and_normalization.py

# AI Provider Abstraction
pytest -v tests/test_ai_provider.py

# Remediation Proposals & Isolated Sandbox Verification
pytest -v tests/test_verification_and_remediation.py

# Multi-Tenant Isolation & Auth Hardening
pytest -v tests/test_multi_tenant_and_auth_hardening.py

# Hybrid Agent Protocol
pytest -v tests/test_hybrid_agent.py
```
