"""Regression — the 企业 IP 合规中心 DonutRing 下方必须展示 AI 诊断文案。

旧版本前端给 ``<DonutRing label={`${profile.score}`} />`` 传的是和主刻度
重复的数字（"60%" 上面一个大号 60%、下面又一个小号 60），用户反馈"这应该
换成 AI 实际分析的有意义文字"。

修复三步：

1. ``ComplianceProfile.ai_summary`` 新列存一句话诊断
2. ``run_compliance_audit`` 体检完毕后生成并写入（LLM best-effort + 规则兜底）
3. ``profile_to_dict`` 暴露为 ``aiSummary``，前端用它替换原 label

这个测试盯紧 (1)+(2)+(3)：体检后 profile 必然携带非空 ``aiSummary``，且它
不能只是简单地把分数再念一遍。
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from apps.api.app.core.database import SessionLocal
from apps.api.app.db.models import IpAsset, User
from apps.api.app.services.compliance_engine import (
    _build_ai_summary,
    _rule_based_ai_summary,
    get_profile,
    run_compliance_audit,
)


def _make_user(db: Session, email: str = "compliance-ai@example.com") -> User:
    user = User(
        email=email,
        full_name="Compliance Tester",
        password_hash="x",
        tenant_id=None,
        role="owner",
        business_name="Acme 科技",
        industry="信息技术",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_run_compliance_audit_populates_ai_summary():
    db = SessionLocal()
    try:
        user = _make_user(db)

        # 给一个 pending 商标，能稳定触发至少一个 finding，保证摘要里会带"建议"而非空谈。
        db.add(
            IpAsset(
                owner_id=user.id,
                name="Acme Brand",
                asset_type="trademark",
                status="pending",
            )
        )
        db.commit()

        result = run_compliance_audit(
            db,
            user=user,
            company_name="Acme 科技",
            industry="信息技术",
            scale="SMB",
        )
        db.commit()

        assert "aiSummary" in result, "run_compliance_audit must expose aiSummary"
        assert result["aiSummary"], "aiSummary should not be empty after a successful audit"

        # Profile GET 也必须带 aiSummary —— 前端页面加载时走这条路径。
        profile = get_profile(db, user)
        assert profile is not None
        assert profile.get("aiSummary"), "profile_to_dict must surface aiSummary"
        assert profile["aiSummary"] == result["aiSummary"], (
            "aiSummary on GET profile should match the value just persisted by audit"
        )

        # 必须是真·一句话诊断，而不是单纯把分数数字再念一遍 ——
        # 如果只是 "60" / "60分" 那和 DonutRing 原 label 一模一样，等于没修。
        summary = profile["aiSummary"].strip()
        digits_only = re.fullmatch(r"\d{1,3}\s*(分|%|points?)?", summary)
        assert digits_only is None, (
            f"aiSummary 不应只是评分数字的重复: {summary!r}"
        )
        assert len(summary) >= 6, f"aiSummary 过短，可能没有真正写入: {summary!r}"
    finally:
        db.rollback()
        db.close()


def test_rule_based_ai_summary_is_used_when_llm_unavailable():
    """硬兜底：即使没有 LLM，_build_ai_summary 也必须返回可读的一句话。

    这是线上 LLM 断连 / 配额耗尽时的最后防线，保证 UI 永远不会退回到
    "label={score}" 那种冗余小字。
    """
    text = _rule_based_ai_summary(
        score=62,
        high=2,
        medium=1,
        weakest=("技术保护", 40),
        industry="信息技术",
    )
    assert "技术保护" in text, "规则文案应该点名最薄弱的维度"
    assert "建议" in text, "规则文案应该包含一个 actionable 建议"
    assert len(text) >= 10

    # _build_ai_summary 在 LLM 报错时必须走到规则文案；这里我们 monkeypatch
    # provider_registry.get 抛异常来模拟 LLM 不可用。
    from apps.api.app.adapters import registry as registry_mod

    original_get = registry_mod.provider_registry.get

    def _fail(_name: str):
        raise RuntimeError("llm not configured in this test")

    registry_mod.provider_registry.get = _fail  # type: ignore[assignment]
    try:
        summary = _build_ai_summary(
            company_name="Acme",
            industry="信息技术",
            scale="SMB",
            score=62,
            findings=[
                {"severity": "high", "title": "商标未注册", "category": "trademark"},
            ],
            heatmap={"brand_protection": 40, "technology_protection": 70},
        )
    finally:
        registry_mod.provider_registry.get = original_get  # type: ignore[assignment]

    assert summary, "LLM 不可用时必须落回规则文案，绝不能返回空串"
    assert re.fullmatch(r"\d{1,3}\s*(分|%)?", summary.strip()) is None, (
        "兜底文案不应只是数字"
    )
