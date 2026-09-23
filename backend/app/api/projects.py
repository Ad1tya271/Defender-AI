import shutil
import zipfile
from pathlib import Path
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.project import Project
from app.models.scan import Scan
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectStatsResponse

router = APIRouter(prefix="/api/projects", tags=["projects"])
WORKSPACE_ROOT = Path("scan-workspaces")


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    project_in: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_project = Project(
        name=project_in.name,
        description=project_in.description,
        owner_id=current_user.id,
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return new_project


@router.get("", response_model=List[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Project).filter(Project.owner_id == current_user.id).order_by(Project.created_at.desc()).all()


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    return project


@router.get("/{project_id}/stats", response_model=ProjectStatsResponse)
def get_project_stats(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")

    total_scans = db.query(Scan).filter(Scan.project_id == project_id).count()
    latest_scan = (
        db.query(Scan)
        .filter(Scan.project_id == project_id)
        .order_by(Scan.created_at.desc())
        .first()
    )

    stats = {
        "project_id": project.id,
        "name": project.name,
        "total_scans": total_scans,
        "latest_scan_id": latest_scan.id if latest_scan else None,
        "latest_scan_status": latest_scan.status if latest_scan else None,
        "latest_security_score": latest_scan.security_score if latest_scan else None,
        "critical_count": latest_scan.critical_count if latest_scan else 0,
        "high_count": latest_scan.high_count if latest_scan else 0,
        "medium_count": latest_scan.medium_count if latest_scan else 0,
        "low_count": latest_scan.low_count if latest_scan else 0,
        "total_findings": latest_scan.total_findings if latest_scan else 0,
        "last_scanned_at": latest_scan.completed_at or latest_scan.created_at if latest_scan else None,
    }

    return ProjectStatsResponse(**stats)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this project")

    # Clean project workspace on disk
    workspace_dir = WORKSPACE_ROOT / str(project_id)
    if workspace_dir.exists():
        shutil.rmtree(workspace_dir, ignore_errors=True)

    db.delete(project)
    db.commit()
    return None


@router.post("/{project_id}/upload", status_code=status.HTTP_200_OK)
def upload_project_archive(
    project_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to upload to this project")

    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted")

    project_workspace = WORKSPACE_ROOT / str(project_id)

    # Clean any previous upload for this project
    if project_workspace.exists():
        shutil.rmtree(project_workspace)
    project_workspace.mkdir(parents=True, exist_ok=True)

    zip_path = project_workspace / "upload.zip"
    with open(zip_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    extract_path = project_workspace / "source"
    extract_path.mkdir(exist_ok=True)

    try:
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            for member in zip_ref.namelist():
                member_path = extract_path / member
                # Zip-slip protection: reject anything that escapes extract_path
                if not str(member_path.resolve()).startswith(str(extract_path.resolve())):
                    raise HTTPException(status_code=400, detail="Unsafe path detected in archive")
            zip_ref.extractall(extract_path)
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid zip archive")

    zip_path.unlink()  # remove the raw zip, keep only extracted source

    return {"message": "Upload successful", "extracted_to": str(extract_path)}