"use client";

import { useState, useEffect } from "react";
import type { AutomationRule } from "@a1plus/domain";
import { proxyBaseUrl } from "@/lib/env";

export function AutomationSettingsPanel() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${proxyBaseUrl}/automation/rules`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setRules(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleRule = async (rule: AutomationRule) => {
    const newEnabled = !rule.enabled;
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, enabled: newEnabled } : r))
    );
    try {
      await fetch(`${proxyBaseUrl}/automation/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: newEnabled }),
      });
    } catch {
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r))
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        加载中…
      </div>
    );
  }

  const cronRules = rules.filter((r) => r.triggerType === "cron");
  const eventRules = rules.filter((r) => r.triggerType === "event");

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">定时巡检任务</h2>
        {cronRules.length === 0 ? (
          <p className="text-sm text-slate-400">暂无定时任务</p>
        ) : (
          <div className="space-y-3">
            {cronRules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 p-4 border rounded-lg bg-white">
                <div className="flex-1">
                  <p className="font-medium text-sm text-slate-900">
                    {rule.description ?? rule.ruleKey}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    调度：{(rule.triggerConfig as Record<string, string>)?.cron ?? "—"}
                  </p>
                  {rule.lastFiredAt && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      上次执行：{new Date(rule.lastFiredAt).toLocaleString("zh-CN")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => toggleRule(rule)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${
                    rule.enabled ? "bg-green-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      rule.enabled ? "translate-x-4" : ""
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">事件驱动规则</h2>
        {eventRules.length === 0 ? (
          <p className="text-sm text-slate-400">暂无事件规则</p>
        ) : (
          <div className="space-y-3">
            {eventRules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 p-4 border rounded-lg bg-white">
                <div className="flex-1">
                  <p className="font-medium text-sm text-slate-900">
                    {rule.description ?? rule.ruleKey}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    触发事件：{(rule.triggerConfig as Record<string, string>)?.event_type ?? "—"}
                  </p>
                </div>
                <button
                  onClick={() => toggleRule(rule)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${
                    rule.enabled ? "bg-green-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      rule.enabled ? "translate-x-4" : ""
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
