"""Demo trigger — 一键引爆 7 支柱场景推送链路。

Usage (from repo root):
    python -m apps.api.scripts.demo_trigger_all_scenarios

运行前提：
  - 已执行 `python -m apps.api.scripts.seed_demo`
  - worker 正在运行（`python -m apps.worker.main`）或至少会在演示时被启动

脚本做什么：
  1. 拉起 demo 用户 + demo provider
  2. 依次 emit 以下事件，覆盖 automation_engine.BUILTIN_RULES 里所有 scenario.*：
     - diagnosis.completed         → scenario.diagnosis_to_match
     - trademark.red_flag          → scenario.trademark_red_flag
     - asset.expiring_soon         → scenario.asset_expiring_renewal
     - monitoring.alert            → scenario.monitoring_infringement_hit
     - policy.digest_ready         → scenario.policy_hit_compliance
     - provider.lead_created       → scenario.provider_fresh_lead
     - compliance.audit_completed  → scenario.compliance_score_low
     - litigation.predicted (低胜率/高胜率各一次)
  3. 打印事件 id，便于去 /inbox、/push-center 查看命中结果
"""
from __future__ import annotations

import sys
from uuid import uuid4

from apps.api.app.core.database import SessionLocal
from apps.api.app.db.models import (
    IpAsset,
    LegalServiceProvider,
    User,
)
from apps.api.app.services import event_types
from apps.api.app.services.event_bus import emit_event


DEMO_EMAIL = "demo@a1plus.local"


def _find_demo_user(db) -> User | None:
    return db.query(User).filter(User.email == DEMO_EMAIL).first()


def _find_demo_provider_user(db) -> User | None:
    """Return the first user that owns a provider account, if any."""
    provider = (
        db.query(LegalServiceProvider)
        .filter(LegalServiceProvider.user_id.is_not(None))
        .first()
    )
    if not provider:
        return None
    return db.query(User).filter(User.id == provider.user_id).first()


def _first_asset(db, user_id: str) -> IpAsset | None:
    return db.query(IpAsset).filter(IpAsset.owner_id == user_id).first()


def trigger_all(db) -> list[tuple[str, str]]:
    fired: list[tuple[str, str]] = []

    user = _find_demo_user(db)
    if not user:
        print(f"[!] demo 用户 {DEMO_EMAIL} 不存在，请先运行 seed_demo。")
        sys.exit(1)

    provider_user = _find_demo_provider_user(db)

    # 1) 需求画像 → 智能匹配
    ev = emit_event(
        db,
        event_type=event_types.DIAGNOSIS_COMPLETED,
        user_id=user.id,
        tenant_id=user.tenant_id,
        source_entity_type="diagnosis",
        source_entity_id=str(uuid4()),
        payload={
            "industry": user.industry or "跨境电商",
            "stage": user.stage or "early",
            "intent": "trademark",
            "risk_count": 2,
        },
    )
    fired.append(("diagnosis.completed", ev.id))

    # 2) 商标红旗 → 场景推送
    ev = emit_event(
        db,
        event_type=event_types.TRADEMARK_RED_FLAG,
        user_id=user.id,
        tenant_id=user.tenant_id,
        source_entity_type="trademark",
        source_entity_id=str(uuid4()),
        payload={
            "trademark_name": "DemoBrand",
            "applicant_name": user.full_name or "Demo",
            "risk_level": "red",
            "categories": [25, 35],
        },
    )
    fired.append(("trademark.red_flag", ev.id))

    # 3) 资产到期续展
    asset = _first_asset(db, user.id)
    if asset:
        ev = emit_event(
            db,
            event_type=event_types.ASSET_EXPIRING_SOON,
            user_id=user.id,
            tenant_id=user.tenant_id,
            source_entity_type="asset",
            source_entity_id=asset.id,
            payload={
                "asset_id": asset.id,
                "asset_name": asset.name,
                "days_until_expiry": 45,
            },
        )
        fired.append(("asset.expiring_soon", ev.id))

    # 4) 监控告警
    ev = emit_event(
        db,
        event_type=event_types.MONITORING_ALERT,
        user_id=user.id,
        tenant_id=user.tenant_id,
        source_entity_type="monitoring",
        source_entity_id=str(uuid4()),
        payload={
            "alert_count": 3,
            "high_count": 2,
            "job_id": str(uuid4()),
        },
    )
    fired.append(("monitoring.alert", ev.id))

    # 5) 政策命中（带 impact_high=True 才能触发 scenario.policy_hit_compliance）
    ev = emit_event(
        db,
        event_type=event_types.POLICY_DIGEST_READY,
        user_id=user.id,
        tenant_id=user.tenant_id,
        source_entity_type="policy",
        source_entity_id=str(uuid4()),
        payload={
            "impact_high": True,
            "policy_count": 4,
            "high_impact_count": 2,
            "industry": user.industry or "跨境电商",
        },
    )
    fired.append(("policy.digest_ready (impact_high=True)", ev.id))

    # 6) 新线索高分 → 推律师（target_role=provider）
    if provider_user:
        ev = emit_event(
            db,
            event_type=event_types.PROVIDER_LEAD_CREATED,
            user_id=provider_user.id,
            tenant_id=None,
            source_entity_type="provider_lead",
            source_entity_id=str(uuid4()),
            payload={
                "score": 82.0,
                "temperature": "hot",
                "intent": "trademark",
                "urgency": "urgent",
                "region": "上海",
            },
        )
        fired.append(("provider.lead_created (score=82)", ev.id))
    else:
        print("[i] 未找到绑定 user 的 provider，跳过 provider.lead_created 推送。")

    # 7) 合规评分过低
    ev = emit_event(
        db,
        event_type=event_types.COMPLIANCE_AUDIT_COMPLETED,
        user_id=user.id,
        tenant_id=user.tenant_id,
        source_entity_type="compliance_profile",
        source_entity_id=str(uuid4()),
        payload={
            "score": 48,
            "industry": user.industry or "跨境电商",
            "findings_count": 7,
            "high_severity_count": 3,
            "subscription_tier": "free",
        },
    )
    fired.append(("compliance.audit_completed (score=48)", ev.id))

    # 8) 诉讼预测：一条低胜率 + 一条高胜率
    for label, win_prob in (("低胜率", 0.28), ("高胜率", 0.82)):
        ev = emit_event(
            db,
            event_type=event_types.LITIGATION_PREDICTED,
            user_id=user.id,
            tenant_id=user.tenant_id,
            source_entity_type="litigation_case",
            source_entity_id=str(uuid4()),
            payload={
                "win_probability": win_prob,
                "damage_low": 80_000,
                "damage_high": 200_000,
                "strategy": "negotiation" if win_prob < 0.5 else "file_lawsuit",
            },
        )
        fired.append((f"litigation.predicted ({label} win={win_prob})", ev.id))

    db.commit()
    return fired


def main() -> None:
    db = SessionLocal()
    try:
        fired = trigger_all(db)
    finally:
        db.close()

    print("\n=== 已 emit 场景事件 ===")
    for name, event_id in fired:
        print(f"  {name:<50}  event_id={event_id}")
    print(
        "\n提示：事件由 worker 异步消费。请确保 worker 正在运行，"
        "然后刷新 /inbox 或 /push-center/timeline 查看命中结果。"
    )


if __name__ == "__main__":
    main()
