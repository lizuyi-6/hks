from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.orm import Session

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.core.streaming import sse_event
from apps.api.app.db.models import IpAsset, User
from apps.api.app.schemas.chat import ChatRequest

logger = logging.getLogger(__name__)

DISCLAIMER = "仅供参考，以官方为准"
MAX_HISTORY_TURNS = 10
MAX_TOOL_CALLS_PER_TURN = 3

SYSTEM_PROMPT_TEMPLATE = """你是 A1+ IP Coworker，一位专注于知识产权的专业助手。风格：专业、简洁、有温度，像资深同事。

## 你的能力
- 商标查重与注册风险评估
- IP 全面诊断与策略建议
- 商标申请书生成（用户自行提交至官方系统）
- 合同知识产权条款审查
- 专利可行性评估
- 知识产权政策速递
- IP 资产台账管理

## 重要规则
1. 所有输出必须附带免责声明：**仅供参考，以官方为准**
2. 不代替用户向任何官方系统提交材料
3. 遇到法律解释问题，引导用户咨询专业律师
4. 当用户意图清晰时，主动调用工具执行，不要反复询问确认
5. 工具调用失败时，用规则引擎结果回复，不暴露技术错误

## 当前用户
- 用户：{full_name}
- 企业：{business_name}
- 行业：{industry}
- 阶段：{stage}

## 用户 IP 资产台账（{asset_count} 条）
{asset_summary}

## 对话约定
- 简洁回答，避免冗长列表
- 工具返回结果后，用1-2句话点评要点，再给出下一步建议
- 在每轮回复末尾提供1-2个自然的后续问题建议
"""

CHAT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "trademark_check",
            "description": "查询商标近似情况，评估注册风险。用户提到注册商标、查重、商标查询时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "trademark_name": {"type": "string", "description": "商标名称"},
                    "business_description": {"type": "string", "description": "业务描述，用于推断类别"},
                    "categories": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "尼斯分类号，如['42']，可根据业务描述推断",
                    },
                },
                "required": ["trademark_name", "business_description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ip_diagnosis",
            "description": "对用户业务进行IP全面诊断，给出优先保护建议。用户询问IP策略、需要保护什么时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "business_name": {"type": "string"},
                    "business_description": {"type": "string"},
                    "industry": {"type": "string"},
                    "stage": {"type": "string", "description": "企业阶段: startup/growth/mature"},
                },
                "required": ["business_description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_assets",
            "description": "查询用户已有的IP资产台账。用户询问我的商标、资产情况、有哪些IP时调用。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_application",
            "description": "生成商标申请书文档。用户确认要申请、说好的、生成申请书时调用。必须先有trademark_check结果。",
            "parameters": {
                "type": "object",
                "properties": {
                    "trademark_name": {"type": "string"},
                    "applicant_name": {"type": "string"},
                    "business_description": {"type": "string"},
                    "categories": {"type": "array", "items": {"type": "string"}},
                    "risk_level": {"type": "string", "enum": ["green", "yellow", "red"]},
                },
                "required": ["trademark_name", "applicant_name", "categories", "risk_level"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "contract_review",
            "description": "审查合同中的知识产权条款。用户上传合同或提到审合同、合同审查时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "contract_text": {"type": "string", "description": "合同文本内容"},
                },
                "required": ["contract_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "patent_assess",
            "description": "评估技术描述的专利保护可行性。用户提到申请专利、技术保护时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {"type": "string", "description": "技术方案描述"},
                },
                "required": ["description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "policy_digest",
            "description": "获取行业最新知识产权政策摘要。用户询问最新政策、补贴、扶持政策时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "industry": {"type": "string", "description": "行业名称"},
                },
                "required": ["industry"],
            },
        },
    },
]


def build_system_prompt(user: User, assets: list[IpAsset]) -> str:
    asset_lines = []
    for a in assets[:20]:
        expires = a.expires_at.strftime("%Y-%m-%d") if a.expires_at else "长期"
        asset_lines.append(
            f"  - [{a.asset_type}] {a.name} · 状态:{a.status} · 到期:{expires}"
        )
    asset_summary = "\n".join(asset_lines) if asset_lines else "  （暂无已登记资产）"

    return SYSTEM_PROMPT_TEMPLATE.format(
        full_name=user.full_name,
        business_name=user.business_name or "未填写",
        industry=user.industry or "未填写",
        stage=user.stage or "未填写",
        asset_count=len(assets),
        asset_summary=asset_summary,
    )


async def run_chat_stream(
    request: ChatRequest,
    user: User,
    db: Session,
    trace_id: str,
) -> AsyncGenerator[str, None]:
    assets = (
        db.query(IpAsset)
        .filter(IpAsset.owner_id == user.id)
        .order_by(IpAsset.created_at.desc())
        .limit(20)
        .all()
    )
    system_prompt = build_system_prompt(user, assets)

    history = request.history[-MAX_HISTORY_TURNS * 2 :]
    messages = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": request.message})

    llm = provider_registry.get("llm")
    tool_call_count = 0
    follow_ups: list[str] = []

    while tool_call_count <= MAX_TOOL_CALLS_PER_TURN:
        pending_tool_call: dict | None = None
        accumulated_text = ""
        meta_sent = tool_call_count > 0

        async for event in llm.multi_turn_stream(messages, CHAT_TOOLS, system_prompt, trace_id):
            event_type = event.get("type")

            if event_type == "meta":
                if not meta_sent:
                    yield sse_event("meta", event)
                    meta_sent = True
                continue

            if event_type == "token":
                accumulated_text += event.get("content", "")
                yield sse_event("token", {"content": event.get("content", "")})
                continue

            if event_type == "tool_call":
                pending_tool_call = event
                break

            if event_type == "done":
                break

        if pending_tool_call and tool_call_count < MAX_TOOL_CALLS_PER_TURN:
            tool_call_count += 1
            action_name = pending_tool_call["name"]
            action_args = _enrich_args(pending_tool_call.get("args", {}), user, request.context)

            yield sse_event("action_start", {
                "action": action_name,
                "label": _action_label(action_name, action_args),
                "params": action_args,
            })

            try:
                tool_result = await _execute_action(action_name, action_args, user, db, trace_id)
                yield sse_event("action_result", tool_result)

                if accumulated_text:
                    messages.append({"role": "assistant", "content": accumulated_text})
                messages.append({
                    "role": "tool",
                    "tool_call_id": action_name,
                    "content": json.dumps(tool_result, ensure_ascii=False),
                })
                continue
            except Exception as exc:
                logger.warning("tool execution failed: %s %s", action_name, exc)
                yield sse_event("action_result", {
                    "action": action_name, "error": True,
                    "message": "工具调用失败，请稍后重试",
                })
                if accumulated_text:
                    messages.append({"role": "assistant", "content": accumulated_text})
                messages.append({
                    "role": "tool",
                    "tool_call_id": action_name,
                    "content": "工具调用失败，请基于已知信息给用户提供基础建议。",
                })
                continue

        break

    yield sse_event("done", {
        "disclaimer": DISCLAIMER,
        "followUp": follow_ups or _default_follow_ups(request.message),
    })


def _enrich_args(args: dict, user: User, context: dict) -> dict:
    enriched = dict(args)
    for k, v in context.items():
        if k not in enriched or not enriched[k]:
            enriched[k] = v
    if "applicant_name" not in enriched or not enriched["applicant_name"]:
        enriched["applicant_name"] = user.applicant_name or user.full_name
    return enriched


def _action_label(action: str, args: dict) -> str:
    labels = {
        "trademark_check": f"正在查询商标「{args.get('trademark_name', '...')}」...",
        "ip_diagnosis": "正在进行IP全面诊断...",
        "list_assets": "正在查询您的IP资产台账...",
        "generate_application": f"正在生成「{args.get('trademark_name', '...')}」申请书...",
        "contract_review": "正在审查合同知识产权条款...",
        "patent_assess": "正在评估专利可行性...",
        "policy_digest": f"正在获取{args.get('industry', '行业')}政策速递...",
    }
    return labels.get(action, f"正在执行 {action}...")


def _default_follow_ups(user_message: str) -> list[str]:
    if any(kw in user_message for kw in ("商标", "注册", "品牌")):
        return ["需要我帮你生成申请书吗？", "要查看详细的近似商标列表吗？"]
    if "专利" in user_message:
        return ["要了解专利申请的完整流程吗？"]
    if "合同" in user_message:
        return ["需要我逐条分析风险条款吗？"]
    return ["需要查看您的IP资产台账吗？", "要进行IP全面诊断吗？"]


async def _execute_action(
    action: str,
    args: dict,
    user: User,
    db: Session,
    trace_id: str,
) -> dict[str, Any]:
    if action == "trademark_check":
        from apps.api.app.schemas.trademark import TrademarkCheckRequest
        payload = TrademarkCheckRequest(
            trademark_name=args["trademark_name"],
            business_description=args.get("business_description", ""),
            applicant_name=args.get("applicant_name") or user.applicant_name or user.full_name,
            applicant_type=user.applicant_type or "company",
            categories=args.get("categories", ["35"]),
        )
        envelope = provider_registry.get("trademarkSearch").search(payload, trace_id)
        result = envelope.normalized_payload
        return {
            "action": "trademark_check",
            "risk_level": result.risk_level,
            "summary": result.summary,
            "recommendation": result.recommendation,
            "findings_count": len(result.findings),
            "alternatives": result.alternatives[:3],
        }

    elif action == "ip_diagnosis":
        from apps.api.app.schemas.diagnosis import DiagnosisRequest
        payload = DiagnosisRequest(
            business_name=args.get("business_name") or user.business_name,
            business_description=args["business_description"],
            industry=args.get("industry") or user.industry,
            stage=args.get("stage") or user.stage,
        )
        kb = provider_registry.get("knowledgeBase")
        knowledge = kb.retrieve("ip-strategy", trace_id).normalized_payload
        envelope = provider_registry.get("llm").diagnose(payload, knowledge, trace_id)
        result = envelope.normalized_payload
        return {
            "action": "ip_diagnosis",
            "summary": result.summary,
            "priority_assets": result.priority_assets,
            "risks": result.risks,
            "next_actions": result.next_actions,
        }

    elif action == "list_assets":
        assets = (
            db.query(IpAsset)
            .filter(IpAsset.owner_id == user.id)
            .order_by(IpAsset.created_at.desc())
            .all()
        )
        return {
            "action": "list_assets",
            "total": len(assets),
            "assets": [
                {
                    "name": a.name,
                    "type": a.asset_type,
                    "status": a.status,
                    "expires_at": a.expires_at.isoformat() if a.expires_at else None,
                }
                for a in assets
            ],
        }

    elif action == "generate_application":
        from apps.api.app.services.jobs import enqueue_job, process_job
        payload_data = {
            "trademark_name": args["trademark_name"],
            "applicant_name": args.get("applicant_name") or user.full_name,
            "applicant_type": user.applicant_type or "company",
            "business_description": args.get("business_description", ""),
            "categories": args.get("categories", ["35"]),
            "risk_level": args.get("risk_level", "yellow"),
        }
        job = enqueue_job(db, "trademark.application", payload_data)
        process_job(db, job)
        db.refresh(job)
        return {
            "action": "generate_application",
            "job_id": job.id,
            "status": job.status,
            "download_hint": f"申请书已生成，可通过 /trademarks/drafts/{job.id} 获取",
        }

    elif action == "contract_review":
        envelope = provider_registry.get("contractReview").review(
            args["contract_text"], trace_id
        )
        result = envelope.normalized_payload
        return {
            "action": "contract_review",
            "summary": result.get("summary", ""),
            "risks_count": len(result.get("risks", [])),
        }

    elif action == "patent_assess":
        envelope = provider_registry.get("patentAssist").assess(
            args["description"], trace_id
        )
        result = envelope.normalized_payload
        return {"action": "patent_assess", **result}

    elif action == "policy_digest":
        envelope = provider_registry.get("policyDigest").digest(
            args.get("industry", "通用"), trace_id
        )
        result = envelope.normalized_payload
        return {"action": "policy_digest", **result}

    else:
        raise ValueError(f"Unknown action: {action}")
