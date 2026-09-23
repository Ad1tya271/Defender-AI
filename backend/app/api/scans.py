from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime
from typing import List

from app.database.session import get_db
from app.models.project import Project
from app.models.scan import Scan
from app.models.finding import Finding
from app.models.user import User
from app.schemas.scan import ScanResponse
from app.schemas.finding import FindingResponse
from app.api.deps import get_current_user
from app.services.scanners.semgrep_scanner import run_semgrep_scan

router = APIRouter(tags=["scans"])

@router.post("/api/projects/{project_id}/scans", response_model=ScanResponse, status_code=status.HTTP_201_CREATED)
def create_scan(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to scan this project")

    scan = Scan(project_id=project.id, status="running", scanner="semgrep")
    db.add(scan)
    db.commit()
    db.refresh(scan)

    # NOTE: hardcoded test target for now — real upload-based path handling comes later
    target_path = "test-scan-target"

    try:
        raw_findings = run_semgrep_scan(target_path)
    except RuntimeError as e:
        scan.status = "failed"
        scan.completed_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")

    for f in raw_findings:
        finding = Finding(scan_id=scan.id, **f)
        db.add(finding)

    scan.status = "completed"
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
        raise HTTPException(status_code=403, detail="Not authorized to view this project")

    return db.query(Scan).filter(Scan.project_id == project_id).all()

@router.get("/api/scans/{scan_id}/findings", response_model=List[FindingResponse])
def get_scan_findings(
    scan_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    project = db.query(Project).filter(Project.id == scan.project_id).first()
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this scan")

    return db.query(Finding).filter(Finding.scan_id == scan_id).all()