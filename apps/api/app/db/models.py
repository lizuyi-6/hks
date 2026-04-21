from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from sqlalchemy import Column

from apps.api.app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    plan: Mapped[str] = mapped_column(String(32), default="free")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    tenant_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=True)
    role: Mapped[str] = mapped_column(String(32), default="member")
    business_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    business_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    industry: Mapped[str | None] = mapped_column(String(120), nullable=True)
    stage: Mapped[str | None] = mapped_column(String(120), nullable=True)
    applicant_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    applicant_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    has_trademark: Mapped[bool | None] = mapped_column(Boolean, default=False)
    has_patent: Mapped[bool | None] = mapped_column(Boolean, default=False)
    ip_focus: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class JobRecord(Base):
    __tablename__ = "job_records"
    __table_args__ = (
        # Composite index matching the hot worker query (status IN (...) AND run_after <= now)
        Index("ix_job_status_run_after", "status", "run_after"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=True)
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
    tenant_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=True)
    owner_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    asset_type: Mapped[str] = mapped_column(String(64))
    registration_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
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
    tenant_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=True)
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
    tenant_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    workflow_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("workflow_instances.id"), nullable=True)
    module_type: Mapped[str] = mapped_column(String(64))
    job_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("job_records.id"), nullable=True)
    result_data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SystemEvent(Base):
    __tablename__ = "system_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    event_type: Mapped[str] = mapped_column(String(120), index=True)
    source_entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    processed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AutomationRule(Base):
    __tablename__ = "automation_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    rule_key: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    trigger_type: Mapped[str] = mapped_column(String(32))
    trigger_config: Mapped[dict] = mapped_column(JSON, default=dict)
    condition_expr: Mapped[str | None] = mapped_column(String(512), nullable=True)
    action_type: Mapped[str] = mapped_column(String(64))
    action_config: Mapped[dict] = mapped_column(JSON, default=dict)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    category: Mapped[str] = mapped_column(String(64))
    priority: Mapped[str] = mapped_column(String(16))
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    action_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class MonitoringWatchlist(Base):
    __tablename__ = "monitoring_watchlist"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    keyword: Mapped[str] = mapped_column(String(255))
    item_type: Mapped[str] = mapped_column(String(32), default="keyword")
    frequency: Mapped[str] = mapped_column(String(16), default="weekly")
    status: Mapped[str] = mapped_column(String(16), default="active")
    alerts: Mapped[int] = mapped_column(Integer, default=0)
    last_hit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ============================================================================
# A1+ 2.0 — AI Legal Services Operating System
# ============================================================================


class LegalServiceProvider(Base):
    """Law firm / IP agency / individual lawyer (supply side)."""

    __tablename__ = "legal_service_providers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    provider_type: Mapped[str] = mapped_column(String(32), default="lawyer")
    name: Mapped[str] = mapped_column(String(255))
    short_intro: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    regions: Mapped[list] = mapped_column(JSON, default=list)
    practice_areas: Mapped[list] = mapped_column(JSON, default=list)
    languages: Mapped[list] = mapped_column(JSON, default=list)
    featured_tags: Mapped[list] = mapped_column(JSON, default=list)
    rating_avg: Mapped[float] = mapped_column(default=0.0)
    orders_count: Mapped[int] = mapped_column(Integer, default=0)
    response_sla_minutes: Mapped[int] = mapped_column(Integer, default=180)
    win_rate: Mapped[float] = mapped_column(default=0.0)
    hourly_rate_range: Mapped[str | None] = mapped_column(String(64), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Persisted bag-of-tags embedding so embedding recall doesn't recompute
    # per query. Keys are tokens (lowercased), values are weighted counts.
    # Empty dict → lazy-build on next query.
    tag_vec: Mapped[dict] = mapped_column(JSON, default=dict)
    tag_vec_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    credentials: Mapped[list["ProviderCredential"]] = relationship(back_populates="provider")
    products: Mapped[list["ServiceProduct"]] = relationship(back_populates="provider")


class ProviderCredential(Base):
    __tablename__ = "provider_credentials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    provider_id: Mapped[str] = mapped_column(String(36), ForeignKey("legal_service_providers.id", ondelete="CASCADE"))
    credential_type: Mapped[str] = mapped_column(String(64))
    credential_number: Mapped[str] = mapped_column(String(120))
    issuer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    provider: Mapped["LegalServiceProvider"] = relationship(back_populates="credentials")


class ServiceProduct(Base):
    """Productized legal service SKU."""

    __tablename__ = "service_products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    provider_id: Mapped[str] = mapped_column(String(36), ForeignKey("legal_service_providers.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[int] = mapped_column(Integer, default=0)
    price_mode: Mapped[str] = mapped_column(String(16), default="fixed")
    delivery_days: Mapped[int] = mapped_column(Integer, default=7)
    deliverables: Mapped[list] = mapped_column(JSON, default=list)
    spec: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="active")
    sold_count: Mapped[int] = mapped_column(Integer, default=0)
    rating_avg: Mapped[float] = mapped_column(default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    provider: Mapped["LegalServiceProvider"] = relationship(back_populates="products")


class UserProfileTag(Base):
    """Need-profile tags extracted from user behavior and AI tagging."""

    __tablename__ = "user_profile_tags"
    __table_args__ = (
        Index("ix_profile_user_tagtype", "user_id", "tag_type"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    tag_type: Mapped[str] = mapped_column(String(64))
    tag_value: Mapped[str] = mapped_column(String(255))
    confidence: Mapped[float] = mapped_column(default=0.8)
    source: Mapped[str] = mapped_column(String(64), default="system")
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MatchingRequest(Base):
    """One matching request — a user's legal service need."""

    __tablename__ = "matching_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    intent_category: Mapped[str] = mapped_column(String(64))
    raw_query: Mapped[str] = mapped_column(Text)
    budget_range: Mapped[str | None] = mapped_column(String(64), nullable=True)
    urgency: Mapped[str] = mapped_column(String(16), default="normal")
    region: Mapped[str | None] = mapped_column(String(64), nullable=True)
    profile_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    profile_vector: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="matched")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    candidates: Mapped[list["MatchingCandidate"]] = relationship(back_populates="request", cascade="all, delete-orphan")


class MatchingCandidate(Base):
    __tablename__ = "matching_candidates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    request_id: Mapped[str] = mapped_column(String(36), ForeignKey("matching_requests.id", ondelete="CASCADE"), index=True)
    provider_id: Mapped[str] = mapped_column(String(36), ForeignKey("legal_service_providers.id"))
    product_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("service_products.id"), nullable=True)
    score: Mapped[float] = mapped_column(default=0.0)
    rank: Mapped[int] = mapped_column(Integer, default=0)
    reasons: Mapped[list] = mapped_column(JSON, default=list)
    feedback: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    request: Mapped["MatchingRequest"] = relationship(back_populates="candidates")


class ConsultationSession(Base):
    """AI consultation that can hand off to a human lawyer."""

    __tablename__ = "consultation_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    provider_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("legal_service_providers.id"), nullable=True)
    topic: Mapped[str] = mapped_column(String(255))
    channel: Mapped[str] = mapped_column(String(32), default="ai")
    status: Mapped[str] = mapped_column(String(32), default="ai_active")
    ai_confidence: Mapped[float] = mapped_column(default=1.0)
    handoff_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ai_handoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    transcript: Mapped[list] = mapped_column(JSON, default=list)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ServiceOrder(Base):
    """User-to-provider service order (end-to-end service digitization)."""

    __tablename__ = "service_orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    order_no: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    provider_id: Mapped[str] = mapped_column(String(36), ForeignKey("legal_service_providers.id"), index=True)
    product_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("service_products.id"), nullable=True)
    matching_request_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("matching_requests.id"), nullable=True)
    consultation_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("consultation_sessions.id"), nullable=True)
    amount: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(8), default="CNY")
    status: Mapped[str] = mapped_column(String(32), default="pending_quote", index=True)
    escrow_status: Mapped[str] = mapped_column(String(32), default="idle")
    escrow_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    contract_envelope_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    contract_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    deliverables: Mapped[list] = mapped_column(JSON, default=list)
    milestones: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[dict] = mapped_column(JSON, default=dict)
    user_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_review: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provider_review: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ComplianceProfile(Base):
    """Enterprise compliance profile (tenant-scoped compliance SaaS)."""

    __tablename__ = "compliance_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=True, index=True)
    owner_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    company_name: Mapped[str] = mapped_column(String(255))
    industry: Mapped[str | None] = mapped_column(String(120), nullable=True)
    scale: Mapped[str | None] = mapped_column(String(64), nullable=True)
    asset_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    compliance_score: Mapped[int] = mapped_column(Integer, default=0)
    score_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    risk_heatmap: Mapped[dict] = mapped_column(JSON, default=dict)
    last_audit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    subscription_tier: Mapped[str] = mapped_column(String(16), default="free")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    findings: Mapped[list["ComplianceFinding"]] = relationship(back_populates="profile", cascade="all, delete-orphan")


class ComplianceFinding(Base):
    __tablename__ = "compliance_findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    profile_id: Mapped[str] = mapped_column(String(36), ForeignKey("compliance_profiles.id", ondelete="CASCADE"), index=True)
    severity: Mapped[str] = mapped_column(String(16))
    category: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    remediation: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommended_products: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default="open")
    job_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("job_records.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    profile: Mapped["ComplianceProfile"] = relationship(back_populates="findings")


class PolicySubscription(Base):
    """用户订阅的政策 / 行业雷达，用于合规 SaaS 与定向推送。"""

    __tablename__ = "policy_subscriptions"
    __table_args__ = (
        Index("ix_policy_sub_user_topic", "user_id", "topic"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    industry: Mapped[str | None] = mapped_column(String(120), nullable=True)
    topic: Mapped[str] = mapped_column(String(120))  # e.g. "商标新规" / "跨境合规" / "数据安全"
    frequency: Mapped[str] = mapped_column(String(16), default="weekly")  # daily / weekly / on_change
    channels: Mapped[list] = mapped_column(JSON, default=list)  # ["inapp", "email", "wechat"]
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProviderLead(Base):
    """Lead visible to providers (drives 精准获客)."""

    __tablename__ = "provider_leads"
    __table_args__ = (
        Index("ix_lead_provider_status", "provider_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    provider_id: Mapped[str] = mapped_column(String(36), ForeignKey("legal_service_providers.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    matching_request_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("matching_requests.id"), nullable=True)
    assignee_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("firm_members.id"), nullable=True, index=True)
    score: Mapped[float] = mapped_column(default=0.0)
    temperature: Mapped[str] = mapped_column(String(16), default="warm")
    status: Mapped[str] = mapped_column(String(32), default="new")
    snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FirmMember(Base):
    """律所 / 代理机构内的成员账号，用于组内线索分配与协作。"""

    __tablename__ = "firm_members"
    __table_args__ = (
        Index("ix_firm_member_provider_active", "provider_id", "active"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    provider_id: Mapped[str] = mapped_column(String(36), ForeignKey("legal_service_providers.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(32), default="associate")  # partner / associate / paralegal / admin
    specialties: Mapped[list] = mapped_column(JSON, default=list)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    active_leads: Mapped[int] = mapped_column(Integer, default=0)
    closed_leads: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ============================================================================
# Litigation Intelligence — IP 诉讼风险预测与策略推演
# ============================================================================


class LitigationCase(Base):
    """A user's litigation / dispute case submitted for AI risk prediction."""

    __tablename__ = "litigation_cases"
    __table_args__ = (
        Index("ix_litcase_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    case_type: Mapped[str] = mapped_column(String(32), index=True)
    role: Mapped[str] = mapped_column(String(16))
    jurisdiction: Mapped[str | None] = mapped_column(String(64), nullable=True)
    summary: Mapped[str] = mapped_column(Text)
    party_scale: Mapped[str | None] = mapped_column(String(32), nullable=True)
    evidence_score: Mapped[int] = mapped_column(Integer, default=5)
    claim_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    extras: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    predictions: Mapped[list["LitigationPrediction"]] = relationship(
        back_populates="case", cascade="all, delete-orphan"
    )


class LitigationPrediction(Base):
    """A frozen AI prediction snapshot for a case."""

    __tablename__ = "litigation_predictions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("litigation_cases.id", ondelete="CASCADE"), index=True)
    win_probability: Mapped[float] = mapped_column(default=0.5)
    risk_level: Mapped[str] = mapped_column(String(16), default="medium")
    money_low: Mapped[int] = mapped_column(Integer, default=0)
    money_high: Mapped[int] = mapped_column(Integer, default=0)
    money_currency: Mapped[str] = mapped_column(String(8), default="CNY")
    duration_days_low: Mapped[int] = mapped_column(Integer, default=60)
    duration_days_high: Mapped[int] = mapped_column(Integer, default=180)
    strategies: Mapped[list] = mapped_column(JSON, default=list)
    evidence_checklist: Mapped[list] = mapped_column(JSON, default=list)
    probability_factors: Mapped[list] = mapped_column(JSON, default=list)
    headline: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_mode: Mapped[str] = mapped_column(String(16), default="real")
    trace_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    case: Mapped["LitigationCase"] = relationship(back_populates="predictions")
    scenarios: Mapped[list["LitigationScenario"]] = relationship(
        back_populates="prediction", cascade="all, delete-orphan"
    )
    precedents: Mapped[list["LitigationPrecedent"]] = relationship(
        back_populates="prediction", cascade="all, delete-orphan"
    )


class LitigationScenario(Base):
    """An on-the-fly what-if scenario derived from a base prediction."""

    __tablename__ = "litigation_scenarios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    prediction_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("litigation_predictions.id", ondelete="CASCADE"), index=True
    )
    overrides: Mapped[dict] = mapped_column(JSON, default=dict)
    adjusted_probability: Mapped[float] = mapped_column(default=0.0)
    delta: Mapped[float] = mapped_column(default=0.0)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    prediction: Mapped["LitigationPrediction"] = relationship(back_populates="scenarios")


class LitigationPrecedent(Base):
    """A similar precedent case anchored to a prediction."""

    __tablename__ = "litigation_precedents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    prediction_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("litigation_predictions.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(255))
    case_no: Mapped[str | None] = mapped_column(String(120), nullable=True)
    court: Mapped[str | None] = mapped_column(String(120), nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(32), nullable=True)
    similarity: Mapped[float] = mapped_column(default=0.0)
    takeaway: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    prediction: Mapped["LitigationPrediction"] = relationship(back_populates="precedents")
