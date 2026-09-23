from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ScanCreate(BaseModel):
    project_id: UUID


class ScanResponse(BaseModel):
    id: UUID
    project_id: UUID
    status: str

    security_score: Optional[int] = None

    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    total_findings: int

    summary: Optional[str] = None

    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)