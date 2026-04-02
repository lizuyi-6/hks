from __future__ import annotations

from dataclasses import dataclass

from apps.api.app.adapters.mock.providers import (
    MockDocumentRenderAdapter,
    MockEnterpriseLookupAdapter,
    MockKnowledgeBaseAdapter,
    MockLlmAdapter,
    MockMonitoringAdapter,
    MockNotificationAdapter,
    MockPublicWebSearchAdapter,
    MockSubmissionGuideAdapter,
    MockTrademarkSearchAdapter,
)
from apps.api.app.adapters.real.document_render import RealDocumentRenderAdapter
from apps.api.app.adapters.real.enterprise_lookup import RealEnterpriseLookupAdapter
from apps.api.app.adapters.real.knowledge import RealKnowledgeBaseAdapter
from apps.api.app.adapters.real.llm import RealRuleLlmAdapter
from apps.api.app.adapters.real.monitoring import RealMonitoringAdapter
from apps.api.app.adapters.real.notification import RealNotificationAdapter
from apps.api.app.adapters.real.public_web_search import RealPublicWebSearchAdapter
from apps.api.app.adapters.real.submission_guide import RealSubmissionGuideAdapter
from apps.api.app.adapters.real.trademark_search import RealTrademarkSearchAdapter
from apps.api.app.core.config import get_settings


@dataclass
class ProviderHealthSnapshot:
    port: str
    mode: str
    provider: str
    available: bool
    reason: str | None


class ProviderRegistry:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.providers = {
            "trademarkSearch": {
                "real": RealTrademarkSearchAdapter(),
                "mock": MockTrademarkSearchAdapter(),
            },
            "enterpriseLookup": {
                "real": RealEnterpriseLookupAdapter(),
                "mock": MockEnterpriseLookupAdapter(),
            },
            "publicWebSearch": {
                "real": RealPublicWebSearchAdapter(),
                "mock": MockPublicWebSearchAdapter(),
            },
            "knowledgeBase": {
                "real": RealKnowledgeBaseAdapter(),
                "mock": MockKnowledgeBaseAdapter(),
            },
            "llm": {"real": RealRuleLlmAdapter(), "mock": MockLlmAdapter()},
            "documentRender": {
                "real": RealDocumentRenderAdapter(),
                "mock": MockDocumentRenderAdapter(),
            },
            "notification": {
                "real": RealNotificationAdapter(),
                "mock": MockNotificationAdapter(),
            },
            "monitoring": {"real": RealMonitoringAdapter(), "mock": MockMonitoringAdapter()},
            "submissionGuide": {
                "real": RealSubmissionGuideAdapter(),
                "mock": MockSubmissionGuideAdapter(),
            },
        }

    def mode_for(self, port: str) -> str:
        mapping = {
            "trademarkSearch": self.settings.provider_trademark_search_mode,
            "enterpriseLookup": self.settings.provider_enterprise_lookup_mode,
            "publicWebSearch": self.settings.provider_public_web_search_mode,
            "knowledgeBase": self.settings.provider_knowledge_base_mode,
            "llm": self.settings.provider_llm_mode,
            "documentRender": self.settings.provider_document_render_mode,
            "notification": self.settings.provider_notification_mode,
            "monitoring": self.settings.provider_monitoring_mode,
            "submissionGuide": self.settings.provider_submission_guide_mode,
        }
        return mapping[port]

    def get(self, port: str, mode: str | None = None):
        active_mode = mode or self.mode_for(port)
        provider = self.providers[port][active_mode]
        available, reason = provider.availability()
        if not available:
            raise RuntimeError(f"{port} provider unavailable: {reason}")
        return provider

    def health(self) -> list[ProviderHealthSnapshot]:
        snapshots: list[ProviderHealthSnapshot] = []
        for port, choices in self.providers.items():
            active_mode = self.mode_for(port)
            provider = choices[active_mode]
            available, reason = provider.availability()
            snapshots.append(
                ProviderHealthSnapshot(
                    port=port,
                    mode=active_mode,
                    provider=provider.provider_name,
                    available=available,
                    reason=reason,
                )
            )
        return snapshots


provider_registry = ProviderRegistry()
