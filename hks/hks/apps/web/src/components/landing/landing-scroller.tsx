"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AuroraBg } from "@/components/aurora-bg";

type LandingScrollerProps = {
  children: ReactNode;
};

const STEP_THROTTLE_MS = 28;
const BASE_DURATION_MS = 200;
const MAX_DURATION_MS = 300;

/** Map wheel delta to ~pixels so mouse (line mode) and touchpad (pixel mode) share one path. */
function normalizeWheelDeltaY(e: WheelEvent, viewportH: number, linePx = 52): number {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * linePx;
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY * viewportH;
  return e.deltaY;
}

/** Mouse / discrete notch vs smooth trackpad stream. */
function isDiscreteWheelEvent(e: WheelEvent, normalizedDy: number): boolean {
  return (
    e.deltaMode === WheelEvent.DOM_DELTA_LINE ||
    e.deltaMode === WheelEvent.DOM_DELTA_PAGE ||
    Math.abs(normalizedDy) >= 56
  );
}

// Touchpad: accumulate normalized delta until this (one intentional fling ≈ one section).
const WHEEL_STEP_THRESHOLD = 92;
const INERTIA_IDLE_MS = 200;
// Ignore noise; use normalized delta (line mode already scaled).
const MIN_WHEEL_NORM = 1.25;

export function LandingScroller({ children }: LandingScrollerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [count, setCount] = useState(0);
  // Defer the heavy aurora layers (beam, stripes, extra orbs, particles) until the
  // browser is idle. First paint only carries 2 core orbs + vignette + grid, which
  // eliminates the initial paint spike and the associated scroll stutter.
  // (handled inside AuroraBg now)

  useEffect(() => {

    const container = ref.current;
    if (!container) return;

    const syncSectionStates = (i: number) => {
      const list = Array.from(
        container.querySelectorAll<HTMLElement>("[data-landing-section]")
      );
      list.forEach((el, idx) => {
        if (idx === i) {
          el.setAttribute("data-active", "true");
        } else {
          el.removeAttribute("data-active");
        }
      });
    };
    const commitActive = (i: number) => {
      setActiveIdx(i);
      syncSectionStates(i);
    };

    const state = {
      targetIdx: 0,
      raf: null as number | null,
      lastStepAt: 0,
      lastWheelDir: 0 as -1 | 0 | 1,
      touchStartY: null as number | null,
      accumDy: 0,
      wheelLocked: false,
      idleTimer: null as number | null,
      // Tracks the magnitude of the previous wheel event.  During inertia the
      // magnitude decreases monotonically; a sudden rise signals a new swipe.
      prevDeltaAbs: 0
    };

    const armIdleTimer = () => {
      if (state.idleTimer != null) window.clearTimeout(state.idleTimer);
      state.idleTimer = window.setTimeout(() => {
        state.idleTimer = null;
        state.accumDy = 0;
        // Only release the lock once the animation has also settled.
        if (state.raf == null) state.wheelLocked = false;
      }, INERTIA_IDLE_MS);
    };

    const clearIdleTimer = () => {
      if (state.idleTimer != null) {
        window.clearTimeout(state.idleTimer);
        state.idleTimer = null;
      }
    };

    const sectionsOf = () =>
      Array.from(container.querySelectorAll<HTMLElement>("[data-landing-section]"));

    const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

    const nearestIndex = () => {
      const h = container.clientHeight || 1;
      return Math.round(container.scrollTop / h);
    };

    const cancelAnim = () => {
      if (state.raf != null) {
        cancelAnimationFrame(state.raf);
        state.raf = null;
      }
    };

    const animateToTarget = () => {
      const list = sectionsOf();
      const target = list[state.targetIdx];
      if (!target) return;

      cancelAnim();
      const from = container.scrollTop;
      const to = target.offsetTop;
      const distance = to - from;
      if (Math.abs(distance) < 0.5) {
        container.scrollTop = to;
        commitActive(state.targetIdx);
        return;
      }

      // Lock further wheel stepping until the animation ends AND the
      // touchpad inertia tail goes quiet (see armIdleTimer / onWheel).
      state.wheelLocked = true;

      const h = container.clientHeight || 1;
      const span = Math.min(1, Math.abs(distance) / h);
      let duration = BASE_DURATION_MS + (MAX_DURATION_MS - BASE_DURATION_MS) * span;
      if (Math.abs(distance) > h * 1.2) {
        duration = Math.min(duration, 280);
      }
      const startAt = performance.now();
      const easeInOutCubic = (t: number) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const tick = (now: number) => {
        const p = Math.min(1, (now - startAt) / duration);
        container.scrollTop = from + distance * easeInOutCubic(p);
        if (p < 1) {
          state.raf = requestAnimationFrame(tick);
        } else {
          state.raf = null;
          commitActive(state.targetIdx);
          // If no wheel activity is pending, release immediately; otherwise
          // the idle timer will release once the inertial tail stops.
          if (state.idleTimer == null) {
            state.accumDy = 0;
            state.wheelLocked = false;
          }
        }
      };
      state.raf = requestAnimationFrame(tick);
      commitActive(state.targetIdx);
    };

    const step = (dir: 1 | -1, amount = 1) => {
      const now = performance.now();
      if (now - state.lastStepAt < STEP_THROTTLE_MS) return;
      state.lastStepAt = now;

      const list = sectionsOf();
      const base = state.raf != null ? state.targetIdx : nearestIndex();
      const next = clamp(base + dir * amount, list.length - 1);
      if (next === state.targetIdx && state.raf == null) return;
      state.targetIdx = next;
      animateToTarget();
    };

    const goTo = (idx: number) => {
      const list = sectionsOf();
      state.targetIdx = clamp(idx, list.length - 1);
      state.lastStepAt = performance.now();
      animateToTarget();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vh = container.clientHeight || 1;
      const dy = normalizeWheelDeltaY(e, vh);
      if (Math.abs(dy) < MIN_WHEEL_NORM) return;

      const dir: 1 | -1 = dy > 0 ? 1 : -1;
      const absDy = Math.abs(dy);
      const discrete = isDiscreteWheelEvent(e, dy);

      // ── Mouse / discrete notch path ────────────────────────────────────────
      // No accumulator, no inertia lock. Each notch = step once.
      // If an animation is in flight, snap to the nearest already-scrolled
      // section first so we don't skip sections on fast spinning.
      if (discrete) {
        if (state.wheelLocked || state.raf != null) {
          clearIdleTimer();
          cancelAnim();
          state.targetIdx = nearestIndex();
          commitActive(state.targetIdx);
          state.wheelLocked = false;
          state.accumDy = 0;
          state.prevDeltaAbs = 0;
          state.lastStepAt = 0; // always honour the notch
        }
        state.lastWheelDir = dir;
        step(dir, 1);
        return;
      }

      // ── Touchpad / continuous path ──────────────────────────────────────────
      if (dir !== state.lastWheelDir && state.lastWheelDir !== 0) {
        state.accumDy = 0;
        state.wheelLocked = false;
        state.prevDeltaAbs = 0;
        clearIdleTimer();
      }
      state.lastWheelDir = dir;

      // New intentional fling detected: delta jumps up vs decelerating tail.
      if (
        state.wheelLocked &&
        state.prevDeltaAbs >= 12 &&
        absDy > state.prevDeltaAbs * 1.55 &&
        absDy >= 22
      ) {
        state.accumDy = 0;
        state.wheelLocked = false;
        clearIdleTimer();
      }
      state.prevDeltaAbs = absDy;

      if (state.wheelLocked) {
        armIdleTimer();
        return;
      }

      state.accumDy += dy;
      armIdleTimer();

      if (Math.abs(state.accumDy) >= WHEEL_STEP_THRESHOLD) {
        const stepDir: 1 | -1 = state.accumDy > 0 ? 1 : -1;
        state.accumDy = 0;
        state.prevDeltaAbs = 0;
        state.wheelLocked = true;
        step(stepDir, 1);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      switch (e.key) {
        case "ArrowDown":
        case "PageDown":
        case " ":
          e.preventDefault();
          step(1);
          break;
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          step(-1);
          break;
        case "Home":
          e.preventDefault();
          goTo(0);
          break;
        case "End":
          e.preventDefault();
          goTo(sectionsOf().length - 1);
          break;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      state.touchStartY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (state.touchStartY == null) return;
      e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (state.touchStartY == null) return;
      const endY = e.changedTouches[0]?.clientY ?? state.touchStartY;
      const delta = state.touchStartY - endY;
      state.touchStartY = null;
      if (Math.abs(delta) < 36) return;
      state.lastStepAt = 0;
      step(delta > 0 ? 1 : -1);
    };

    const onAnchorClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.("a[href^='#']") as
        | HTMLAnchorElement
        | null;
      if (!a) return;
      const raw = a.getAttribute("href") ?? "";
      const id = raw.slice(1);
      if (!id) return;
      const target = container.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
      if (!target) return;
      e.preventDefault();
      const list = sectionsOf();
      const idx = list.indexOf(target.closest("[data-landing-section]") as HTMLElement);
      goTo(idx >= 0 ? idx : 0);
    };

    let rafMove: number | null = null;
    const onPointerMove = (e: PointerEvent) => {
      const mx = (e.clientX / window.innerWidth) * 2 - 1;
      const my = (e.clientY / window.innerHeight) * 2 - 1;
      if (rafMove != null) cancelAnimationFrame(rafMove);
      rafMove = requestAnimationFrame(() => {
        container.style.setProperty("--mx", mx.toFixed(3));
        container.style.setProperty("--my", my.toFixed(3));
      });
    };

    setCount(sectionsOf().length);
    state.targetIdx = nearestIndex();
    commitActive(state.targetIdx);

    container.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("click", onAnchorClick);
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      cancelAnim();
      clearIdleTimer();
      if (rafMove != null) cancelAnimationFrame(rafMove);
      container.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("click", onAnchorClick);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);


  const jumpTo = (idx: number) => {
    const container = ref.current;
    if (!container) return;
    const list = Array.from(
      container.querySelectorAll<HTMLElement>("[data-landing-section]")
    );
    const target = list[idx];
    if (!target) return;
    container.scrollTo({ top: target.offsetTop, behavior: "smooth" });
    list.forEach((el, i) => {
      if (i === idx) {
        el.setAttribute("data-active", "true");
      } else {
        el.removeAttribute("data-active");
      }
    });
    setActiveIdx(idx);
  };

  return (
    <div
      ref={ref}
      className="landing-scroll relative h-screen w-full overflow-x-hidden overflow-y-auto touch-none"
      style={
        {
          "--mx": 0,
          "--my": 0
        } as CSSProperties
      }
    >
      <AuroraBg />
      {children}
      {count > 1 ? (
        <nav
          aria-label="章节导航"
          className="fixed right-5 top-1/2 z-fixed hidden -translate-y-1/2 flex-col gap-2 md:flex"
        >
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`跳到第 ${i + 1} 屏`}
              aria-current={activeIdx === i ? "true" : undefined}
              onClick={() => jumpTo(i)}
              className={[
                "rounded-full transition-all duration-[260ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                activeIdx === i
                  ? "h-7 w-2 bg-primary-600 shadow-[0_0_14px_rgb(var(--color-primary-500)/0.7)]"
                  : "h-2 w-2 bg-text-muted hover:scale-150 hover:bg-primary-500"
              ].join(" ")}
            />
          ))}
        </nav>
      ) : null}
    </div>
  );
}
