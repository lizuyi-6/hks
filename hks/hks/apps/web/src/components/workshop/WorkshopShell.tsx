"use client";

import { dashboardMockData } from "./mock-data";
import { AppleGlass } from "./variants/AppleGlass";
import { ArcSoft } from "./variants/ArcSoft";
import { NotionCraft } from "./variants/NotionCraft";
import { VercelDash } from "./variants/VercelDash";
import { MascotWidget } from "../MascotBubble";

const variants = [
  {
    id: "wsv-apple",
    label: "Apple Glass",
    dot: "#0a84ff",
    description:
      "Apple iOS 18 / visionOS · 深色彩色 blob 背景 + 真毛玻璃 + SF Pro 56px hero 数字 + iridescent 描边",
    component: AppleGlass,
  },
  {
    id: "wsv-arc",
    label: "Arc Soft",
    dot: "#8fb49b",
    description:
      "Arc Browser / Things 3 · 奶油底色 + sage/peach/lavender 粉色调色盘 + 24px 圆角 + 软分层阴影",
    component: ArcSoft,
  },
  {
    id: "wsv-notion",
    label: "Notion Craft",
    dot: "#2f7c52",
    description:
      "Notion / Craft / Bear · 暖米白 + serif display 数字 + 大页边距 + 顶部分隔线 + 阅读质感",
    component: NotionCraft,
  },
  {
    id: "wsv-vercel",
    label: "Vercel Dash",
    dot: "#00d884",
    description:
      "Vercel Analytics / PlanetScale · 近黑底 + 44px hero 数字 + mini sparkline + 折线图 + donut + 横向柱",
    component: VercelDash,
  },
] as const;

export function WorkshopShell() {
  return (
    <div className="ws-shell">
      <header className="ws-topbar">
        <span className="ws-topbar-title">
          Dashboard Style Workshop <span>· {variants.length} variants</span>
        </span>
        <nav className="ws-nav">
          {variants.map((v) => (
            <a key={v.id} href={`#${v.id}`} className="ws-nav-link">
              <span className="ws-nav-dot" style={{ background: v.dot }} />
              {v.label}
            </a>
          ))}
        </nav>
      </header>

      {variants.map((v, i) => {
        const Component = v.component;
        return (
          <div key={v.id}>
            {i > 0 && <div className="ws-divider" />}
            <section id={v.id} className="ws-section">
              <div className="ws-section-header">
                <span className="ws-section-label">
                  {String(i + 1).padStart(2, "0")} / {String(variants.length).padStart(2, "0")}
                </span>
                <h2 className="ws-section-title">
                  <span style={{ color: v.dot }}>●</span>&nbsp;{v.label}
                </h2>
                <p className="ws-section-desc">{v.description}</p>
              </div>
              <Component data={dashboardMockData} />
            </section>
          </div>
        );
      })}

      <footer
        style={{
          textAlign: "center",
          padding: "48px 24px",
          color: "rgba(255,255,255,0.15)",
          fontSize: "11px",
          letterSpacing: "0.04em",
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        A1+ IP Coworker · Dashboard Style Workshop · dev-only · 不影响产品主站设计系统
      </footer>

      <MascotWidget
        expression="idle"
        bubble={{
          message: "您好！我是您的 IP 小助手，有任何知识产权问题随时问我~",
          placement: "left",
          duration: 6000,
        }}
      />
    </div>
  );
}
