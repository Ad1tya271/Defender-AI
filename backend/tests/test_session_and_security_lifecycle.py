import uuid
from datetime import datetime, timedelta, timezone
from jose import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import ALGORITHM, create_access_token
from app.database.session import SessionLocal
from app.main import app
from app.models.project import Project
from app.models.user import User

client = TestClient(app)


def test_expired_session_returns_401_on_protected_endpoints():
    """Verify that expired JWT tokens return 401 on protected endpoints."""
    user_id = str(uuid.uuid4())
    
    # Generate token expired 1 hour in the past
    expired_payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
    }
    expired_token = jwt.encode(expired_payload, settings.SECRET_KEY, algorithm=ALGORITHM)
    headers = {"Authorization": f"Bearer {expired_token}"}
    
    # 1. Projects endpoint
    res_proj = client.get("/api/projects", headers=headers)
    assert res_proj.status_code == 401
    assert "detail" in res_proj.json()
    
    # 2. Scans endpoint
    res_scans = client.get(f"/api/projects/{uuid.uuid4()}/scans", headers=headers)
    assert res_scans.status_code == 401
    
    # 3. Findings endpoint
    res_find = client.get(f"/api/scans/{uuid.uuid4()}/findings", headers=headers)
    assert res_find.status_code == 401


def test_fresh_token_validity_and_access():
    """Verify that a freshly generated token successfully authenticates."""
    email = f"fresh_user_{uuid.uuid4().hex[:8]}@example.com"
    pw = "StrongPass2026!"
    
    # Register and login
    reg_res = client.post("/api/auth/register", json={"email": email, "password": pw})
    assert reg_res.status_code == 201
    
    login_res = client.post("/api/auth/login", json={"email": email, "password": pw})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    
    # Decode token payload to ensure valid expiration
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    assert "sub" in payload
    assert payload["exp"] > datetime.now(timezone.utc).timestamp()
    
    # Authorized call
    auth_res = client.get("/api/projects", headers={"Authorization": f"Bearer {token}"})
    assert auth_res.status_code == 200
    assert isinstance(auth_res.json(), list)


def test_snippet_upload_and_sanitization():
    """Verify snippet ingestion safely handles code snippets without path traversal."""
    email = f"snippet_user_{uuid.uuid4().hex[:8]}@example.com"
    pw = "StrongPass2026!"
    
    reg_res = client.post("/api/auth/register", json={"email": email, "password": pw})
    assert reg_res.status_code == 201
    
    login_res = client.post("/api/auth/login", json={"email": email, "password": pw})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create project
    proj_res = client.post(
        "/api/projects",
        json={"name": "Vulnerable Demo Target", "description": "Testing scanner snippets"},
        headers=headers,
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["id"]
    
    # Upload sample code snippet
    snippet_code = "import sqlite3\ncur.execute(f'SELECT * FROM users WHERE id = {user_id}')\n"
    save_res = client.post(
        f"/api/projects/{proj_id}/snippet",
        json={"filename": "vulnerable_test_target.py", "code": snippet_code},
        headers=headers,
    )
    assert save_res.status_code == 200
    assert "Snippet saved" in save_res.json()["message"]
    
    # Path traversal in filename: the endpoint sanitizes to os.path.basename
    bad_filename_res = client.post(
        f"/api/projects/{proj_id}/snippet",
        json={"filename": "../../etc/passwd", "code": "malicious code"},
        headers=headers,
    )
    assert bad_filename_res.status_code == 200
    assert "filename" in bad_filename_res.json()
    assert "/" not in bad_filename_res.json()["filename"]
    assert ".." not in bad_filename_res.json()["filename"]
