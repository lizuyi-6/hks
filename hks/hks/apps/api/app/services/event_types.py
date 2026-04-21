JOB_COMPLETED = "job.completed"
JOB_FAILED = "job.failed"
WORKFLOW_STEP_COMPLETED = "workflow.step_completed"
WORKFLOW_STEP_AWAITING = "workflow.step_awaiting_review"
WORKFLOW_COMPLETED = "workflow.completed"
WORKFLOW_FAILED = "workflow.failed"
ASSET_CREATED = "asset.created"
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
