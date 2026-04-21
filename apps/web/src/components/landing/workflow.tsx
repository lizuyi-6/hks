import Link from "next/link";
import { coreWorkflow } from "@a1plus/domain";

type StepMeta = {
  detail: string;
  output: string;
  tone: "ready" | "running" | "auto";
};

const stepMeta: Record<string, StepMeta> = {
  "注册 / 登录": {
    detail: "创建账户并完善企业或个人主体信息，建立身份与权限。",
    output: "主体档案 · 权限角色",
    tone: "ready"
  },
  "IP 诊断": {
    detail: "AI 评估商标、专利、软著的保护优先级并给出建议路线。",
    output: "诊断报告 · 优先级矩阵",
    tone: "ready"
  },
  "商标查重": {
    detail: "多维度查重，输出绿 / 黄 / 红三档风险提示与近似项。",
    output: "风险分级 · 近似清单",
    tone: "ready"
  },
  "申请书生成": {
    detail: "依据查重结果套用官方模板生成 DOCX / PDF 初稿。",
    output: "DOCX / PDF 初稿",
    tone: "running"
  },
  "提交引导": {
    detail: "按主管机关流程逐步给出提交清单与核验要点。",
    output: "提交清单 · 自检项",
    tone: "running"
  },
  "自动入台账": {
    detail: "受理或核准后自动写入 IP 资产台账并同步到监控。",
    output: "台账记录 · 监控目标",
    tone: "auto"
  },
  "提醒任务": {
    detail: "续展、年费、异议答辩多渠道提醒，失败自动重试并降级。",
    output: "续展 · 年费 · 异议提醒",
    tone: "auto"
  }
};

const toneStyle: Record<StepMeta["tone"], { dot: string; label: string; chip: string }> = {
  ready: {
    dot: "bg-primary-500",
    label: "可直接发起",
    chip: "bg-success-50 text-success-700"
  },
  running: {
    dot: "bg-warning-500",
    label: "依赖上一步",
    chip: "bg-warning-50 text-warning-700"
  },
  auto: {
    dot: "bg-info-500",
    label: "自动触发",
    chip: "bg-info-50 text-info-700"
  }
};

export function LandingWorkflow() {
  return (
    <section
      id="workflow"
      data-landing-section
      className="flex h-screen snap-start items-center overflow-hidden pt-16"
    >
      <div className="mx-auto grid h-full w-full max-w-[1400px] grid-cols-1 gap-8 px-6 py-6 md:grid-cols-[0.75fr_1.6fr] md:items-stretch">
        <aside className="flex flex-col justify-between py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-primary-600">
              Workflow
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-text-primary md:text-5xl md:leading-[1.1]">
              七步跑完
              <br />
              一次
              <span className="bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
                商标申请
              </span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-text-secondary md:text-lg">
              工作流将离散模块编排为可追溯的端到端流程，每一步的上下文、数据来源与 provider
              都被记录，并在执行失败时降级重试。
            </p>
          </div>

          <div className="space-y-2.5">
            {(
              [
                ["ready", "可直接发起"],
                ["running", "依赖上一步"],
                ["auto", "自动触发"]
              ] as const
            ).map(([tone, label]) => (
              <div key={tone} className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${toneStyle[tone].dot}`} />
                <span className="text-sm text-text-secondary">{label}</span>
              </div>
            ))}
            <Link
              href="/register"
              className="btn-tech mt-4 inline-flex h-11 items-center rounded-md px-5 text-sm font-medium text-white"
            >
              立即试跑
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                className="ml-2 h-4 w-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
          </div>
        </aside>

        <ol className="grid min-h-0 auto-rows-fr gap-2.5">
          {coreWorkflow.map((step, idx) => {
            const meta = stepMeta[step];
            const tone = meta?.tone ?? "ready";
            return (
              <li
                key={step}
                style={{ animationDelay: `${idx * 60}ms` }}
                className="tech-card group relative grid h-full min-h-0 grid-cols-[auto_1fr_auto] items-center gap-4 overflow-hidden rounded-xl border border-border bg-surface-elevated px-5 py-3"
              >
                <span aria-hidden className="tech-corner tech-corner-tl" />
                <span aria-hidden className="tech-corner tech-corner-br" />
                <div className="flex items-center gap-4">
                  <span
                    className="num-display flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-sunken text-xl text-text-primary transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:border-primary-500/60 group-hover:bg-primary-500/10 group-hover:text-primary-700"
                    aria-hidden
                  >
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="hidden h-px w-6 bg-border md:block" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-lg font-semibold text-text-primary md:text-xl">
                      {step}
                    </h3>
                    <span className={`rounded px-2 py-0.5 text-[11px] ${toneStyle[tone].chip}`}>
                      {toneStyle[tone].label}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-text-secondary md:text-base">
                    {meta?.detail ?? ""}
                  </p>
                </div>
                <div className="hidden items-center gap-2 text-right md:flex">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-text-tertiary">
                      Output
                    </p>
                    <p className="text-sm font-medium text-text-primary">{meta?.output ?? "—"}</p>
                  </div>
                  <span className={`h-2 w-2 rounded-full ${toneStyle[tone].dot}`} aria-hidden />
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
