from __future__ import annotations

from dataclasses import dataclass

from apps.api.app.adapters.real.competitor import RealCompetitorAdapter
from apps.api.app.adapters.real.compliance_audit import RealComplianceAuditAdapter
from apps.api.app.adapters.real.contract_review import RealContractReviewAdapter
from apps.api.app.adapters.real.document_render import RealDocumentRenderAdapter
from apps.api.app.adapters.real.due_diligence import RealDueDiligenceAdapter
from apps.api.app.adapters.real.enterprise_lookup import RealEnterpriseLookupAdapter
from apps.api.app.adapters.real.escrow import RealPaymentEscrowAdapter
from apps.api.app.adapters.real.esignature import RealESignatureAdapter
from apps.api.app.adapters.real.knowledge import RealKnowledgeBaseAdapter
from apps.api.app.adapters.real.litigation import RealLitigationPredictorAdapter
from apps.api.app.adapters.real.llm import RealLlmAdapter
from apps.api.app.adapters.real.matching import RealMatchingAdapter
from apps.api.app.adapters.real.matching_embedding import EmbeddingMatchingAdapter
from apps.api.app.adapters.real.monitoring import RealMonitoringAdapter
from apps.api.app.adapters.real.notification import RealNotificationAdapter
from apps.api.app.adapters.real.patent_assist import RealPatentAssistAdapter
from apps.api.app.adapters.real.policy_digest import RealPolicyDigestAdapter
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
    """Registry of real provider adapters.

    Mock adapters and per-port mode switching have been removed —— LLM is
    hardcoded to Doubao-Seed-2.0-pro and every other port is served by its
    real adapter.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        matching_adapter = (
            EmbeddingMatchingAdapter()
            if getattr(self.settings, "profile_matching_mode", "rules") == "embedding"
            else RealMatchingAdapter()
        )
        self.providers = {
            "trademarkSearch": RealTrademarkSearchAdapter(),
            "enterpriseLookup": RealEnterpriseLookupAdapter(),
            "publicWebSearch": RealPublicWebSearchAdapter(),
            "knowledgeBase": RealKnowledgeBaseAdapter(),
            "llm": RealLlmAdapter(),
            "documentRender": RealDocumentRenderAdapter(),
            "notification": RealNotificationAdapter(),
            "monitoring": RealMonitoringAdapter(),
            "submissionGuide": RealSubmissionGuideAdapter(),
            "competitor": RealCompetitorAdapter(),
            "contractReview": RealContractReviewAdapter(),
            "patentAssist": RealPatentAssistAdapter(),
            "policyDigest": RealPolicyDigestAdapter(),
            "dueDiligence": RealDueDiligenceAdapter(),
            "matching": matching_adapter,
            "complianceAudit": RealComplianceAuditAdapter(),
            "paymentEscrow": RealPaymentEscrowAdapter(),
            "eSignature": RealESignatureAdapter(),
            "litigationPredictor": RealLitigationPredictorAdapter(),
        }

    def mode_for(self, port: str) -> str:  # kept for backward compat
        return "real"

    def get(self, port: str, mode: str | None = None):
        provider = self.providers[port]
        available, reason = provider.availability()
        if not available:
            raise RuntimeError(f"{port} provider unavailable: {reason}")
        return provider

    def health(self) -> list[ProviderHealthSnapshot]:
        snapshots: list[ProviderHealthSnapshot] = []
        for port, provider in self.providers.items():
            available, reason = provider.availability()
            snapshots.append(
                ProviderHealthSnapshot(
                    port=port,
                    mode="real",
                    provider=provider.provider_name,
                    available=available,
                    reason=reason,
                )
            )
        return snapshots


provider_registry = ProviderRegistry()
