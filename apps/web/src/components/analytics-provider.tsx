"use client";

import { useEffect, useRef } from "react";
import { analytics, trackPageView, trackClick } from "@/lib/analytics";

interface AnalyticsProviderProps {
  children: React.ReactNode;
}

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    trackPageView(window.location.pathname, document.referrer);

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (target.tagName === "BUTTON" || target.closest("button")) {
        const button = target.tagName === "BUTTON" ? target : target.closest("button") as HTMLElement;
        const buttonId = button.id || button.getAttribute("data-track-id") || button.className;
        trackClick(buttonId, button.textContent?.trim());
      }

      if (target.tagName === "A" || target.closest("a")) {
        const link = (target.tagName === "A" ? target : target.closest("a")) as HTMLAnchorElement;
        const linkId = link.id || link.getAttribute("data-track-id") || link.href;
        trackClick(`link:${linkId}`);
      }
    };

    document.addEventListener("click", handleClick);

    const handleFormSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement;
      if (form.tagName === "FORM") {
        const formId = form.id || form.getAttribute("data-track-id") || form.className;
        form.addEventListener(
          "submit",
          () => {},
          { once: true }
        );
      }
    };

    document.addEventListener("submit", handleFormSubmit);

    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("submit", handleFormSubmit);
    };
  }, []);

  useEffect(() => {
    const handleRouteChange = () => {
      trackPageView(window.location.pathname);
    };

    window.addEventListener("popstate", handleRouteChange);

    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      handleRouteChange();
    };

    return () => {
      window.removeEventListener("popstate", handleRouteChange);
      history.pushState = originalPushState;
    };
  }, []);

  return <>{children}</>;
}
