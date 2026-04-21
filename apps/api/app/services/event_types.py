JOB_COMPLETED = "job.completed"
JOB_FAILED = "job.failed"
WORKFLOW_STEP_COMPLETED = "workflow.step_completed"
WORKFLOW_STEP_AWAITING = "workflow.step_awaiting_review"
WORKFLOW_COMPLETED = "workflow.completed"
WORKFLOW_FAILED = "workflow.failed"
ASSET_CREATED = "asset.created"
ASSET_UPDATED = "asset.updated"
ASSET_DELETED = "asset.deleted"
ASSET_EXPIRING_SOON = "asset.expiring_soon"
MONITORING_ALERT = "monitoring.alert"
SCAN_CYCLE_DUE = "scan.cycle_due"
POLICY_DIGEST_READY = "policy.digest_ready"
COMPETITOR_CHANGE = "competitor.change"

# ------------------------------------------------------------------
# Scenario-push 事件（对应 automation_engine.BUILTIN_RULES 中的 scenario.*）
# 这些事件需要在对应服务完成业务动作时 emit，否则场景规则永远不会触发。
# ------------------------------------------------------------------
DIAGNOSIS_COMPLETED = "diagnosis.completed"
TRADEMARK_RED_FLAG = "trademark.red_flag"
COMPLIANCE_AUDIT_COMPLETED = "compliance.audit_completed"
PROVIDER_LEAD_CREATED = "provider.lead_created"
LITIGATION_PREDICTED = "litigation.predicted"

# ------------------------------------------------------------------
# 用户活动事件（用于「账户活动记录」时间线）
# 每个用户可见的 HTTP 动作都应 emit 一条，供 routes/profile.py::get_profile_activity
# 聚合展示。
# ------------------------------------------------------------------
USER_REGISTERED = "user.registered"
USER_LOGIN = "user.login"
USER_LOGOUT = "user.logout"
AUTH_PASSWORD_CHANGED = "auth.password_changed"
AUTH_PASSWORD_RESET_REQUESTED = "auth.password_reset_requested"
AUTH_PASSWORD_RESET = "auth.password_reset"

PROFILE_UPDATED = "profile.updated"

FILE_UPLOADED = "file.uploaded"
LICENSE_PARSED = "license.parsed"
DOCUMENT_GENERATED = "document.generated"

CHAT_STARTED = "chat.started"
CHAT_HANDOFF = "chat.handoff"

MATCHING_REQUESTED = "matching.requested"

LITIGATION_CASE_CREATED = "litigation.case_created"
