import hashlib
import secrets
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.agent import AgentRegistration
from app.models.audit import AuditEvent
from app.models.finding import Finding
from app.models.project import Project
from app.models.scan import Scan
from app.models.user import User
from app.schemas.agent import (
    AgentHeartbeatRequest,
    AgentHeartbeatResponse,
    AgentJobItem,
    AgentJobResultSubmit,
    AgentRegisterRequest,
    AgentRegisterResponse,
    AgentResponse,
)

router = APIRouter(tags=["agents"])


def _hash_agent_key(raw_key: str) -> str:
    """Computes SHA-256 digest of the agent key for safe database storage."""
    return hashlib.sha256(raw_key.strip().encode("utf-8")).hexdigest()


def get_authenticated_agent(
    x_agent_key: Optional[str] = Header(None, alias="X-Agent-Key"),
    db: Session = Depends(get_db),
) -> AgentRegistration:
    """Authenticates a local scanner runner via the secret X-Agent-Key header."""
    if not x_agent_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Agent-Key authentication header",
        )

    key_hash = _hash_agent_key(x_agent_key)
    agent = (
        db.query(AgentRegistration)
        .filter(AgentRegistration.api_key_hash == key_hash)
        .first()
    )

    if not agent or agent.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked agent API key",
        )

    return agent


# ============================================================
# USER MANAGEMENT OF HYBRID AGENTS
# ============================================================

@router.post(
    "/api/agents/register",
    response_model=AgentRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_new_agent(
    payload: AgentRegisterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Registers a new hybrid scanning agent and generates an ephemeral secret key."""
    # Generate a cryptographically secure 256-bit agent secret key
    raw_secret = f"def_agent_{secrets.token_urlsafe(32)}"
    key_hash = _hash_agent_key(raw_secret)

    agent = AgentRegistration(
        user_id=current_user.id,
        agent_name=payload.agent_name,
        api_key_hash=key_hash,
        hostname=payload.hostname,
        os=payload.os,
        scanner_capabilities=payload.scanner_capabilities,
        status="active",
    )
    db.add(agent)
    db.flush()

    db.add(
        AuditEvent(
            user_id=current_user.id,
            action="agent_registered",
            resource_type="agent",
            resource_id=str(agent.id),
            details=f"Registered runner agent '{agent.agent_name}'",
        )
    )
    db.commit()
    db.refresh(agent)

    return AgentRegisterResponse(
        id=agent.id,
        agent_name=agent.agent_name,
        api_key=raw_secret,
        status=agent.status,
        created_at=agent.created_at,
    )


@router.get(
    "/api/agents",
    response_model=List[AgentResponse],
)
def list_user_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lists all registered hybrid agents owned by the user."""
    return (
        db.query(AgentRegistration)
        .filter(AgentRegistration.user_id == current_user.id)
        .order_by(AgentRegistration.created_at.desc())
        .all()
    )


@router.delete(
    "/api/agents/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def revoke_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revokes an agent registration so it can no longer communicate with the cloud."""
    agent = (
        db.query(AgentRegistration)
        .filter(AgentRegistration.id == agent_id, AgentRegistration.user_id == current_user.id)
        .first()
    )
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    agent.status = "revoked"
    db.add(
        AuditEvent(
            user_id=current_user.id,
            action="agent_revoked",
            resource_type="agent",
            resource_id=str(agent.id),
            details=f"Revoked runner agent '{agent.agent_name}'",
        )
    )
    db.commit()
    return None


# ============================================================
# AGENT GATEWAY (AUTHENTICATED VIA X-AGENT-KEY)
# ============================================================

@router.post(
    "/api/agent-gateway/heartbeat",
    response_model=AgentHeartbeatResponse,
)
def agent_heartbeat(
    payload: AgentHeartbeatRequest,
    agent: AgentRegistration = Depends(get_authenticated_agent),
    db: Session = Depends(get_db),
):
    """
    Heartbeat and polling endpoint for hybrid runners.
    Updates telemetry and delivers pending scan assignments for the agent's tenant.
    """
    agent.last_heartbeat = datetime.now(timezone.utc)
    if payload.hostname:
        agent.hostname = payload.hostname
    if payload.scanner_capabilities:
        agent.scanner_capabilities = payload.scanner_capabilities

    db.commit()

    # Discover queued jobs belonging to this tenant
    pending_scans = (
        db.query(Scan)
        .join(Project, Scan.project_id == Project.id)
        .filter(Project.owner_id == agent.user_id, Scan.status == "queued")
        .order_by(Scan.created_at.asc())
        .limit(5)
        .all()
    )

    jobs = [
        AgentJobItem(job_id=s.id, project_id=s.project_id, scanner=s.scanner or "all")
        for s in pending_scans
    ]

    return AgentHeartbeatResponse(
        status="ok",
        server_time=datetime.now(timezone.utc),
        pending_jobs=jobs,
    )


@router.post(
    "/api/agent-gateway/jobs/{job_id}/results",
)
def submit_agent_job_results(
    job_id: UUID,
    payload: AgentJobResultSubmit,
    agent: AgentRegistration = Depends(get_authenticated_agent),
    db: Session = Depends(get_db),
):
    """
    Ingests normalized scan metadata from the hybrid local runner.
    ZERO PROPRIETARY CODE TRANSMITTED: Only normalized vulnerability metadata is synced.
    """
    scan = (
        db.query(Scan)
        .join(Project, Scan.project_id == Project.id)
        .filter(Scan.id == job_id, Project.owner_id == agent.user_id)
        .first()
    )

    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan job not found or does not belong to this tenant",
        )

    # Ingest findings
    critical_count = 0
    high_count = 0
    medium_count = 0
    low_count = 0

    for item in payload.findings:
        sev = (item.severity or "low").lower()
        if sev == "critical":
            critical_count += 1
        elif sev == "high":
            high_count += 1
        elif sev == "medium":
            medium_count += 1
        else:
            low_count += 1

        finding = Finding(
            scan_id=scan.id,
            scanner=item.scanner,
            rule_id=item.rule_id,
            title=item.title,
            description=item.description,
            severity=sev,
            file_path=item.file_path,
            start_line=item.start_line,
            end_line=item.end_line,
        )
        db.add(finding)

    # Calculate score if not provided
    calculated_score = payload.security_score
    if calculated_score is None:
        penalty = (critical_count * 25) + (high_count * 15) + (medium_count * 5) + (low_count * 1)
        calculated_score = max(0, 100 - penalty)

    scan.status = payload.status
    scan.completed_at = datetime.now(timezone.utc)
    scan.critical_count = critical_count
    scan.high_count = high_count
    scan.medium_count = medium_count
    scan.low_count = low_count
    scan.total_findings = len(payload.findings)
    scan.security_score = calculated_score
    scan.summary = payload.summary or f"Scan executed by hybrid agent '{agent.agent_name}'"

    db.add(
        AuditEvent(
            user_id=agent.user_id,
            action="agent_results_submitted",
            resource_type="scan",
            resource_id=str(scan.id),
            details=f"Agent '{agent.agent_name}' submitted {len(payload.findings)} findings (Score: {calculated_score}/100)",
        )
    )

    db.commit()

    return {
        "success": True,
        "job_id": str(scan.id),
        "status": scan.status,
        "findings_ingested": len(payload.findings),
    }
