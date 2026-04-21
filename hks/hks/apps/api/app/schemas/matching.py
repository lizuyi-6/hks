from __future__ import annotations

from apps.api.app.schemas.common import ApiModel


class MatchingRunRequest(ApiModel):
    raw_query: str
    top_k: int = 5


class MatchingFingerprint(ApiModel):
    intent_category: str
    urgency: str
    budget: str | None = None
    region: str | None = None
    tags: list[str] = []
    suggested_practice_areas: list[str] = []


class MatchingProviderCard(ApiModel):
    candidate_id: str
    rank: int
    score: float
    reasons: list[str] = []
    provider: dict
    product: dict | None = None


class MatchingRunResponse(ApiModel):
    request_id: str
    fingerprint: MatchingFingerprint
    candidates: list[MatchingProviderCard]
