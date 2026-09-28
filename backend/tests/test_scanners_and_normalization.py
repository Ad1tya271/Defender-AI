import io
import json
from pathlib import Path
import pytest
import zipfile

from fastapi.testclient import TestClient

from app.main import app
from app.services.scanners.semgrep_scanner import parse_semgrep_output
from app.services.scanners.trivy_scanner import parse_trivy_output

client = TestClient(app)


def test_parse_semgrep_empty():
    assert parse_semgrep_output("") == []
    assert parse_semgrep_output("   \n  ") == []
    assert parse_semgrep_output('{"results": []}') == []


def test_parse_semgrep_normal():
    sample_json = json.dumps({
        "results": [
            {
                "check_id": "python.lang.security.deserialization.pickle.avoid-pickle",
                "path": "app/worker.py",
                "start": {"line": 15, "col": 5},
                "end": {"line": 15, "col": 25},
                "extra": {
                    "message": "Avoid using `pickle` on untrusted input.",
                    "severity": "ERROR",
                    "metadata": {
                        "cwe": ["CWE-502: Deserialization of Untrusted Data"],
                        "owasp": ["A08:2021 - Software and Data Integrity Failures"],
                    },
                },
            },
            {
                "check_id": "python.flask.security.audit.hardcoded-config.hardcoded-secret-key",
                "path": "app/config.py",
                "start": {"line": 4, "col": 1},
                "end": {"line": 4, "col": 30},
                "extra": {
                    "message": "Hardcoded secret key detected.",
                    "severity": "WARNING",
                },
            },
        ]
    })

    findings = parse_semgrep_output(sample_json)
    assert len(findings) == 2

    # Finding 1
    f1 = findings[0]
    assert f1["scanner"] == "semgrep"
    assert f1["rule_id"] == "python.lang.security.deserialization.pickle.avoid-pickle"
    assert f1["severity"] == "high"
    assert f1["file_path"] == "app/worker.py"
    assert f1["start_line"] == 15
    assert f1["end_line"] == 15
    assert "CWE-502" in f1["description"]
    assert "A08:2021" in f1["description"]

    # Finding 2
    f2 = findings[1]
    assert f2["severity"] == "medium"
    assert f2["start_line"] == 4


def test_parse_semgrep_malformed():
    with pytest.raises(RuntimeError):
        parse_semgrep_output("Not JSON at all and no braces")


def test_parse_trivy_empty():
    assert parse_trivy_output("") == []
    assert parse_trivy_output('{"Results": []}') == []


def test_parse_trivy_vulnerabilities_and_misconfigs():
    sample_json = json.dumps({
        "Results": [
            {
                "Target": "requirements.txt",
                "Vulnerabilities": [
                    {
                        "VulnerabilityID": "CVE-2023-46136",
                        "PkgName": "werkzeug",
                        "InstalledVersion": "2.2.2",
                        "FixedVersion": "3.0.1",
                        "Severity": "HIGH",
                        "Title": "High memory usage with large form data",
                        "Description": "Werkzeug before 3.0.1 allows an attacker to cause high memory usage.",
                        "PrimaryURL": "https://avd.aquasec.com/nvd/cve-2023-46136",
                        "Locations": [{"StartLine": 12, "EndLine": 12}],
                    }
                ],
                "Misconfigurations": [
                    {
                        "ID": "AVD-DS-0002",
                        "Title": "Root user specified in Dockerfile",
                        "Description": "Running containers as root poses a security risk.",
                        "Severity": "MEDIUM",
                        "Message": "Specify a non-root user using the USER instruction",
                        "Resolution": "Add 'USER nonroot' to your Dockerfile",
                        "CauseMetadata": {"StartLine": 5, "EndLine": 5},
                    }
                ],
            }
        ]
    })

    findings = parse_trivy_output(sample_json)
    assert len(findings) == 2

    # Check SCA finding
    sca = next(f for f in findings if f["rule_id"] == "CVE-2023-46136")
    assert sca["scanner"] == "trivy"
    assert sca["severity"] == "high"
    assert "version 3.0.1" in sca["description"]
    assert sca["start_line"] == 12

    # Check Misconfig finding
    misconfig = next(f for f in findings if f["rule_id"] == "AVD-DS-0002")
    assert misconfig["scanner"] == "trivy"
    assert misconfig["severity"] == "medium"
    assert "[Misconfig]" in misconfig["title"]
    assert "USER nonroot" in misconfig["description"]
    assert misconfig["start_line"] == 5


def test_zip_slip_and_upload_hardening():
    # Register and create project
    email = f"zip_test_{Path(__file__).stem}@example.com"
    reg_res = client.post("/api/auth/register", json={"email": email, "password": "password123"})
    if reg_res.status_code == 201:
        token = client.post("/api/auth/login", json={"email": email, "password": "password123"}).json()["access_token"]
    else:
        token = client.post("/api/auth/login", json={"email": email, "password": "password123"}).json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    p_res = client.post("/api/projects", json={"name": "Zip Test Project"}, headers=headers)
    assert p_res.status_code == 201
    project_id = p_res.json()["id"]

    # 1. Test zip-slip archive rejection
    malicious_buf = io.BytesIO()
    with zipfile.ZipFile(malicious_buf, "w") as zf:
        zf.writestr("../../etc/passwd", "root:x:0:0:root")
    malicious_buf.seek(0)

    slip_res = client.post(
        f"/api/projects/{project_id}/upload",
        files={"file": ("malicious.zip", malicious_buf.getvalue(), "application/zip")},
        headers=headers,
    )
    assert slip_res.status_code == 400
    assert "Unsafe" in slip_res.json()["detail"] or "traversal" in slip_res.json()["detail"]

    # 2. Test non-zip file rejection
    text_buf = io.BytesIO(b"Hello world")
    txt_res = client.post(
        f"/api/projects/{project_id}/upload",
        files={"file": ("app.tar.gz", text_buf.getvalue(), "application/gzip")},
        headers=headers,
    )
    assert txt_res.status_code == 400
    assert "Only .zip" in txt_res.json()["detail"]

    # Clean up project
    del_res = client.delete(f"/api/projects/{project_id}", headers=headers)
    assert del_res.status_code == 204


def test_list_all_user_scans_endpoint():
    import uuid
    email = f"scans_api_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = client.post("/api/auth/register", json={"email": email, "password": "password123"})
    assert reg_res.status_code == 201
    token = client.post("/api/auth/login", json={"email": email, "password": "password123"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Query all scans for this new user -> should return empty list
    res = client.get("/api/scans", headers=headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    assert len(res.json()) == 0
