import Link from "next/link";
import { Logo } from "@/components/landing/logo";

const columns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "产品",
    links: [
      { label: "工作台", href: "/dashboard" },
      { label: "IP 诊断", href: "/diagnosis" },
      { label: "商标查重", href: "/trademark/check" },
      { label: "资产台账", href: "/assets" }
    ]
  },
  {
    title: "资源",
    links: [
      { label: "能力概览", href: "#features" },
      { label: "工作流说明", href: "#workflow" },
      { label: "常见问题", href: "#faq" }
    ]
  },
  {
    title: "账户",
    links: [
      { label: "登录", href: "/login" },
      { label: "注册", href: "/register" },
      { label: "忘记密码", href: "/forgot-password" }
    ]
  }
];

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-surface-sunken">
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <Logo size={28} interactive={false} />
              <span className="text-sm font-semibold tracking-tight text-text-primary">
                A1<span className="text-primary-600">+</span> IP Coworker
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-text-secondary">
              AI 驱动的知识产权协作伙伴，从诊断到存证可审计。
            </p>
          </div>

          <div className="flex flex-wrap gap-8">
            {columns.map((col) => (
              <div key={col.title}>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {col.title}
                </h4>
                <ul className="mt-2 space-y-1">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {l.href.startsWith("#") ? (
                        <a
                          href={l.href}
                          className="text-xs text-text-secondary transition-colors hover:text-text-primary"
                        >
                          {l.label}
                        </a>
                      ) : (
                        <Link
                          href={l.href}
                          className="text-xs text-text-secondary transition-colors hover:text-text-primary"
                        >
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col items-start justify-between gap-2 border-t border-border pt-4 md:flex-row md:items-center">
          <p className="text-[11px] text-text-tertiary">
            © {new Date().getFullYear()} A1+ IP Coworker. All rights reserved.
          </p>
          <p className="text-[11px] text-text-tertiary">
            本产品输出的分析与建议不构成法律意见。
          </p>
        </div>
      </div>
    </footer>
  );
}
