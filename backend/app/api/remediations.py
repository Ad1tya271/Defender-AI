import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.audit import AuditEvent
from app.models.finding import Finding
from app.models.project import Project
from app.models.remediation import RemediationProposal, VerificationResult
from app.models.scan import Scan
from app.models.user import User
from app.schemas.remediation import (
    RemediationProposalCreate,
    RemediationProposalDetailResponse,
    RemediationProposalResponse,
    VerificationResultResponse,
)
from app.services.verification.verifier import (
    apply_patch_to_project,
    rollback_patch_for_project,
    verify_remediation_patch,
)

router = APIRouter(tags=["remediations"])


def _check_proposal_ownership(
    db: Session, proposal_id: UUID, user_id: UUID
) -> Tuple[RemediationProposal, Project]:
    """Helper ensuring current user owns the project containing this remediation proposal."""
    proposal = (
        db.query(RemediationProposal)
        .filter(RemediationProposal.id == proposal_id)
        .first()
    )
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Remediation proposal not found",
        )

    finding = db.query(Finding).filter(Finding.id == proposal.finding_id).first()
    if not finding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated finding not found",
        )

    scan = db.query(Scan).filter(Scan.id == finding.scan_id).first()
    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated scan not found",
        )

    project = db.query(Project).filter(Project.id == scan.project_id).first()
    if not project or project.owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this remediation proposal",
        )

    return proposal, project


# ============================================================
# CREATE REMEDIATION PROPOSAL FOR A FINDING
# ============================================================

@router.post(
    "/api/findings/{finding_id}/proposals",
    response_model=RemediationProposalResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_remediation_proposal(
    finding_id: UUID,
    payload: RemediationProposalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Saves an AI-suggested or analyst-created patch as a formal remediation proposal."""
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Finding not found",
        )

    scan = db.query(Scan).filter(Scan.id == finding.scan_id).first()
    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated scan not found",
        )

    project = db.query(Project).filter(Project.id == scan.project_id).first()
    if not project or project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to propose remediations for this finding",
        )

    proposal = RemediationProposal(
        finding_id=finding.id,
        user_id=current_user.id,
        explanation=payload.explanation,
        patch=payload.patch,
        target_file=payload.target_file or finding.file_path,
        status="proposed",
    )
    db.add(proposal)
    db.flush()

    db.add(
        AuditEvent(
            user_id=current_user.id,
            action="remediation_proposed",
            resource_type="remediation_proposal",
            resource_id=str(proposal.id),
            details=f"Created remediation proposal for finding '{finding.title}'",
        )
    )
    db.commit()
    db.refresh(proposal)
    return proposal


# ============================================================
# LIST PROPOSALS FOR A FINDING OR PROJECT
# ============================================================

@router.get(
    "/api/findings/{finding_id}/proposals",
    response_model=List[RemediationProposalResponse],
)
def list_finding_proposals(
    finding_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Finding not found",
        )

    scan = db.query(Scan).filter(Scan.id == finding.scan_id).first()
    project = db.query(Project).filter(Project.id == scan.project_id).first()
    if not project or project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access proposals for this finding",
        )

    return (
        db.query(RemediationProposal)
        .filter(RemediationProposal.finding_id == finding_id)
        .order_by(RemediationProposal.created_at.desc())
        .all()
    )


@router.get(
    "/api/projects/{project_id}/remediations",
    response_model=List[RemediationProposalResponse],
)
def list_project_remediations(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access project remediations",
        )

    return (
        db.query(RemediationProposal)
        .join(Finding, RemediationProposal.finding_id == Finding.id)
        .join(Scan, Finding.scan_id == Scan.id)
        .filter(Scan.project_id == project_id)
        .order_by(RemediationProposal.created_at.desc())
        .all()
    )


# ============================================================
# GET PROPOSAL DETAILS (WITH VERIFICATION HISTORY)
# ============================================================

@router.get(
    "/api/remediations/{proposal_id}",
    response_model=RemediationProposalDetailResponse,
)
def get_remediation_proposal_detail(
    proposal_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    proposal, _ = _check_proposal_ownership(db, proposal_id, current_user.id)
    return proposal


# ============================================================
# APPROVE PROPOSAL
# ============================================================

@router.post(
    "/api/remediations/{proposal_id}/approve",
    response_model=RemediationProposalResponse,
)
def approve_remediation_proposal(
    proposal_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    proposal, _ = _check_proposal_ownership(db, proposal_id, current_user.id)
    proposal.status = "approved"
    proposal.updated_at = datetime.now(timezone.utc)

    db.add(
        AuditEvent(
            user_id=current_user.id,
            action="remediation_approved",
            resource_type="remediation_proposal",
            resource_id=str(proposal.id),
            details=f"Approved remediation proposal {proposal.id}",
        )
    )
    db.commit()
    db.refresh(proposal)
    return proposal


# ============================================================
# REJECT PROPOSAL
# ============================================================

@router.post(
    "/api/remediations/{proposal_id}/reject",
    response_model=RemediationProposalResponse,
)
def reject_remediation_proposal(
    proposal_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    proposal, _ = _check_proposal_ownership(db, proposal_id, current_user.id)
    proposal.status = "rejected"
    proposal.updated_at = datetime.now(timezone.utc)

    db.add(
        AuditEvent(
            user_id=current_user.id,
            action="remediation_rejected",
            resource_type="remediation_proposal",
            resource_id=str(proposal.id),
            details=f"Rejected remediation proposal {proposal.id}",
        )
    )
    db.commit()
    db.refresh(proposal)
    return proposal


# ============================================================
# ISOLATED VERIFICATION OF PROPOSAL
# ============================================================

@router.post(
    "/api/remediations/{proposal_id}/verify",
    response_model=VerificationResultResponse,
)
def verify_proposal_patch(
    proposal_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Executes isolated working-copy verification:
    applies patch in ephemeral directory, re-scans, and confirms vulnerability resolution.
    """
    proposal, _ = _check_proposal_ownership(db, proposal_id, current_user.id)

    try:
        verification = verify_remediation_patch(db=db, proposal=proposal)

        db.add(
            AuditEvent(
                user_id=current_user.id,
                action="remediation_verified",
                resource_type="remediation_proposal",
                resource_id=str(proposal.id),
                details=f"Verification finished with status '{verification.status}'",
            )
        )
        db.commit()
        return verification

    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Verification execution failed: {str(e)}",
        )


# ============================================================
# APPLY VERIFIED & APPROVED PATCH TO SOURCE
# ============================================================

@router.post(
    "/api/remediations/{proposal_id}/apply",
)
def apply_remediation_patch(
    proposal_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Applies an approved and verified remediation patch directly to the real project source code.
    Creates safety backups before modifying any files.
    """
    proposal, _ = _check_proposal_ownership(db, proposal_id, current_user.id)

    try:
        result = apply_patch_to_project(db=db, proposal=proposal)

        db.add(
            AuditEvent(
                user_id=current_user.id,
                action="remediation_applied",
                resource_type="remediation_proposal",
                resource_id=str(proposal.id),
                details=json.dumps(result),
            )
        )
        db.commit()
        return result

    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply patch: {str(e)}",
        )


# ============================================================
# ROLLBACK APPLIED PATCH
# ============================================================

@router.post(
    "/api/remediations/{proposal_id}/rollback",
)
def rollback_remediation_patch(
    proposal_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rolls back an applied patch by restoring the safety backup file."""
    proposal, _ = _check_proposal_ownership(db, proposal_id, current_user.id)

    try:
        result = rollback_patch_for_project(db=db, proposal=proposal)

        db.add(
            AuditEvent(
                user_id=current_user.id,
                action="remediation_rolled_back",
                resource_type="remediation_proposal",
                resource_id=str(proposal.id),
                details=json.dumps(result),
            )
        )
        db.commit()
        return result

    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to rollback patch: {str(e)}",
        )
