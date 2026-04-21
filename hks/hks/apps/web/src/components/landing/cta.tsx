import Link from "next/link";
import { LandingFooter } from "@/components/landing/footer";

type CtaProps = {
  authenticated: boolean;
};

export function LandingCta({ authenticated }: CtaProps) {
  const href = authenticated ? "/dashboard" : "/register";
  const label = authenticated ? "进入工作台" : "免费创建账户";

  return (
    <section
      data-landing-section
      className="flex h-screen snap-start flex-col overflow-hidden pt-16"
    >
      <div className="flex flex-1 items-center">
        <div className="mx-auto w-full max-w-[1400px] px-6">
          <div className="tech-border relative overflow-hidden rounded-2xl border border-border bg-surface-elevated p-8 md:p-12">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(40rem 20rem at 0% 0%, rgb(var(--color-primary-500) / 0.14), transparent 60%), radial-gradient(35rem 18rem at 100% 100%, rgb(var(--color-info-500) / 0.10), transparent 60%)"
              }}
            />
            <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-center">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-text-primary md:text-4xl">
                  把下一个商标交给 A1+ 来跑完全程
                </h2>
                <p className="mt-3 max-w-xl text-sm text-text-secondary md:text-base">
                  注册即可开始诊断、查重与申请书生成。所有步骤保留原始上下文，随时回看、导出、交接。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 md:justify-end">
                <Link
                  href={href}
                  className="btn-tech inline-flex h-11 items-center rounded-md px-6 text-sm font-medium text-white"
                >
                  {label}
                </Link>
                {!authenticated ? (
                  <Link
                    href="/login"
                    className="btn-tech-outline inline-flex h-11 items-center rounded-md border border-border bg-surface px-6 text-sm font-medium text-text-primary"
                  >
                    已有账户登录
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      <LandingFooter />
    </section>
  );
}
