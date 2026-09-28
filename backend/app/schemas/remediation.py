from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class VerificationResultResponse(BaseModel):
    id: UUID
    remediation_id: UUID
    status: str
    original_findings_count: int
    remaining_findings_count: int
    new_findings_count: int
    scanner: str
    details: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RemediationProposalCreate(BaseModel):
    explanation: str
    patch: str
    target_file: Optional[str] = None


class RemediationProposalResponse(BaseModel):
    id: UUID
    finding_id: UUID
    user_id: UUID
    explanation: str
    patch: str
    status: str
    target_file: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RemediationProposalDetailResponse(RemediationProposalResponse):
    verifications: List[VerificationResultResponse] = []
