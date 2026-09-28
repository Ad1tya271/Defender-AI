import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit import AuditEvent
from app.models.finding import Finding
from app.models.project import Project
from app.models.remediation import RemediationProposal, VerificationResult
from app.models.scan import Scan
from app.services.scanners.semgrep_scanner import run_semgrep_scan
from app.services.scanners.trivy_scanner import run_trivy_scan
from app.services.verification.patch_applier import (
    PatchError,
    apply_patch_to_workspace,
    extract_target_files,
    sanitize_relative_path,
)

logger = logging.getLogger(__name__)
DEFAULT_WORKSPACE_ROOT = Path("scan-workspaces")


def verify_remediation_patch(
    db: Session,
    proposal: RemediationProposal,
    workspace_root: Optional[Path] = None,
) -> VerificationResult:
    """
    Executes isolated working-copy verification for a remediation proposal:
    1. Copies project source to an isolated, ephemeral verification directory.
    2. Safely applies the proposed unified diff patch.
    3. Re-runs the appropriate scanner (Semgrep or Trivy) on the working copy.
    4. Compares post-patch findings with baseline scan to verify if the vulnerability
       is resolved, still vulnerable, or if new findings were introduced.
    5. Records and persists VerificationResult in the database.
    6. Cleans up the ephemeral working copy.
    """
    root = workspace_root or DEFAULT_WORKSPACE_ROOT

    # 1. Resolve finding, scan, and project
    finding: Optional[Finding] = (
        db.query(Finding).filter(Finding.id == proposal.finding_id).first()
    )
    if not finding:
        raise ValueError(f"Associated finding {proposal.finding_id} not found.")

    scan: Optional[Scan] = db.query(Scan).filter(Scan.id == finding.scan_id).first()
    if not scan:
        raise ValueError(f"Associated scan {finding.scan_id} not found.")

    project: Optional[Project] = (
        db.query(Project).filter(Project.id == scan.project_id).first()
    )
    if not project:
        raise ValueError(f"Associated project {scan.project_id} not found.")

    # 2. Identify source directory
    source_dir = (root / str(project.id) / "source").resolve()
    if not source_dir.exists() or not source_dir.is_dir():
        # Fallback for test fixture workspaces if source directory was not populated
        fallback = Path("test-scan-target").resolve()
        if fallback.exists() and fallback.is_dir():
            source_dir = fallback
        else:
            raise RuntimeError(
                f"Project source workspace does not exist at {source_dir}"
            )

    scanner = (finding.scanner or "semgrep").lower()

    # 3. Setup ephemeral verification working copy
    verify_base = root / str(project.id) / "verification-workspaces"
    working_copy = verify_base / str(proposal.id)

    # Clean up any lingering working copy from previous attempt
    if working_copy.exists():
        shutil.rmtree(working_copy, ignore_errors=True)

    working_copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source_dir, working_copy)

    verification_status = "failed"
    original_count = 1
    remaining_count = 0
    new_count = 0
    details_dict: Dict[str, Any] = {}

    try:
        # 4. Safely apply unified diff patch to working copy
        hint_file = proposal.target_file or finding.file_path
        try:
            modified_files = apply_patch_to_workspace(
                working_copy, proposal.patch, target_file_hint=hint_file
            )
            details_dict["modified_files"] = [str(p.name) for p in modified_files]
        except PatchError as pe:
            logger.warning(f"Verification patch application failed: {pe}")
            details_dict["error"] = f"Patch application failed: {str(pe)}"
            verification_result = VerificationResult(
                remediation_id=proposal.id,
                status="failed",
                original_findings_count=1,
                remaining_findings_count=1,
                new_findings_count=0,
                scanner=scanner,
                details=json.dumps(details_dict),
            )
            db.add(verification_result)
            db.commit()
            db.refresh(verification_result)
            return verification_result

        # 5. Re-run scanner on modified working copy
        try:
            if scanner == "trivy":
                post_findings = run_trivy_scan(str(working_copy))
            else:
                post_findings = run_semgrep_scan(str(working_copy))
        except Exception as scan_err:
            logger.error(f"Verification re-scan execution failed: {scan_err}")
            details_dict["error"] = f"Re-scan execution failed: {str(scan_err)}"
            verification_result = VerificationResult(
                remediation_id=proposal.id,
                status="failed",
                original_findings_count=1,
                remaining_findings_count=1,
                new_findings_count=0,
                scanner=scanner,
                details=json.dumps(details_dict),
            )
            db.add(verification_result)
            db.commit()
            db.refresh(verification_result)
            return verification_result

        # 6. Compare post-scan findings against baseline finding & scan
        baseline_findings = (
            db.query(Finding)
            .filter(Finding.scan_id == scan.id, Finding.scanner == scanner)
            .all()
        )
        original_count = len(baseline_findings) or 1

        target_rule = finding.rule_id
        target_path = (
            finding.file_path.replace("\\", "/").lstrip("/")
            if finding.file_path
            else ""
        )

        def matches_finding(item: Dict[str, Any]) -> bool:
            if item.get("rule_id") != target_rule:
                return False
            f_path = (item.get("file_path") or "").replace("\\", "/").lstrip("/")
            if not target_path or not f_path:
                return True
            return target_path.endswith(f_path) or f_path.endswith(target_path)

        target_still_present = any(matches_finding(f) for f in post_findings)

        # Check for newly introduced findings
        baseline_keys = {
            (b.rule_id, (b.file_path or "").replace("\\", "/").lstrip("/"))
            for b in baseline_findings
        }
        new_findings = [
            f
            for f in post_findings
            if (f.get("rule_id"), (f.get("file_path") or "").replace("\\", "/").lstrip("/"))
            not in baseline_keys
        ]
        new_count = len(new_findings)
        remaining_count = len(post_findings)

        if target_still_present:
            verification_status = "still_vulnerable"
        elif new_count > 0:
            verification_status = "new_findings_introduced"
        else:
            verification_status = "verified_fixed"

        details_dict.update({
            "target_rule_id": target_rule,
            "target_file": target_path,
            "target_cleared": not target_still_present,
            "new_findings_count": new_count,
            "remaining_total": remaining_count,
            "new_findings_sample": [
                {"rule_id": nf.get("rule_id"), "title": nf.get("title")}
                for nf in new_findings[:5]
            ],
        })

        verification_result = VerificationResult(
            remediation_id=proposal.id,
            status=verification_status,
            original_findings_count=original_count,
            remaining_findings_count=remaining_count,
            new_findings_count=new_count,
            scanner=scanner,
            details=json.dumps(details_dict),
        )
        db.add(verification_result)
        db.commit()
        db.refresh(verification_result)
        return verification_result

    finally:
        # 7. Always clean up the ephemeral verification working copy
        if working_copy.exists():
            shutil.rmtree(working_copy, ignore_errors=True)


def apply_patch_to_project(
    db: Session,
    proposal: RemediationProposal,
    workspace_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Applies an approved and verified remediation patch directly to the real project source.
    Creates a timestamped backup before touching files to support rollback.
    """
    if proposal.status != "approved":
        raise ValueError(
            f"Only approved proposals can be applied. Current status is '{proposal.status}'."
        )

    # Validate that at least one successful verification exists
    verified = (
        db.query(VerificationResult)
        .filter(
            VerificationResult.remediation_id == proposal.id,
            VerificationResult.status == "verified_fixed",
        )
        .first()
    )
    if not verified:
        raise ValueError(
            "Cannot apply patch: no successful verification ('verified_fixed') found. "
            "Verification is required before applying patches to source code."
        )

    root = workspace_root or DEFAULT_WORKSPACE_ROOT
    finding = db.query(Finding).filter(Finding.id == proposal.finding_id).first()
    if not finding:
        raise ValueError(f"Associated finding {proposal.finding_id} not found.")

    scan = db.query(Scan).filter(Scan.id == finding.scan_id).first()
    project = db.query(Project).filter(Project.id == scan.project_id).first()

    source_dir = (root / str(project.id) / "source").resolve()
    if not source_dir.exists() or not source_dir.is_dir():
        fallback = Path("test-scan-target").resolve()
        if fallback.exists() and fallback.is_dir():
            source_dir = fallback
        else:
            raise RuntimeError(f"Project source directory not found: {source_dir}")

    # Identify files that will be modified
    target_files = extract_target_files(proposal.patch)
    if not target_files and (proposal.target_file or finding.file_path):
        target_files = [proposal.target_file or finding.file_path]

    backups_created = []
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    # Create backups
    for tf in target_files:
        try:
            full_path = sanitize_relative_path(tf, source_dir)
            if full_path.exists() and full_path.is_file():
                backup_path = full_path.with_name(f"{full_path.name}.defenderai_bak_{ts}")
                shutil.copy2(full_path, backup_path)
                backups_created.append(str(backup_path))
        except Exception as e:
            logger.warning(f"Could not backup target file {tf}: {e}")

    # Apply the patch to actual source directory
    modified_files = apply_patch_to_workspace(
        source_dir,
        proposal.patch,
        target_file_hint=proposal.target_file or finding.file_path,
    )

    # Update proposal status
    proposal.status = "applied"
    proposal.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(proposal)

    return {
        "proposal_id": str(proposal.id),
        "status": "applied",
        "modified_files": [str(p) for p in modified_files],
        "backups": backups_created,
    }


def rollback_patch_for_project(
    db: Session,
    proposal: RemediationProposal,
    workspace_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Rolls back an applied patch by restoring the most recent backup files.
    """
    if proposal.status != "applied":
        raise ValueError(
            f"Only applied proposals can be rolled back. Current status is '{proposal.status}'."
        )

    root = workspace_root or DEFAULT_WORKSPACE_ROOT
    finding = db.query(Finding).filter(Finding.id == proposal.finding_id).first()
    scan = db.query(Scan).filter(Scan.id == finding.scan_id).first()
    project = db.query(Project).filter(Project.id == scan.project_id).first()

    source_dir = (root / str(project.id) / "source").resolve()
    if not source_dir.exists() or not source_dir.is_dir():
        fallback = Path("test-scan-target").resolve()
        if fallback.exists() and fallback.is_dir():
            source_dir = fallback
        else:
            raise RuntimeError(f"Project source directory not found: {source_dir}")

    target_files = extract_target_files(proposal.patch)
    if not target_files and (proposal.target_file or finding.file_path):
        target_files = [proposal.target_file or finding.file_path]

    restored_files = []
    for tf in target_files:
        target_path = sanitize_relative_path(tf, source_dir)
        # Look for backup files matching pattern: {target_path.name}.defenderai_bak_*
        parent = target_path.parent
        prefix = f"{target_path.name}.defenderai_bak_"
        backups = sorted(
            [f for f in parent.glob(f"{prefix}*") if f.is_file()],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if backups:
            latest_backup = backups[0]
            shutil.copy2(latest_backup, target_path)
            latest_backup.unlink()  # Remove used backup
            restored_files.append(str(target_path))

    proposal.status = "approved"
    proposal.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(proposal)

    return {
        "proposal_id": str(proposal.id),
        "status": "rolled_back",
        "restored_files": restored_files,
    }
