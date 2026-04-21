"use client";

import { useEffect, useState } from "react";
import type { ReminderTask } from "@a1plus/domain";
import { WorkspaceCard, Badge, Empty } from "@a1plus/ui";
import { request, ErrorDisplay } from "./shared";

export function ReminderPanel() {
  const [tasks, setTasks] = useState<ReminderTask[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadTasks() {
    try {
      const response = await request<ReminderTask[]>("/reminders");
      setTasks(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提醒加载失败");
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  async function rerunTask(taskId: string) {
    setError(null);
    try {
      await request(`/jobs/${taskId}/rerun`, { method: "POST" });
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重跑失败");
    }
  }

  const statusVariant = (status: string): "success" | "warning" | "error" | "info" => {
    if (status === "sent") return "success";
    if (status === "failed" || status === "dead_letter") return "error";
    return "info";
  };

  return (
    <WorkspaceCard title="提醒中心" eyebrow="Queue + Retry">
      {error ? <ErrorDisplay error={error} /> : null}
      {tasks.length === 0 ? (
        <Empty title="暂无提醒" description="暂无提醒任务。" />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="flex flex-col gap-3 rounded-md border border-border p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium text-text-primary">{task.channel.toUpperCase()}</p>
                <p className="mt-1 text-sm text-text-tertiary">
                  到期时间 {new Date(task.dueAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · 资产 {task.assetId}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={statusVariant(task.status)} size="sm">{task.status}</Badge>
                {(task.status === "failed" || task.status === "dead_letter") ? (
                  <button
                    type="button"
                    onClick={() => void rerunTask(task.id)}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken transition-colors"
                  >
                    人工重跑
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </WorkspaceCard>
  );
}
