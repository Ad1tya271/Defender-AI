import uuid
from fastapi.testclient import TestClient

from app.database.session import SessionLocal
from app.main import app
from app.models.agent import AgentRegistration
from app.models.audit import AuditEvent
from app.models.finding import Finding
from app.models.project import Project
from app.models.scan import Scan
from app.models.user import User

client = TestClient(app)


def test_agent_registration_and_hashing():
    db = SessionLocal()
    try:
        # Register user
        email = f"agent_owner_{uuid.uuid4().hex[:8]}@example.com"
        client.post("/api/auth/register", json={"email": email, "password": "password123"})
        token = client.post("/api/auth/login", json={"email": email, "password": "password123"}).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Register agent
        reg_payload = {
            "agent_name": "Aditya-Workstation-Runner",
            "hostname": "aditya-laptop",
            "os": "Windows 11",
            "scanner_capabilities": "semgrep,trivy",
        }
        res = client.post("/api/agents/register", json=reg_payload, headers=headers)
        assert res.status_code == 201
        data = res.json()
        assert "id" in data
        assert data["agent_name"] == "Aditya-Workstation-Runner"
        assert data["api_key"].startswith("def_agent_")
        assert data["status"] == "active"

        raw_key = data["api_key"]
        agent_id = uuid.UUID(data["id"])

        # Check DB does NOT store raw_key in plaintext, only hash
        agent_db = db.query(AgentRegistration).filter(AgentRegistration.id == agent_id).first()
        assert agent_db is not None
        assert agent_db.api_key_hash != raw_key
        assert len(agent_db.api_key_hash) == 64  # SHA-256 hex length

        # Check audit event
        audit = db.query(AuditEvent).filter(
            AuditEvent.action == "agent_registered",
            AuditEvent.resource_id == str(agent_id),
        ).first()
        assert audit is not None

        # List agents
        res_list = client.get("/api/agents", headers=headers)
        assert res_list.status_code == 200
        agents = res_list.json()
        assert any(a["id"] == str(agent_id) for a in agents)

        # Revoke agent
        res_del = client.delete(f"/api/agents/{agent_id}", headers=headers)
        assert res_del.status_code == 204

        db.expire_all()
        agent_revoked = db.query(AgentRegistration).filter(AgentRegistration.id == agent_id).first()
        assert agent_revoked.status == "revoked"

        # Revoked agent cannot use gateway
        res_hb = client.post(
            "/api/agent-gateway/heartbeat",
            json={"hostname": "aditya-laptop"},
            headers={"X-Agent-Key": raw_key},
        )
        assert res_hb.status_code == 401

    finally:
        db.close()


def test_agent_heartbeat_and_findings_gateway():
    db = SessionLocal()
    try:
        # Create user
        email = f"agent_pipeline_{uuid.uuid4().hex[:8]}@example.com"
        client.post("/api/auth/register", json={"email": email, "password": "password123"})
        token = client.post("/api/auth/login", json={"email": email, "password": "password123"}).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create project and queued scan
        proj_res = client.post("/api/projects", json={"name": "Airgapped App"}, headers=headers)
        proj_id = proj_res.json()["id"]

        user = db.query(User).filter(User.email == email).first()
        scan = Scan(
            project_id=uuid.UUID(proj_id),
            status="queued",
            scanner="semgrep",
        )
        db.add(scan)
        db.commit()
        db.refresh(scan)

        # Register active agent
        agent_res = client.post(
            "/api/agents/register",
            json={"agent_name": "Corp-CI-Runner", "scanner_capabilities": "semgrep"},
            headers=headers,
        )
        agent_key = agent_res.json()["api_key"]
        agent_headers = {"X-Agent-Key": agent_key}

        # 1. Test heartbeat: receives the queued job
        hb_res = client.post(
            "/api/agent-gateway/heartbeat",
            json={"hostname": "runner-node-1"},
            headers=agent_headers,
        )
        assert hb_res.status_code == 200
        hb_data = hb_res.json()
        assert hb_data["status"] == "ok"
        assert len(hb_data["pending_jobs"]) >= 1
        received_job = next(j for j in hb_data["pending_jobs"] if j["job_id"] == str(scan.id))
        assert received_job["project_id"] == proj_id

        # 2. Test findings submission: zero source code transmitted
        results_payload = {
            "status": "completed",
            "summary": "Local Semgrep scan completed inside enterprise network.",
            "security_score": 85,
            "findings": [
                {
                    "scanner": "semgrep",
                    "rule_id": "python.jwt.hardcoded-secret",
                    "title": "Hardcoded JWT Secret Detected",
                    "description": "CWE-798: Use of Hard-coded Credentials",
                    "severity": "high",
                    "file_path": "backend/auth.py",
                    "start_line": 12,
                    "end_line": 12,
                },
                {
                    "scanner": "semgrep",
                    "rule_id": "python.flask.debug-mode-enabled",
                    "title": "Flask Debug Mode Enabled in Production",
                    "description": "CWE-489: Active Debug Code",
                    "severity": "medium",
                    "file_path": "backend/server.py",
                    "start_line": 45,
                    "end_line": 45,
                },
            ],
        }

        res_results = client.post(
            f"/api/agent-gateway/jobs/{scan.id}/results",
            json=results_payload,
            headers=agent_headers,
        )
        assert res_results.status_code == 200
        assert res_results.json()["success"] is True
        assert res_results.json()["findings_ingested"] == 2

        # Verify findings persisted in DB attached to the scan
        db.refresh(scan)
        assert scan.status == "completed"
        assert scan.total_findings == 2
        assert scan.high_count == 1
        assert scan.medium_count == 1
        assert scan.security_score == 85

        saved_findings = db.query(Finding).filter(Finding.scan_id == scan.id).all()
        assert len(saved_findings) == 2
        titles = {f.title for f in saved_findings}
        assert "Hardcoded JWT Secret Detected" in titles

        # Verify audit event logged
        audit = db.query(AuditEvent).filter(
            AuditEvent.action == "agent_results_submitted",
            AuditEvent.resource_id == str(scan.id),
        ).first()
        assert audit is not None
        assert "Corp-CI-Runner" in audit.details

    finally:
        db.close()


def test_cross_tenant_agent_job_isolation():
    db = SessionLocal()
    try:
        # User A creates project and scan
        email_a = f"owner_a_{uuid.uuid4().hex[:8]}@example.com"
        client.post("/api/auth/register", json={"email": email_a, "password": "password123"})
        token_a = client.post("/api/auth/login", json={"email": email_a, "password": "password123"}).json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        proj_a = client.post("/api/projects", json={"name": "Tenant A Secret Project"}, headers=headers_a).json()
        scan_a = Scan(project_id=uuid.UUID(proj_a["id"]), status="queued", scanner="semgrep")
        db.add(scan_a)
        db.commit()
        db.refresh(scan_a)

        # User B registers an agent
        email_b = f"owner_b_{uuid.uuid4().hex[:8]}@example.com"
        client.post("/api/auth/register", json={"email": email_b, "password": "password123"})
        token_b = client.post("/api/auth/login", json={"email": email_b, "password": "password123"}).json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        agent_b = client.post("/api/agents/register", json={"agent_name": "Tenant-B-Agent"}, headers=headers_b).json()
        agent_b_headers = {"X-Agent-Key": agent_b["api_key"]}

        # Tenant B's agent CANNOT see Tenant A's queued job in heartbeat
        hb = client.post("/api/agent-gateway/heartbeat", json={}, headers=agent_b_headers).json()
        job_ids = [j["job_id"] for j in hb.get("pending_jobs", [])]
        assert str(scan_a.id) not in job_ids

        # Tenant B's agent CANNOT submit results for Tenant A's scan job
        hack_res = client.post(
            f"/api/agent-gateway/jobs/{scan_a.id}/results",
            json={"status": "completed", "findings": []},
            headers=agent_b_headers,
        )
        assert hack_res.status_code == 404

    finally:
        db.close()
