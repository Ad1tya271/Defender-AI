from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class AgentRegisterRequest(BaseModel):
    agent_name: str = Field(..., min_length=2, max_length=100)
    hostname: Optional[str] = None
    os: Optional[str] = None
    scanner_capabilities: Optional[str] = "semgrep,trivy"


class AgentRegisterResponse(BaseModel):
    id: UUID
    agent_name: str
    api_key: str  # Presented only once upon registration
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AgentResponse(BaseModel):
    id: UUID
    agent_name: str
    status: str
    hostname: Optional[str] = None
    os: Optional[str] = None
    scanner_capabilities: Optional[str] = None
    last_heartbeat: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AgentHeartbeatRequest(BaseModel):
    hostname: Optional[str] = None
    scanner_capabilities: Optional[str] = None


class AgentJobItem(BaseModel):
    job_id: UUID
    project_id: UUID
    scanner: str


class AgentHeartbeatResponse(BaseModel):
    status: str
    server_time: datetime
    pending_jobs: List[AgentJobItem] = []


class AgentFindingInput(BaseModel):
    scanner: str
    rule_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    severity: str
    file_path: Optional[str] = None
    start_line: Optional[int] = None
    end_line: Optional[int] = None


class AgentJobResultSubmit(BaseModel):
    status: str = Field(default="completed", description="'completed' or 'failed'")
    findings: List[AgentFindingInput] = []
    summary: Optional[str] = None
    security_score: Optional[int] = None
    error_message: Optional[str] = None
