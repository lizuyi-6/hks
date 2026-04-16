from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from apps.api.app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    business_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    business_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    industry: Mapped[str | None] = mapped_column(String(120), nullable=True)
    stage: Mapped[str | None] = mapped_column(String(120), nullable=True)
    applicant_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    applicant_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    has_trademark: Mapped[bool | None] = mapped_column(default=False)
    has_patent: Mapped[bool | None] = mapped_column(default=False)
    ip_focus: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class JobRecord(Base):
    __tablename__ = "job_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    job_type: Mapped[str] = mapped_column(String(120), index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    run_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class IpAsset(Base):
    __tablename__ = "ip_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    owner_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    asset_type: Mapped[str] = mapped_column(String(64))
    registration_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_milestone: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_mode: Mapped[str] = mapped_column(String(16), default="real")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    reminders: Mapped[list["ReminderTask"]] = relationship(back_populates="asset")


class ReminderTask(Base):
    __tablename__ = "reminder_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("ip_assets.id", ondelete="CASCADE"))
    job_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("job_records.id"), nullable=True)
    channel: Mapped[str] = mapped_column(String(32), default="email")
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default="queued")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    asset: Mapped["IpAsset"] = relationship(back_populates="reminders")


class DocumentRecord(Base):
    __tablename__ = "document_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("job_records.id"))
    docx_path: Mapped[str] = mapped_column(String(255))
    pdf_path: Mapped[str] = mapped_column(String(255))
    document_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkflowInstance(Base):
    __tablename__ = "workflow_instances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    workflow_type: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    context: Mapped[dict] = mapped_column(JSON, default=dict)
    current_step_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    steps: Mapped[list["WorkflowStep"]] = relationship(back_populates="workflow")


class WorkflowStep(Base):
    __tablename__ = "workflow_steps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    workflow_id: Mapped[str] = mapped_column(String(36), ForeignKey("workflow_instances.id"))
    step_type: Mapped[str] = mapped_column(String(120))
    step_index: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    job_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("job_records.id"), nullable=True)
    input_data: Mapped[dict] = mapped_column(JSON, default=dict)
    output_data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    workflow: Mapped["WorkflowInstance"] = relationship(back_populates="steps")


class ModuleResult(Base):
    __tablename__ = "module_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    workflow_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("workflow_instances.id"), nullable=True)
    module_type: Mapped[str] = mapped_column(String(64))
    job_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("job_records.id"), nullable=True)
    result_data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
