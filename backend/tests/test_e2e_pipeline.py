import io
import json
import uuid
import zipfile
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_full_pipeline():
    # 1. Health check
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}

    # 2. Register
    test_email = f"test_{uuid.uuid4().hex[:6]}@example.com"
    res = client.post("/api/auth/register", json={"email": test_email, "password": "password123"})
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == test_email
    assert "id" in data

    # 3. Login
    res = client.post("/api/auth/login", json={"email": test_email, "password": "password123"})
    assert res.status_code == 200
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 4. Create Project
    res = client.post(
        "/api/projects",
        json={"name": "Multi-Scanner Test App", "description": "Testing Semgrep SAST + Trivy SCA"},
        headers=headers
    )
    assert res.status_code == 201
    project = res.json()
    project_id = project["id"]
    assert project["name"] == "Multi-Scanner Test App"

    # 5. Upload source archive (with SQL injection code + vulnerable dependency)
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zf:
        zf.writestr(
            "app/vulnerable.py",
            "import sqlite3\n"
            "def get_user(user_id):\n"
            "    conn = sqlite3.connect('app.db')\n"
            "    cursor = conn.cursor()\n"
            "    query = 'SELECT * FROM users WHERE id = ' + user_id\n"
            "    cursor.execute(query)\n"
            "    return cursor.fetchone()\n"
        )
        zf.writestr(
            "requirements.txt",
            "fastapi==0.111.0\n"
            "ecdsa==0.19.2\n"
        )
    zip_buffer.seek(0)

    res = client.post(
        f"/api/projects/{project_id}/upload",
        files={"file": ("source.zip", zip_buffer.getvalue(), "application/zip")},
        headers=headers
    )
    assert res.status_code == 200
    assert res.json()["message"] == "Upload successful"

    # 6. Trigger Multi-Scanner Scan (Semgrep + Trivy)
    res = client.post(f"/api/projects/{project_id}/scans?scanner=all", headers=headers)
    assert res.status_code == 201
    scan = res.json()
    assert scan["status"] == "completed"
    assert scan["total_findings"] >= 2
    scan_id = scan["id"]

    # 7. Retrieve Findings
    res = client.get(f"/api/scans/{scan_id}/findings", headers=headers)
    assert res.status_code == 200
    findings = res.json()
    assert len(findings) >= 2

    scanners_detected = {f["scanner"] for f in findings}
    assert "semgrep" in scanners_detected, "Semgrep finding was not detected"
    assert "trivy" in scanners_detected, "Trivy SCA finding was not detected"

    print("\n--- Multi-Scanner Pipeline Test Passed ---")
    print(f"Total findings: {len(findings)}")
    for f in findings:
        print(f"  - [{f['scanner'].upper()} / {f['severity'].upper()}] {f['title']} ({f.get('rule_id')}) in {f['file_path']}")
