import uuid
from fastapi.testclient import TestClient

from app.core.config import settings
from app.database.session import SessionLocal
from app.main import app
from app.models.audit import AuditEvent
from app.models.remediation import RemediationProposal, VerificationResult
from app.models.user import User

client = TestClient(app)


def test_simple_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_detailed_health_check():
    res = client.get("/health/detailed")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert data["execution_mode"] == settings.EXECUTION_MODE
    assert data["database"]["connected"] is True
    assert "scanners" in data
    assert "semgrep" in data["scanners"]
    assert "trivy" in data["scanners"]
    assert "ai_service" in data

    res_api = client.get("/api/health")
    assert res_api.status_code == 200
    assert res_api.json()["status"] == data["status"]


def test_models_and_audit_event():
    db = SessionLocal()
    try:
        # Create a test audit event
        audit = AuditEvent(
            action="test_action",
            resource_type="system",
            resource_id="health_check",
            details="Milestone 2 verification audit event",
        )
        db.add(audit)
        db.commit()
        db.refresh(audit)

        assert audit.id is not None
        assert audit.action == "test_action"
        assert audit.created_at is not None

        # Clean up
        db.delete(audit)
        db.commit()
    finally:
        db.close()
