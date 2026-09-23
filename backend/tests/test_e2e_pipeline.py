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
        json={"name": "Test Sec App", "description": "Automated scan verification"},
        headers=headers
    )
    assert res.status_code == 201
    project = res.json()
    project_id = project["id"]
    assert project["name"] == "Test Sec App"

    # 5. Upload source archive (with SQL injection)
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
    zip_buffer.seek(0)

    res = client.post(
        f"/api/projects/{project_id}/upload",
        files={"file": ("source.zip", zip_buffer.getvalue(), "application/zip")},
        headers=headers
    )
    assert res.status_code == 200
    assert res.json()["message"] == "Upload successful"

    # 6. Trigger Scan
    res = client.post(f"/api/projects/{project_id}/scans", headers=headers)
    assert res.status_code == 201
    scan = res.json()
    assert scan["status"] == "completed"
    assert scan["total_findings"] >= 1
    assert scan["high_count"] >= 1
    scan_id = scan["id"]

    # 7. Retrieve Findings
    res = client.get(f"/api/scans/{scan_id}/findings", headers=headers)
    assert res.status_code == 200
    findings = res.json()
    assert len(findings) >= 1
    assert any("raw-query" in f.get("rule_id", "") or "SQL" in f.get("title", "") for f in findings)
    print("\nE2E Scan Pipeline Test Passed with findings:", [f["title"] for f in findings])
