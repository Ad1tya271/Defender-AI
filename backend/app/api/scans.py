from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.project import Project
from app.models.scan import Scan
from app.models.user import User
from app.schemas.scan import ScanResponse
from app.api.deps import get_current_user


router = APIRouter(
    prefix="/api/projects/{project_id}/scans",
    tags=["scans"],
)


@router.post(
    "",
    response_model=ScanResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_scan(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify that the project exists
    project = (
        db.query(Project)
        .filter(Project.id == project_id)
        .first()
    )

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    # Verify that the project belongs to the logged-in user
    if project.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to scan this project",
        )

    # Create a new scan
    new_scan = Scan(
        project_id=project_id,
        status="pending",
        started_at=datetime.utcnow(),
    )

    db.add(new_scan)
    db.commit()
    db.refresh(new_scan)

    return new_scan


@router.get(
    "",
    response_model=List[ScanResponse],
)
def list_scans(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify that the project exists
    project = (
        db.query(Project)
        .filter(Project.id == project_id)
        .first()
    )

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    # Verify ownership
    if project.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to access this project",
        )

    scans = (
        db.query(Scan)
        .filter(Scan.project_id == project_id)
        .order_by(Scan.created_at.desc())
        .all()
    )

    return scans


@router.get(
    "/{scan_id}",
    response_model=ScanResponse,
)
def get_scan(
    project_id: UUID,
    scan_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify project ownership
    project = (
        db.query(Project)
        .filter(Project.id == project_id)
        .first()
    )

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    if project.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to access this project",
        )

    scan = (
        db.query(Scan)
        .filter(
            Scan.id == scan_id,
            Scan.project_id == project_id,
        )
        .first()
    )

    if not scan:
        raise HTTPException(
            status_code=404,
            detail="Scan not found",
        )

    return scan