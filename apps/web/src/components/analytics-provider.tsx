"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { analytics, trackPageView, trackClick } from "@/lib/analytics";

interface AnalyticsProviderProps {
  children: React.ReactNode;
}

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  const initialized = useRef(false);
  const pathname = usePathname();

  // Track initial page view and set up click/form listeners once.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    trackPageView(window.location.pathname, document.referrer);

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (target.tagName === "BUTTON" || target.closest("button")) {
        const button = (
          target.tagName === "BUTTON" ? target : target.closest("button")
        ) as HTMLElement;
        const buttonId =
          button.id || button.getAttribute("data-track-id") || button.className;
        trackClick(buttonId, button.textContent?.trim());
      }

      if (target.tagName === "A" || target.closest("a")) {
        const link = (
          target.tagName === "A" ? target : target.closest("a")
        ) as HTMLAnchorElement;
        const linkId =
          link.id || link.getAttribute("data-track-id") || link.href;
        trackClick(`link:${linkId}`);
      }
    };

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, []);

  // Track SPA navigations via the App Router's usePathname hook — no monkey-patching needed.
  useEffect(() => {
    if (!initialized.current) return;
    trackPageView(pathname);
  }, [pathname]);

  useEffect(() => {
    return () => {
      analytics.destroy();
    };
  }, []);

  return <>{children}</>;
}
