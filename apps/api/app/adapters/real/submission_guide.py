from __future__ import annotations

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import SubmissionGuidePort
from apps.api.app.schemas.common import SourceRef
from apps.api.app.schemas.trademark import SubmissionGuideResult


class RealSubmissionGuideAdapter(SubmissionGuidePort):
    port_name = "submissionGuide"
    provider_name = "cnipa-guide"
    mode = "real"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def guide(self, draft_id: str, trace_id: str):
        result = SubmissionGuideResult(
            title="CNIPA 商标电子申请提交流程",
            steps=[
                "核对申请书信息与类别建议，确认申请人主体信息无误。",
                "登录国家知识产权局商标网上申请入口。",
                "按页面要求上传申请文件并逐项核对。",
                "由申请人自行确认并提交官方申报。",
            ],
            official_url="https://sbj.cnipa.gov.cn/",
            warning="A1+ 仅提供文件准备与引导，不代替用户向官方系统提交申报。",
        )

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="CNIPA 指引", url=result.official_url)],
            disclaimer="提交流程根据公开入口整理，仅供参考，以官方实际页面为准。",
            normalized_payload=result,
        )

