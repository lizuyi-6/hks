"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * Shared aurora background — same visual layers as the landing page.
 * Renders core orbs + grid + vignette immediately; defers enhanced layers
 * (beam, stripes, extra orbs, particles) until the browser is idle.
 */
export function AuroraBg() {
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const w = window as IdleWindow;
    let idleHandle: number | null = null;
    let timerHandle: number | null = null;
    const schedule = () => setEnhanced(true);
    if (typeof w.requestIdleCallback === "function") {
      idleHandle = w.requestIdleCallback(schedule, { timeout: 1200 });
    } else {
      timerHandle = window.setTimeout(schedule, 600);
    }

    let rafMove: number | null = null;
    const onPointerMove = (e: PointerEvent) => {
      const el = document.documentElement;
      const mx = (e.clientX / window.innerWidth) * 2 - 1;
      const my = (e.clientY / window.innerHeight) * 2 - 1;
      if (rafMove != null) cancelAnimationFrame(rafMove);
      rafMove = requestAnimationFrame(() => {
        el.style.setProperty("--mx", mx.toFixed(3));
        el.style.setProperty("--my", my.toFixed(3));
      });
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      if (idleHandle != null && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleHandle);
      }
      if (timerHandle != null) window.clearTimeout(timerHandle);
      if (rafMove != null) cancelAnimationFrame(rafMove);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <div aria-hidden className="landing-aurora pointer-events-none fixed inset-0 -z-0">
      <span className="aurora-orb aurora-orb-a" />
      <span className="aurora-orb aurora-orb-b" />
      <span className="landing-grid" />
      <span className="aurora-vignette" />
      {enhanced ? (
        <>
          <span className="aurora-beam" />
          <span className="aurora-stripe aurora-stripe-1" />
          <span className="aurora-stripe aurora-stripe-2" />
          <span className="aurora-stripe aurora-stripe-3" />
          <span className="aurora-orb aurora-orb-c" />
          <span className="aurora-orb aurora-orb-d" />
          <span className="aurora-orb aurora-orb-e" />
          <span className="aurora-particles">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className={`aurora-dot aurora-dot-${i % 6}`}
                style={{ ["--i" as string]: i } as CSSProperties}
              />
            ))}
          </span>
        </>
      ) : null}
    </div>
  );
}
