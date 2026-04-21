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
      <div className="flex items-center justify-center h-48 text-text-muted text-sm">
        ????
      </div>
    );
  }

  const cronRules = rules.filter((r) => r.triggerType === "cron");
  const eventRules = rules.filter((r) => r.triggerType === "event");

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">??????</h2>
        {cronRules.length === 0 ? (
          <p className="text-sm text-text-muted">??????</p>
        ) : (
          <div className="space-y-3">
            {cronRules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 p-3 border border-border rounded-md bg-surface">
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    {rule.description ?? rule.ruleKey}
                  </p>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    ???{(rule.triggerConfig as Record<string, string>)?.cron ?? "?"}
                  </p>
                  {rule.lastFiredAt && (
                    <p className="text-xs text-text-muted mt-0.5">
                      ?????{new Date(rule.lastFiredAt).toLocaleString("zh-CN")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => toggleRule(rule)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${
                    rule.enabled ? "bg-primary-600" : "bg-neutral-300"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-neutral-50 shadow-sm transition-transform ${
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
        <h2 className="text-sm font-semibold text-text-primary mb-3">??????</h2>
        {eventRules.length === 0 ? (
          <p className="text-sm text-text-muted">??????</p>
        ) : (
          <div className="space-y-3">
            {eventRules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 p-3 border border-border rounded-md bg-surface">
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    {rule.description ?? rule.ruleKey}
                  </p>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    ?????{(rule.triggerConfig as Record<string, string>)?.event_type ?? "?"}
                  </p>
                </div>
                <button
                  onClick={() => toggleRule(rule)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${
                    rule.enabled ? "bg-primary-600" : "bg-neutral-300"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-neutral-50 shadow-sm transition-transform ${
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
