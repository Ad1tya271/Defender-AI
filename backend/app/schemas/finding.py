from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional

class FindingResponse(BaseModel):
    id: UUID
    scan_id: UUID
    scanner: str
    rule_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    severity: str
    file_path: Optional[str] = None
    start_line: Optional[int] = None
    end_line: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True