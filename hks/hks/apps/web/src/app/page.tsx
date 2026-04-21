import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { isAuthenticated } from "@/lib/auth";
import { LandingScroller } from "@/components/landing/landing-scroller";
import { LandingNavbar } from "@/components/landing/navbar";
import { LandingHero } from "@/components/landing/hero";
import { LandingFeatures } from "@/components/landing/features";

// Below-fold sections are code-split into their own chunks so the initial JS
// payload stays small. A placeholder section preserves the 100vh snap slot until
// the real component streams in, keeping scroll-snap math stable.
const snapPlaceholder = (id?: string) => (
  <section
    id={id}
    data-landing-section
    className="h-screen snap-start"
    aria-hidden
  />
);
const LandingWorkflow = dynamic(
  () => import("@/components/landing/workflow").then((m) => m.LandingWorkflow),
  { loading: () => snapPlaceholder("workflow") }
);
const LandingFaq = dynamic(
  () => import("@/components/landing/faq").then((m) => m.LandingFaq),
  { loading: () => snapPlaceholder("faq") }
);
const LandingCta = dynamic(
  () => import("@/components/landing/cta").then((m) => m.LandingCta),
  { loading: () => snapPlaceholder() }
);

export const metadata: Metadata = {
  title: "A1+ IP Coworker · AI 驱动的知识产权协作平台",
  description:
    "一条 AI 工作流串起商标查重、申请书生成、IP 诊断、资产台账与提醒任务，支持黑夜/白天主题切换。",
  openGraph: {
    title: "A1+ IP Coworker",
    description: "AI 驱动的知识产权协作平台：商标 · 专利 · 软著 · 版权全流程。",
    type: "website"
  }
};

export default async function HomePage() {
  const authenticated = await isAuthenticated();

  return (
    <LandingScroller>
      <LandingNavbar authenticated={authenticated} />
      <LandingHero authenticated={authenticated} />
      <LandingFeatures />
      <LandingWorkflow />
      <LandingFaq />
      <LandingCta authenticated={authenticated} />
    </LandingScroller>
  );
}
