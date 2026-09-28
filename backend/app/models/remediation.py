from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database.session import Base


class RemediationProposal(Base):
    __tablename__ = "remediation_proposals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    finding_id = Column(
        UUID(as_uuid=True),
        ForeignKey("findings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    explanation = Column(Text, nullable=False)
    patch = Column(Text, nullable=False)
    status = Column(
        String,
        nullable=False,
        default="proposed",
        index=True,
    )  # proposed, approved, rejected, applied
    target_file = Column(String, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    finding = relationship("Finding", backref="remediations")
    user = relationship("User", backref="remediations")
    verifications = relationship(
        "VerificationResult",
        back_populates="remediation",
        cascade="all, delete-orphan",
        order_by="VerificationResult.created_at.desc()",
    )


class VerificationResult(Base):
    __tablename__ = "verification_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    remediation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("remediation_proposals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(
        String,
        nullable=False,
        index=True,
    )  # verified_fixed, still_vulnerable, new_findings_introduced, failed
    original_findings_count = Column(Integer, nullable=False, default=0)
    remaining_findings_count = Column(Integer, nullable=False, default=0)
    new_findings_count = Column(Integer, nullable=False, default=0)
    scanner = Column(String, nullable=False)
    details = Column(Text, nullable=True)  # JSON-encoded comparison breakdown
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    remediation = relationship("RemediationProposal", back_populates="verifications")
