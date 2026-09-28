from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
from time import perf_counter
import urllib.request

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import auth, projects, scans, findings, remediations, agents
from app.core.config import settings
from app.database.session import SessionLocal
from app.services.scanners.semgrep_scanner import get_semgrep_cmd
from app.services.scanners.trivy_scanner import get_trivy_cmd

app = FastAPI(title="DefenderAI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(scans.router)
app.include_router(findings.router)
app.include_router(remediations.router)
app.include_router(agents.router)


@app.get("/health")
def health_check():
    """Simple health probe for backwards compatibility and load balancers."""
    return {"status": "ok"}


@app.get("/health/detailed")
@app.get("/api/health")
def detailed_health_check():
    """Comprehensive environment and component diagnostics."""
    # 1. Database check
    db_start = perf_counter()
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        db_info = {
            "connected": True,
            "latency_ms": round((perf_counter() - db_start) * 1000, 2),
            "error": None,
        }
    except Exception as e:
        db_info = {
            "connected": False,
            "latency_ms": None,
            "error": str(e),
        }

    # 2. Ollama AI check
    try:
        req = urllib.request.Request(
            f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags",
            headers={"User-Agent": "DefenderAI-HealthCheck"},
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = [m.get("name", "") for m in data.get("models", [])]
            model_available = any(settings.OLLAMA_MODEL in m for m in models)
            ollama_info = {
                "reachable": True,
                "base_url": settings.OLLAMA_BASE_URL,
                "configured_model": settings.OLLAMA_MODEL,
                "model_available": model_available,
                "available_models": models,
                "error": None,
            }
    except Exception as e:
        ollama_info = {
            "reachable": False,
            "base_url": settings.OLLAMA_BASE_URL,
            "configured_model": settings.OLLAMA_MODEL,
            "model_available": False,
            "available_models": [],
            "error": str(e),
        }

    # 3. Scanners check
    semgrep_cmd = get_semgrep_cmd()
    semgrep_path = Path(semgrep_cmd)
    semgrep_installed = semgrep_path.exists() or (shutil.which(semgrep_cmd) is not None)

    trivy_cmd = get_trivy_cmd()
    trivy_path = Path(trivy_cmd)
    trivy_installed = trivy_path.exists() or (shutil.which(trivy_cmd) is not None)

    overall_status = "ok" if (db_info["connected"] and semgrep_installed and trivy_installed) else "degraded"

    return {
        "status": overall_status,
        "execution_mode": settings.EXECUTION_MODE,
        "app_env": settings.APP_ENV,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": db_info,
        "ai_service": ollama_info,
        "scanners": {
            "semgrep": {
                "installed": semgrep_installed,
                "path": str(semgrep_cmd),
            },
            "trivy": {
                "installed": trivy_installed,
                "path": str(trivy_cmd),
            },
        },
    }