from pathlib import Path
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.finding import Finding
from app.models.project import Project
from app.models.scan import Scan
from app.models.user import User
from app.schemas.finding import FindingDetailResponse, FindingResponse
from app.services.ai.ollama_service import (
    FindingExplanation,
    RemediationSuggestion,
    ollama_service,
)


router = APIRouter(tags=["findings"])

WORKSPACE_ROOT = Path("scan-workspaces")


def extract_code_snippet(
    project_id: UUID,
    file_path: Optional[str],
    start_line: Optional[int],
    end_line: Optional[int],
    context: int = 5,
) -> Optional[str]:
    """Safely extracts the surrounding lines of code from the workspace."""

    if not file_path:
        return None

    # Workspace path
    source_dir = WORKSPACE_ROOT / str(project_id) / "source"
    full_path = (source_dir / file_path).resolve()

    # Path traversal safeguard
    if not str(full_path).startswith(str(source_dir.resolve())):
        fallback_path = (Path("test-scan-target") / file_path).resolve()

        if fallback_path.exists():
            full_path = fallback_path
        else:
            return None

    if not full_path.exists() or not full_path.is_file():
        # Fallback check
        fallback_path = (Path("test-scan-target") / file_path).resolve()

        if fallback_path.exists() and fallback_path.is_file():
            full_path = fallback_path
        else:
            return None

    try:
        with open(
            full_path,
            "r",
            encoding="utf-8",
            errors="replace",
        ) as f:
            lines = f.readlines()

        if not lines:
            return None

        if start_line is None:
            # Return first 30 lines if no specific line is given
            # e.g. requirements.txt
            return "".join(lines[:30])

        s_line = max(1, start_line - context)
        e_line = min(
            len(lines),
            (end_line or start_line) + context,
        )

        snippet_lines = []

        for line_num in range(s_line, e_line + 1):
            prefix = (
                " > "
                if start_line <= line_num <= (end_line or start_line)
                else "   "
            )

            snippet_lines.append(
                f"{prefix}{line_num:4d} | {lines[line_num - 1]}"
            )

        return "".join(snippet_lines)

    except Exception:
        return None


# ============================================================
# GET FINDING DETAILS
# ============================================================

@router.get(
    "/api/findings/{finding_id}",
    response_model=FindingDetailResponse,
)
def get_finding_detail(
    finding_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    finding = (
        db.query(Finding)
        .filter(Finding.id == finding_id)
        .first()
    )

    if not finding:
        raise HTTPException(
            status_code=404,
            detail="Finding not found",
        )

    scan = (
        db.query(Scan)
        .filter(Scan.id == finding.scan_id)
        .first()
    )

    if not scan:
        raise HTTPException(
            status_code=404,
            detail="Associated scan not found",
        )

    project = (
        db.query(Project)
        .filter(Project.id == scan.project_id)
        .first()
    )

    if not project or project.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to access this finding",
        )

    snippet = extract_code_snippet(
        project_id=project.id,
        file_path=finding.file_path,
        start_line=finding.start_line,
        end_line=finding.end_line,
    )

    finding_data = {
        "id": finding.id,
        "scan_id": finding.scan_id,
        "scanner": finding.scanner,
        "rule_id": finding.rule_id,
        "title": finding.title,
        "description": finding.description,
        "severity": finding.severity,
        "file_path": finding.file_path,
        "start_line": finding.start_line,
        "end_line": finding.end_line,
        "created_at": finding.created_at,
        "code_snippet": snippet,
    }

    return FindingDetailResponse(**finding_data)


# ============================================================
# GET FINDING CODE SNIPPET
# ============================================================

@router.get(
    "/api/findings/{finding_id}/snippet",
)
def get_finding_code_snippet(
    finding_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    finding = (
        db.query(Finding)
        .filter(Finding.id == finding_id)
        .first()
    )

    if not finding:
        raise HTTPException(
            status_code=404,
            detail="Finding not found",
        )

    scan = (
        db.query(Scan)
        .filter(Scan.id == finding.scan_id)
        .first()
    )

    if not scan:
        raise HTTPException(
            status_code=404,
            detail="Associated scan not found",
        )

    project = (
        db.query(Project)
        .filter(Project.id == scan.project_id)
        .first()
    )

    if not project or project.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to access this finding",
        )

    snippet = extract_code_snippet(
        project_id=project.id,
        file_path=finding.file_path,
        start_line=finding.start_line,
        end_line=finding.end_line,
    )

    return {
        "finding_id": finding.id,
        "file_path": finding.file_path,
        "start_line": finding.start_line,
        "end_line": finding.end_line,
        "code_snippet": snippet,
    }


# ============================================================
# GET SCAN FINDINGS
# ============================================================

@router.get(
    "/api/scans/{scan_id}/findings",
    response_model=List[FindingResponse],
)
@router.get(
    "/api/projects/{project_id}/scans/{scan_id}/findings",
    response_model=List[FindingResponse],
)
def get_scan_findings(
    scan_id: UUID,
    project_id: Optional[UUID] = None,
    severity: Optional[str] = Query(
        None,
        description="Filter by severity: critical, high, medium, low",
    ),
    scanner: Optional[str] = Query(
        None,
        description="Filter by scanner: semgrep, trivy",
    ),
    search: Optional[str] = Query(
        None,
        description="Search keyword in title, description, or file path",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scan = (
        db.query(Scan)
        .filter(Scan.id == scan_id)
        .first()
    )

    if not scan:
        raise HTTPException(
            status_code=404,
            detail="Scan not found",
        )

    project = (
        db.query(Project)
        .filter(Project.id == scan.project_id)
        .first()
    )

    if not project or project.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to view this scan",
        )

    query = (
        db.query(Finding)
        .filter(Finding.scan_id == scan_id)
    )

    if severity:
        query = query.filter(
            Finding.severity == severity.lower()
        )

    if scanner:
        query = query.filter(
            Finding.scanner == scanner.lower()
        )

    if search:
        search_pattern = f"%{search}%"

        query = query.filter(
            or_(
                Finding.title.ilike(search_pattern),
                Finding.description.ilike(search_pattern),
                Finding.file_path.ilike(search_pattern),
                Finding.rule_id.ilike(search_pattern),
            )
        )

    return query.order_by(
        Finding.created_at.desc()
    ).all()


# ============================================================
# AI: EXPLAIN FINDING
# ============================================================

@router.post(
    "/api/findings/{finding_id}/explain",
    response_model=FindingExplanation,
)
def explain_finding(
    finding_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Use local Ollama AI to explain a security finding."""

    finding = (
        db.query(Finding)
        .filter(Finding.id == finding_id)
        .first()
    )

    if not finding:
        raise HTTPException(
            status_code=404,
            detail="Finding not found",
        )

    scan = (
        db.query(Scan)
        .filter(Scan.id == finding.scan_id)
        .first()
    )

    if not scan:
        raise HTTPException(
            status_code=404,
            detail="Associated scan not found",
        )

    project = (
        db.query(Project)
        .filter(Project.id == scan.project_id)
        .first()
    )

    if not project or project.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to access this finding",
        )

    snippet = extract_code_snippet(
        project_id=project.id,
        file_path=finding.file_path,
        start_line=finding.start_line,
        end_line=finding.end_line,
    )

    if not snippet:
        raise HTTPException(
            status_code=400,
            detail="Code snippet could not be extracted for this finding",
        )

    try:
        explanation = ollama_service.explain_finding(
            finding=finding,
            code_snippet=snippet,
        )

        return explanation

    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"AI explanation failed: {str(exc)}",
        ) from exc


# ============================================================
# AI: REMEDIATE FINDING
# ============================================================

@router.post(
    "/api/findings/{finding_id}/remediate",
    response_model=RemediationSuggestion,
)
def remediate_finding(
    finding_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Use local Ollama AI to generate a remediation suggestion."""

    finding = (
        db.query(Finding)
        .filter(Finding.id == finding_id)
        .first()
    )

    if not finding:
        raise HTTPException(
            status_code=404,
            detail="Finding not found",
        )

    scan = (
        db.query(Scan)
        .filter(Scan.id == finding.scan_id)
        .first()
    )

    if not scan:
        raise HTTPException(
            status_code=404,
            detail="Associated scan not found",
        )

    project = (
        db.query(Project)
        .filter(Project.id == scan.project_id)
        .first()
    )

    if not project or project.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to access this finding",
        )

    snippet = extract_code_snippet(
        project_id=project.id,
        file_path=finding.file_path,
        start_line=finding.start_line,
        end_line=finding.end_line,
    )

    if not snippet:
        raise HTTPException(
            status_code=400,
            detail="Code snippet could not be extracted for this finding",
        )

    try:
        remediation = ollama_service.suggest_remediation(
            finding=finding,
            code_snippet=snippet,
        )

        return remediation

    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"AI remediation failed: {str(exc)}",
        ) from exc