from apps.api.app.schemas.common import ApiModel


class DiagnosisRequest(ApiModel):
    business_name: str | None = None
    business_description: str
    industry: str | None = None
    stage: str | None = None


class DiagnosisResult(ApiModel):
    summary: str
    priority_assets: list[str]
    risks: list[str]
    next_actions: list[str]
    recommended_track: str
    recommended_trademark_categories: list[str]
