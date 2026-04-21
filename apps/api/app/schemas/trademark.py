from apps.api.app.schemas.common import ApiModel


class TrademarkCheckRequest(ApiModel):
    trademark_name: str
    business_description: str
    applicant_name: str
    applicant_type: str
    categories: list[str]


class TrademarkFinding(ApiModel):
    name: str
    category: str
    similarity_score: int
    status: str
    note: str


class TrademarkCheckResult(ApiModel):
    risk_level: str
    summary: str
    recommendation: str
    suggested_categories: list[str]
    findings: list[TrademarkFinding]
    alternatives: list[str]


class ApplicationDraftRequest(ApiModel):
    trademark_name: str
    applicant_name: str
    applicant_type: str
    business_description: str
    categories: list[str]
    risk_level: str


class ApplicationDraftResult(ApiModel):
    draft_id: str
    trademark_name: str
    applicant_name: str
    categories: list[str]
    risk_level: str
    source_mode: str
    provider: str
    document_labels: list[str]
    download_endpoints: dict[str, str]


class SubmissionGuideResult(ApiModel):
    title: str
    steps: list[str]
    official_url: str
    warning: str
