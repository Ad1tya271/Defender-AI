from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional

class SnippetIn(BaseModel):
    filename: Optional[str] = None
    code: str

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    owner_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectStatsResponse(BaseModel):
    project_id: UUID
    name: str
    total_scans: int
    latest_scan_id: Optional[UUID] = None
    latest_scan_status: Optional[str] = None
    latest_security_score: Optional[int] = None
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0
    total_findings: int = 0
    last_scanned_at: Optional[datetime] = None

    class Config:
        from_attributes = True