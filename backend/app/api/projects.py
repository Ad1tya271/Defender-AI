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
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse

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
    return db.query(Project).filter(Project.owner_id == current_user.id).all()


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