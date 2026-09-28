import uuid
from datetime import datetime, timedelta, timezone
from jose import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.rate_limiter import login_rate_limiter
from app.core.security import ALGORITHM, create_access_token
from app.database.session import SessionLocal
from app.main import app
from app.models.audit import AuditEvent
from app.models.finding import Finding
from app.models.project import Project
from app.models.remediation import RemediationProposal
from app.models.scan import Scan
from app.models.user import User

client = TestClient(app)


# ============================================================
# 1. AUTHENTICATION & PASSWORD HARDENING
# ============================================================

def test_password_length_validation():
    # Passwords shorter than 8 characters must be rejected by Pydantic validation (422)
    short_pw_payload = {
        "email": f"short_pw_{uuid.uuid4().hex[:8]}@example.com",
        "password": "short",
    }
    res = client.post("/api/auth/register", json=short_pw_payload)
    assert res.status_code == 422
    assert "at least 8 characters" in str(res.json())

    # Valid password (>= 8 chars) accepted
    valid_payload = {
        "email": f"valid_pw_{uuid.uuid4().hex[:8]}@example.com",
        "password": "secure_password_123",
    }
    res_valid = client.post("/api/auth/register", json=valid_payload)
    assert res_valid.status_code == 201


def test_invalid_and_expired_tokens():
    # 1. Invalid bearer token
    res_invalid = client.get("/api/projects", headers={"Authorization": "Bearer not_a_valid_token"})
    assert res_invalid.status_code == 401

    # 2. Expired JWT token
    expired_payload = {
        "sub": str(uuid.uuid4()),
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
    }
    expired_token = jwt.encode(expired_payload, settings.SECRET_KEY, algorithm=ALGORITHM)
    res_expired = client.get("/api/projects", headers={"Authorization": f"Bearer {expired_token}"})
    assert res_expired.status_code == 401


def test_login_rate_limiting_and_audit():
    login_rate_limiter.reset()
    fake_email = f"rate_limit_{uuid.uuid4().hex[:8]}@example.com"

    try:
        # Trigger 10 failed login attempts (allowed up to limit)
        for _ in range(10):
            res = client.post(
                "/api/auth/login",
                json={"email": fake_email, "password": "wrong_password"},
            )
            assert res.status_code == 401

        # 11th request must trigger rate limit 429 Too Many Requests
        res_throttled = client.post(
            "/api/auth/login",
            json={"email": fake_email, "password": "wrong_password"},
        )
        assert res_throttled.status_code == 429
        assert "Rate limit exceeded" in res_throttled.json()["detail"]

        # Check audit event for failed login was recorded
        db = SessionLocal()
        failed_audits = (
            db.query(AuditEvent)
            .filter(AuditEvent.action == "login_failed")
            .all()
        )
        assert len(failed_audits) > 0
        db.close()

    finally:
        login_rate_limiter.reset()


# ============================================================
# 2. MULTI-TENANT ISOLATION TESTS
# ============================================================

def test_cross_tenant_project_isolation():
    db = SessionLocal()
    try:
        # Create User A
        email_a = f"tenant_a_{uuid.uuid4().hex[:8]}@example.com"
        reg_a = client.post("/api/auth/register", json={"email": email_a, "password": "password123"})
        assert reg_a.status_code == 201
        token_a = client.post("/api/auth/login", json={"email": email_a, "password": "password123"}).json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Create User B
        email_b = f"tenant_b_{uuid.uuid4().hex[:8]}@example.com"
        reg_b = client.post("/api/auth/register", json={"email": email_b, "password": "password123"})
        assert reg_b.status_code == 201
        token_b = client.post("/api/auth/login", json={"email": email_b, "password": "password123"}).json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User A creates a project
        res_proj_a = client.post("/api/projects", json={"name": "User A Private App"}, headers=headers_a)
        assert res_proj_a.status_code == 201
        project_a_id = res_proj_a.json()["id"]

        # User B CANNOT view User A's project
        res_get = client.get(f"/api/projects/{project_a_id}", headers=headers_b)
        assert res_get.status_code == 403

        # User B CANNOT view User A's project stats
        res_stats = client.get(f"/api/projects/{project_a_id}/stats", headers=headers_b)
        assert res_stats.status_code == 403

        # User B CANNOT edit User A's project
        res_put = client.put(f"/api/projects/{project_a_id}", json={"name": "Hacked App"}, headers=headers_b)
        assert res_put.status_code == 403

        # User B CANNOT delete User A's project
        res_del = client.delete(f"/api/projects/{project_a_id}", headers=headers_b)
        assert res_del.status_code == 403

        # User B's project list does NOT contain User A's project
        res_list = client.get("/api/projects", headers=headers_b)
        assert res_list.status_code == 200
        proj_ids = [p["id"] for p in res_list.json()]
        assert project_a_id not in proj_ids

        # User B CANNOT save snippet or upload to User A's workspace
        res_snip = client.post(
            f"/api/projects/{project_a_id}/snippet",
            json={"filename": "test.py", "code": "print(1)"},
            headers=headers_b,
        )
        assert res_snip.status_code == 403

    finally:
        db.close()


def test_cross_tenant_scan_and_findings_isolation():
    db = SessionLocal()
    try:
        # Create User A & B
        email_a = f"tenant_scans_a_{uuid.uuid4().hex[:8]}@example.com"
        client.post("/api/auth/register", json={"email": email_a, "password": "password123"})
        token_a = client.post("/api/auth/login", json={"email": email_a, "password": "password123"}).json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        email_b = f"tenant_scans_b_{uuid.uuid4().hex[:8]}@example.com"
        client.post("/api/auth/register", json={"email": email_b, "password": "password123"})
        token_b = client.post("/api/auth/login", json={"email": email_b, "password": "password123"}).json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User A setup project, scan, and finding
        proj_res = client.post("/api/projects", json={"name": "User A Sensitive Project"}, headers=headers_a)
        proj_a_id = proj_res.json()["id"]

        user_a = db.query(User).filter(User.email == email_a).first()
        user_b = db.query(User).filter(User.email == email_b).first()

        scan = Scan(project_id=uuid.UUID(proj_a_id), status="completed", scanner="semgrep")
        db.add(scan)
        db.commit()
        db.refresh(scan)

        finding = Finding(
            scan_id=scan.id,
            scanner="semgrep",
            rule_id="sec.rule.a",
            title="Secret Key Leak",
            severity="critical",
            file_path="secrets.env",
        )
        db.add(finding)
        db.commit()
        db.refresh(finding)

        # 1. User B CANNOT trigger scan on User A's project
        res_scan_trigger = client.post(f"/api/projects/{proj_a_id}/scans", headers=headers_b)
        assert res_scan_trigger.status_code == 403

        # 2. User B CANNOT list scans of User A's project
        res_scan_list = client.get(f"/api/projects/{proj_a_id}/scans", headers=headers_b)
        assert res_scan_list.status_code == 403

        # 3. User B global scans list does NOT contain User A's scans
        res_global_scans = client.get("/api/scans", headers=headers_b)
        assert res_global_scans.status_code == 200
        scan_ids = [s["id"] for s in res_global_scans.json()]
        assert str(scan.id) not in scan_ids

        # 4. User B CANNOT delete User A's scan
        res_del_scan = client.delete(f"/api/scans/{scan.id}", headers=headers_b)
        assert res_del_scan.status_code == 403

        # 5. User B CANNOT view findings for User A's scan
        res_findings = client.get(f"/api/scans/{scan.id}/findings", headers=headers_b)
        assert res_findings.status_code == 403

        # 6. User B CANNOT get finding details or code snippet
        res_find_detail = client.get(f"/api/findings/{finding.id}", headers=headers_b)
        assert res_find_detail.status_code == 403

        res_find_snip = client.get(f"/api/findings/{finding.id}/snippet", headers=headers_b)
        assert res_find_snip.status_code == 403

        # 7. User B CANNOT trigger AI explain or remediate on User A's finding
        res_ai_exp = client.post(f"/api/findings/{finding.id}/explain", headers=headers_b)
        assert res_ai_exp.status_code == 403

        res_ai_rem = client.post(f"/api/findings/{finding.id}/remediate", headers=headers_b)
        assert res_ai_rem.status_code == 403

    finally:
        db.close()


def test_cross_tenant_remediation_isolation():
    db = SessionLocal()
    try:
        # Create User A & B
        email_a = f"remed_tenant_a_{uuid.uuid4().hex[:8]}@example.com"
        client.post("/api/auth/register", json={"email": email_a, "password": "password123"})
        token_a = client.post("/api/auth/login", json={"email": email_a, "password": "password123"}).json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        email_b = f"remed_tenant_b_{uuid.uuid4().hex[:8]}@example.com"
        client.post("/api/auth/register", json={"email": email_b, "password": "password123"})
        token_b = client.post("/api/auth/login", json={"email": email_b, "password": "password123"}).json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        user_a = db.query(User).filter(User.email == email_a).first()
        user_b = db.query(User).filter(User.email == email_b).first()

        proj = Project(name="Project A Proposals", owner_id=user_a.id)
        db.add(proj)
        db.commit()
        db.refresh(proj)

        scan = Scan(project_id=proj.id, status="completed")
        db.add(scan)
        db.commit()
        db.refresh(scan)

        finding = Finding(scan_id=scan.id, scanner="semgrep", rule_id="sqli", title="SQLi", severity="high")
        db.add(finding)
        db.commit()
        db.refresh(finding)

        # User A creates a proposal
        proposal = RemediationProposal(
            finding_id=finding.id,
            user_id=user_a.id,
            explanation="Fix SQLi",
            patch="--- a/f.py\n+++ b/f.py\n@@ -1 +1 @@\n-old\n+new\n",
            status="proposed",
        )
        db.add(proposal)
        db.commit()
        db.refresh(proposal)

        # 1. User B CANNOT view proposals for User A's finding or project
        res_p1 = client.get(f"/api/findings/{finding.id}/proposals", headers=headers_b)
        assert res_p1.status_code == 403

        res_p2 = client.get(f"/api/projects/{proj.id}/remediations", headers=headers_b)
        assert res_p2.status_code == 403

        res_p3 = client.get(f"/api/remediations/{proposal.id}", headers=headers_b)
        assert res_p3.status_code == 403

        # 2. User B CANNOT approve or reject User A's proposal
        res_app = client.post(f"/api/remediations/{proposal.id}/approve", headers=headers_b)
        assert res_app.status_code == 403

        res_rej = client.post(f"/api/remediations/{proposal.id}/reject", headers=headers_b)
        assert res_rej.status_code == 403

        # 3. User B CANNOT verify, apply, or rollback User A's proposal
        res_ver = client.post(f"/api/remediations/{proposal.id}/verify", headers=headers_b)
        assert res_ver.status_code == 403

        res_apl = client.post(f"/api/remediations/{proposal.id}/apply", headers=headers_b)
        assert res_apl.status_code == 403

        res_rlb = client.post(f"/api/remediations/{proposal.id}/rollback", headers=headers_b)
        assert res_rlb.status_code == 403

    finally:
        db.close()
