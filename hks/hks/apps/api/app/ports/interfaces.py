from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from typing import Any

from apps.api.app.schemas.common import DataSourceEnvelope
from apps.api.app.schemas.diagnosis import DiagnosisRequest, DiagnosisResult
from apps.api.app.schemas.trademark import (
    ApplicationDraftRequest,
    SubmissionGuideResult,
    TrademarkCheckRequest,
    TrademarkCheckResult,
)


class BasePortAdapter(ABC):
    port_name: str
    provider_name: str
    mode: str

    @abstractmethod
    def availability(self) -> tuple[bool, str | None]:
        raise NotImplementedError


class TrademarkSearchPort(BasePortAdapter, ABC):
    @abstractmethod
    def search(self, payload: TrademarkCheckRequest, trace_id: str) -> DataSourceEnvelope[TrademarkCheckResult]:
        raise NotImplementedError


class EnterpriseLookupPort(BasePortAdapter, ABC):
    @abstractmethod
    def lookup(self, company_name: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError


class PublicWebSearchPort(BasePortAdapter, ABC):
    @abstractmethod
    def search(self, query: str, trace_id: str) -> DataSourceEnvelope[list[dict[str, Any]]]:
        raise NotImplementedError


class KnowledgeBasePort(BasePortAdapter, ABC):
    @abstractmethod
    def retrieve(self, topic: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError


class LLMPort(BasePortAdapter, ABC):
    @abstractmethod
    def diagnose(
        self,
        payload: DiagnosisRequest,
        knowledge: dict[str, Any],
        trace_id: str,
    ) -> DataSourceEnvelope[DiagnosisResult]:
        raise NotImplementedError

    @abstractmethod
    def summarize_application(
        self,
        payload: ApplicationDraftRequest,
        trace_id: str,
    ) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def analyze_text(
        self,
        system_prompt: str,
        user_prompt: str,
        trace_id: str,
    ) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    async def diagnose_stream(
        self,
        payload: DiagnosisRequest,
        knowledge: dict[str, Any],
        trace_id: str,
    ) -> AsyncGenerator[str, None]:
        raise NotImplementedError

    @abstractmethod
    async def summarize_application_stream(
        self,
        payload: ApplicationDraftRequest,
        trace_id: str,
    ) -> AsyncGenerator[str, None]:
        raise NotImplementedError

    @abstractmethod
    async def analyze_text_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        trace_id: str,
    ) -> AsyncGenerator[str, None]:
        raise NotImplementedError

    @abstractmethod
    async def multi_turn_stream(
        self,
        messages: list[dict[str, str]],
        tools: list[dict],
        system_prompt: str,
        trace_id: str,
    ) -> AsyncGenerator[dict, None]:
        raise NotImplementedError


class DocumentRenderPort(BasePortAdapter, ABC):
    @abstractmethod
    def render_application(
        self,
        payload: ApplicationDraftRequest,
        summary: dict[str, Any],
        trace_id: str,
    ) -> tuple[str, str]:
        raise NotImplementedError


class NotificationPort(BasePortAdapter, ABC):
    @abstractmethod
    def send_email(self, to_email: str, subject: str, body: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError


class MonitoringPort(BasePortAdapter, ABC):
    @abstractmethod
    def scan(self, query: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def get_alerts(self, user_id: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError


class CompetitorPort(BasePortAdapter, ABC):
    @abstractmethod
    def track(self, company_name: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def compare(self, companies: list[str], trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError


class ContractReviewPort(BasePortAdapter, ABC):
    @abstractmethod
    def review(self, contract_text: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError


class PatentAssistPort(BasePortAdapter, ABC):
    @abstractmethod
    def assess(self, description: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError


class PolicyDigestPort(BasePortAdapter, ABC):
    @abstractmethod
    def digest(self, industry: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError


class DueDiligencePort(BasePortAdapter, ABC):
    @abstractmethod
    def investigate(self, company_name: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError


class SubmissionGuidePort(BasePortAdapter, ABC):
    @abstractmethod
    def guide(self, draft_id: str, trace_id: str) -> DataSourceEnvelope[SubmissionGuideResult]:
        raise NotImplementedError


class MatchingPort(BasePortAdapter, ABC):
    """Rerank provider candidates for a matching request."""

    @abstractmethod
    def rank(
        self,
        intent: dict[str, Any],
        profile_vector: dict[str, Any],
        candidates: list[dict[str, Any]],
        trace_id: str,
    ) -> DataSourceEnvelope[list[dict[str, Any]]]:
        raise NotImplementedError


class ComplianceAuditPort(BasePortAdapter, ABC):
    """Produce a full IP compliance audit for an enterprise."""

    @abstractmethod
    def audit(
        self,
        company: dict[str, Any],
        assets: list[dict[str, Any]],
        trace_id: str,
    ) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError


class PaymentEscrowPort(BasePortAdapter, ABC):
    """Escrow payment API (mock for demo)."""

    @abstractmethod
    def hold(self, order_id: str, amount: int, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def release(self, order_id: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def refund(self, order_id: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError


class ESignaturePort(BasePortAdapter, ABC):
    """Electronic signature API (mock for demo)."""

    @abstractmethod
    def create_envelope(
        self,
        order_id: str,
        template_id: str,
        signers: list[dict[str, Any]],
        trace_id: str,
    ) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def status(self, envelope_id: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError


class LitigationPredictorPort(BasePortAdapter, ABC):
    """Predict IP litigation outcome, amount, duration and strategies for a case."""

    @abstractmethod
    def predict(
        self,
        case: dict[str, Any],
        trace_id: str,
    ) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def simulate(
        self,
        base: dict[str, Any],
        overrides: dict[str, Any],
        trace_id: str,
    ) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError
