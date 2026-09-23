from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime

from app.database.session import Base


class Scan(Base):
    __tablename__ = "scans"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False
    )

    status = Column(
        String,
        nullable=False,
        default="pending"
    )

    scanner = Column(
        String,
        nullable=False,
        default="semgrep"
    )

    security_score = Column(
        Integer,
        nullable=True
    )

    critical_count = Column(
        Integer,
        nullable=False,
        default=0
    )

    high_count = Column(
        Integer,
        nullable=False,
        default=0
    )

    medium_count = Column(
        Integer,
        nullable=False,
        default=0
    )

    low_count = Column(
        Integer,
        nullable=False,
        default=0
    )

    total_findings = Column(
        Integer,
        nullable=False,
        default=0
    )

    summary = Column(
        Text,
        nullable=True
    )

    started_at = Column(
        DateTime,
        nullable=True
    )

    completed_at = Column(
        DateTime,
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    project = relationship(
        "Project",
        backref="scans"
    )