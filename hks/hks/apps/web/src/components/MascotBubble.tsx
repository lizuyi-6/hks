"use client";

import { useEffect, useRef, useState } from "react";

export type BubblePlacement = "top" | "bottom" | "left" | "right";

export interface BubbleConfig {
  message: string;
  placement?: BubblePlacement;
  duration?: number;
}

interface MascotBubbleProps {
  config: BubbleConfig;
  onDismiss?: () => void;
}

const placementStyles: Record<BubblePlacement, { arrow: string; container: string }> = {
  left: {
    arrow: "mascot-bubble-arrow--left",
    container: "mascot-bubble-container--left",
  },
  right: {
    arrow: "mascot-bubble-arrow--right",
    container: "mascot-bubble-container--right",
  },
  top: {
    arrow: "mascot-bubble-arrow--top",
    container: "mascot-bubble-container--top",
  },
  bottom: {
    arrow: "mascot-bubble-arrow--bottom",
    container: "mascot-bubble-container--bottom",
  },
};

export function MascotBubble({ config, onDismiss }: MascotBubbleProps) {
  const { message, placement = "left", duration = 6000 } = config;
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVisible(true);
    setFading(false);

    timerRef.current = setTimeout(() => {
      setFading(true);
      setTimeout(() => {
        setVisible(false);
        onDismiss?.();
      }, 400);
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message, duration, onDismiss]);

  if (!visible) return null;

  const { arrow, container } = placementStyles[placement];

  return (
    <div className={`mascot-bubble-container ${container} ${fading ? "mascot-bubble--fading" : "mascot-bubble--visible"}`}>
      <div className="mascot-bubble">
        <p className="mascot-bubble-text">{message}</p>
      </div>
      <div className={`mascot-bubble-arrow ${arrow}`} />
    </div>
  );
}

export interface MascotWidgetProps {
  expression?: "idle" | "thinking" | "happy" | "warning" | "sleepy";
  bubble?: BubbleConfig;
  onBubbleDismiss?: () => void;
}

export function MascotWidget({ expression = "idle", bubble, onBubbleDismiss }: MascotWidgetProps) {
  return (
    <div className="mascot-float">
      {bubble && (
        <MascotBubble config={bubble} onDismiss={onBubbleDismiss} />
      )}
      <button className="mascot-float-btn" aria-label="A1+ IP 小助手">
        <span className="mascot-float-char">
          <MascotInner expression={expression} />
        </span>
      </button>
    </div>
  );
}

function MascotInner({ expression }: { expression: "idle" | "thinking" | "happy" | "warning" | "sleepy" }) {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" aria-label={`A1+ mascot - ${expression}`}>
      <defs>
        <radialGradient id="mb-body" cx="38%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#3a7bd5" />
          <stop offset="100%" stopColor="#0a5fcc" />
        </radialGradient>
      </defs>

      {/* Shadow */}
      <ellipse cx="32" cy="61" rx="14" ry="3" fill="rgba(0,0,0,0.18)" />

      {/* Left ear */}
      <circle cx="17" cy="11" r="6" fill="url(#mb-body)" />
      <circle cx="17" cy="11" r="3" fill="rgba(255,255,255,0.22)" />

      {/* Right ear */}
      <circle cx="47" cy="11" r="6" fill="url(#mb-body)" />
      <circle cx="47" cy="11" r="3" fill="rgba(255,255,255,0.22)" />

      {/* Body */}
      <circle cx="32" cy="30" r="24" fill="url(#mb-body)" />

      {/* Body highlight */}
      <ellipse cx="27" cy="22" rx="9" ry="6" fill="rgba(255,255,255,0.15)" />

      {/* Antenna */}
      <circle
        cx="32"
        cy="2"
        r="3.5"
        fill="#ff375f"
        opacity={expression === "warning" ? 1 : 0.85}
      />
      {expression === "warning" && (
        <circle cx="32" cy="2" r="3.5" fill="#ff375f" opacity="0.5">
          <animate attributeName="r" from="3.5" to="7" dur="0.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.5" to="0" dur="0.8s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Eyes */}
      {expression === "happy" ? (
        <>
          <path d="M 22 27 Q 26 22 30 27" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M 34 27 Q 38 22 42 27" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" />
        </>
      ) : expression === "sleepy" ? (
        <>
          <line x1="21" y1="27" x2="29" y2="27" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="35" y1="27" x2="43" y2="27" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="25" cy="26" rx="3.8" ry="4.2" fill="white" />
          <ellipse cx="39" cy="26" rx="3.8" ry="4.2" fill="white" />
          {expression !== "thinking" && (
            <>
              <circle cx="26" cy="25" r="1.6" fill="#1a1a2e" />
              <circle cx="40" cy="25" r="1.6" fill="#1a1a2e" />
              <circle cx="26.8" cy="24.3" r="0.7" fill="white" />
              <circle cx="40.8" cy="24.3" r="0.7" fill="white" />
            </>
          )}
        </>
      )}

      {/* Cheeks (happy/idle) */}
      {(expression === "happy" || expression === "idle") && (
        <>
          <circle cx="18" cy="32" r="3" fill="rgba(255,180,150,0.35)" />
          <circle cx="46" cy="32" r="3" fill="rgba(255,180,150,0.35)" />
        </>
      )}

      {/* Mouth */}
      {expression === "happy" ? (
        <path d="M 24 36 Q 32 44 40 36" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      ) : expression === "warning" ? (
        <path d="M 25 37 Q 32 40 39 37" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      ) : expression === "sleepy" ? (
        <line x1="25" y1="37" x2="39" y2="37" stroke="white" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M 25 36 Q 32 40 39 36" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      )}

      {/* Badge */}
      <circle cx="32" cy="50" r="5.5" fill="white" />
      <text x="32" y="54" textAnchor="middle" fontSize="6" fill="#0a5fcc" fontFamily="sans-serif" fontWeight="800" fontStyle="italic">
        A+
      </text>
    </svg>
  );
}
