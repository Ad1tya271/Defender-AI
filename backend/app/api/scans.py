from datetime import datetime
from pathlib import Path
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.finding import Finding
from app.models.project import Project
from app.models.scan import Scan
from app.models.user import User
from app.schemas.scan import ScanResponse
from app.services.scanners.semgrep_scanner import run_semgrep_scan
from app.services.scanners.trivy_scanner import run_trivy_scan

router = APIRouter(tags=["scans"])


@router.post("/api/projects/{project_id}/scans", response_model=ScanResponse, status_code=status.HTTP_201_CREATED)
def create_scan(
    project_id: UUID,
    scanner: Optional[str] = Query(None, description="Scanner type: 'all', 'semgrep', or 'trivy'"),
    body: Optional[dict] = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to scan this project")

    # Determine target workspace
    target_path = Path(f"scan-workspaces/{project_id}/source")
    if not target_path.exists():
        fallback_target = Path("test-scan-target")
        if fallback_target.exists():
            target_path = fallback_target
        else:
            raise HTTPException(
                status_code=400,
                detail="No uploaded source found for this project. Upload a project archive first.",
            )

    # Determine requested scanner (from query param or JSON body)
    body_scanner = body.get("scanner") if isinstance(body, dict) else None
    selected_scanner = (scanner or body_scanner or "all").lower()

    if selected_scanner not in ("all", "semgrep", "trivy"):
        raise HTTPException(status_code=400, detail="Invalid scanner. Choose 'all', 'semgrep', or 'trivy'.")

    scan = Scan(
        project_id=project.id,
        status="running",
        scanner=selected_scanner,
        started_at=datetime.utcnow(),
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    raw_findings = []
    errors = []

    # 1. Run Semgrep SAST if selected
    if selected_scanner in ("all", "semgrep"):
        try:
            semgrep_findings = run_semgrep_scan(str(target_path))
            raw_findings.extend(semgrep_findings)
        except Exception as e:
            errors.append(f"Semgrep: {str(e)}")

    # 2. Run Trivy SCA if selected
    if selected_scanner in ("all", "trivy"):
        try:
            trivy_findings = run_trivy_scan(str(target_path))
            raw_findings.extend(trivy_findings)
        except Exception as e:
            errors.append(f"Trivy: {str(e)}")

    if errors and not raw_findings and selected_scanner != "all":
        scan.status = "failed"
        scan.completed_at = datetime.utcnow()
        scan.summary = " | ".join(errors)
        db.commit()
        raise HTTPException(status_code=500, detail=scan.summary)

    critical = sum(1 for f in raw_findings if f.get("severity") == "critical")
    high = sum(1 for f in raw_findings if f.get("severity") == "high")
    medium = sum(1 for f in raw_findings if f.get("severity") == "medium")
    low = sum(1 for f in raw_findings if f.get("severity") in ("low", "informational"))
    total = len(raw_findings)

    # Security score calculation (0 - 100)
    penalty = (critical * 25) + (high * 15) + (medium * 5) + (low * 1)
    score = max(0, 100 - penalty)

    for f in raw_findings:
        finding = Finding(scan_id=scan.id, **f)
        db.add(finding)

    summary_text = f"Scan ({selected_scanner}) completed with {total} finding(s) ({critical} critical, {high} high, {medium} medium, {low} low)."
    if errors:
        summary_text += f" (Warnings: {'; '.join(errors)})"

    scan.status = "completed"
    scan.critical_count = critical
    scan.high_count = high
    scan.medium_count = medium
    scan.low_count = low
    scan.total_findings = total
    scan.security_score = score
    scan.summary = summary_text
    scan.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(scan)
    return scan


@router.get("/api/projects/{project_id}/scans", response_model=List[ScanResponse])
def list_scans(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")

    return db.query(Scan).filter(Scan.project_id == project_id).order_by(Scan.created_at.desc()).all()


@router.get("/api/projects/{project_id}/scans/{scan_id}", response_model=ScanResponse)
def get_project_scan(
    project_id: UUID,
    scan_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")

    scan = db.query(Scan).filter(Scan.id == scan_id, Scan.project_id == project_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.delete("/api/scans/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/api/projects/{project_id}/scans/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scan(
    scan_id: UUID,
    project_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    project = db.query(Project).filter(Project.id == scan.project_id).first()
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this scan")

    # Cascade delete findings
    db.query(Finding).filter(Finding.scan_id == scan_id).delete()
    db.delete(scan)
    db.commit()
    return None