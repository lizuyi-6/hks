from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import httpx

from apps.api.app.adapters.base import make_envelope
from apps.api.app.core.config import get_settings
from apps.api.app.ports.interfaces import LLMPort
from apps.api.app.schemas.common import SourceRef
from apps.api.app.schemas.diagnosis import DiagnosisRequest, DiagnosisResult
from apps.api.app.schemas.trademark import ApplicationDraftRequest

logger = logging.getLogger(__name__)

DIAGNOSE_SYSTEM_PROMPT = """你是A1+ IP顾问。根据用户业务描述输出JSON：{"summary":"一段话","priority_assets":["资产列表"],"risks":["风险"],"next_actions":["行动"],"recommended_track":"trademark|copyright|patent","recommended_trademark_categories":["35","42"]}。商标：9=科技,35=商业,41=教育,42=软件,43=餐饮,44=医疗。"""

DIAGNOSE_USER_TEMPLATE = "公司：{business_name}，业务：{business_description}，行业：{industry}，阶段：{stage}。输出JSON。"

APPLICATION_SUMMARY_SYSTEM_PROMPT = """你是 A1+ IP Coworker 的申请书摘要助手。根据用户填写的商标申请信息，生成结构化的申请书摘要。

请输出 JSON 格式：
- summary: 一段话概述本次商标申请
- highlights: 字符串数组，列出申请书的要点

重要提醒：所有内容仅供参考，以官方为准。"""

APPLICATION_SUMMARY_USER_TEMPLATE = """为以下商标申请生成摘要：

商标名称：{trademark_name}
申请人：{applicant_name}
申请类别：{categories}
风险等级：{risk_level}
业务描述：{business_description}

请严格以 JSON 格式输出。"""


class _LLMClient:
    def __init__(self, provider: str, api_key: str, base_url: str, model: str):
        self.provider = provider
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    def chat(self, system_prompt: str, user_prompt: str) -> str:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 2048,
        }
        timeout = httpx.Timeout(60.0)
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def chat_stream(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        """Stream chat completion tokens from the LLM API."""
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 2048,
            "stream": True,
        }
        timeout = httpx.Timeout(60.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[len("data: "):]
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        content = chunk.get("choices", [{}])[0].get("delta", {}).get("content")
                        if content:
                            yield content
                    except (json.JSONDecodeError, IndexError, KeyError):
                        continue


def _build_client(settings) -> _LLMClient | None:
    if not settings.llm_api_key:
        return None

    if settings.llm_base_url:
        return _LLMClient(
            provider=settings.llm_provider or "custom",
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            model=settings.llm_model or "default",
        )
    if settings.llm_provider == "dashscope":
        return _LLMClient(
            provider="dashscope",
            api_key=settings.llm_api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            model=settings.llm_model or "qwen-plus",
        )
    if settings.llm_provider == "deepseek":
        return _LLMClient(
            provider="deepseek",
            api_key=settings.llm_api_key,
            base_url="https://api.deepseek.com/v1",
            model=settings.llm_model or "deepseek-chat",
        )
    return None


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        return json.loads(text[start : end + 1])
    return json.loads(text)


class RealLlmAdapter(LLMPort):
    port_name = "llm"
    provider_name = "rules-engine"
    mode = "real"

    def __init__(self) -> None:
        self.settings = get_settings()
        client = _build_client(self.settings)
        if client:
            self.provider_name = client.provider
        self._client = client

    def availability(self) -> tuple[bool, str | None]:
        if self._client is not None:
            return True, None
        return True, "rules-engine fallback (no LLM_API_KEY configured)"

    def diagnose(self, payload: DiagnosisRequest, knowledge: dict, trace_id: str):
        if self._client is None:
            return self._diagnose_rules(payload, knowledge, trace_id)

        user_prompt = DIAGNOSE_USER_TEMPLATE.format(
            business_name=payload.business_name or "未提供",
            business_description=payload.business_description,
            industry=payload.industry or "未提供",
            stage=payload.stage or "未提供",
        )

        try:
            raw = self._client.chat(DIAGNOSE_SYSTEM_PROMPT, user_prompt)
            parsed = _extract_json(raw)
            result = DiagnosisResult(
                summary=parsed.get("summary", ""),
                priority_assets=parsed.get("priority_assets", []),
                risks=parsed.get("risks", []),
                next_actions=parsed.get("next_actions", []),
                recommended_track=parsed.get("recommended_track", "trademark"),
                recommended_trademark_categories=parsed.get(
                    "recommended_trademark_categories", ["35"]
                ),
            )
            return make_envelope(
                mode=self.mode,
                provider=self.provider_name,
                trace_id=trace_id,
                source_refs=[
                    SourceRef(
                        title=f"LLM ({self.provider_name})",
                        note=f"模型 {self._client.model}",
                    )
                ],
                disclaimer="诊断结果由 AI 生成，仅供参考，以官方为准。",
                normalized_payload=result,
            )
        except Exception as exc:
            logger.warning("LLM diagnose failed, falling back to rules: %s", exc)
            return self._diagnose_rules(payload, knowledge, trace_id)

    def _diagnose_rules(self, payload: DiagnosisRequest, knowledge: dict, trace_id: str):
        description = payload.business_description
        lowered = description.lower()

        categories = ["35"]
        if "软件" in description or "saas" in lowered or "系统" in description:
            categories.append("42")
        if "教育" in description or "课程" in description:
            categories.append("41")
        if "服装" in description or "饰品" in description:
            categories.append("25")
        if "餐饮" in description or "食品" in description or "餐厅" in description:
            categories.append("43")
        if "医疗" in description or "美容" in description:
            categories.append("44")
        if "金融" in description or "支付" in description:
            categories.append("36")

        priority_assets = [f"商标：建议优先覆盖第 {', '.join(categories)} 类"]
        if "软件" in description or "代码" in description or "平台" in description:
            priority_assets.append("软件著作权：建议同步准备软著登记材料")
        if "方法" in description or "算法" in description or "硬件" in description:
            priority_assets.append("专利：如存在核心技术方案，建议评估专利布局")

        risks = [
            "如果名称检索不足，可能在提交前后发现近似商标。",
            "若宣传语和品牌元素不统一，后续保护成本会提高。",
        ]
        next_actions = [
            "先执行商标查重并确认核心类别。",
            "根据结果生成申请书并由申请人自行提交至官方系统。",
            "生成后自动入台账，建立 90/60/30/7 天提醒。",
        ]

        result = DiagnosisResult(
            summary=f"基于当前业务描述，建议优先从品牌名称保护切入，并把提交准备与后续台账管理串成一条流程。",
            priority_assets=priority_assets,
            risks=risks,
            next_actions=next_actions,
            recommended_track="trademark",
            recommended_trademark_categories=categories,
        )

        return make_envelope(
            mode=self.mode,
            provider="rules-engine",
            trace_id=trace_id,
            source_refs=[SourceRef(title="规则引擎", note="基于产品文档的首版结构化策略")],
            disclaimer="诊断结果由规则引擎结合知识库生成，仅供参考，以官方为准。",
            normalized_payload=result,
        )

    def summarize_application(self, payload: ApplicationDraftRequest, trace_id: str):
        if self._client is None:
            return self._summarize_application_rules(payload, trace_id)

        user_prompt = APPLICATION_SUMMARY_USER_TEMPLATE.format(
            trademark_name=payload.trademark_name,
            applicant_name=payload.applicant_name,
            categories=", ".join(payload.categories),
            risk_level=payload.risk_level,
            business_description=payload.business_description,
        )

        try:
            raw = self._client.chat(APPLICATION_SUMMARY_SYSTEM_PROMPT, user_prompt)
            parsed = _extract_json(raw)
            return make_envelope(
                mode=self.mode,
                provider=self.provider_name,
                trace_id=trace_id,
                source_refs=[
                    SourceRef(
                        title=f"LLM ({self.provider_name})",
                        note=f"模型 {self._client.model}",
                    )
                ],
                disclaimer="申请书摘要由 AI 生成，仅供参考，以官方为准。",
                normalized_payload={
                    "summary": parsed.get("summary", ""),
                    "highlights": parsed.get("highlights", []),
                },
            )
        except Exception as exc:
            logger.warning("LLM summarize failed, falling back to rules: %s", exc)
            return self._summarize_application_rules(payload, trace_id)

    def _summarize_application_rules(self, payload: ApplicationDraftRequest, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider="rules-engine",
            trace_id=trace_id,
            source_refs=[SourceRef(title="申请书摘要引擎", note="结构化模板摘要")],
            disclaimer="申请书摘要由规则引擎生成，仅供参考，以官方为准。",
            normalized_payload={
                "summary": f"为商标「{payload.trademark_name}」生成申请书，申请人 {payload.applicant_name}，类别 {', '.join(payload.categories)}。",
                "highlights": [
                    "已包含类别建议与风险提示",
                    "已包含用户自行提交的流程提醒",
                ],
            },
        )

    def analyze_text(self, system_prompt: str, user_prompt: str, trace_id: str):
        if self._client is None:
            return make_envelope(
                mode=self.mode,
                provider="rules-engine",
                trace_id=trace_id,
                source_refs=[SourceRef(title="规则引擎", note="通用文本分析回退")],
                disclaimer="分析结果由规则引擎生成，仅供参考。",
                normalized_payload={"analysis": "未配置 LLM，无法执行深度文本分析。请配置 LLM_PROVIDER 和 LLM_API_KEY。"},
            )

        try:
            raw = self._client.chat(system_prompt, user_prompt)
            try:
                parsed = _extract_json(raw)
            except (json.JSONDecodeError, ValueError):
                parsed = {"analysis": raw}

            return make_envelope(
                mode=self.mode,
                provider=self.provider_name,
                trace_id=trace_id,
                source_refs=[
                    SourceRef(
                        title=f"LLM ({self.provider_name})",
                        note=f"模型 {self._client.model}",
                    )
                ],
                disclaimer="分析结果由 AI 生成，仅供参考。",
                normalized_payload=parsed,
            )
        except Exception as exc:
            logger.warning("LLM analyze_text failed: %s", exc)
            return make_envelope(
                mode=self.mode,
                provider="rules-engine",
                trace_id=trace_id,
                source_refs=[SourceRef(title="规则引擎", note="LLM 调用失败回退")],
                disclaimer="分析结果由规则引擎生成，仅供参考。",
                normalized_payload={"analysis": f"LLM 调用失败: {exc}", "error": True},
            )

    async def diagnose_stream(
        self,
        payload: DiagnosisRequest,
        knowledge: dict[str, Any],
        trace_id: str,
    ) -> AsyncGenerator[str, None]:
        from apps.api.app.core.streaming import sse_event

        if self._client is None:
            envelope = self._diagnose_rules(payload, knowledge, trace_id)
            yield sse_event("result", envelope.model_dump(by_alias=True))
            return

        user_prompt = DIAGNOSE_USER_TEMPLATE.format(
            business_name=payload.business_name or "未提供",
            business_description=payload.business_description,
            industry=payload.industry or "未提供",
            stage=payload.stage or "未提供",
        )

        yield sse_event("meta", {"traceId": trace_id, "provider": self.provider_name, "mode": self.mode})

        accumulated = ""
        try:
            async for token in self._client.chat_stream(DIAGNOSE_SYSTEM_PROMPT, user_prompt):
                accumulated += token
                yield sse_event("token", {"content": token})

            parsed = _extract_json(accumulated)
            result = DiagnosisResult(
                summary=parsed.get("summary", ""),
                priority_assets=parsed.get("priority_assets", []),
                risks=parsed.get("risks", []),
                next_actions=parsed.get("next_actions", []),
                recommended_track=parsed.get("recommended_track", "trademark"),
                recommended_trademark_categories=parsed.get("recommended_trademark_categories", ["35"]),
            )
            envelope = make_envelope(
                mode=self.mode,
                provider=self.provider_name,
                trace_id=trace_id,
                source_refs=[SourceRef(title=f"LLM ({self.provider_name})", note=f"模型 {self._client.model}")],
                disclaimer="诊断结果由 AI 生成，仅供参考，以官方为准。",
                normalized_payload=result,
            )
            yield sse_event("result", envelope.model_dump(by_alias=True))
        except Exception as exc:
            logger.warning("LLM diagnose_stream failed, falling back to rules: %s", exc)
            envelope = self._diagnose_rules(payload, knowledge, trace_id)
            yield sse_event("result", envelope.model_dump(by_alias=True))

    async def summarize_application_stream(
        self,
        payload: ApplicationDraftRequest,
        trace_id: str,
    ) -> AsyncGenerator[str, None]:
        from apps.api.app.core.streaming import sse_event

        if self._client is None:
            envelope = self._summarize_application_rules(payload, trace_id)
            yield sse_event("result", envelope.model_dump(by_alias=True))
            return

        user_prompt = APPLICATION_SUMMARY_USER_TEMPLATE.format(
            trademark_name=payload.trademark_name,
            applicant_name=payload.applicant_name,
            categories=", ".join(payload.categories),
            risk_level=payload.risk_level,
            business_description=payload.business_description,
        )

        yield sse_event("meta", {"traceId": trace_id, "provider": self.provider_name, "mode": self.mode})

        accumulated = ""
        try:
            async for token in self._client.chat_stream(APPLICATION_SUMMARY_SYSTEM_PROMPT, user_prompt):
                accumulated += token
                yield sse_event("token", {"content": token})

            parsed = _extract_json(accumulated)
            envelope = make_envelope(
                mode=self.mode,
                provider=self.provider_name,
                trace_id=trace_id,
                source_refs=[SourceRef(title=f"LLM ({self.provider_name})", note=f"模型 {self._client.model}")],
                disclaimer="申请书摘要由 AI 生成，仅供参考，以官方为准。",
                normalized_payload={"summary": parsed.get("summary", ""), "highlights": parsed.get("highlights", [])},
            )
            yield sse_event("result", envelope.model_dump(by_alias=True))
        except Exception as exc:
            logger.warning("LLM summarize_stream failed, falling back to rules: %s", exc)
            envelope = self._summarize_application_rules(payload, trace_id)
            yield sse_event("result", envelope.model_dump(by_alias=True))

    async def analyze_text_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        trace_id: str,
    ) -> AsyncGenerator[str, None]:
        from apps.api.app.core.streaming import sse_event

        if self._client is None:
            envelope = make_envelope(
                mode=self.mode,
                provider="rules-engine",
                trace_id=trace_id,
                source_refs=[SourceRef(title="规则引擎", note="通用文本分析回退")],
                disclaimer="分析结果由规则引擎生成，仅供参考。",
                normalized_payload={"analysis": "未配置 LLM，无法执行深度文本分析。"},
            )
            yield sse_event("result", envelope.model_dump(by_alias=True))
            return

        yield sse_event("meta", {"traceId": trace_id, "provider": self.provider_name, "mode": self.mode})

        accumulated = ""
        try:
            async for token in self._client.chat_stream(system_prompt, user_prompt):
                accumulated += token
                yield sse_event("token", {"content": token})

            try:
                parsed = _extract_json(accumulated)
            except (json.JSONDecodeError, ValueError):
                parsed = {"analysis": accumulated}

            envelope = make_envelope(
                mode=self.mode,
                provider=self.provider_name,
                trace_id=trace_id,
                source_refs=[SourceRef(title=f"LLM ({self.provider_name})", note=f"模型 {self._client.model}")],
                disclaimer="分析结果由 AI 生成，仅供参考。",
                normalized_payload=parsed,
            )
            yield sse_event("result", envelope.model_dump(by_alias=True))
        except Exception as exc:
            logger.warning("LLM analyze_text_stream failed: %s", exc)
            envelope = make_envelope(
                mode=self.mode,
                provider="rules-engine",
                trace_id=trace_id,
                source_refs=[SourceRef(title="规则引擎", note="LLM 调用失败回退")],
                disclaimer="分析结果由规则引擎生成，仅供参考。",
                normalized_payload={"analysis": f"LLM 调用失败: {exc}", "error": True},
            )
            yield sse_event("result", envelope.model_dump(by_alias=True))
