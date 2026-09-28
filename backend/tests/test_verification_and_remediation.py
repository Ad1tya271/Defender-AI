import json
import shutil
import tempfile
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.database.session import SessionLocal
from app.main import app
from app.models.audit import AuditEvent
from app.models.finding import Finding
from app.models.project import Project
from app.models.remediation import RemediationProposal, VerificationResult
from app.models.scan import Scan
from app.models.user import User
from app.services.verification.patch_applier import (
    PatchError,
    apply_patch_to_workspace,
    extract_target_files,
)
from app.services.verification.verifier import (
    apply_patch_to_project,
    rollback_patch_for_project,
    verify_remediation_patch,
)

client = TestClient(app)


# ============================================================
# 1. PATCH APPLIER UNIT TESTS
# ============================================================

def test_extract_target_files():
    diff = """--- a/src/db/query.py\n+++ b/src/db/query.py\n@@ -1,3 +1,3 @@\n"""
    targets = extract_target_files(diff)
    assert targets == ["src/db/query.py"]


def test_patch_applier_clean_application():
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        source_file = root / "app.py"
        source_file.write_text(
            "import os\n\ndef run_query(param):\n    query = 'SELECT * FROM users WHERE id=' + param\n    return query\n",
            encoding="utf-8",
        )

        patch_text = """--- a/app.py
+++ b/app.py
@@ -3,3 +3,3 @@
 def run_query(param):
-    query = 'SELECT * FROM users WHERE id=' + param
+    query = 'SELECT * FROM users WHERE id=?'
     return query
"""
        modified = apply_patch_to_workspace(root, patch_text)
        assert len(modified) == 1
        new_content = source_file.read_text(encoding="utf-8")
        assert "query = 'SELECT * FROM users WHERE id=?'" in new_content
        assert "WHERE id=' + param" not in new_content


def test_patch_applier_path_traversal_defense():
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        traversal_patch = """--- a/../../secret.txt
+++ b/../../secret.txt
@@ -1,1 +1,1 @@
-old
+evil
"""
        with pytest.raises(PatchError, match="Path traversal detected"):
            apply_patch_to_workspace(root, traversal_patch)


def test_patch_applier_context_mismatch():
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        source_file = root / "sample.py"
        source_file.write_text("print('hello world')\n", encoding="utf-8")

        mismatched_patch = """--- a/sample.py
+++ b/sample.py
@@ -1,1 +1,1 @@
-completely wrong context that does not exist in sample.py
+new line
"""
        with pytest.raises(PatchError, match="expected context not found"):
            apply_patch_to_workspace(root, mismatched_patch)


# ============================================================
# 2. VERIFIER SERVICE TESTS
# ============================================================

def test_verifier_isolated_cleanup_and_status_fixed():
    db = SessionLocal()
    temp_dir = tempfile.mkdtemp()
    workspace_root = Path(temp_dir)

    try:
        # Create user & project
        email = f"verifier_test_{uuid.uuid4().hex[:8]}@example.com"
        user = User(email=email, hashed_password="pw")
        db.add(user)
        db.commit()
        db.refresh(user)

        project = Project(name="Verifier Test App", owner_id=user.id)
        db.add(project)
        db.commit()
        db.refresh(project)

        # Setup real workspace directory
        proj_source = workspace_root / str(project.id) / "source"
        proj_source.mkdir(parents=True, exist_ok=True)
        vuln_file = proj_source / "vuln.py"
        vuln_file.write_text(
            "def query(uid):\n    return 'SELECT * FROM u WHERE id=' + uid\n",
            encoding="utf-8",
        )

        scan = Scan(project_id=project.id, status="completed")
        db.add(scan)
        db.commit()
        db.refresh(scan)

        finding = Finding(
            scan_id=scan.id,
            scanner="semgrep",
            rule_id="python.lang.security.audit.sqli",
            title="SQL Injection",
            severity="high",
            file_path="vuln.py",
        )
        db.add(finding)
        db.commit()
        db.refresh(finding)

        valid_patch = """--- a/vuln.py
+++ b/vuln.py
@@ -1,2 +1,2 @@
 def query(uid):
-    return 'SELECT * FROM u WHERE id=' + uid
+    return 'SELECT * FROM u WHERE id=?'
"""
        proposal = RemediationProposal(
            finding_id=finding.id,
            user_id=user.id,
            explanation="Use parameter binding.",
            patch=valid_patch,
            target_file="vuln.py",
            status="proposed",
        )
        db.add(proposal)
        db.commit()
        db.refresh(proposal)

        # Mock scanner re-run returning 0 findings
        with patch(
            "app.services.verification.verifier.run_semgrep_scan",
            return_value=[],
        ):
            res = verify_remediation_patch(
                db=db,
                proposal=proposal,
                workspace_root=workspace_root,
            )

            assert res.status == "verified_fixed"
            assert res.remaining_findings_count == 0
            assert res.new_findings_count == 0

            # Verify working copy was cleaned up (ephemeral guarantee)
            working_copy = workspace_root / str(project.id) / "verification-workspaces" / str(proposal.id)
            assert not working_copy.exists()

            # Verify original source was NOT modified during verification
            orig_content = vuln_file.read_text(encoding="utf-8")
            assert "WHERE id=' + uid" in orig_content

    finally:
        db.close()
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_verifier_still_vulnerable_and_regression():
    db = SessionLocal()
    temp_dir = tempfile.mkdtemp()
    workspace_root = Path(temp_dir)

    try:
        email = f"verifier_status_{uuid.uuid4().hex[:8]}@example.com"
        user = User(email=email, hashed_password="pw")
        db.add(user)
        db.commit()
        db.refresh(user)

        project = Project(name="Status Test App", owner_id=user.id)
        db.add(project)
        db.commit()
        db.refresh(project)

        proj_source = workspace_root / str(project.id) / "source"
        proj_source.mkdir(parents=True, exist_ok=True)
        (proj_source / "code.py").write_text("def test(): pass\n", encoding="utf-8")

        scan = Scan(project_id=project.id, status="completed")
        db.add(scan)
        db.commit()
        db.refresh(scan)

        finding = Finding(
            scan_id=scan.id,
            scanner="semgrep",
            rule_id="python.security.vuln1",
            title="Vuln 1",
            severity="high",
            file_path="code.py",
        )
        db.add(finding)
        db.commit()
        db.refresh(finding)

        patch_text = """--- a/code.py
+++ b/code.py
@@ -1,1 +1,1 @@
-def test(): pass
+def test(): return True
"""
        proposal = RemediationProposal(
            finding_id=finding.id,
            user_id=user.id,
            explanation="Dummy patch",
            patch=patch_text,
            target_file="code.py",
            status="proposed",
        )
        db.add(proposal)
        db.commit()
        db.refresh(proposal)

        # 1. Test Still Vulnerable
        with patch(
            "app.services.verification.verifier.run_semgrep_scan",
            return_value=[
                {"rule_id": "python.security.vuln1", "file_path": "code.py", "title": "Vuln 1"}
            ],
        ):
            res_still = verify_remediation_patch(db=db, proposal=proposal, workspace_root=workspace_root)
            assert res_still.status == "still_vulnerable"

        # 2. Test New Findings Introduced (Regression)
        with patch(
            "app.services.verification.verifier.run_semgrep_scan",
            return_value=[
                {"rule_id": "python.security.new_leak", "file_path": "code.py", "title": "New Leak"}
            ],
        ):
            res_new = verify_remediation_patch(db=db, proposal=proposal, workspace_root=workspace_root)
            assert res_new.status == "new_findings_introduced"
            assert res_new.new_findings_count == 1

    finally:
        db.close()
        shutil.rmtree(temp_dir, ignore_errors=True)


# ============================================================
# 3. REMEDIATION API LIFECYCLE TESTS (REST)
# ============================================================

def test_remediation_api_complete_lifecycle():
    db = SessionLocal()
    temp_dir = tempfile.mkdtemp()
    workspace_root = Path(temp_dir)

    try:
        # Create user
        email = f"lifecycle_user_{uuid.uuid4().hex[:8]}@example.com"
        user = User(email=email, hashed_password="pw")
        db.add(user)
        db.commit()
        db.refresh(user)

        # Create project
        project = Project(name="Lifecycle Project", owner_id=user.id)
        db.add(project)
        db.commit()
        db.refresh(project)

        # Setup source workspace
        proj_source = workspace_root / str(project.id) / "source"
        proj_source.mkdir(parents=True, exist_ok=True)
        target_file = proj_source / "handler.py"
        target_file.write_text("def handle():\n    return 'raw_data'\n", encoding="utf-8")

        # Create scan & finding
        scan = Scan(project_id=project.id, status="completed")
        db.add(scan)
        db.commit()
        db.refresh(scan)

        finding = Finding(
            scan_id=scan.id,
            scanner="semgrep",
            rule_id="sec.rule.1",
            title="Raw data leak",
            severity="medium",
            file_path="handler.py",
        )
        db.add(finding)
        db.commit()
        db.refresh(finding)

        token = create_access_token({"sub": str(user.id)})
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Propose remediation
        proposal_payload = {
            "explanation": "Sanitize return value",
            "patch": """--- a/handler.py
+++ b/handler.py
@@ -1,2 +1,2 @@
 def handle():
-    return 'raw_data'
+    return 'sanitized_data'
""",
            "target_file": "handler.py",
        }
        res_create = client.post(
            f"/api/findings/{finding.id}/proposals",
            json=proposal_payload,
            headers=headers,
        )
        assert res_create.status_code == 201
        prop_data = res_create.json()
        proposal_id = prop_data["id"]
        assert prop_data["status"] == "proposed"

        # 2. List proposals for project & finding
        res_list = client.get(f"/api/projects/{project.id}/remediations", headers=headers)
        assert res_list.status_code == 200
        assert len(res_list.json()) >= 1

        res_find_list = client.get(f"/api/findings/{finding.id}/proposals", headers=headers)
        assert res_find_list.status_code == 200
        assert len(res_find_list.json()) >= 1

        # 3. Attempt to apply without approval -> 400 Bad Request
        res_apply_premature = client.post(f"/api/remediations/{proposal_id}/apply", headers=headers)
        assert res_apply_premature.status_code == 400

        # 4. Approve proposal
        res_approve = client.post(f"/api/remediations/{proposal_id}/approve", headers=headers)
        assert res_approve.status_code == 200
        assert res_approve.json()["status"] == "approved"

        # 5. Attempt to apply without verification -> 400 Bad Request
        res_apply_unverified = client.post(f"/api/remediations/{proposal_id}/apply", headers=headers)
        assert res_apply_unverified.status_code == 400
        assert "no successful verification" in res_apply_unverified.json()["detail"]

        # 6. Verify proposal (mocking scanner)
        with patch("app.services.verification.verifier.DEFAULT_WORKSPACE_ROOT", workspace_root), \
             patch("app.services.verification.verifier.run_semgrep_scan", return_value=[]):
            res_verify = client.post(f"/api/remediations/{proposal_id}/verify", headers=headers)
            assert res_verify.status_code == 200
            assert res_verify.json()["status"] == "verified_fixed"

        # 7. Apply verified proposal to actual project source
        with patch("app.services.verification.verifier.DEFAULT_WORKSPACE_ROOT", workspace_root):
            res_apply = client.post(f"/api/remediations/{proposal_id}/apply", headers=headers)
            assert res_apply.status_code == 200
            apply_data = res_apply.json()
            assert apply_data["status"] == "applied"
            assert len(apply_data["backups"]) == 1

            # Check actual file was modified
            applied_content = target_file.read_text(encoding="utf-8")
            assert "return 'sanitized_data'" in applied_content

        # 8. Rollback applied patch
        with patch("app.services.verification.verifier.DEFAULT_WORKSPACE_ROOT", workspace_root):
            res_rollback = client.post(f"/api/remediations/{proposal_id}/rollback", headers=headers)
            assert res_rollback.status_code == 200
            assert res_rollback.json()["status"] == "rolled_back"

            # Check original content restored
            restored_content = target_file.read_text(encoding="utf-8")
            assert "return 'raw_data'" in restored_content

        # 9. Reject proposal
        res_reject = client.post(f"/api/remediations/{proposal_id}/reject", headers=headers)
        assert res_reject.status_code == 200
        assert res_reject.json()["status"] == "rejected"

        # 10. Verify audit event trace exists
        audits = (
            db.query(AuditEvent)
            .filter(AuditEvent.resource_id == str(proposal_id))
            .all()
        )
        actions = {a.action for a in audits}
        assert "remediation_proposed" in actions
        assert "remediation_approved" in actions
        assert "remediation_verified" in actions
        assert "remediation_applied" in actions
        assert "remediation_rolled_back" in actions
        assert "remediation_rejected" in actions

    finally:
        db.close()
        shutil.rmtree(temp_dir, ignore_errors=True)
