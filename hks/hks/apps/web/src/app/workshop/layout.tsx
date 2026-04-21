import type { ReactNode } from "react";
import "@/components/workshop/styles.css";

export const metadata = {
  title: "Dashboard Style Workshop · A1+ IP Coworker",
  robots: "noindex,nofollow",
};

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body style={{ margin: 0, background: "#0f0f11", color: "#fff" }}>
        {children}
      </body>
    </html>
  );
}
