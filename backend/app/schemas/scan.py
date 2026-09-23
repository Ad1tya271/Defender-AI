from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional

class ScanResponse(BaseModel):
    id: UUID
    project_id: UUID
    status: str
    scanner: str
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True