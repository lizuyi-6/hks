"use client";

import { useEffect, useRef, useState } from "react";

export type MascotExpression = "idle" | "thinking" | "happy" | "warning" | "sleepy";

export type MascotSize = "sm" | "md" | "lg";

interface MascotProps {
  expression?: MascotExpression;
  size?: MascotSize;
  animated?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: { vw: 36, vh: 36, cx: 18, cy: 18, r: 14, eyeRx: 2.2, eyeRy: 2.5 },
  md: { vw: 64, vh: 64, cx: 32, cy: 30, r: 24, eyeRx: 3.8, eyeRy: 4.2 },
  lg: { vw: 96, vh: 96, cx: 48, cy: 44, r: 36, eyeRx: 5.5, eyeRy: 6 },
};

export function Mascot({
  expression = "idle",
  size = "md",
  animated = true,
  className = "",
}: MascotProps) {
  const s = SIZE_MAP[size];
  const [blink, setBlink] = useState(false);
  const [thinkingOffset, setThinkingOffset] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!animated || expression !== "idle") return;

    const scheduleBlink = () => {
      timerRef.current = setTimeout(() => {
        setBlink(true);
        setTimeout(() => {
          setBlink(false);
          scheduleBlink();
        }, 120);
      }, 2500 + Math.random() * 1500);
    };

    scheduleBlink();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [animated, expression]);

  useEffect(() => {
    if (expression === "thinking") {
      thinkTimerRef.current = setInterval(() => {
        setThinkingOffset((p) => (p + 1) % 3);
      }, 600);
    } else {
      setThinkingOffset(0);
      if (thinkTimerRef.current) clearInterval(thinkTimerRef.current);
    }
    return () => {
      if (thinkTimerRef.current) clearInterval(thinkTimerRef.current);
    };
  }, [expression]);

  const eyeY = s.cy - s.r * 0.12;
  const leftEyeX = s.cx - s.r * 0.3;
  const rightEyeX = s.cx + s.r * 0.3;
  const mouthY = s.cy + s.r * 0.38;
  const earY = s.cy - s.r * 0.82;
  const earSize = s.r * 0.28;
  const badgeCX = s.cx;
  const badgeCY = s.cy + s.r * 0.55;
  const badgeR = s.r * 0.22;
  const antennaY = s.cy - s.r * 1.05;

  const getEyeShape = () => {
    if (blink || expression === "sleepy") {
      return (
        <>
          <line
            x1={leftEyeX - s.eyeRx}
            y1={eyeY}
            x2={leftEyeX + s.eyeRx}
            y2={eyeY}
            stroke="white"
            strokeWidth={s.eyeRy * 1.2}
            strokeLinecap="round"
          />
          <line
            x1={rightEyeX - s.eyeRx}
            y1={eyeY}
            x2={rightEyeX + s.eyeRx}
            y2={eyeY}
            stroke="white"
            strokeWidth={s.eyeRy * 1.2}
            strokeLinecap="round"
          />
        </>
      );
    }
    if (expression === "thinking") {
      return (
        <>
          <circle cx={leftEyeX} cy={eyeY} r={s.eyeRx * 0.7} fill="white" />
          <circle cx={rightEyeX} cy={eyeY} r={s.eyeRx * 0.7} fill="white" />
        </>
      );
    }
    if (expression === "warning") {
      return (
        <>
          <circle cx={leftEyeX} cy={eyeY} r={s.eyeRx * 0.75} fill="white" />
          <circle cx={rightEyeX} cy={eyeY} r={s.eyeRx * 0.75} fill="white" />
        </>
      );
    }
    if (expression === "happy") {
      return (
        <>
          <path
            d={`M ${leftEyeX - s.eyeRx * 0.9} ${eyeY + s.eyeRy * 0.3} Q ${leftEyeX} ${eyeY - s.eyeRy * 0.8} ${leftEyeX + s.eyeRx * 0.9} ${eyeY + s.eyeRy * 0.3}`}
            stroke="white"
            strokeWidth={s.eyeRy * 0.8}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={`M ${rightEyeX - s.eyeRx * 0.9} ${eyeY + s.eyeRy * 0.3} Q ${rightEyeX} ${eyeY - s.eyeRy * 0.8} ${rightEyeX + s.eyeRx * 0.9} ${eyeY + s.eyeRy * 0.3}`}
            stroke="white"
            strokeWidth={s.eyeRy * 0.8}
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
    }
    return (
      <>
        <ellipse cx={leftEyeX} cy={eyeY} rx={s.eyeRx} ry={s.eyeRy} fill="white" />
        <ellipse cx={rightEyeX} cy={eyeY} rx={s.eyeRx} ry={s.eyeRy} fill="white" />
      </>
    );
  };

  const getPupils = () => {
    if (expression === "sleepy") return null;
    if (expression === "warning") {
      return (
        <>
          <circle cx={leftEyeX} cy={eyeY} r={s.eyeRx * 0.35} fill="#1a1a2e" />
          <circle cx={rightEyeX} cy={eyeY} r={s.eyeRx * 0.35} fill="#1a1a2e" />
        </>
      );
    }
    return (
      <>
        <circle cx={leftEyeX + s.eyeRx * 0.15} cy={eyeY - s.eyeRy * 0.15} r={s.eyeRx * 0.45} fill="#1a1a2e" />
        <circle cx={rightEyeX + s.eyeRx * 0.15} cy={eyeY - s.eyeRy * 0.15} r={s.eyeRx * 0.45} fill="#1a1a2e" />
        <circle cx={leftEyeX + s.eyeRx * 0.3} cy={eyeY - s.eyeRy * 0.3} r={s.eyeRx * 0.18} fill="white" />
        <circle cx={rightEyeX + s.eyeRx * 0.3} cy={eyeY - s.eyeRy * 0.3} r={s.eyeRx * 0.18} fill="white" />
      </>
    );
  };

  const getMouth = () => {
    const mw = s.r * 0.28;
    if (expression === "happy") {
      return (
        <path
          d={`M ${s.cx - mw * 1.6} ${mouthY - s.r * 0.04} Q ${s.cx} ${mouthY + s.r * 0.22} ${s.cx + mw * 1.6} ${mouthY - s.r * 0.04}`}
          stroke="white"
          strokeWidth={s.r * 0.06}
          strokeLinecap="round"
          fill="none"
        />
      );
    }
    if (expression === "warning") {
      const wh = s.r * 0.1;
      return (
        <path
          d={`M ${s.cx - mw} ${mouthY - wh * 0.5} Q ${s.cx} ${mouthY + wh * 1.5} ${s.cx + mw} ${mouthY - wh * 0.5}`}
          stroke="white"
          strokeWidth={s.r * 0.055}
          strokeLinecap="round"
          fill="none"
        />
      );
    }
    if (expression === "sleepy") {
      return (
        <line
          x1={s.cx - mw * 0.8}
          y1={mouthY}
          x2={s.cx + mw * 0.8}
          y2={mouthY}
          stroke="white"
          strokeWidth={s.r * 0.045}
          strokeLinecap="round"
        />
      );
    }
    if (expression === "thinking") {
      const dots = [
        { dx: -mw * 0.7, dy: 0 },
        { dx: 0, dy: -s.r * 0.04 },
        { dx: mw * 0.7, dy: 0 },
      ];
      return (
        <>
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={s.cx + d.dx}
              cy={mouthY + d.dy}
              r={s.r * 0.045}
              fill="white"
              opacity={i === thinkingOffset ? 1 : 0.4}
            />
          ))}
        </>
      );
    }
    return (
      <path
        d={`M ${s.cx - mw} ${mouthY} Q ${s.cx} ${mouthY + s.r * 0.1} ${s.cx + mw} ${mouthY}`}
        stroke="white"
        strokeWidth={s.r * 0.055}
        strokeLinecap="round"
        fill="none"
      />
    );
  };

  const getCheeks = () => {
    if (expression !== "happy" && expression !== "idle") return null;
    const cr = s.r * 0.12;
    const cxOff = s.r * 0.5;
    const cyOff = s.r * 0.2;
    const cheekColor = "rgba(255,180,150,0.35)";
    return (
      <>
        <circle cx={leftEyeX - cxOff} cy={eyeY + cyOff} r={cr} fill={cheekColor} />
        <circle cx={rightEyeX + cxOff} cy={eyeY + cyOff} r={cr} fill={cheekColor} />
      </>
    );
  };

  const getAccent = () => {
    if (expression === "warning") {
      return (
        <circle
          cx={s.cx}
          cy={s.cy - s.r * 1.25}
          r={s.r * 0.18}
          fill="#ff375f"
          opacity={0.9}
        />
      );
    }
    if (expression === "thinking") {
      const offsets = [
        { dx: s.r * 0.6, dy: -s.r * 0.5 },
        { dx: s.r * 0.75, dy: -s.r * 0.75 },
        { dx: s.r * 0.85, dy: -s.r * 1.0 },
      ];
      return (
        <>
          {offsets.map((o, i) => (
            <circle
              key={i}
              cx={s.cx + o.dx}
              cy={s.cy + o.dy}
              r={s.r * 0.09 - i * 0.015}
              fill="#5ac8ff"
              opacity={i === thinkingOffset ? 0.95 : 0.25}
            />
          ))}
        </>
      );
    }
    if (expression === "sleepy") {
      const zSize = s.r * 0.2;
      return (
        <>
          <text
            x={s.cx + s.r * 0.7}
            y={s.cy - s.r * 0.9}
            fontSize={zSize}
            fill="#5ac8ff"
            opacity={0.7}
            fontFamily="sans-serif"
            fontWeight="700"
          >
            z
          </text>
          <text
            x={s.cx + s.r * 1.05}
            y={s.cy - s.r * 1.15}
            fontSize={zSize * 0.7}
            fill="#5ac8ff"
            opacity={0.45}
            fontFamily="sans-serif"
            fontWeight="700"
          >
            z
          </text>
        </>
      );
    }
    return (
      <line
        x1={s.cx}
        y1={s.cy - s.r * 0.88}
        x2={s.cx}
        y2={s.cy - s.r * 0.72}
        stroke="#5ac8ff"
        strokeWidth={s.r * 0.045}
        strokeLinecap="round"
      />
    );
  };

  const getBodyGradientId = () => `body-grad-${size}-${expression}`;
  const getShadowId = () => `mascot-shadow-${size}`;

  return (
    <svg
      viewBox={`0 0 ${s.vw} ${s.vh}`}
      width={s.vw}
      height={s.vh}
      className={className}
      aria-label={`A1+ mascot - ${expression}`}
    >
      <defs>
        <radialGradient id={getBodyGradientId()} cx="38%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#3a7bd5" />
          <stop offset="100%" stopColor="#0a5fcc" />
        </radialGradient>
        <radialGradient id={getShadowId()} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.2)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>

      {/* Shadow */}
      <ellipse
        cx={s.cx}
        cy={s.cy + s.r * 1.08}
        rx={s.r * 0.75}
        ry={s.r * 0.12}
        fill={getShadowId()}
      />

      {/* Left ear */}
      <circle
        cx={s.cx - s.r * 0.62}
        cy={earY}
        r={earSize}
        fill="url(#body-grad)"
        style={{ fill: `url(#${getBodyGradientId()})` }}
      />
      <circle
        cx={s.cx - s.r * 0.62}
        cy={earY}
        r={earSize * 0.45}
        fill="rgba(255,255,255,0.25)"
      />

      {/* Right ear */}
      <circle
        cx={s.cx + s.r * 0.62}
        cy={earY}
        r={earSize}
        fill="url(#body-grad)"
        style={{ fill: `url(#${getBodyGradientId()})` }}
      />
      <circle
        cx={s.cx + s.r * 0.62}
        cy={earY}
        r={earSize * 0.45}
        fill="rgba(255,255,255,0.25)"
      />

      {/* Body */}
      <circle
        cx={s.cx}
        cy={s.cy}
        r={s.r}
        fill={getBodyGradientId()}
      />

      {/* Body highlight */}
      <ellipse
        cx={s.cx - s.r * 0.22}
        cy={s.cy - s.r * 0.3}
        rx={s.r * 0.38}
        ry={s.r * 0.25}
        fill="rgba(255,255,255,0.18)"
      />

      {/* Antenna */}
      {getAccent()}

      {/* Eyes */}
      {getEyeShape()}
      {getPupils()}

      {/* Cheeks */}
      {getCheeks()}

      {/* Mouth */}
      {getMouth()}

      {/* Badge */}
      <circle cx={badgeCX} cy={badgeCY} r={badgeR} fill="white" />
      <text
        x={badgeCX}
        y={badgeCY + badgeR * 0.38}
        textAnchor="middle"
        fontSize={badgeR * 1.1}
        fill="#0a5fcc"
        fontFamily="sans-serif"
        fontWeight="800"
        fontStyle="italic"
      >
        A+
      </text>
    </svg>
  );
}
