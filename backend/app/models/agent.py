from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database.session import Base


class AgentRegistration(Base):
    __tablename__ = "agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_name = Column(String, nullable=False)
    api_key_hash = Column(String, nullable=False, unique=True, index=True)
    status = Column(String, nullable=False, default="active", index=True)  # active, offline, revoked
    hostname = Column(String, nullable=True)
    os = Column(String, nullable=True)
    scanner_capabilities = Column(String, nullable=True, default="semgrep,trivy")
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", backref="agents")
