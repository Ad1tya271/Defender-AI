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

    # 6. Trigger Multi-Scanner Scan (Semgrep + Trivy via JSON body)
    res = client.post(f"/api/projects/{project_id}/scans", json={"scanner": "all"}, headers=headers)
    assert res.status_code == 201
    scan = res.json()
    assert scan["status"] == "completed"
    assert scan["total_findings"] >= 2
    assert scan["high_count"] >= 2
    scan_id = scan["id"]

    # 7. Retrieve Findings
    res = client.get(f"/api/scans/{scan_id}/findings", headers=headers)
    assert res.status_code == 200
    findings = res.json()
    assert len(findings) >= 2

    # 8. Test Finding Filters (by severity, scanner, search)
    res_high = client.get(f"/api/scans/{scan_id}/findings?severity=high", headers=headers)
    assert res_high.status_code == 200
    assert len(res_high.json()) >= 2

    res_semgrep = client.get(f"/api/scans/{scan_id}/findings?scanner=semgrep", headers=headers)
    assert res_semgrep.status_code == 200
    assert any("vulnerable.py" in f["file_path"] for f in res_semgrep.json())

    res_trivy = client.get(f"/api/scans/{scan_id}/findings?scanner=trivy", headers=headers)
    assert res_trivy.status_code == 200
    assert any("requirements.txt" in f["file_path"] for f in res_trivy.json())

    res_search = client.get(f"/api/scans/{scan_id}/findings?search=SQL", headers=headers)
    assert res_search.status_code == 200
    assert len(res_search.json()) >= 1

    # 9. Test Single Finding Detail & Code Snippet Extraction
    semgrep_finding = next(f for f in findings if f["scanner"] == "semgrep")
    res_detail = client.get(f"/api/findings/{semgrep_finding['id']}", headers=headers)
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["id"] == semgrep_finding["id"]
    assert detail["code_snippet"] is not None
    assert "SELECT * FROM users" in detail["code_snippet"]

    res_snippet = client.get(f"/api/findings/{semgrep_finding['id']}/snippet", headers=headers)
    assert res_snippet.status_code == 200
    assert "SELECT * FROM users" in res_snippet.json()["code_snippet"]

    # 10. Test Project Stats Dashboard Endpoint
    res_stats = client.get(f"/api/projects/{project_id}/stats", headers=headers)
    assert res_stats.status_code == 200
    stats = res_stats.json()
    assert stats["project_id"] == project_id
    assert stats["total_scans"] == 1
    assert stats["latest_scan_id"] == scan_id
    assert stats["latest_security_score"] <= 100
    assert stats["high_count"] >= 2
    assert stats["total_findings"] >= 2

    # 11. Test Scan Deletion
    res_del_scan = client.delete(f"/api/scans/{scan_id}", headers=headers)
    assert res_del_scan.status_code == 204

    # Verify findings cascade deleted
    res_after_del = client.get(f"/api/scans/{scan_id}/findings", headers=headers)
    assert res_after_del.status_code == 404

    print("\n--- All Comprehensive API & Multi-Scanner Tests Passed Cleanly ---")
