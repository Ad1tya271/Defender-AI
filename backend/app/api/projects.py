import shutil
import zipfile
from pathlib import Path
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.database.session import get_db
from app.models.audit import AuditEvent
from app.models.project import Project
from app.models.scan import Scan
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectStatsResponse, SnippetIn

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


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: UUID,
    project_in: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this project")

    project.name = project_in.name
    project.description = project_in.description
    db.commit()
    db.refresh(project)
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

    # Clean project workspace on disk
    workspace_dir = WORKSPACE_ROOT / str(project_id)
    if workspace_dir.exists():
        shutil.rmtree(workspace_dir, ignore_errors=True)

    db.delete(project)
    db.commit()
    return None


MAX_SNIPPET_CHARS = 200_000  # ~200KB of pasted text
MAX_ARCHIVE_FILES = 10_000
MAX_UNCOMPRESSED_BYTES = 250_000_000  # 250 MB max extracted


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

    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted")

    project_workspace = WORKSPACE_ROOT / str(project_id)

    # Clean any previous upload for this project
    if project_workspace.exists():
        shutil.rmtree(project_workspace, ignore_errors=True)
    project_workspace.mkdir(parents=True, exist_ok=True)

    zip_path = project_workspace / "upload.zip"
    total_bytes = 0

    try:
        with open(zip_path, "wb") as buffer:
            while chunk := file.file.read(65536):
                total_bytes += len(chunk)
                if total_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
                    buffer.close()
                    zip_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"Uploaded archive exceeds maximum size of {settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB",
                    )
                buffer.write(chunk)
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        zip_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to save upload archive: {str(e)}")

    extract_path = project_workspace / "source"
    extract_path.mkdir(exist_ok=True)

    try:
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            infolist = zip_ref.infolist()

            # Zip bomb checks
            if len(infolist) > MAX_ARCHIVE_FILES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Archive contains too many files ({len(infolist)} > {MAX_ARCHIVE_FILES})",
                )

            cumulative_uncompressed = sum(info.file_size for info in infolist)
            if cumulative_uncompressed > MAX_UNCOMPRESSED_BYTES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Archive uncompressed size exceeds limit ({cumulative_uncompressed} bytes > {MAX_UNCOMPRESSED_BYTES} bytes)",
                )

            resolved_extract = extract_path.resolve()

            for info in infolist:
                raw_name = info.filename
                # Disallow drive letters or rooted paths
                if raw_name.startswith(("/", "\\")) or (len(raw_name) > 1 and raw_name[1] == ":"):
                    raise HTTPException(status_code=400, detail="Unsafe absolute path detected in archive")

                # Disallow traversal parts
                path_parts = Path(raw_name).parts
                if ".." in path_parts:
                    raise HTTPException(status_code=400, detail="Path traversal component detected in archive")

                member_target = (extract_path / raw_name).resolve()
                if not str(member_target).startswith(str(resolved_extract)):
                    raise HTTPException(status_code=400, detail="Unsafe path detected in archive")

            zip_ref.extractall(extract_path)

    except zipfile.BadZipFile:
        zip_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid zip archive")
    except Exception as e:
        zip_path.unlink(missing_ok=True)
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=f"Archive extraction failed: {str(e)}")

    zip_path.unlink(missing_ok=True)  # remove raw zip, keep only extracted source

    # Audit log event
    audit_event = AuditEvent(
        user_id=current_user.id,
        action="project_archive_uploaded",
        resource_type="project",
        resource_id=str(project.id),
        details=f"Uploaded {file.filename} ({total_bytes} bytes)",
    )
    db.add(audit_event)
    db.commit()

    return {"message": "Upload successful", "extracted_to": str(extract_path)}


@router.post("/{project_id}/snippet", status_code=status.HTTP_200_OK)
def save_code_snippet(
    project_id: UUID,
    body: SnippetIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Save a pasted code snippet into the project's scan workspace as a single
    file, so the existing scan/findings/explain/remediate pipeline can run
    against it exactly as it would for an uploaded project.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this project")

    if not body.code or not body.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    if len(body.code) > MAX_SNIPPET_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Snippet is too large (max {MAX_SNIPPET_CHARS} characters)",
        )

    raw_name = (body.filename or "").strip().replace("\\", "/")
    safe_name = Path(raw_name).name if raw_name else ""
    if not safe_name or safe_name in (".", ".."):
        safe_name = "snippet.py"

    source_dir = WORKSPACE_ROOT / str(project_id) / "source"
    source_dir.mkdir(parents=True, exist_ok=True)

    target_path = (source_dir / safe_name).resolve()
    if not str(target_path).startswith(str(source_dir.resolve())):
        raise HTTPException(status_code=400, detail="Invalid filename")

    target_path.write_text(body.code, encoding="utf-8")

    # Audit log event
    audit_event = AuditEvent(
        user_id=current_user.id,
        action="snippet_saved",
        resource_type="project",
        resource_id=str(project.id),
        details=f"Saved snippet '{safe_name}' ({len(body.code)} chars)",
    )
    db.add(audit_event)
    db.commit()

    return {
        "message": "Snippet saved. Run a scan on this project to analyze it.",
        "filename": safe_name,
        "path": str(target_path),
        "size_bytes": target_path.stat().st_size,
    }