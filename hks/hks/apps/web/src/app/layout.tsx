import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { AnalyticsProvider } from "@/components/analytics-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "A1+ IP Coworker",
  description: "AI 驱动的知识产权助手，提供商标查重、申请书生成、IP诊断与资产管理服务"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}`
          }}
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
