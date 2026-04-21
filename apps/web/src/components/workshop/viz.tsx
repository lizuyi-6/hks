"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

/* ============================================================
   Sparkline — smooth-ish polyline + gradient area fill
   Accepts any numeric series; auto normalizes.
   ============================================================ */
export function Sparkline({
  data,
  color = "currentColor",
  width = 120,
  height = 40,
  fill = true,
  strokeWidth = 1.5,
  gradientId,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  strokeWidth?: number;
  gradientId?: string;
}) {
  const uid = useId();
  const gid = gradientId ?? `sparkline-grad-${uid}`;

  if (data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const padding = strokeWidth;
  const usableH = height - padding * 2;

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = padding + usableH - ((v - min) / range) * usableH;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`))
    .join(" ");
  const areaPath = `${linePath} L ${width.toFixed(2)} ${height} L 0 ${height} Z`;
  // gid already set above with useId()

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block", overflow: "visible" }}
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gid})`} />
        </>
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ============================================================
   DonutRing — single-value progress ring with track
   ============================================================ */
export function DonutRing({
  percent,
  color = "currentColor",
  track = "rgb(var(--color-border) / 0.6)",
  size = 88,
  strokeWidth = 8,
  label,
  valueLabel,
}: {
  percent: number;
  color?: string;
  track?: string;
  size?: number;
  strokeWidth?: number;
  label?: ReactNode;
  valueLabel?: ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={track} strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          pointerEvents: "none",
        }}
      >
        {valueLabel ?? (
          <span style={{ fontSize: size * 0.22, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {percent}%
          </span>
        )}
        {label && <span style={{ fontSize: 10, opacity: 0.6, marginTop: 3 }}>{label}</span>}
      </div>
    </div>
  );
}

/* ============================================================
   BarRow — horizontal bar with label + value
   ============================================================ */
export function BarRow({
  label,
  value,
  max,
  color = "currentColor",
  track = "rgb(var(--color-border) / 0.6)",
  suffix,
  labelStyle,
  valueStyle,
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
  track?: string;
  suffix?: string;
  labelStyle?: CSSProperties;
  valueStyle?: CSSProperties;
}) {
  const percent = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12, fontWeight: 500, ...labelStyle }}>{label}</span>
        <span style={{ fontSize: 11, fontFeatureSettings: '"tnum"', ...valueStyle }}>
          {value}
          {suffix ? ` ${suffix}` : ""}
        </span>
      </div>
      <div style={{ height: 6, background: track, borderRadius: 999, overflow: "hidden" }}>
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: color,
            borderRadius: 999,
            transition: "width 600ms cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </div>
    </div>
  );
}

/* ============================================================
   KpiNumber — giant display number with label + delta
   ============================================================ */
export function KpiNumber({
  value,
  label,
  delta,
  trend,
  size = 48,
  weight = 700,
  labelColor,
  valueColor,
  upColor = "#10b981",
  downColor = "#ef4444",
  fontFamily,
}: {
  value: string | number;
  label?: ReactNode;
  delta?: string;
  trend?: "up" | "down";
  size?: number;
  weight?: number;
  labelColor?: string;
  valueColor?: string;
  upColor?: string;
  downColor?: string;
  fontFamily?: string;
}) {
  const deltaColor = trend === "up" ? upColor : trend === "down" ? downColor : undefined;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <span style={{ fontSize: 11, fontWeight: 500, color: labelColor, letterSpacing: "0.02em" }}>
          {label}
        </span>
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: size,
            fontWeight: weight,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            color: valueColor,
            fontFeatureSettings: '"tnum"',
            fontFamily,
          }}
        >
          {value}
        </span>
        {delta && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: deltaColor,
              fontFeatureSettings: '"tnum"',
            }}
          >
            {trend === "up" ? "↑" : trend === "down" ? "↓" : ""} {delta}
          </span>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   AreaChart — larger version of sparkline with axis labels
   ============================================================ */
export function AreaChart({
  data,
  labels,
  color = "currentColor",
  width = 560,
  height = 160,
  showGrid = true,
  gridColor = "rgb(var(--color-border) / 0.6)",
  labelColor = "rgb(var(--color-text-tertiary))",
}: {
  data: number[];
  labels?: string[];
  color?: string;
  width?: number;
  height?: number;
  showGrid?: boolean;
  gridColor?: string;
  labelColor?: string;
}) {
  const areaUid = useId();
  const gid = `area-grad-${areaUid}`;

  if (data.length === 0) return null;
  const paddingX = 8;
  const paddingTop = 8;
  const paddingBottom = labels ? 20 : 8;
  const innerW = width - paddingX * 2;
  const innerH = height - paddingTop - paddingBottom;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;

  const points = data.map((v, i) => {
    const x = paddingX + i * stepX;
    const y = paddingTop + innerH - ((v - min) / range) * innerH;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`))
    .join(" ");
  const areaPath = `${linePath} L ${paddingX + innerW} ${paddingTop + innerH} L ${paddingX} ${paddingTop + innerH} Z`;

  const gridLines = [0.25, 0.5, 0.75].map((t) => paddingTop + innerH * t);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showGrid && (
        <g>
          {gridLines.map((y, i) => (
            <line key={i} x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke={gridColor} strokeWidth={1} strokeDasharray="2 4" />
          ))}
        </g>
      )}
      <path d={areaPath} fill={`url(#${gid})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill={color} />
      ))}
      {labels &&
        labels.map((l, i) => (
          <text
            key={i}
            x={paddingX + i * stepX}
            y={height - 4}
            textAnchor="middle"
            fontSize={9}
            fill={labelColor}
            fontFamily="inherit"
          >
            {l}
          </text>
        ))}
    </svg>
  );
}
