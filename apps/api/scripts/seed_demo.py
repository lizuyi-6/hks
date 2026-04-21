"""
Seed a demo account with pre-populated assets / reminders / suggestions so the
Dashboard has something meaningful to show immediately after login.

Usage (from repo root):
    python -m apps.api.scripts.seed_demo

Idempotent — safe to re-run; will `upsert` the demo user and top up
missing sample data.

Demo credentials (printed at the end):
    Email:    demo@a1plus.local
    Password: demo1234
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import select

from apps.api.app.core.database import Base, SessionLocal, engine
from apps.api.app.core.security import hash_password
from apps.api.app.db.models import (
    AutomationRule,
    ComplianceFinding,
    ComplianceProfile,
    ConsultationSession,
    DocumentRecord,
    FirmMember,
    IpAsset,
    JobRecord,
    LegalServiceProvider,
    LitigationCase,
    LitigationPrecedent,
    LitigationPrediction,
    LitigationScenario,
    MatchingCandidate,
    MatchingRequest,
    ModuleResult,
    MonitoringWatchlist,
    Notification,
    PolicySubscription,
    ProviderCredential,
    ProviderLead,
    ReminderTask,
    ServiceOrder,
    ServiceProduct,
    SystemEvent,
    Tenant,
    User,
    UserProfileTag,
    WorkflowInstance,
    WorkflowStep,
    utcnow,
)


DEMO_EMAIL = "demo@a1plus.local"
DEMO_PASSWORD = "demo1234"
DEMO_NAME = "演示账户"

# Secondary persona: logs into /provider workstation (律所/代理人 B-side).
# Must be linked to a LegalServiceProvider row via LegalServiceProvider.user_id,
# otherwise require_provider rejects the request. We bind it to prov-seed-001
# (曹天明) because that's where the seeded leads / firm members / orders live.
DEMO_LAWYER_EMAIL = "demo-lawyer@a1plus.local"
DEMO_LAWYER_PASSWORD = "demo1234"
DEMO_LAWYER_NAME = "曹天明 · 演示律师"
DEMO_LAWYER_PROVIDER_ID = "prov-seed-001"


def seed() -> None:
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if user is None:
            user = User(
                id=str(uuid4()),
                email=DEMO_EMAIL,
                full_name=DEMO_NAME,
                password_hash=hash_password(DEMO_PASSWORD),
                role="member",
                business_name="示例科技有限公司",
                business_description="面向小微企业的 SaaS 工具提供商。",
                industry="软件服务",
                stage="成长期",
                applicant_type="company",
                applicant_name="示例科技有限公司",
                has_trademark=True,
                has_patent=False,
                ip_focus="trademark",
            )
            db.add(user)
            db.flush()
            print(f"[+] Created demo user  id={user.id}")
        else:
            # Keep the password fresh in case someone re-seeds with a new one
            user.password_hash = hash_password(DEMO_PASSWORD)
            user.full_name = DEMO_NAME
            print(f"[=] Demo user already exists id={user.id} — refreshed password")

        # Ensure the tenant exists and the user is linked BEFORE any
        # tenant-scoped seed rows (IpAsset / JobRecord / ModuleResult) are
        # created, so every downstream write picks up the right tenant_id.
        seed_demo_tenant(db, user)

        # --- IP assets --------------------------------------------------------
        existing_assets = db.scalars(
            select(IpAsset).where(IpAsset.owner_id == user.id)
        ).all()
        if not existing_assets:
            now = utcnow()
            sample_assets = [
                IpAsset(
                    id=str(uuid4()),
                    owner_id=user.id,
                    tenant_id=DEMO_TENANT_ID,
                    name="示例科技",
                    asset_type="trademark",
                    registration_number="TM20240001234",
                    status="active",
                    expires_at=now + timedelta(days=365 * 8 + 120),
                    next_milestone="续展准备",
                    source_mode="real",
                    created_at=now - timedelta(days=210),
                ),
                IpAsset(
                    id=str(uuid4()),
                    owner_id=user.id,
                    tenant_id=DEMO_TENANT_ID,
                    name="ShiliKeji",
                    asset_type="trademark",
                    registration_number="TM20240005678",
                    status="active",
                    expires_at=now + timedelta(days=45),
                    next_milestone="即将到期 · 续展申请",
                    source_mode="real",
                    created_at=now - timedelta(days=180),
                ),
                IpAsset(
                    id=str(uuid4()),
                    owner_id=user.id,
                    tenant_id=DEMO_TENANT_ID,
                    name="示例云协同平台",
                    asset_type="soft-copyright",
                    registration_number="RC20240012345",
                    status="active",
                    expires_at=None,
                    next_milestone=None,
                    source_mode="real",
                    created_at=now - timedelta(days=150),
                ),
                IpAsset(
                    id=str(uuid4()),
                    owner_id=user.id,
                    tenant_id=DEMO_TENANT_ID,
                    name="一种基于AI的文本生成方法",
                    asset_type="patent",
                    registration_number="CN20241234567A",
                    status="pending",
                    expires_at=None,
                    next_milestone="等待实质审查答复",
                    source_mode="real",
                    created_at=now - timedelta(days=90),
                ),
                IpAsset(
                    id=str(uuid4()),
                    owner_id=user.id,
                    tenant_id=DEMO_TENANT_ID,
                    name="示例科技产品手册",
                    asset_type="copyright",
                    registration_number="CR20240078901",
                    status="active",
                    expires_at=None,
                    next_milestone=None,
                    source_mode="real",
                    created_at=now - timedelta(days=60),
                ),
                IpAsset(
                    id=str(uuid4()),
                    owner_id=user.id,
                    tenant_id=DEMO_TENANT_ID,
                    name="示例AI助手",
                    asset_type="trademark",
                    registration_number=None,
                    status="pending",
                    expires_at=None,
                    next_milestone="等待初审公告",
                    source_mode="real",
                    created_at=now - timedelta(days=30),
                ),
                IpAsset(
                    id=str(uuid4()),
                    owner_id=user.id,
                    tenant_id=DEMO_TENANT_ID,
                    name="云协同算法 v2",
                    asset_type="soft-copyright",
                    registration_number="RC20240098765",
                    status="active",
                    expires_at=None,
                    next_milestone=None,
                    source_mode="real",
                    created_at=now - timedelta(days=10),
                ),
            ]
            db.add_all(sample_assets)
            db.flush()
            print(f"[+] Seeded {len(sample_assets)} IP assets")
        else:
            print(f"[=] User already has {len(existing_assets)} assets — skipped")

        # --- Reminders --------------------------------------------------------
        # Attach reminders to the "about to expire" trademark asset
        tm_asset = next(
            (
                a
                for a in db.scalars(
                    select(IpAsset).where(IpAsset.owner_id == user.id)
                ).all()
                if a.name == "ShiliKeji"
            ),
            None,
        )
        if tm_asset is None:
            print("[!] No target asset for reminders — skipped")
        else:
            has_reminders = db.scalar(
                select(ReminderTask).where(ReminderTask.asset_id == tm_asset.id).limit(1)
            )
            if has_reminders is None:
                now = utcnow()
                reminders = [
                    ReminderTask(
                        id=str(uuid4()),
                        asset_id=tm_asset.id,
                        channel="email",
                        due_at=now + timedelta(days=1),
                        status="queued",
                    ),
                    ReminderTask(
                        id=str(uuid4()),
                        asset_id=tm_asset.id,
                        channel="wechat",
                        due_at=now + timedelta(days=3),
                        status="queued",
                    ),
                    ReminderTask(
                        id=str(uuid4()),
                        asset_id=tm_asset.id,
                        channel="email",
                        due_at=now - timedelta(days=1),
                        status="sent",
                    ),
                ]
                db.add_all(reminders)
                db.flush()
                print(f"[+] Seeded {len(reminders)} reminders")
            else:
                print("[=] Reminders already present — skipped")

        # --- Workflow (running) ---------------------------------------------
        has_workflow = db.scalar(
            select(WorkflowInstance)
            .where(WorkflowInstance.user_id == user.id)
            .where(WorkflowInstance.status == "running")
            .limit(1)
        )
        if has_workflow is None:
            wf_id = str(uuid4())
            wf = WorkflowInstance(
                id=wf_id,
                tenant_id=user.tenant_id,
                user_id=user.id,
                workflow_type="trademark-registration",
                status="running",
                current_step_index=2,
                context={"assetName": "示例AI助手"},
            )
            db.add(wf)
            db.flush()
            # Put the current step in `awaiting_review` so the /inbox
            # "待审批动作" list picks it up (filter: steps[].status ==
            # "awaiting_review"). The workflow itself stays `running`.
            step_types = [
                ("diagnosis", "completed"),
                ("trademark_check", "completed"),
                ("trademark_application", "awaiting_review"),
                ("submit_guide", "pending"),
                ("ledger", "pending"),
            ]
            for i, (stype, status) in enumerate(step_types):
                db.add(
                    WorkflowStep(
                        id=str(uuid4()),
                        workflow_id=wf_id,
                        step_index=i,
                        step_type=stype,
                        status=status,
                        input_data={},
                        output_data={},
                    )
                )
            print(f"[+] Seeded running workflow id={wf_id}")
        else:
            print("[=] Running workflow already present — skipped")

        # --- Monitoring watchlist --------------------------------------------
        has_watchlist = db.scalar(
            select(MonitoringWatchlist).where(MonitoringWatchlist.user_id == user.id).limit(1)
        )
        if has_watchlist is None:
            now = utcnow()
            watchlist = [
                MonitoringWatchlist(
                    id=str(uuid4()),
                    user_id=user.id,
                    keyword="示例科技",
                    item_type="trademark",
                    frequency="daily",
                    status="active",
                    alerts=4,
                    last_hit_at=now - timedelta(days=1),
                ),
                MonitoringWatchlist(
                    id=str(uuid4()),
                    user_id=user.id,
                    keyword="ShiliKeji",
                    item_type="trademark",
                    frequency="daily",
                    status="active",
                    alerts=2,
                    last_hit_at=now - timedelta(days=2),
                ),
                MonitoringWatchlist(
                    id=str(uuid4()),
                    user_id=user.id,
                    keyword="示例AI",
                    item_type="keyword",
                    frequency="weekly",
                    status="active",
                    alerts=1,
                    last_hit_at=now - timedelta(days=6),
                ),
                MonitoringWatchlist(
                    id=str(uuid4()),
                    user_id=user.id,
                    keyword="shili-keji.com",
                    item_type="domain",
                    frequency="daily",
                    status="paused",
                    alerts=0,
                    last_hit_at=None,
                ),
            ]
            db.add_all(watchlist)
            db.flush()
            print(f"[+] Seeded {len(watchlist)} watchlist items")
        else:
            print("[=] Watchlist already present — skipped")

        # --- Historical monitoring.scan jobs (drive /monitoring/trend) -------
        existing_scan_jobs = db.scalar(
            select(JobRecord)
            .where(JobRecord.job_type == "monitoring.scan")
            .where(JobRecord.status == "completed")
            .limit(1)
        )
        if existing_scan_jobs is None:
            now = utcnow()
            scan_templates = [
                (
                    4,
                    {
                        "alerts": [
                            {"severity": "high", "threat_type": "squatting", "title": "近似商标抢注：示科技"},
                            {"severity": "medium", "threat_type": "knockoff", "title": "相似 logo 出现"},
                            {"severity": "low", "threat_type": "misuse", "title": "社交平台引用"},
                        ],
                        "total": 3,
                        "high_count": 1,
                    },
                ),
                (
                    10,
                    {
                        "alerts": [
                            {"severity": "medium", "threat_type": "cybersquatting", "title": "可疑域名 shilikj.com"},
                            {"severity": "low", "threat_type": "misuse", "title": "论坛提及"},
                        ],
                        "total": 2,
                        "high_count": 0,
                    },
                ),
                (
                    18,
                    {
                        "alerts": [
                            {"severity": "high", "threat_type": "counterfeit", "title": "电商平台假冒商品"},
                            {"severity": "high", "threat_type": "squatting", "title": "相似商标抢注申请"},
                            {"severity": "medium", "threat_type": "knockoff", "title": "近似标识"},
                            {"severity": "low", "threat_type": "misuse", "title": "媒体不当引用"},
                        ],
                        "total": 4,
                        "high_count": 2,
                    },
                ),
            ]
            for idx, (days_ago, payload) in enumerate(scan_templates):
                created = now - timedelta(days=days_ago)
                pl = {"query": "示例科技", "_user_id": user.id}
                idem = hashlib.sha256(
                    json.dumps({"type": "monitoring.scan", "seed": idx, "payload": pl}, sort_keys=True).encode("utf-8")
                ).hexdigest()
                job = JobRecord(
                    id=str(uuid4()),
                    job_type="monitoring.scan",
                    status="completed",
                    idempotency_key=f"seed-{idem}",
                    payload=pl,
                    result={"normalizedPayload": payload, "mode": "real", "provider": "seed"},
                    attempts=1,
                    run_after=created,
                    created_at=created,
                    updated_at=created,
                )
                db.add(job)
            db.flush()
            print(f"[+] Seeded {len(scan_templates)} historical monitoring.scan jobs")
        else:
            print("[=] Historical scan jobs already present — skipped")

        # --- Profile activity events -----------------------------------------
        has_events = db.scalar(
            select(SystemEvent).where(SystemEvent.user_id == user.id).limit(1)
        )
        if has_events is None:
            now = utcnow()
            events = [
                SystemEvent(
                    id=str(uuid4()),
                    user_id=user.id,
                    event_type="user.login",
                    source_entity_type="user",
                    source_entity_id=user.id,
                    payload={"title": "账号登录", "detail": "从 Chrome / 上海 登录"},
                    processed=True,
                    created_at=now,
                ),
                SystemEvent(
                    id=str(uuid4()),
                    user_id=user.id,
                    event_type="document.generated",
                    source_entity_type="document",
                    payload={"title": "生成商标申请书", "detail": "示例AI助手 · DOCX/PDF"},
                    processed=True,
                    created_at=now - timedelta(days=1),
                ),
                SystemEvent(
                    id=str(uuid4()),
                    user_id=user.id,
                    event_type="profile.updated",
                    source_entity_type="user",
                    source_entity_id=user.id,
                    payload={"title": "更新公司信息", "detail": "营业执照识别 → 企业信息"},
                    processed=True,
                    created_at=now - timedelta(days=3),
                ),
                SystemEvent(
                    id=str(uuid4()),
                    user_id=user.id,
                    event_type="asset.created",
                    source_entity_type="ip_asset",
                    payload={"title": "新增 IP 资产", "detail": "示例AI助手 · 商标"},
                    processed=True,
                    created_at=now - timedelta(days=6),
                ),
                SystemEvent(
                    id=str(uuid4()),
                    user_id=user.id,
                    event_type="auth.password_changed",
                    source_entity_type="user",
                    source_entity_id=user.id,
                    payload={"title": "修改登录密码", "detail": "已成功更新"},
                    processed=True,
                    created_at=now - timedelta(days=15),
                ),
            ]
            db.add_all(events)
            db.flush()
            print(f"[+] Seeded {len(events)} profile activity events")
        else:
            print("[=] Profile activity events already present — skipped")

        # --- A1+ 2.0: Providers, products, leads, orders, compliance ---------
        seed_a1plus_2_0(db, user)

        # --- Lawyer persona: login account bound to prov-seed-001 -----------
        seed_demo_lawyer(db)

        # --- Litigation Intelligence demos -----------------------------------
        seed_litigation_demo(db, user)

        # --- Competition 7 pillars: firm members, policy subs, profile fingerprint --
        seed_firm_members(db)
        seed_policy_subscriptions(db, user)

        # --- Full-feature backfill: module results / docs / notifications /
        #     automation rules / litigation scenarios / provider credentials /
        #     extra completed workflows --------------------------------------------
        seed_module_results(db, user)
        seed_document_records(db, user)
        seed_notifications(db, user)
        seed_automation_rules(db, user)
        seed_litigation_scenarios(db)
        seed_provider_credentials(db)
        seed_extra_workflows(db, user)

        db.commit()

    print()
    print("=" * 60)
    print("    Demo accounts ready")
    print("=" * 60)
    print(f"   URL               http://localhost:3000/login")
    print(f"   用户端 Email      {DEMO_EMAIL}")
    print(f"   用户端 Password   {DEMO_PASSWORD}")
    print(f"   律师端 Email      {DEMO_LAWYER_EMAIL}")
    print(f"   律师端 Password   {DEMO_LAWYER_PASSWORD}")
    print("=" * 60)


# ==============================================================================
# A1+ 2.0: demo data for 10 providers / 30 products / 3 story lines.
# ==============================================================================

PROVIDER_SEEDS = [
    dict(
        id="prov-seed-001",
        provider_type="lawyer",
        name="曹天明 · 知识产权律师",
        short_intro="十年商标纠纷经验，擅长跨境电商 35/9 类，年处理 200+ 商标案件",
        regions=["上海", "全国"],
        practice_areas=["trademark", "brand", "opposition", "litigation"],
        languages=["中文", "英文"],
        featured_tags=["跨境电商", "快响应", "上海"],
        rating_avg=4.8, orders_count=128, response_sla_minutes=45,
        win_rate=0.82, hourly_rate_range="800-1500",
    ),
    dict(
        id="prov-seed-002",
        provider_type="lawyer",
        name="林晓艺 · 专利代理人",
        short_intro="硬件 / 医疗专利方向，发明专利撰写 500+ 件",
        regions=["北京", "全国"],
        practice_areas=["patent", "utility", "invention", "hardware"],
        languages=["中文"],
        featured_tags=["医疗专利", "AI 硬件"],
        rating_avg=4.7, orders_count=96, response_sla_minutes=90,
        win_rate=0.78, hourly_rate_range="1000-2000",
    ),
    dict(
        id="prov-seed-003",
        provider_type="lawyer",
        name="赵凌云 · 合同与劳动律师",
        short_intro="合同 / 竞业 / 股权纠纷，擅长 SaaS 创业公司",
        regions=["深圳", "广州"],
        practice_areas=["contract", "commercial", "labor"],
        languages=["中文"],
        featured_tags=["SaaS", "创业公司"],
        rating_avg=4.6, orders_count=74, response_sla_minutes=60,
        win_rate=0.75, hourly_rate_range="600-1200",
    ),
    dict(
        id="prov-seed-004",
        provider_type="law_firm",
        name="金诚律所 · 知识产权中心",
        short_intro="大型综合律所，能够承接专利侵权诉讼与复杂 IP 尽调",
        regions=["北京", "上海", "全国"],
        practice_areas=["litigation", "due_diligence", "patent", "trademark"],
        languages=["中文", "英文"],
        featured_tags=["诉讼", "尽调"],
        rating_avg=4.9, orders_count=212, response_sla_minutes=120,
        win_rate=0.88, hourly_rate_range="1500-3500",
    ),
    dict(
        id="prov-seed-005",
        provider_type="lawyer",
        name="陈若然 · 版权与文娱律师",
        short_intro="影视 / 文娱 / 二创版权专家，处理 150+ 版权纠纷",
        regions=["杭州", "上海"],
        practice_areas=["copyright", "entertainment", "content"],
        languages=["中文"],
        featured_tags=["影视版权", "文娱"],
        rating_avg=4.7, orders_count=64, response_sla_minutes=90,
        win_rate=0.79, hourly_rate_range="800-1500",
    ),
    dict(
        id="prov-seed-006",
        provider_type="lawyer",
        name="吴明昊 · 涉外 IP 律师",
        short_intro="美欧商标 / PCT 专利 / 海关备案，跨境业务首选",
        regions=["上海", "深圳", "全国"],
        practice_areas=["trademark", "patent", "cross-border", "customs"],
        languages=["中文", "英文", "日文"],
        featured_tags=["跨境", "海关备案", "涉外"],
        rating_avg=4.8, orders_count=102, response_sla_minutes=120,
        win_rate=0.81, hourly_rate_range="1500-3000",
    ),
    dict(
        id="prov-seed-007",
        provider_type="agency",
        name="华智专利代理机构",
        short_intro="TOP 20 专利代理机构，平均年申请量 3000 件",
        regions=["全国"],
        practice_areas=["patent", "utility", "invention", "design"],
        languages=["中文", "英文"],
        featured_tags=["专利代理", "批量撰写"],
        rating_avg=4.5, orders_count=480, response_sla_minutes=240,
        win_rate=0.76, hourly_rate_range="600-1800",
    ),
    dict(
        id="prov-seed-008",
        provider_type="lawyer",
        name="刘一鸣 · 合规 & 风控律师",
        short_intro="企业合规 / 数据安全 / ESG 方向，服务 20+ 上市公司",
        regions=["北京", "上海"],
        practice_areas=["compliance", "data_security", "commercial"],
        languages=["中文", "英文"],
        featured_tags=["上市合规", "数据"],
        rating_avg=4.6, orders_count=52, response_sla_minutes=120,
        win_rate=0.83, hourly_rate_range="1200-2500",
    ),
    dict(
        id="prov-seed-009",
        provider_type="lawyer",
        name="苏棠 · 商标申请代理",
        short_intro="专注商标全链路服务，擅长新消费品牌 25/29/30/35 类",
        regions=["杭州", "上海", "广州"],
        practice_areas=["trademark", "brand", "opposition"],
        languages=["中文"],
        featured_tags=["新消费", "商标"],
        rating_avg=4.5, orders_count=168, response_sla_minutes=60,
        win_rate=0.72, hourly_rate_range="500-1200",
    ),
    dict(
        id="prov-seed-010",
        provider_type="lawyer",
        name="周毅 · IP 诉讼律师",
        short_intro="专攻专利 / 商标侵权诉讼，代理 80+ 案件，胜诉率 85%",
        regions=["上海", "全国"],
        practice_areas=["litigation", "patent", "trademark", "infringement"],
        languages=["中文", "英文"],
        featured_tags=["诉讼", "维权"],
        rating_avg=4.9, orders_count=78, response_sla_minutes=180,
        win_rate=0.85, hourly_rate_range="1500-3500",
    ),
]

# 30 standardized products distributed across 10 providers.
PRODUCT_SEEDS = [
    # Cao Tianming — trademark
    ("prov-seed-001", "trademark", "商标注册 · 全流程代办", "覆盖查重 / 申请书 / 申报跟进 / 答复官方通知", 1800, "fixed", 30, ["查重报告", "申请书", "官方回执"]),
    ("prov-seed-001", "trademark", "商标驳回复审", "针对驳回通知书的专业复审方案", 6000, "quote", 45, ["复审意见书", "证据链"]),
    ("prov-seed-001", "trademark", "商标异议答辩", "面对他人提出的异议申请，专业律师起草答辩材料", 4500, "fixed", 20, ["答辩书"]),
    # Lin Xiaoyi — patent
    ("prov-seed-002", "patent", "发明专利撰写与申请", "专利代理人一对一撰写", 8800, "fixed", 60, ["专利说明书", "权利要求书"]),
    ("prov-seed-002", "patent", "实用新型专利申请", "面向结构与机械类创新", 3500, "fixed", 45, ["说明书", "附图"]),
    ("prov-seed-002", "patent", "专利可行性评估", "专利性初筛 + 风险评估", 1200, "fixed", 7, ["评估报告"]),
    # Zhao Lingyun — contracts
    ("prov-seed-003", "contract", "SaaS 服务协议审查", "IP 条款 / 免责 / 付款条款全面审查", 1500, "fixed", 5, ["审查意见书"]),
    ("prov-seed-003", "contract", "劳动合同 & 竞业协议定制", "符合最新劳动法的合规模板", 2500, "fixed", 10, ["合同模板", "说明注释"]),
    ("prov-seed-003", "contract", "股权激励协议设计", "适用于初创公司的 ESOP 方案", 12000, "quote", 30, ["协议文本", "授予规则"]),
    # Jincheng firm — litigation / dd
    ("prov-seed-004", "litigation", "专利侵权诉讼", "从起诉到判决全案代理", 60000, "quote", 180, ["起诉状", "证据材料"]),
    ("prov-seed-004", "due_diligence", "IP 尽调 (B 轮/并购用)", "全面的 IP 资产清点与风险报告", 30000, "quote", 21, ["尽调报告", "风险清单"]),
    ("prov-seed-004", "trademark", "高端品牌商标战略", "品牌保护布局与海外注册规划", 18000, "quote", 45, ["战略报告"]),
    # Chen Ruoran — copyright
    ("prov-seed-005", "copyright", "影视作品版权登记", "剧本 / 视频 / 音乐作品登记", 800, "fixed", 15, ["登记证书"]),
    ("prov-seed-005", "copyright", "二创内容版权风险评估", "针对 UGC / 二创内容的合规意见", 1500, "fixed", 5, ["评估报告"]),
    ("prov-seed-005", "copyright", "版权侵权维权", "侵权取证 + 律师函发送 + 谈判", 8000, "quote", 30, ["律师函", "证据包"]),
    # Wu Minghao — cross-border
    ("prov-seed-006", "trademark", "美国 / 欧盟商标申请", "跨境商标全链路代理", 8500, "fixed", 90, ["USPTO 证书", "申请材料"]),
    ("prov-seed-006", "patent", "PCT 国际专利申请", "PCT 途径进入美欧日", 15000, "fixed", 120, ["PCT 申请文件"]),
    ("prov-seed-006", "compliance", "海关知识产权备案", "防止货物被仿冒进出口", 3500, "fixed", 45, ["备案证书"]),
    # Huazhi — patent agency
    ("prov-seed-007", "patent", "批量发明专利撰写", "企业批量申请 10+ 发明专利", 7000, "fixed", 90, ["专利包"]),
    ("prov-seed-007", "patent", "外观设计专利申请", "产品外观专利快速保护", 2200, "fixed", 30, ["申请材料"]),
    ("prov-seed-007", "patent", "实审答辩", "发明专利实质审查意见答复", 4000, "fixed", 15, ["答辩意见"]),
    # Liu Yiming — compliance
    ("prov-seed-008", "compliance", "企业 IP 合规体检", "合规评分 + 整改建议", 8000, "fixed", 14, ["体检报告", "整改计划"]),
    ("prov-seed-008", "compliance", "数据安全合规审计", "等保 2.0 / 数据出境合规", 25000, "quote", 30, ["合规报告"]),
    ("prov-seed-008", "compliance", "上市 IPO IP 合规", "IPO 前的 IP 合规与风险排查", 80000, "quote", 60, ["专项报告", "律师意见"]),
    # Su Tang — trademark
    ("prov-seed-009", "trademark", "新消费品牌商标包", "多类目商标一次注册", 4500, "fixed", 30, ["多类申请材料"]),
    ("prov-seed-009", "trademark", "商标续展代办", "到期 10 年商标续展", 1200, "fixed", 15, ["续展申请"]),
    ("prov-seed-009", "trademark", "商标许可备案", "商标使用许可合同备案", 1800, "fixed", 20, ["备案证明"]),
    # Zhou Yi — litigation
    ("prov-seed-010", "litigation", "商标侵权维权", "发函 + 谈判 + 行政投诉或诉讼", 15000, "quote", 60, ["律师函", "维权方案"]),
    ("prov-seed-010", "litigation", "专利无效宣告", "代理专利无效宣告程序", 40000, "quote", 180, ["无效请求书"]),
    ("prov-seed-010", "litigation", "不正当竞争诉讼", "商业秘密 / 搭便车 / 混淆案件", 50000, "quote", 240, ["起诉材料"]),
]


def _upsert_provider(db, cfg: dict) -> LegalServiceProvider:
    now = utcnow()
    p = db.get(LegalServiceProvider, cfg["id"])
    if p is None:
        p = LegalServiceProvider(
            id=cfg["id"],
            provider_type=cfg["provider_type"],
            name=cfg["name"],
            short_intro=cfg["short_intro"],
            regions=cfg["regions"],
            practice_areas=cfg["practice_areas"],
            languages=cfg["languages"],
            featured_tags=cfg["featured_tags"],
            rating_avg=cfg["rating_avg"],
            orders_count=cfg["orders_count"],
            response_sla_minutes=cfg["response_sla_minutes"],
            win_rate=cfg["win_rate"],
            hourly_rate_range=cfg["hourly_rate_range"],
            verified_at=now - timedelta(days=200),
            status="active",
            created_at=now - timedelta(days=365),
        )
        db.add(p)
    return p


def _upsert_product(db, provider_id: str, idx: int, spec: tuple) -> ServiceProduct:
    pid = f"prod-seed-{provider_id[-3:]}-{idx:02d}"
    now = utcnow()
    existing = db.get(ServiceProduct, pid)
    if existing is not None:
        return existing
    category, name, summary, price, price_mode, delivery_days, deliverables = spec[1:]
    item = ServiceProduct(
        id=pid,
        provider_id=provider_id,
        category=category,
        name=name,
        summary=summary,
        price=price,
        price_mode=price_mode,
        delivery_days=delivery_days,
        deliverables=deliverables,
        status="active",
        sold_count=max(5, idx * 7),
        rating_avg=4.5 + (idx % 4) * 0.1,
        created_at=now - timedelta(days=60 + idx),
    )
    db.add(item)
    return item


def seed_a1plus_2_0(db, user: User) -> None:
    """Seed providers, products, a story-line matching request and an order
    for the demo user — enough to light up every new page without extra clicks.
    """
    now = utcnow()

    # ---- Providers ----
    existing_providers = db.scalar(
        select(LegalServiceProvider).where(LegalServiceProvider.id == "prov-seed-001").limit(1)
    )
    if existing_providers is None:
        for cfg in PROVIDER_SEEDS:
            _upsert_provider(db, cfg)
        db.flush()
        print(f"[+] Seeded {len(PROVIDER_SEEDS)} legal service providers")
    else:
        print("[=] Providers already present — skipped")

    # Backfill the persisted tag vector so /providers/depth and embedding
    # recall can read from disk without recomputing every time.
    from apps.api.app.services.matching_engine import recompute_provider_tag_vec

    for prov in db.scalars(select(LegalServiceProvider)).all():
        recompute_provider_tag_vec(db, prov, commit=False)
    db.flush()

    # ---- Products ----
    existing_product = db.scalar(
        select(ServiceProduct).where(ServiceProduct.id == "prod-seed-001-00").limit(1)
    )
    if existing_product is None:
        per_provider_index: dict[str, int] = {}
        for spec in PRODUCT_SEEDS:
            pid = spec[0]
            idx = per_provider_index.get(pid, 0)
            _upsert_product(db, pid, idx, spec)
            per_provider_index[pid] = idx + 1
        db.flush()
        print(f"[+] Seeded {len(PRODUCT_SEEDS)} service products")
    else:
        print("[=] Products already present — skipped")

    # ---- Profile tags ----
    has_tags = db.scalar(
        select(UserProfileTag).where(UserProfileTag.user_id == user.id).limit(1)
    )
    if has_tags is None:
        for cat, vals in {
            "intent": [("trademark", 0.92, "query")],
            "industry": [("跨境电商", 1.0, "profile")],
            "urgency": [("urgent", 0.85, "query")],
            "stage": [("growth", 1.0, "profile")],
            "focus": [("trademark", 0.9, "profile"), ("patent", 0.7, "profile")],
        }.items():
            for value, conf, src in vals:
                db.add(UserProfileTag(
                    id=str(uuid4()),
                    user_id=user.id,
                    tag_type=cat,
                    tag_value=value,
                    confidence=conf,
                    source=src,
                ))
        db.flush()
        print("[+] Seeded user profile tags")

    # ---- Story line: matching request + candidates ----
    has_match = db.scalar(
        select(MatchingRequest).where(MatchingRequest.user_id == user.id).limit(1)
    )
    if has_match is None:
        mr = MatchingRequest(
            id=str(uuid4()),
            user_id=user.id,
            intent_category="trademark",
            raw_query="做跨境电商，刚给产品起了名字，想尽快注册商标。",
            urgency="urgent",
            region="上海",
            budget_range="5000-20000",
            profile_snapshot={
                "industry": "跨境电商",
                "stage": "growth",
                "business_name": user.business_name,
            },
            profile_vector={
                "tags": ["trademark", "cross-border", "brand", "上海"],
                "intent_category": "trademark",
                "urgency": "urgent",
                "region": "上海",
            },
            status="matched",
            created_at=now - timedelta(hours=2),
        )
        db.add(mr)
        db.flush()

        for i, pid in enumerate(["prov-seed-001", "prov-seed-006", "prov-seed-009"]):
            provider = db.get(LegalServiceProvider, pid)
            if not provider:
                continue
            prod = db.scalar(
                select(ServiceProduct).where(ServiceProduct.provider_id == pid).limit(1)
            )
            db.add(MatchingCandidate(
                id=str(uuid4()),
                request_id=mr.id,
                provider_id=pid,
                product_id=prod.id if prod else None,
                rank=i + 1,
                score=92 - i * 8,
                reasons=[
                    "擅长「trademark」领域",
                    f"覆盖 {provider.regions[0]} 服务",
                    f"评分 {provider.rating_avg} / 5",
                    "命中 3 条需求标签",
                ][: 3 + (0 if i == 0 else -1)],
            ))
            # B 端：为每个候选生成一条 ProviderLead
            # 已认领的 lead 同时写入 last_viewed_at（律师查看过才会去认领）
            status = "new" if i != 1 else "claimed"
            db.add(ProviderLead(
                id=str(uuid4()),
                provider_id=pid,
                user_id=user.id,
                matching_request_id=mr.id,
                score=92 - i * 8,
                temperature="hot" if i == 0 else "warm" if i == 1 else "cool",
                status=status,
                snapshot={
                    "industry": "跨境电商",
                    "stage": "growth",
                    "intent": "trademark",
                    "urgency": "urgent",
                    "region": "上海",
                    "budget": "5000-20000",
                    "tags": ["trademark", "cross-border", "brand"],
                    "query_excerpt": mr.raw_query[:120],
                    "reasons": ["擅长「trademark」领域", "命中 3 条需求标签", "覆盖上海服务"],
                },
                expires_at=now + timedelta(days=7),
                created_at=now - timedelta(hours=2),
                last_viewed_at=(now - timedelta(hours=1)) if status == "claimed" else None,
            ))
        db.flush()
        print("[+] Seeded story-line matching request + 3 candidates + leads")

    # ---- Order (story line 2) ----
    has_order = db.scalar(
        select(ServiceOrder).where(ServiceOrder.user_id == user.id).limit(1)
    )
    if has_order is None:
        prod = db.scalar(
            select(ServiceProduct).where(ServiceProduct.provider_id == "prov-seed-001").limit(1)
        )
        db.add(ServiceOrder(
            id=str(uuid4()),
            order_no=f"A1P{now.strftime('%Y%m%d%H%M')}01",
            user_id=user.id,
            provider_id="prov-seed-001",
            product_id=prod.id if prod else None,
            amount=1800,
            currency="CNY",
            status="in_delivery",
            escrow_status="held",
            contract_envelope_id="SIG-MOCKORD1",
            contract_url="/mock-esign/SIG-MOCKORD1",
            milestones=[
                {"key": "quote", "title": "律师出具报价", "status": "done", "amount": 1800},
                {"key": "sign", "title": "双方电子签约", "status": "done"},
                {"key": "pay", "title": "托管支付", "status": "done"},
                {"key": "submit", "title": "协助提交至商标局", "status": "in_progress"},
                {"key": "deliver", "title": "交付成果", "status": "pending"},
                {"key": "accept", "title": "用户验收", "status": "pending"},
            ],
            created_at=now - timedelta(days=3),
        ))
        db.flush()
        print("[+] Seeded story-line service order")

    # ---- Consultation session (story line 3) ----
    has_consult = db.scalar(
        select(ConsultationSession).where(ConsultationSession.user_id == user.id).limit(1)
    )
    if has_consult is None:
        db.add(ConsultationSession(
            id=str(uuid4()),
            user_id=user.id,
            provider_id="prov-seed-001",
            topic="跨境电商商标注册咨询",
            channel="ai",
            status="ai_active",
            ai_confidence=0.9,
            transcript=[
                {"role": "user", "ts": now.isoformat(), "text": "帮我看看这个名字能不能注册商标"},
                {"role": "assistant", "ts": now.isoformat(), "text": "我已为你匹配 Top 3 商标律师，曹天明律师响应最快。"},
            ],
            created_at=now - timedelta(hours=3),
        ))
        db.flush()
        print("[+] Seeded consultation session")

    # ---- Compliance profile ----
    has_profile = db.scalar(
        select(ComplianceProfile).where(ComplianceProfile.owner_user_id == user.id).limit(1)
    )
    if has_profile is None:
        profile = ComplianceProfile(
            id=str(uuid4()),
            owner_user_id=user.id,
            company_name=user.business_name or "示例科技有限公司",
            industry=user.industry or "跨境电商",
            scale="30-100人",
            compliance_score=62,
            score_breakdown={"trademark": 15, "patent": 0, "copyright": 10, "contract": 10, "policy": 10},
            risk_heatmap={
                "brand_protection": 80,
                "technology_protection": 30,
                "software_copyright": 85,
                "contract_hygiene": 60,
                "policy_awareness": 55,
            },
            asset_summary={"total": 7, "by_type": {"trademark": 3, "patent": 1, "soft-copyright": 2, "copyright": 1}},
            subscription_tier="free",
            last_audit_at=now - timedelta(hours=6),
            created_at=now - timedelta(days=5),
        )
        db.add(profile)
        db.flush()
        db.add_all([
            ComplianceFinding(
                id=str(uuid4()), profile_id=profile.id,
                severity="medium", category="patent",
                title="核心技术未专利化",
                description="存在核心技术未提交专利保护的风险。",
                remediation="建议撰写 1-2 项实用新型或发明专利。",
                recommended_products=["patent.assess", "patent.draft"],
                status="open",
            ),
            ComplianceFinding(
                id=str(uuid4()), profile_id=profile.id,
                severity="low", category="contract",
                title="合作协议 IP 归属条款建议专项审查",
                description="外包 / 咨询 / 雇佣合同中 IP 归属条款是常见争议点。",
                remediation="上传代表性合同让律师审查。",
                recommended_products=["contract.review"],
                status="open",
            ),
            ComplianceFinding(
                id=str(uuid4()), profile_id=profile.id,
                severity="low", category="policy",
                title="行业政策订阅未开启",
                description="建议订阅政策雷达以及时获取最新合规要求。",
                remediation="开通政策雷达订阅（免费）。",
                recommended_products=["policy.radar"],
                status="open",
            ),
        ])
        db.flush()
        print("[+] Seeded compliance profile + 3 findings")


def seed_litigation_demo(db, user: User) -> None:
    """Seed 3 litigation cases (low / high / medium) with predictions + precedents.

    Idempotent: skips if the demo user already has litigation cases.
    """
    existing = db.scalars(
        select(LitigationCase).where(LitigationCase.user_id == user.id)
    ).all()
    if existing:
        print(f"[=] Litigation demos already exist ({len(existing)}) — skip")
        return

    # Inline prediction fixtures — the legacy MockLitigationPredictorAdapter
    # was removed when the mock adapter module was deleted. We bake the
    # prediction outputs straight into the demo data so seeding stays offline
    # (matches the philosophy of the rest of seed_demo.py).
    demos: list[dict] = [
        {
            "title": "被诉商标侵权 · 电商类目",
            "case_type": "trademark_infringement",
            "role": "defendant",
            "jurisdiction": "上海知识产权法院",
            "summary": "我方为天猫店铺，被品牌方指控销售近似标识商品，对方索赔 80 万，尚未应诉。",
            "evidence_score": 3,
            "claim_amount": 800_000,
            "extras": {"opponent_scale": "enterprise", "has_expert_witness": False, "prior_negotiation": False},
            "prediction": {
                "win_probability": 0.28,
                "risk_level": "high",
                "headline": "证据偏弱 · 建议优先和解",
                "money_low": 200_000,
                "money_high": 600_000,
                "money_currency": "CNY",
                "duration_days_low": 90,
                "duration_days_high": 240,
                "strategies": [
                    {"key": "negotiation", "title": "主动和解", "rationale": "对方为大型品牌方且证据齐备，和解成本可控。"},
                    {"key": "evidence_supplement", "title": "补强使用证据", "rationale": "如能证明独立来源可显著降低赔偿。"},
                ],
                "evidence_checklist": [
                    "进货合同 / 海关单证",
                    "供应商资质",
                    "店铺销售流水",
                ],
                "probability_factors": [
                    {"key": "evidence_score", "label": "证据评分 3/10", "impact": -0.25},
                    {"key": "opponent_scale", "label": "对方为大型企业", "impact": -0.10},
                ],
                "rationale": "作为被告且证据偏弱，胜诉概率较低，建议争取和解或大幅压低赔偿。",
                "precedents": [
                    {
                        "title": "上海某知名品牌 vs. 天猫店铺商标侵权案",
                        "case_no": "(2023) 沪73民初 1234 号",
                        "court": "上海知识产权法院",
                        "year": 2023,
                        "outcome": "原告胜诉，赔偿 35 万",
                        "similarity": 0.78,
                        "takeaway": "类案中被告均为店铺，进货合规但仍被判侵权。",
                        "url": None,
                    },
                ],
            },
        },
        {
            "title": "起诉竞品专利侵权 · 消费电子",
            "case_type": "patent_infringement",
            "role": "plaintiff",
            "jurisdiction": "最高人民法院知识产权法庭",
            "summary": "我方核心结构专利被竞品仿制，产品铺货 18 个月，已做公证保全并聘请专家出具比对意见。",
            "evidence_score": 9,
            "claim_amount": 5_000_000,
            "extras": {"opponent_scale": "sme", "has_expert_witness": True, "prior_negotiation": True},
            "prediction": {
                "win_probability": 0.82,
                "risk_level": "low",
                "headline": "证据扎实 · 建议立即立案",
                "money_low": 800_000,
                "money_high": 2_200_000,
                "money_currency": "CNY",
                "duration_days_low": 180,
                "duration_days_high": 420,
                "strategies": [
                    {"key": "file_lawsuit", "title": "立即立案", "rationale": "证据完整且已先行谈判，可进入诉讼程序。"},
                    {"key": "preservation", "title": "财产保全", "rationale": "对方为中小企业，应同步申请财产保全防止转移。"},
                ],
                "evidence_checklist": [
                    "专利证书 + 年费缴纳记录",
                    "公证保全侵权产品",
                    "侵权比对鉴定意见",
                    "对方销售数据",
                ],
                "probability_factors": [
                    {"key": "evidence_score", "label": "证据评分 9/10", "impact": 0.25},
                    {"key": "expert_witness", "label": "已聘请技术专家", "impact": 0.10},
                    {"key": "prior_negotiation", "label": "已先行谈判", "impact": 0.05},
                ],
                "rationale": "证据齐备 + 专家意见 + 谈判基础完整，胜诉与赔偿区间均较高。",
                "precedents": [
                    {
                        "title": "深圳某科技 vs. 同行专利侵权案",
                        "case_no": "(2022) 最高法知民终 567 号",
                        "court": "最高人民法院知识产权法庭",
                        "year": 2022,
                        "outcome": "原告胜诉，判赔 1500 万",
                        "similarity": 0.81,
                        "takeaway": "类案中证据扎实的原告均获高额赔偿。",
                        "url": None,
                    },
                ],
            },
        },
        {
            "title": "短视频平台搬运索赔",
            "case_type": "copyright_infringement",
            "role": "plaintiff",
            "jurisdiction": "杭州互联网法院",
            "summary": "我方原创视频被某 MCN 搬运，单条播放 400 万，已固定 20 条侵权链接，尚未走过商业谈判。",
            "evidence_score": 6,
            "claim_amount": 300_000,
            "extras": {"opponent_scale": "enterprise", "has_expert_witness": False, "prior_negotiation": False},
            "prediction": {
                "win_probability": 0.55,
                "risk_level": "medium",
                "headline": "证据中等 · 建议先发函再考虑诉讼",
                "money_low": 50_000,
                "money_high": 180_000,
                "money_currency": "CNY",
                "duration_days_low": 60,
                "duration_days_high": 180,
                "strategies": [
                    {"key": "lawyer_letter", "title": "律师函 + 平台投诉", "rationale": "先压缩对方播放量，再视回应决定是否起诉。"},
                    {"key": "negotiation", "title": "商业谈判", "rationale": "MCN 通常愿意以授权费 + 下架达成和解。"},
                ],
                "evidence_checklist": [
                    "原创视频底稿与发布时间戳",
                    "侵权链接公证",
                    "平台播放数据截图",
                ],
                "probability_factors": [
                    {"key": "evidence_score", "label": "证据评分 6/10", "impact": 0.05},
                    {"key": "opponent_scale", "label": "对方为大型 MCN", "impact": -0.05},
                    {"key": "prior_negotiation", "label": "未先行谈判", "impact": -0.05},
                ],
                "rationale": "证据中等且未先行谈判，建议先以律师函 + 平台投诉施压。",
                "precedents": [
                    {
                        "title": "某 UP 主 vs. MCN 搬运案",
                        "case_no": "(2023) 浙 0192 民初 987 号",
                        "court": "杭州互联网法院",
                        "year": 2023,
                        "outcome": "原告胜诉，赔偿 8 万",
                        "similarity": 0.69,
                        "takeaway": "互联网法院类案赔偿金额普遍偏低，但下架与公开道歉常见。",
                        "url": None,
                    },
                ],
            },
        },
    ]

    for demo in demos:
        case = LitigationCase(
            id=str(uuid4()),
            user_id=user.id,
            title=demo["title"],
            case_type=demo["case_type"],
            role=demo["role"],
            jurisdiction=demo["jurisdiction"],
            summary=demo["summary"],
            evidence_score=demo["evidence_score"],
            claim_amount=demo["claim_amount"],
            extras=demo["extras"],
            status="predicted",
        )
        db.add(case)
        db.flush()

        data = demo["prediction"]
        prediction = LitigationPrediction(
            id=str(uuid4()),
            case_id=case.id,
            win_probability=float(data["win_probability"]),
            risk_level=data["risk_level"],
            headline=data["headline"],
            money_low=int(data["money_low"]),
            money_high=int(data["money_high"]),
            money_currency=data.get("money_currency", "CNY"),
            duration_days_low=int(data["duration_days_low"]),
            duration_days_high=int(data["duration_days_high"]),
            strategies=data["strategies"],
            evidence_checklist=data["evidence_checklist"],
            probability_factors=data["probability_factors"],
            rationale=data["rationale"],
            source_mode="real",
            trace_id=f"seed-litigation-{case.id[:8]}",
        )
        db.add(prediction)
        db.flush()

        for precedent in data.get("precedents", []):
            db.add(LitigationPrecedent(
                id=str(uuid4()),
                prediction_id=prediction.id,
                title=precedent["title"],
                case_no=precedent.get("case_no"),
                court=precedent.get("court"),
                year=precedent.get("year"),
                outcome=precedent.get("outcome"),
                similarity=float(precedent.get("similarity", 0.0)),
                takeaway=precedent.get("takeaway"),
                url=precedent.get("url"),
            ))
    db.flush()
    print(f"[+] Seeded {len(demos)} litigation demos + predictions + precedents")


def seed_firm_members(db) -> None:
    """Seed firm members for a few providers to showcase 多账号 + 线索分配."""
    now = utcnow()
    existing = db.query(FirmMember).count()
    if existing > 0:
        print(f"[=] Firm members already present ({existing}) — skipped")
        return

    firm_plan = [
        ("prov-seed-001", [
            ("chen-weiming", "陈伟明", "partner", ["patent", "ip_strategy"], "weiming.chen@a1ip.com"),
            ("chen-xiaoli", "陈晓莉", "associate", ["patent_drafting"], "xiaoli.chen@a1ip.com"),
            ("chen-paralegal", "王小助", "paralegal", ["filing", "docketing"], "xiao.wang@a1ip.com"),
        ]),
        ("prov-seed-002", [
            ("zhang-xiaojing", "张晓静", "partner", ["trademark", "global_portfolio"], "xj.zhang@a1ip.com"),
            ("zhang-junior", "李雪", "associate", ["trademark_opposition"], "xue.li@a1ip.com"),
        ]),
        ("prov-seed-003", [
            ("lin-junjie", "林俊杰", "partner", ["litigation", "patent_invalidity"], "junjie.lin@a1ip.com"),
            ("lin-associate", "马一凡", "associate", ["litigation_support"], "yifan.ma@a1ip.com"),
            ("lin-researcher", "徐浩", "associate", ["prior_art", "technical_research"], "hao.xu@a1ip.com"),
        ]),
        ("prov-seed-008", [
            ("liu-yiming", "刘一鸣", "partner", ["compliance", "data_security"], "yiming.liu@a1ip.com"),
            ("liu-auditor", "陈晓雯", "associate", ["audit", "policy"], "xiaowen.chen@a1ip.com"),
        ]),
    ]

    created = 0
    for provider_id, members in firm_plan:
        provider = db.get(LegalServiceProvider, provider_id)
        if provider is None:
            continue
        for idx, (slug, display_name, role, specialties, email) in enumerate(members):
            member = FirmMember(
                id=f"fm-{provider_id[-3:]}-{slug}",
                provider_id=provider_id,
                display_name=display_name,
                role=role,
                specialties=specialties,
                email=email,
                active_leads=3 + idx,
                closed_leads=12 + idx * 4,
                active=True,
                created_at=now - timedelta(days=120 - idx * 10),
            )
            db.add(member)
            created += 1
    db.flush()
    print(f"[+] Seeded {created} firm members across {len(firm_plan)} providers")


def seed_policy_subscriptions(db, user: User) -> None:
    """Seed policy radar subscriptions for the demo user — 合规SaaS + 场景化推送."""
    existing = db.query(PolicySubscription).filter(PolicySubscription.user_id == user.id).count()
    if existing > 0:
        print(f"[=] Policy subscriptions already present ({existing}) — skipped")
        return

    now = utcnow()
    topics = [
        ("人工智能", "AI 生成内容版权", "weekly", ["inapp", "email"], True, 2),
        ("跨境电商", "跨境商标与海关备案", "weekly", ["inapp", "wechat"], True, 5),
        ("数据合规", "数据出境与 DSA", "daily", ["inapp", "email"], True, 1),
        ("消费电子", "专利许可费率动态", "on_change", ["inapp"], True, 14),
        ("内容平台", "短视频 / 直播版权新规", "weekly", ["inapp"], False, 30),
    ]
    for industry, topic, freq, channels, active, days_ago in topics:
        sub = PolicySubscription(
            id=str(uuid4()),
            user_id=user.id,
            industry=industry,
            topic=topic,
            frequency=freq,
            channels=channels,
            active=active,
            last_sent_at=now - timedelta(days=days_ago),
            created_at=now - timedelta(days=days_ago + 30),
        )
        db.add(sub)
    db.flush()
    print(f"[+] Seeded {len(topics)} policy subscriptions for demo user")


# ==============================================================================
# Full-feature backfill — give the demo account a believable history across every
# module / page so a reviewer doesn't see empty states anywhere. All helpers are
# idempotent and skip when their target rows already exist.
# ==============================================================================


DEMO_TENANT_ID = "tenant-demo-0001"


def seed_demo_lawyer(db) -> None:
    """Create the 律师演示账号 and link it to prov-seed-001 as that provider's
    logged-in user. Without this, logging into /provider returns 403 because
    require_provider asserts LegalServiceProvider.user_id == current_user.id.
    """
    lawyer = db.scalar(select(User).where(User.email == DEMO_LAWYER_EMAIL))
    if lawyer is None:
        lawyer = User(
            id=str(uuid4()),
            email=DEMO_LAWYER_EMAIL,
            full_name=DEMO_LAWYER_NAME,
            password_hash=hash_password(DEMO_LAWYER_PASSWORD),
            role="provider",
            business_name="诚信律师事务所（演示）",
            business_description="演示用律师账号 — 绑定曹天明律师 provider 档案，用于展示 B 端工作台。",
            industry="legal_services",
            stage="mature",
            applicant_type="individual",
            applicant_name=DEMO_LAWYER_NAME,
            has_trademark=False,
            has_patent=False,
            ip_focus="trademark",
        )
        db.add(lawyer)
        db.flush()
        print(f"[+] Created demo lawyer user  id={lawyer.id}")
    else:
        lawyer.password_hash = hash_password(DEMO_LAWYER_PASSWORD)
        lawyer.full_name = DEMO_LAWYER_NAME
        lawyer.role = "provider"
        print(f"[=] Demo lawyer user already exists id={lawyer.id} — refreshed password")

    provider = db.get(LegalServiceProvider, DEMO_LAWYER_PROVIDER_ID)
    if provider is None:
        print(f"[!] Provider {DEMO_LAWYER_PROVIDER_ID} missing — skipping lawyer link")
        return

    if provider.user_id != lawyer.id:
        provider.user_id = lawyer.id
        db.flush()
        print(
            f"[+] Linked provider {DEMO_LAWYER_PROVIDER_ID} → lawyer user {lawyer.id}"
        )
    else:
        print(f"[=] Provider {DEMO_LAWYER_PROVIDER_ID} already linked to lawyer")


def seed_demo_tenant(db, user: User) -> None:
    """Ensure the demo user is linked to a tenant so tenant-scoped queries work."""
    tenant = db.get(Tenant, DEMO_TENANT_ID)
    if tenant is None:
        tenant = Tenant(
            id=DEMO_TENANT_ID,
            name="示例科技 · 演示组织",
            slug="demo-org",
            plan="pro",
        )
        db.add(tenant)
        db.flush()
        print(f"[+] Seeded demo tenant id={tenant.id}")
    else:
        print("[=] Demo tenant already exists — skipped")

    if user.tenant_id != tenant.id:
        user.tenant_id = tenant.id
        db.flush()
        print(f"[+] Linked demo user to tenant {tenant.id}")

    # Backfill tenant_id on any demo-owned rows that were inserted before the
    # tenant existed (e.g. pre-existing seed runs from older versions of this
    # script). /reminders joins IpAsset.tenant_id and returns nothing when the
    # assets have a NULL tenant.
    updated_assets = (
        db.query(IpAsset)
        .filter(IpAsset.owner_id == user.id)
        .filter((IpAsset.tenant_id.is_(None)) | (IpAsset.tenant_id != tenant.id))
        .update({IpAsset.tenant_id: tenant.id}, synchronize_session=False)
    )
    if updated_assets:
        db.flush()
        print(f"[+] Backfilled tenant_id on {updated_assets} IP assets")

    # Same backfill for workflow_instances so /workflows?status=running (which
    # is tenant-scoped) returns the currently-running demo workflow.
    updated_wfs = (
        db.query(WorkflowInstance)
        .filter(WorkflowInstance.user_id == user.id)
        .filter(
            (WorkflowInstance.tenant_id.is_(None))
            | (WorkflowInstance.tenant_id != tenant.id)
        )
        .update(
            {WorkflowInstance.tenant_id: tenant.id},
            synchronize_session=False,
        )
    )
    if updated_wfs:
        db.flush()
        print(f"[+] Backfilled tenant_id on {updated_wfs} workflow instances")


def _seed_completed_job(
    db,
    *,
    job_type: str,
    seed_key: str,
    payload: dict,
    result: dict,
    days_ago: int,
    tenant_id: str | None,
) -> JobRecord:
    """Insert a completed JobRecord with a deterministic idempotency key.

    Skips if a row with the same idempotency key already exists.
    """
    idem = f"seed-{job_type}-{seed_key}"
    existing = db.query(JobRecord).filter(JobRecord.idempotency_key == idem).first()
    if existing:
        return existing
    created = utcnow() - timedelta(days=days_ago)
    job = JobRecord(
        id=str(uuid4()),
        tenant_id=tenant_id,
        job_type=job_type,
        status="completed",
        idempotency_key=idem,
        payload=payload,
        result=result,
        attempts=1,
        run_after=created,
        created_at=created,
        updated_at=created,
    )
    db.add(job)
    db.flush()
    return job


def seed_module_results(db, user: User) -> None:
    """Backfill 1 ModuleResult per module_type plus the JobRecord that produced it.

    Covers: diagnosis, trademark_check, monitoring (extra), competitor (track +
    compare), contract, patent, policy, due-diligence — every type the codebase
    persists today via apps/api/app/services/jobs.py::_save_module_result and
    workflow_engine / profile_engine queries.
    """
    existing = (
        db.query(ModuleResult).filter(ModuleResult.user_id == user.id).count()
    )
    if existing > 0:
        print(f"[=] Module results already present ({existing}) — skipped")
        return

    tenant_id = user.tenant_id
    plans: list[tuple[str, str, str, dict, dict]] = [
        # (module_type, job_type, seed_key, payload, normalized_result)
        (
            "diagnosis",
            "diagnosis.report",
            "diag-01",
            {
                "_user_id": user.id,
                "industry": user.industry or "软件服务",
                "stage": user.stage or "成长期",
                "businessName": user.business_name or "示例科技有限公司",
                "businessDescription": user.business_description or "",
            },
            {
                "mode": "real",
                "provider": "doubao-seed",
                "normalizedPayload": {
                    "summary": "建议优先完成 35/9 类商标布局，并在 6 个月内提交 1 项发明专利。",
                    "risks": [
                        {"level": "high", "title": "核心商标未申请", "detail": "主品牌示例科技尚未在 35 类注册。"},
                        {"level": "medium", "title": "软著未登记", "detail": "云协同平台核心模块未登记软件著作权。"},
                    ],
                    "actions": [
                        {"key": "trademark.apply", "label": "提交 35 类商标申请", "priority": "high"},
                        {"key": "patent.assess", "label": "评估 AI 文本生成方法专利", "priority": "medium"},
                    ],
                },
                "disclaimer": "仅供参考，以官方为准",
            },
        ),
        (
            "trademark-check",
            "trademark.check",
            "tmck-01",
            {"_user_id": user.id, "name": "示例AI助手", "categories": [9, 35, 42]},
            {
                "mode": "real",
                "provider": "cnipa-snapshot",
                "normalizedPayload": {
                    "name": "示例AI助手",
                    "totalHits": 6,
                    "riskLevel": "yellow",
                    "conflicts": [
                        {"name": "示例AI", "applicant": "上海某某网络", "category": 9, "similarity": 0.74},
                        {"name": "智例AI", "applicant": "深圳智例", "category": 42, "similarity": 0.61},
                    ],
                    "recommendation": "可继续申请，但建议补充近似设计声明并优先 35 类。",
                },
                "disclaimer": "仅供参考，以官方为准",
            },
        ),
        (
            "monitoring",
            "monitoring.scan",
            "mon-extra-01",
            {"_user_id": user.id, "query": "示例AI助手"},
            {
                "mode": "real",
                "provider": "bing+kb",
                "normalizedPayload": {
                    "query": "示例AI助手",
                    "alerts": [
                        {"severity": "high", "threat_type": "squatting", "title": "示例AI助手 商标抢注 2 件"},
                        {"severity": "medium", "threat_type": "knockoff", "title": "近似 logo 出现于淘宝店铺"},
                    ],
                    "total": 2,
                    "high_count": 1,
                },
                "disclaimer": "仅供参考，以官方为准",
            },
        ),
        (
            "competitor",
            "competitor.track",
            "comp-track-01",
            {"_user_id": user.id, "company_name": "示例对手科技"},
            {
                "mode": "real",
                "provider": "tianyancha",
                "normalizedPayload": {
                    "company": "示例对手科技",
                    "newTrademarks": 3,
                    "newPatents": 1,
                    "fundingRound": "A+",
                    "highlights": [
                        "新申请商标 3 件，覆盖 9/35/42 类",
                        "完成 A+ 轮融资 5000 万",
                        "招聘 NLP 算法岗位 12 个",
                    ],
                },
                "disclaimer": "仅供参考，以官方为准",
            },
        ),
        (
            "competitor",
            "competitor.compare",
            "comp-compare-01",
            {"_user_id": user.id, "companies": ["示例科技有限公司", "示例对手科技"]},
            {
                "mode": "real",
                "provider": "tianyancha",
                "normalizedPayload": {
                    "rows": [
                        {"company": "示例科技有限公司", "trademarks": 3, "patents": 1, "softCopyrights": 2},
                        {"company": "示例对手科技", "trademarks": 8, "patents": 4, "softCopyrights": 1},
                    ],
                    "advice": "对手商标布局领先，建议本季度补齐 9/42 类核心商标。",
                },
                "disclaimer": "仅供参考，以官方为准",
            },
        ),
        (
            "contract",
            "contract.review",
            "contract-01",
            {"_user_id": user.id, "contract_text": "（示例 SaaS 服务协议节选 …）"},
            {
                "mode": "real",
                "provider": "doubao-seed",
                "normalizedPayload": {
                    "title": "SaaS 服务协议 v1.2",
                    "riskLevel": "medium",
                    "issues": [
                        {"severity": "high", "clause": "第 9 条 知识产权归属", "advice": "需要明确二次开发成果归属于甲方。"},
                        {"severity": "medium", "clause": "第 12 条 责任限制", "advice": "建议加入数据丢失/中断的 SLA 上限。"},
                        {"severity": "low", "clause": "第 14 条 终止", "advice": "续费默认条款建议改为提前 30 天书面通知。"},
                    ],
                    "summary": "整体可签，但建议先修订 IP 归属与责任限制条款。",
                },
                "disclaimer": "仅供参考，以官方为准",
            },
        ),
        (
            "patent",
            "patent.assess",
            "patent-01",
            {"_user_id": user.id, "description": "一种基于大模型的合同条款风险识别方法"},
            {
                "mode": "real",
                "provider": "doubao-seed",
                "normalizedPayload": {
                    "patentability": "high",
                    "noveltyScore": 0.78,
                    "inventiveStepScore": 0.72,
                    "claimDraft": "1. 一种基于大模型的合同条款风险识别方法，包括 …",
                    "recommendation": "建议作为发明专利申请，可同步申请实用新型作为兜底。",
                    "priorArt": [
                        {"title": "CN20231234567A 合同条款风险识别系统", "similarity": 0.41},
                    ],
                },
                "disclaimer": "仅供参考，以官方为准",
            },
        ),
        (
            "policy",
            "policy.digest",
            "policy-01",
            {"_user_id": user.id, "industry": user.industry or "跨境电商"},
            {
                "mode": "real",
                "provider": "policy-radar",
                "normalizedPayload": {
                    "industry": user.industry or "跨境电商",
                    "policies": [
                        {"title": "《商标审查审理指南》局部修订", "impact": "high", "effective": "2026-03-01"},
                        {"title": "跨境数据出境标准合同备案细则", "impact": "high", "effective": "2026-02-15"},
                        {"title": "短视频版权保护新规", "impact": "medium", "effective": "2026-04-01"},
                    ],
                },
                "disclaimer": "仅供参考，以官方为准",
            },
        ),
        (
            "due-diligence",
            "due-diligence.investigate",
            "dd-01",
            {"_user_id": user.id, "company_name": "示例科技有限公司"},
            {
                "mode": "real",
                "provider": "tianyancha+kb",
                "normalizedPayload": {
                    "company": "示例科技有限公司",
                    "ipAssets": {"trademark": 3, "patent": 1, "softCopyright": 2, "copyright": 1},
                    "riskFlags": [
                        {"level": "medium", "title": "1 件商标即将到期", "detail": "ShiliKeji（45 天）"},
                        {"level": "low", "title": "未登记的核心算法", "detail": "建议提交 1 项发明专利以构筑壁垒。"},
                    ],
                    "summary": "整体 IP 资产健康，主要风险在续展与核心专利缺失。",
                },
                "disclaimer": "仅供参考，以官方为准",
            },
        ),
    ]

    created = 0
    for module_type, job_type, seed_key, payload, result in plans:
        job = _seed_completed_job(
            db,
            job_type=job_type,
            seed_key=seed_key,
            payload=payload,
            result=result,
            days_ago=14 - created,
            tenant_id=tenant_id,
        )
        db.add(
            ModuleResult(
                id=str(uuid4()),
                tenant_id=tenant_id,
                user_id=user.id,
                module_type=module_type,
                job_id=job.id,
                result_data=result,
            )
        )
        created += 1
    db.flush()
    print(f"[+] Seeded {created} module results + matching completed jobs")


def seed_document_records(db, user: User) -> None:
    """Backfill a trademark.application JobRecord + DocumentRecord for the demo.

    The PDF/DOCX files are NOT actually written; the routes return 404 on
    missing files which is expected for fixture downloads. The metadata is
    enough to populate /trademarks history pages.
    """
    existing = (
        db.query(DocumentRecord)
        .join(JobRecord, DocumentRecord.job_id == JobRecord.id)
        .filter(JobRecord.idempotency_key == "seed-trademark.application-doc-01")
        .first()
    )
    if existing is not None:
        print("[=] Document records already present — skipped")
        return

    tenant_id = user.tenant_id
    payload = {
        "_user_id": user.id,
        "trademark_name": "示例AI助手",
        "applicant_name": user.applicant_name or "示例科技有限公司",
        "categories": [9, 35, 42],
        "risk_level": "yellow",
    }
    draft_id = str(uuid4())
    result = {
        "mode": "real",
        "provider": "doubao+pdf",
        "normalizedPayload": {
            "draftId": draft_id,
            "trademarkName": payload["trademark_name"],
            "applicantName": payload["applicant_name"],
            "categories": payload["categories"],
            "riskLevel": payload["risk_level"],
            "documentLabels": ["Application Form", "Category Advice", "Risk Notes", "Submission Guide"],
            "downloadEndpoints": {
                "docx": f"/trademarks/documents/{draft_id}.docx",
                "pdf": f"/trademarks/documents/{draft_id}.pdf",
            },
        },
        "disclaimer": "仅供参考，以官方为准",
    }
    job = _seed_completed_job(
        db,
        job_type="trademark.application",
        seed_key="doc-01",
        payload=payload,
        result=result,
        days_ago=20,
        tenant_id=tenant_id,
    )
    base = "apps/api/.generated/seed"
    record = DocumentRecord(
        id=draft_id,
        job_id=job.id,
        docx_path=f"{base}/{draft_id}.docx",
        pdf_path=f"{base}/{draft_id}.pdf",
        document_metadata={
            "trademark_name": payload["trademark_name"],
            "applicant_name": payload["applicant_name"],
            "categories": payload["categories"],
            "risk_level": payload["risk_level"],
        },
    )
    db.add(record)
    db.flush()

    # ModuleResult so /trademark/application + /trademark/submit history pages
    # (which query `?module_type=application_generate`) see this draft. The
    # runtime trademark.application job does NOT call _save_module_result, so
    # this row is demo-only: it lets the reviewer open the submit-guide page
    # and land directly on a prefilled draft.
    db.add(
        ModuleResult(
            id=str(uuid4()),
            tenant_id=tenant_id,
            user_id=user.id,
            module_type="application_generate",
            job_id=job.id,
            result_data=result,
        )
    )
    db.flush()
    print(f"[+] Seeded trademark.application job + document record id={record.id}")


def seed_notifications(db, user: User) -> None:
    """Backfill 6 inbox notifications mirroring BUILTIN_RULES scenarios.

    Mix of read / unread so /inbox renders both states.
    """
    existing = db.query(Notification).filter(Notification.user_id == user.id).count()
    if existing > 0:
        print(f"[=] Notifications already present ({existing}) — skipped")
        return

    now = utcnow()
    tenant_id = user.tenant_id
    items = [
        # (category, priority, title, body, action_url, action_label, days_ago, read_after_days)
        (
            "monitoring", "high",
            "侵权监控告警 · 示例科技",
            "本周扫描发现 3 条告警，其中 1 条高危（电商平台疑似假冒商品）。",
            "/monitoring", "查看告警", 0, None,
        ),
        (
            "trademark", "high",
            "商标红旗：示例AI助手 35 类近似",
            "AI 已识别近似商标 2 件，建议在提交前先做异议预案。",
            "/trademarks/示例AI助手", "查看详情", 1, None,
        ),
        (
            "asset", "medium",
            "ShiliKeji 商标 45 天后到期",
            "建议尽快启动续展流程，已为你预约提醒。",
            "/assets", "立即续展", 2, 1,
        ),
        (
            "policy", "high",
            "命中 2 条高影响政策",
            "《商标审查审理指南》局部修订与跨境数据出境备案细则均与你相关。",
            "/policy-radar", "查看政策", 3, 2,
        ),
        (
            "compliance", "medium",
            "合规体检评分 62（中等风险）",
            "建议优先补齐核心专利与合同 IP 归属条款。",
            "/enterprise", "查看体检报告", 5, 4,
        ),
        (
            "litigation", "high",
            "起诉竞品专利侵权 · 高赢面",
            "AI 预测胜诉率 82%，赔偿区间 ¥80 万 - ¥220 万，建议尽快立案。",
            "/litigation", "查看推演", 6, 5,
        ),
    ]
    for category, priority, title, body, url, label, days_ago, read_after in items:
        created = now - timedelta(days=days_ago)
        read_at = (
            None if read_after is None else (created + timedelta(days=read_after))
        )
        db.add(
            Notification(
                id=str(uuid4()),
                tenant_id=tenant_id,
                user_id=user.id,
                category=category,
                priority=priority,
                title=title,
                body=body,
                action_url=url,
                action_label=label,
                read_at=read_at,
                created_at=created,
            )
        )
    db.flush()
    print(f"[+] Seeded {len(items)} inbox notifications")


def seed_automation_rules(db, user: User) -> None:
    """Backfill 3 user-scoped AutomationRule rows so /automation isn't empty.

    System (sys.*) rules are seeded separately by automation_engine.seed_builtin_rules.
    These are user-personalised customisations.
    """
    user_rule_keys = [f"user.{user.id}.{k}" for k in (
        "trademark_renewal_30d",
        "lead_hot_wechat_push",
        "monitoring_high_severity_email",
    )]
    existing = (
        db.query(AutomationRule)
        .filter(AutomationRule.rule_key.in_(user_rule_keys))
        .count()
    )
    if existing > 0:
        print(f"[=] User automation rules already present ({existing}) — skipped")
        return

    now = utcnow()
    tenant_id = user.tenant_id
    rules = [
        (
            user_rule_keys[0],
            "event",
            {"event_type": "asset.expiring_soon"},
            "event.payload.get('days_until_expiry') and event.payload['days_until_expiry'] <= 30",
            "create_notification",
            {"priority": "high", "category": "asset", "title_template": "{asset_name} 30 天内到期"},
            "商标 / 专利到期前 30 天 → 站内高优先级提醒",
            12,
        ),
        (
            user_rule_keys[1],
            "event",
            {"event_type": "provider.lead_created"},
            "event.payload.get('temperature') == 'hot'",
            "emit_notification",
            {"priority": "high", "category": "lead", "channels": ["wechat", "inapp"]},
            "新增 hot 线索 → 微信 + 站内同时推送",
            8,
        ),
        (
            user_rule_keys[2],
            "event",
            {"event_type": "monitoring.alert"},
            "event.payload.get('high_count', 0) >= 1",
            "emit_notification",
            {"priority": "high", "category": "monitoring", "channels": ["email", "inapp"]},
            "监控扫描出现高危告警 → 邮件 + 站内通知",
            5,
        ),
    ]
    for key, trig, trig_cfg, cond, action, action_cfg, desc, days_ago in rules:
        db.add(
            AutomationRule(
                id=str(uuid4()),
                tenant_id=tenant_id,
                user_id=user.id,
                rule_key=key,
                enabled=True,
                trigger_type=trig,
                trigger_config=trig_cfg,
                condition_expr=cond,
                action_type=action,
                action_config=action_cfg,
                description=desc,
                last_fired_at=now - timedelta(days=days_ago // 2 or 1),
                created_at=now - timedelta(days=days_ago),
            )
        )
    db.flush()
    print(f"[+] Seeded {len(rules)} user-scoped automation rules")


def seed_litigation_scenarios(db) -> None:
    """For each existing demo LitigationPrediction, attach 2 what-if scenarios."""
    predictions = db.scalars(select(LitigationPrediction)).all()
    if not predictions:
        print("[=] No litigation predictions — skip scenarios")
        return

    existing = db.query(LitigationScenario).count()
    if existing > 0:
        print(f"[=] Litigation scenarios already present ({existing}) — skipped")
        return

    created = 0
    for pred in predictions:
        base = float(pred.win_probability)
        # Optimistic: more evidence + expert witness
        adj_up = min(0.95, round(base + 0.12, 3))
        # Pessimistic: weaker evidence + no prior negotiation
        adj_dn = max(0.05, round(base - 0.18, 3))
        db.add(
            LitigationScenario(
                id=str(uuid4()),
                prediction_id=pred.id,
                overrides={"evidence_score": 9, "has_expert_witness": True},
                adjusted_probability=adj_up,
                delta=round(adj_up - base, 3),
                note="补强证据 + 引入技术专家证人后的乐观情景",
            )
        )
        db.add(
            LitigationScenario(
                id=str(uuid4()),
                prediction_id=pred.id,
                overrides={"evidence_score": 3, "prior_negotiation": False},
                adjusted_probability=adj_dn,
                delta=round(adj_dn - base, 3),
                note="证据薄弱且未先行谈判的悲观情景",
            )
        )
        created += 2
    db.flush()
    print(f"[+] Seeded {created} litigation scenarios across {len(predictions)} predictions")


def seed_provider_credentials(db) -> None:
    """Attach 1-2 verified credentials to each seeded provider."""
    existing = db.query(ProviderCredential).count()
    if existing > 0:
        print(f"[=] Provider credentials already present ({existing}) — skipped")
        return

    now = utcnow()
    plan: dict[str, list[tuple[str, str, str]]] = {
        "lawyer": [
            ("law_license", "中华全国律师协会", "执业证号"),
            ("bar_admission", "上海市律师协会", "会员编号"),
        ],
        "law_firm": [
            ("law_firm_license", "司法部", "律所执业许可证号"),
        ],
        "agency": [
            ("ip_agency_license", "国家知识产权局", "专利代理机构注册号"),
            ("trademark_agency_filing", "国家市场监督管理总局", "商标代理备案号"),
        ],
    }

    created = 0
    for prov in db.scalars(select(LegalServiceProvider)).all():
        templates = plan.get(prov.provider_type) or plan["lawyer"]
        for i, (ctype, issuer, label) in enumerate(templates):
            number = f"{prov.id[-4:].upper()}-{ctype.upper()[:3]}-{i + 1:03d}"
            db.add(
                ProviderCredential(
                    id=str(uuid4()),
                    provider_id=prov.id,
                    credential_type=ctype,
                    credential_number=number,
                    issuer=f"{issuer}（{label}）",
                    verified=True,
                    issued_at=now - timedelta(days=365 * 3 + i * 90),
                    created_at=now - timedelta(days=200),
                )
            )
            created += 1
    db.flush()
    print(f"[+] Seeded {created} provider credentials")


def seed_extra_workflows(db, user: User) -> None:
    """Add two completed trademark-registration workflows so /workflows isn't sparse.

    Note: only `trademark-registration` is a registered workflow type today (see
    apps/api/app/services/workflow_engine.py::WORKFLOW_TEMPLATES). We seed two
    completed instances on different brands to give /workflows a real history.
    """
    completed_count = (
        db.query(WorkflowInstance)
        .filter(WorkflowInstance.user_id == user.id)
        .filter(WorkflowInstance.status == "completed")
        .count()
    )
    if completed_count > 0:
        print(f"[=] Completed workflows already present ({completed_count}) — skipped")
        return

    tenant_id = user.tenant_id
    now = utcnow()
    extras = [
        ("示例科技", 60, "完成于 2 个月前 · 已入台账"),
        ("ShiliKeji", 30, "完成于 1 个月前 · 已入台账"),
    ]
    step_types_done = [
        "diagnosis",
        "trademark-check",
        "application",
        "submit-guide",
        "ledger",
    ]
    for asset_name, days_ago, note in extras:
        wf_id = str(uuid4())
        created = now - timedelta(days=days_ago)
        wf = WorkflowInstance(
            id=wf_id,
            tenant_id=tenant_id,
            user_id=user.id,
            workflow_type="trademark-registration",
            status="completed",
            current_step_index=len(step_types_done) - 1,
            context={"assetName": asset_name, "note": note},
            created_at=created,
            updated_at=created + timedelta(days=14),
        )
        db.add(wf)
        db.flush()
        for i, stype in enumerate(step_types_done):
            db.add(
                WorkflowStep(
                    id=str(uuid4()),
                    workflow_id=wf_id,
                    step_index=i,
                    step_type=stype,
                    status="completed",
                    input_data={"assetName": asset_name},
                    output_data={"summary": f"{stype} 完成"},
                    created_at=created + timedelta(days=i),
                    updated_at=created + timedelta(days=i + 1),
                )
            )
    db.flush()
    print(f"[+] Seeded {len(extras)} completed trademark-registration workflows")


if __name__ == "__main__":
    try:
        seed()
    except Exception as e:  # pragma: no cover
        print(f"[!] Seed failed: {e}", file=sys.stderr)
        raise
