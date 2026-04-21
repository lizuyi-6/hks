import Link from "next/link";
import { modules, type ModuleDefinition } from "@a1plus/domain";

const iconFor: Record<ModuleDefinition["key"], string> = {
  inbox: "M2 5l6 4 6-4M2 5v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5M2 5l6-3 6 3",
  dashboard: "M2 9h5V2H2v7zm7 5h5V7H9v7zm-7 0h5V11H2v3zm7-12v4h5V2H9z",
  diagnosis: "M8 2v12M2 8h12M4.5 4.5l7 7M11.5 4.5l-7 7",
  trademark: "M3 3h10v3H3zM3 8h7v5H3zM11 8h2v5h-2z",
  assets: "M2 4h12v3H2zM2 9h12v4H2zM5 11h2M10 11h1",
  reminders: "M4 13h8l-1-2V8a3 3 0 0 0-6 0v3l-1 2zM6.5 13.5a1.5 1.5 0 0 0 3 0",
  monitoring: "M7.5 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM11 11l3 3",
  competitors:
    "M5 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM11 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM8 4.5L5 8M8 4.5L11 8M8 2.5v2",
  contracts: "M4 2h6l2 2v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM6 7h4M6 10h4",
  policies: "M3 2h8l2 2v10H3zM6 6h5M6 9h5M6 12h3",
  patents: "M8 2l2 4 4 .5-3 3 1 4-4-2.5L4 13.5l1-4-3-3L6 6z",
  "due-diligence": "M3 13V3h6l3 3v7H3zM9 3v3h3M5 9h5M5 11h4",
  automation: "M3 8a5 5 0 0 1 9-3M13 8a5 5 0 0 1-9 3M11 2v3h-3M5 14v-3h3",
  match: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5v3l3 3",
  consult: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  orders: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2",
  provider: "M12 2l3 7h7l-5.5 4.5 2 7L12 16l-6.5 4.5 2-7L2 9h7z",
  enterprise: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6",
  litigation: "M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 8v4M10 14h4",
  "my-profile": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  "push-center": "M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.8l-6.4 4.4 2.4-7.2-6-4.8h7.6z"
};

const tagFor: Record<ModuleDefinition["key"], string[]> = {
  inbox: ["任务", "审批", "提醒"],
  dashboard: ["指标", "provider", "配置"],
  diagnosis: ["AI 诊断", "策略"],
  trademark: ["查重", "申请书", "递交"],
  assets: ["商标", "专利", "软著"],
  reminders: ["续展", "年费"],
  monitoring: ["侵权", "告警"],
  competitors: ["竞品", "追踪"],
  contracts: ["条款", "合规"],
  policies: ["政策", "速递"],
  patents: ["评估", "布局"],
  "due-diligence": ["尽调", "估值"],
  automation: ["自动化", "规则"],
  match: ["律师", "匹配"],
  consult: ["咨询", "对话"],
  orders: ["订单", "管理"],
  provider: ["服务商", "配置"],
  enterprise: ["企业", "合规"],
  litigation: ["诉讼", "追踪"],
  "my-profile": ["画像", "标签"],
  "push-center": ["推送", "通知"]
};

const statusLabel = (s: ModuleDefinition["status"]) =>
  s === "pillar" ? "支柱" : s === "core" ? "核心" : s === "tool" ? "工具" : "扩展";

const statusClass = (s: ModuleDefinition["status"]) =>
  s === "tool"
    ? "bg-purple-500/10 text-purple-600"
    : s === "pillar" || s === "core"
    ? "bg-success-50 text-success-700"
    : "bg-neutral-100 text-text-secondary";

export function LandingFeatures() {
  return (
    <section
      id="features"
      data-landing-section
      className="flex h-screen snap-start items-center overflow-hidden bg-surface-sunken/60 pt-16"
    >
      <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col justify-center px-6 py-6">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-wider text-primary-600">
            Capabilities
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary md:text-5xl">
            一套产品，覆盖 IP 全生命周期
          </h2>
          <p className="mt-3 text-base text-text-secondary md:text-lg">
            商标 · 专利 · 软著 · 版权——所有模块共享同一份知识库与工作流上下文。
          </p>
        </div>

        <div className="mt-6 grid min-h-0 flex-1 auto-rows-fr gap-4 md:grid-cols-3 md:grid-rows-4">
          {modules.slice(0, 12).map((m, idx) => (
            <Link
              key={m.key}
              href={m.href}
              style={{ animationDelay: `${idx * 50}ms` }}
              className="tech-card group relative flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-xl border border-border bg-surface-elevated p-5"
            >
              <span aria-hidden className="tech-corner tech-corner-tl" />
              <span aria-hidden className="tech-corner tech-corner-tr" />
              <span aria-hidden className="tech-corner tech-corner-bl" />
              <span aria-hidden className="tech-corner tech-corner-br" />
              <div>
                <div className="flex items-start justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-500/10 text-primary-600 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:rotate-6 group-hover:scale-110">
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="h-5 w-5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={iconFor[m.key]} />
                    </svg>
                  </span>
                  <span
                    className={[
                      "rounded px-2 py-0.5 text-[11px] font-medium",
                      statusClass(m.status)
                    ].join(" ")}
                  >
                    {statusLabel(m.status)}
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-tight text-text-primary">
                  {m.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                  {m.description}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {tagFor[m.key]?.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-[11px] text-text-tertiary"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <span className="flex -translate-x-1 items-center gap-1 text-xs font-medium text-primary-600 opacity-0 transition-all duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100">
                  进入
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover:translate-x-1"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
