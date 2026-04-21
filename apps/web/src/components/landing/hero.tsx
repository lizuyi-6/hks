import Link from "next/link";
import { coreWorkflow } from "@a1plus/domain";

type HeroProps = {
  authenticated: boolean;
};

export function LandingHero({ authenticated }: HeroProps) {
  const primaryHref = authenticated ? "/dashboard" : "/register";
  const primaryLabel = authenticated ? "进入工作台" : "免费开始";

  return (
    <section
      data-landing-section
      className="relative flex h-screen snap-start items-center overflow-hidden pt-16"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60rem 32rem at 10% -10%, rgb(var(--color-primary-500) / 0.12), transparent 60%), radial-gradient(50rem 28rem at 95% 0%, rgb(var(--color-info-500) / 0.08), transparent 60%)"
        }}
      />
      <div aria-hidden className="tech-grid-bg pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto grid w-full max-w-[1400px] gap-10 px-6 md:grid-cols-[1.15fr_1fr] md:items-center">
        <div className="page-enter">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-elevated px-3 py-1 text-xs font-medium text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
            全流程 AI · 商标 / 专利 / 软著 / 版权
          </span>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-text-primary md:text-5xl md:leading-[1.1]">
            让知识产权工作
            <br />
            像
            <span className="mx-2 bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
              协作文档
            </span>
            一样顺手
          </h1>
          <p className="mt-5 max-w-xl text-sm text-text-secondary md:text-base">
            A1+ IP Coworker 把 IP 诊断、商标查重、申请书生成、提交引导、资产台账与提醒任务
            串成一条 AI 工作流——从立项到存证，全流程可追溯、可审计。
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={primaryHref}
              className="btn-tech group inline-flex h-11 items-center rounded-md px-6 text-sm font-medium text-white"
            >
              {primaryLabel}
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                className="ml-2 h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-1"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            <a
              href="#workflow"
              className="btn-tech-outline inline-flex h-11 items-center rounded-md border border-border bg-surface-elevated px-6 text-sm font-medium text-text-primary shadow-sm"
            >
              查看工作流
            </a>
          </div>

          <dl className="mt-8 grid max-w-md grid-cols-3 gap-6">
            <div>
              <dt className="text-xs text-text-tertiary">核心模块</dt>
              <dd className="num-display mt-1 text-2xl text-text-primary">9</dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">工作流步骤</dt>
              <dd className="num-display mt-1 text-2xl text-text-primary">7</dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">商标类目</dt>
              <dd className="num-display mt-1 text-2xl text-text-primary">45</dd>
            </div>
          </dl>
        </div>

        <div className="relative hidden md:block">
          <div
            aria-hidden
            className="hero-orb absolute -inset-6 -z-10 rounded-2xl bg-gradient-to-br from-primary-500/15 via-transparent to-info-500/10 blur-2xl"
          />
          <div className="tech-border tech-rise scanline overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-lg">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-error-500/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning-500/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-success-500/60" />
              <span className="ml-3 text-xs text-text-tertiary">当前任务 · IP 工作流 #A10238</span>
            </div>
            <ol className="divide-y divide-border">
              {coreWorkflow.map((step, idx) => {
                const state = idx < 3 ? "done" : idx === 3 ? "running" : "pending";
                return (
                  <li key={step} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className={[
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                        state === "done"
                          ? "bg-primary-500/15 text-primary-700"
                          : state === "running"
                          ? "bg-warning-500/15 text-warning-700"
                          : "bg-neutral-200 text-text-tertiary"
                      ].join(" ")}
                    >
                      {state === "done" ? (
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.5l3 3 7-7" />
                        </svg>
                      ) : (
                        idx + 1
                      )}
                    </span>
                    <span className="flex-1 text-sm text-text-primary">{step}</span>
                    <span
                      className={[
                        "rounded px-2 py-0.5 text-[11px]",
                        state === "done"
                          ? "bg-success-50 text-success-700"
                          : state === "running"
                          ? "bg-warning-50 text-warning-700"
                          : "bg-neutral-100 text-text-tertiary"
                      ].join(" ")}
                    >
                      {state === "done" ? "已完成" : state === "running" ? "进行中" : "待开始"}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
