from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional


class ScanResponse(BaseModel):
    id: UUID
    project_id: UUID
    status: str
    scanner: Optional[str] = "semgrep"
    security_score: Optional[int] = None
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0
    total_findings: int = 0
    summary: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True