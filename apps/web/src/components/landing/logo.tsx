"use client";

type LogoProps = {
  size?: number;
  className?: string;
  withWordmark?: boolean;
  /** when true, mark reacts to its own hover AND its parent's `group` hover */
  interactive?: boolean;
};

/**
 * Three ascending diamonds connected by fine lattice lines.
 * Inspired by StepFun (ascending steps), ByteDance (node connectivity),
 * and Volcano Engine (bold gradient + upward energy).
 * No letterforms anywhere in the mark.
 */
export function Logo({
  size = 32,
  className = "",
  withWordmark = false,
  interactive = true
}: LogoProps) {
  return (
    <span
      className={[
        "logo-mark relative inline-flex items-center gap-2",
        interactive ? "logo-mark--interactive" : "",
        className
      ].join(" ")}
    >
      <span
        className="logo-mark__svg relative inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 48 48"
          width={size}
          height={size}
          aria-hidden
          className="relative z-10"
        >
          <defs>
            {/* Base diamond — deepest tone */}
            <linearGradient id="logoDiaA" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(var(--color-primary-800))" />
              <stop offset="100%" stopColor="rgb(var(--color-primary-600))" />
            </linearGradient>
            {/* Mid diamond — transitional */}
            <linearGradient id="logoDiaB" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(var(--color-primary-600))" />
              <stop offset="100%" stopColor="rgb(var(--color-primary-400))" />
            </linearGradient>
            {/* Top diamond — brightest, focal point */}
            <linearGradient id="logoDiaC" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(var(--color-primary-400))" />
              <stop offset="100%" stopColor="rgb(var(--color-info-300))" />
            </linearGradient>
            {/* Halo behind the top diamond */}
            <radialGradient id="logoGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgb(var(--color-primary-400))" stopOpacity="0.6" />
              <stop offset="100%" stopColor="rgb(var(--color-primary-400))" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Soft glow centred on the top diamond */}
          <circle
            cx="35"
            cy="12"
            r="14"
            fill="url(#logoGlow)"
            className="logo-halo"
          />

          {/* Connector lines — dashed lattice (ByteDance connectivity feel) */}
          <g
            stroke="rgb(var(--color-primary-400))"
            strokeOpacity="0.45"
            strokeWidth="1"
            strokeDasharray="2 2"
            strokeLinecap="round"
            fill="none"
          >
            {/* base → mid */}
            <line x1="11" y1="34" x2="23" y2="22" />
            {/* mid → top */}
            <line x1="23" y1="22" x2="35" y2="12" />
          </g>

          {/* Base diamond — bottom-left, smallest, darkest */}
          <rect
            x="4"
            y="27"
            width="13"
            height="13"
            rx="1.5"
            fill="url(#logoDiaA)"
            fillOpacity="0.92"
            transform="rotate(45 10.5 33.5)"
            className="logo-diamond"
          />

          {/* Mid diamond — centre */}
          <rect
            x="16"
            y="15"
            width="15"
            height="15"
            rx="1.5"
            fill="url(#logoDiaB)"
            fillOpacity="0.95"
            transform="rotate(45 23.5 22.5)"
            className="logo-diamond"
          />

          {/* Top diamond — top-right, largest, brightest, primary interactive el */}
          <rect
            x="27"
            y="4"
            width="17"
            height="17"
            rx="1.5"
            fill="url(#logoDiaC)"
            transform="rotate(45 35.5 12.5)"
            className="logo-frame logo-diamond"
          />

          {/* Tiny pulsing core dot on the top diamond */}
          <circle
            cx="35"
            cy="12"
            r="2.2"
            fill="rgb(255 255 255)"
            opacity="0.85"
            className="logo-core"
          />
        </svg>
      </span>

      {withWordmark ? (
        <span className="text-base font-semibold tracking-tight text-text-primary">
          A1<span className="text-primary-600">+</span>{" "}
          <span className="text-text-secondary">IP Coworker</span>
        </span>
      ) : null}
    </span>
  );
}
