from __future__ import annotations

from abc import ABC, abstractmethod
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


class SubmissionGuidePort(BasePortAdapter, ABC):
    @abstractmethod
    def guide(self, draft_id: str, trace_id: str) -> DataSourceEnvelope[SubmissionGuideResult]:
        raise NotImplementedError
