"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

/* ============================================================
   ColumnChart — vertical bars with optional labels
   ============================================================ */
export function ColumnChart({
  data,
  labels,
  color = "currentColor",
  trackColor = "rgb(var(--color-border) / 0.5)",
  width = 560,
  height = 160,
  barGap = 6,
  highlight,
}: {
  data: number[];
  labels?: string[];
  color?: string;
  trackColor?: string;
  width?: number;
  height?: number;
  barGap?: number;
  highlight?: number;
}) {
  if (data.length === 0) return null;
  const paddingX = 12;
  const paddingTop = 14;
  const paddingBottom = labels ? 22 : 8;
  const innerW = width - paddingX * 2;
  const innerH = height - paddingTop - paddingBottom;
  const max = Math.max(1, ...data);
  const stepX = innerW / data.length;
  const barW = Math.max(2, stepX - barGap);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      {data.map((v, i) => {
        const x = paddingX + i * stepX + (stepX - barW) / 2;
        const h = (v / max) * innerH;
        const y = paddingTop + (innerH - h);
        const isHi = highlight === i;
        return (
          <g key={i}>
            <rect
              x={x}
              y={paddingTop}
              width={barW}
              height={innerH}
              rx={3}
              fill={trackColor}
            />
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={3}
              fill={color}
              opacity={isHi ? 1 : 0.85}
              style={{ transition: "y 500ms, height 500ms" }}
            />
            <text
              x={x + barW / 2}
              y={y - 4}
              textAnchor="middle"
              fontSize={9}
              fill={color}
              fontFamily="inherit"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {v > 0 ? v : ""}
            </text>
            {labels && labels[i] && (
              <text
                x={x + barW / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={9}
                fill="rgb(var(--color-text-tertiary))"
                fontFamily="inherit"
              >
                {labels[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ============================================================
   StackedBar100 — 100% stacked horizontal bar + legend
   ============================================================ */
export function StackedBar100({
  segments,
  height = 14,
  showLegend = true,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  height?: number;
  showLegend?: boolean;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let acc = 0;
  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          width: "100%",
          height,
          borderRadius: 999,
          overflow: "hidden",
          background: "rgb(var(--color-border) / 0.5)",
        }}
      >
        {segments.map((seg) => {
          const percent = (seg.value / total) * 100;
          acc += percent;
          return (
            <div
              key={seg.label}
              title={`${seg.label}: ${seg.value} (${percent.toFixed(1)}%)`}
              style={{
                width: `${percent}%`,
                background: seg.color,
                transition: "width 500ms",
              }}
            />
          );
        })}
      </div>
      {showLegend && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 10,
          }}
        >
          {segments.map((seg) => {
            const percent = (seg.value / total) * 100;
            return (
              <div
                key={seg.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: seg.color,
                    display: "inline-block",
                  }}
                />
                <span style={{ color: "rgb(var(--color-text-secondary))" }}>{seg.label}</span>
                <span style={{ color: "rgb(var(--color-text-tertiary))", fontFeatureSettings: '"tnum"' }}>
                  {seg.value}
                </span>
                <span style={{ color: "rgb(var(--color-text-muted))", fontFeatureSettings: '"tnum"' }}>
                  {percent.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   StackedAreaChart — N stacked series
   ============================================================ */
export function StackedAreaChart({
  series,
  labels,
  width = 720,
  height = 180,
  showGrid = true,
  gridColor = "rgb(var(--color-border) / 0.6)",
  labelColor = "rgb(var(--color-text-tertiary))",
}: {
  series: Array<{ label: string; color: string; data: number[] }>;
  labels?: string[];
  width?: number;
  height?: number;
  showGrid?: boolean;
  gridColor?: string;
  labelColor?: string;
}) {
  const uid = useId();
  if (series.length === 0 || series[0].data.length === 0) return null;

  const paddingX = 10;
  const paddingTop = 10;
  const paddingBottom = labels ? 22 : 10;
  const innerW = width - paddingX * 2;
  const innerH = height - paddingTop - paddingBottom;
  const n = series[0].data.length;
  const stepX = n > 1 ? innerW / (n - 1) : innerW;

  // build cumulative sums (stack)
  const stacks: number[][] = [];
  for (let i = 0; i < n; i++) {
    let running = 0;
    const col: number[] = [];
    for (const s of series) {
      running += s.data[i] ?? 0;
      col.push(running);
    }
    stacks.push(col);
  }
  const max = Math.max(1, ...stacks.map((c) => c[c.length - 1]));

  const yAt = (v: number) =>
    paddingTop + innerH - (v / max) * innerH;
  const xAt = (i: number) => paddingX + i * stepX;

  const gridLines = [0.25, 0.5, 0.75].map((t) => paddingTop + innerH * t);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      <defs>
        {series.map((s, idx) => (
          <linearGradient id={`stack-${uid}-${idx}`} key={idx} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0.15" />
          </linearGradient>
        ))}
      </defs>
      {showGrid && (
        <g>
          {gridLines.map((y, i) => (
            <line
              key={i}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              stroke={gridColor}
              strokeDasharray="2 4"
            />
          ))}
        </g>
      )}
      {series.map((s, idx) => {
        // upper boundary = stacks[i][idx]; lower = idx>0 ? stacks[i][idx-1] : 0
        const upper = stacks.map((col, i) => [xAt(i), yAt(col[idx])] as const);
        const lower = stacks.map((col, i) => [xAt(i), yAt(idx > 0 ? col[idx - 1] : 0)] as const);
        const path =
          upper
            .map(([x, y], i) =>
              i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`,
            )
            .join(" ") +
          " " +
          lower
            .slice()
            .reverse()
            .map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`)
            .join(" ") +
          " Z";
        return (
          <g key={s.label}>
            <path d={path} fill={`url(#stack-${uid}-${idx})`} stroke="none" />
            <path
              d={upper
                .map(([x, y], i) =>
                  i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`,
                )
                .join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );
      })}
      {labels &&
        labels.map((l, i) =>
          i % Math.ceil(labels.length / 8) === 0 ? (
            <text
              key={i}
              x={xAt(i)}
              y={height - 6}
              textAnchor="middle"
              fontSize={9}
              fill={labelColor}
              fontFamily="inherit"
            >
              {l}
            </text>
          ) : null,
        )}
    </svg>
  );
}

/* ============================================================
   RadarChart — N-axis spider polygon
   ============================================================ */
export function RadarChart({
  axes,
  values,
  max = 100,
  color = "currentColor",
  size = 260,
  rings = 4,
  gridColor = "rgb(var(--color-text-tertiary) / 0.35)",
  axisColor = "rgb(var(--color-text-tertiary) / 0.55)",
  labelColor = "rgb(var(--color-text-primary))",
}: {
  axes: string[];
  values: number[];
  max?: number;
  color?: string;
  size?: number;
  rings?: number;
  gridColor?: string;
  axisColor?: string;
  labelColor?: string;
}) {
  const uid = useId();
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 52;
  const n = axes.length;

  const angle = (i: number) => (-Math.PI / 2) + (i * 2 * Math.PI) / n;
  const axisPoint = (i: number, r: number) => {
    const a = angle(i);
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
  };

  const ringPolys: string[] = [];
  for (let r = 1; r <= rings; r++) {
    const rad = (radius * r) / rings;
    ringPolys.push(
      axes
        .map((_, i) => {
          const [x, y] = axisPoint(i, rad);
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" "),
    );
  }

  const valuePoly = axes
    .map((_, i) => {
      const v = Math.max(0, Math.min(max, values[i] ?? 0));
      const [x, y] = axisPoint(i, (radius * v) / max);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <defs>
        <radialGradient id={`radar-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.1" />
        </radialGradient>
      </defs>
      {ringPolys.map((pts, idx) => (
        <polygon
          key={idx}
          points={pts}
          fill="none"
          stroke={gridColor}
          strokeWidth={1}
          strokeDasharray={idx === ringPolys.length - 1 ? "0" : "2 3"}
        />
      ))}
      {axes.map((_, i) => {
        const [x, y] = axisPoint(i, radius);
        return (
          <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={axisColor} strokeWidth={1} />
        );
      })}
      <polygon
        points={valuePoly}
        fill={`url(#radar-${uid})`}
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ transition: "all 600ms" }}
      />
      {axes.map((_, i) => {
        const v = values[i] ?? 0;
        const [x, y] = axisPoint(i, (radius * Math.max(0, Math.min(max, v))) / max);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={3}
            fill={color}
            stroke="rgb(var(--color-surface))"
            strokeWidth={1.5}
          />
        );
      })}
      {axes.map((label, i) => {
        const [x, y] = axisPoint(i, radius + 18);
        const a = angle(i);
        const anchor =
          Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
        return (
          <text
            key={label}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize={11}
            fontWeight={500}
            fill={labelColor}
            fontFamily="inherit"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

/* ============================================================
   BubbleScatter — scatter + optional quadrants matrix mode
   ============================================================ */
export function BubbleScatter({
  points,
  width = 520,
  height = 320,
  xMin = 0,
  xMax = 100,
  yMin = 0,
  yMax = 100,
  xLabel,
  yLabel,
  quadrants,
  quadrantLabels,
  gridColor = "rgb(var(--color-border))",
  axisColor = "rgb(var(--color-text-tertiary))",
  labelColor = "rgb(var(--color-text-secondary))",
}: {
  points: Array<{
    x: number;
    y: number;
    r?: number;
    color?: string;
    label?: string;
    index?: number;
  }>;
  width?: number;
  height?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  xLabel?: string;
  yLabel?: string;
  quadrants?: boolean;
  quadrantLabels?: [string, string, string, string]; // [TL, TR, BL, BR]
  gridColor?: string;
  axisColor?: string;
  labelColor?: string;
}) {
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const xAt = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * innerW;
  const yAt = (y: number) => padT + innerH - ((y - yMin) / (yMax - yMin)) * innerH;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block" }}
    >
      {quadrants && (
        <>
          <line
            x1={padL + innerW / 2}
            x2={padL + innerW / 2}
            y1={padT}
            y2={padT + innerH}
            stroke={axisColor}
            strokeDasharray="3 4"
          />
          <line
            x1={padL}
            x2={padL + innerW}
            y1={padT + innerH / 2}
            y2={padT + innerH / 2}
            stroke={axisColor}
            strokeDasharray="3 4"
          />
          {quadrantLabels && (
            <>
              <text x={padL + 8} y={padT + 14} fontSize={10} fill={labelColor} fontFamily="inherit">
                {quadrantLabels[0]}
              </text>
              <text
                x={padL + innerW - 8}
                y={padT + 14}
                textAnchor="end"
                fontSize={10}
                fill={labelColor}
                fontFamily="inherit"
              >
                {quadrantLabels[1]}
              </text>
              <text
                x={padL + 8}
                y={padT + innerH - 6}
                fontSize={10}
                fill={labelColor}
                fontFamily="inherit"
              >
                {quadrantLabels[2]}
              </text>
              <text
                x={padL + innerW - 8}
                y={padT + innerH - 6}
                textAnchor="end"
                fontSize={10}
                fill={labelColor}
                fontFamily="inherit"
              >
                {quadrantLabels[3]}
              </text>
            </>
          )}
        </>
      )}
      {/* axis lines */}
      <line x1={padL} x2={padL} y1={padT} y2={padT + innerH} stroke={axisColor} strokeWidth={1} />
      <line
        x1={padL}
        x2={padL + innerW}
        y1={padT + innerH}
        y2={padT + innerH}
        stroke={axisColor}
        strokeWidth={1}
      />
      {/* grid */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={`hg-${t}`}
          x1={padL}
          x2={padL + innerW}
          y1={padT + innerH * (1 - t)}
          y2={padT + innerH * (1 - t)}
          stroke={gridColor}
          strokeDasharray="2 4"
        />
      ))}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={`vg-${t}`}
          x1={padL + innerW * t}
          x2={padL + innerW * t}
          y1={padT}
          y2={padT + innerH}
          stroke={gridColor}
          strokeDasharray="2 4"
        />
      ))}
      {/* bubbles */}
      {points.map((p, i) => {
        const cxp = xAt(p.x);
        const cyp = yAt(p.y);
        const r = Math.max(4, Math.min(28, p.r ?? 8));
        const c = p.color ?? "currentColor";
        const hasIndex = typeof p.index === "number";
        return (
          <g key={i}>
            <circle cx={cxp} cy={cyp} r={r} fill={c} opacity={0.22} />
            <circle cx={cxp} cy={cyp} r={Math.max(2, r * 0.55)} fill={c} />
            {hasIndex ? (
              <text
                x={cxp}
                y={cyp}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(9, Math.min(12, r * 0.7))}
                fontWeight={700}
                fill="rgb(var(--color-text-inverse))"
                fontFamily="inherit"
                style={{ fontFeatureSettings: '"tnum"', pointerEvents: "none" }}
              >
                {p.index}
              </text>
            ) : p.label ? (
              <text
                x={cxp}
                y={cyp - r - 4}
                textAnchor="middle"
                fontSize={10}
                fill={labelColor}
                fontFamily="inherit"
              >
                {p.label}
              </text>
            ) : null}
          </g>
        );
      })}
      {/* axis labels */}
      {xLabel && (
        <text
          x={padL + innerW / 2}
          y={height - 8}
          textAnchor="middle"
          fontSize={10}
          fontWeight={500}
          fill={labelColor}
          fontFamily="inherit"
        >
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={-padT - innerH / 2}
          y={14}
          textAnchor="middle"
          fontSize={10}
          fontWeight={500}
          fill={labelColor}
          fontFamily="inherit"
          transform="rotate(-90)"
        >
          {yLabel}
        </text>
      )}
    </svg>
  );
}

/* ============================================================
   SegmentedRings — a row of small donut rings
   ============================================================ */
export function SegmentedRings({
  items,
  size = 72,
  strokeWidth = 7,
  track = "rgb(var(--color-border) / 0.6)",
}: {
  items: Array<{
    label: string;
    percent: number;
    color?: string;
    hint?: string;
  }>;
  size?: number;
  strokeWidth?: number;
  track?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * radius;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        gap: 12,
      }}
    >
      {items.map((it) => {
        const clamped = Math.max(0, Math.min(100, it.percent));
        const offset = circ - (clamped / 100) * circ;
        const color = it.color ?? "currentColor";
        return (
          <div
            key={it.label}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
          >
            <div style={{ position: "relative", width: size, height: size }}>
              <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={track}
                  strokeWidth={strokeWidth}
                />
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  style={{ transition: "stroke-dashoffset 600ms" }}
                />
              </svg>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: size * 0.22,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "rgb(var(--color-text-primary))",
                  fontFeatureSettings: '"tnum"',
                }}
              >
                {clamped}%
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "rgb(var(--color-text-primary))" }}>
                {it.label}
              </div>
              {it.hint && (
                <div style={{ fontSize: 10, color: "rgb(var(--color-text-tertiary))" }}>{it.hint}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   MilestoneTrack — journey path with orbs
   ============================================================ */
export function MilestoneTrack({
  steps,
  current,
  color = "rgb(var(--color-primary-600))",
}: {
  steps: Array<{ label: string; hint?: string; icon?: ReactNode }>;
  current: number;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
        position: "relative",
      }}
    >
      {/* connecting line */}
      <div
        style={{
          position: "absolute",
          top: 18,
          left: `calc(100% / ${steps.length * 2})`,
          right: `calc(100% / ${steps.length * 2})`,
          height: 2,
          background: "rgb(var(--color-border))",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 18,
          left: `calc(100% / ${steps.length * 2})`,
          width: `calc((100% - 100% / ${steps.length}) * ${Math.max(
            0,
            Math.min(1, current / Math.max(1, steps.length - 1)),
          )})`,
          height: 2,
          background: color,
          zIndex: 1,
          transition: "width 600ms",
        }}
      />
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "upcoming";
        return (
          <div
            key={s.label}
            style={{
              position: "relative",
              zIndex: 2,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "0 4px",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 600,
                color: state === "upcoming" ? "rgb(var(--color-text-tertiary))" : "white",
                background:
                  state === "done"
                    ? color
                    : state === "current"
                      ? color
                      : "rgb(var(--color-surface))",
                border:
                  state === "upcoming"
                    ? "2px solid rgb(var(--color-border))"
                    : `2px solid ${color}`,
                boxShadow:
                  state === "current" ? `0 0 0 6px ${hexToRgba(color, 0.15)}` : "none",
                animation: state === "current" ? "pulse-ring 1.8s ease-in-out infinite" : "none",
              }}
            >
              {s.icon ?? i + 1}
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color:
                    state === "upcoming"
                      ? "rgb(var(--color-text-tertiary))"
                      : "rgb(var(--color-text-primary))",
                }}
              >
                {s.label}
              </div>
              {s.hint && (
                <div
                  style={{
                    fontSize: 10,
                    color: "rgb(var(--color-text-tertiary))",
                    marginTop: 2,
                  }}
                >
                  {s.hint}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <style>{`@keyframes pulse-ring { 0%,100% { box-shadow: 0 0 0 6px ${hexToRgba(
        color,
        0.15,
      )}; } 50% { box-shadow: 0 0 0 10px ${hexToRgba(color, 0.05)}; } }`}</style>
    </div>
  );
}

function hexToRgba(c: string, alpha: number) {
  // Accept rgb(var(--...)) expressions by wrapping in rgba via color-mix fallback.
  // Simpler: if it starts with rgb(, inject alpha via a CSS color-mix polyfill-ish trick.
  if (c.startsWith("rgb(var")) return `rgba(0,0,0,${alpha})`; // safe fallback
  if (c.startsWith("rgb(")) return c.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  if (c.startsWith("#") && c.length === 7) {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return c;
}

/* ============================================================
   RadialProgress — circular multi-arc checklist
   ============================================================ */
export function RadialProgress({
  total,
  done,
  size = 160,
  strokeWidth = 10,
  color = "currentColor",
  track = "rgb(var(--color-border) / 0.6)",
  gap = 6, // degrees
  children,
}: {
  total: number;
  done: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  track?: string;
  gap?: number;
  children?: ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const segments = Math.max(1, total);
  const segAngle = 360 / segments;
  const arcAngle = Math.max(1, segAngle - gap);

  function arcPath(startDeg: number, sweepDeg: number) {
    const s = ((startDeg - 90) * Math.PI) / 180;
    const e = ((startDeg + sweepDeg - 90) * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(s);
    const y1 = cy + radius * Math.sin(s);
    const x2 = cx + radius * Math.cos(e);
    const y2 = cy + radius * Math.sin(e);
    const large = sweepDeg > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
        {Array.from({ length: segments }).map((_, i) => {
          const start = i * segAngle + gap / 2;
          const filled = i < done;
          return (
            <path
              key={i}
              d={arcPath(start, arcAngle)}
              fill="none"
              stroke={filled ? color : track}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              style={{ transition: "stroke 400ms" }}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   RibbonBar — single horizontal ribbon split into colored segments
   ============================================================ */
export function RibbonBar({
  segments,
  height = 26,
  showLabels = true,
}: {
  segments: Array<{
    label: string;
    color: string;
    weight?: number; // relative width (default 1)
    sublabel?: string;
  }>;
  height?: number;
  showLabels?: boolean;
}) {
  const total = segments.reduce((s, seg) => s + (seg.weight ?? 1), 0) || 1;
  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          width: "100%",
          height,
          borderRadius: 6,
          overflow: "hidden",
          boxShadow: "inset 0 0 0 1px rgb(var(--color-border))",
        }}
      >
        {segments.map((seg, i) => {
          const w = ((seg.weight ?? 1) / total) * 100;
          return (
            <div
              key={i}
              title={`${seg.label}${seg.sublabel ? " · " + seg.sublabel : ""}`}
              style={{
                width: `${w}%`,
                background: seg.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.02em",
                borderRight: i < segments.length - 1 ? "1px solid rgba(255,255,255,0.35)" : "none",
              }}
            >
              {w > 6 ? seg.label : ""}
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div
          style={{
            display: "flex",
            width: "100%",
            marginTop: 6,
            fontSize: 10,
            color: "rgb(var(--color-text-tertiary))",
          }}
        >
          {segments.map((seg, i) => {
            const w = ((seg.weight ?? 1) / total) * 100;
            return (
              <div
                key={i}
                style={{
                  width: `${w}%`,
                  textAlign: "center",
                  padding: "0 2px",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                {seg.sublabel ?? seg.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   RadialBar — concentric arcs for categorical values
   ============================================================ */
export function RadialBar({
  items,
  size = 220,
  strokeWidth = 12,
  gap = 4,
  track = "rgb(var(--color-border) / 0.6)",
  max,
}: {
  items: Array<{ label: string; value: number; color: string }>;
  size?: number;
  strokeWidth?: number;
  gap?: number;
  track?: string;
  max?: number;
}) {
  const ringCount = items.length;
  const maxV = max ?? Math.max(1, ...items.map((i) => i.value));
  const cx = size / 2;
  const cy = size / 2;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
        {items.map((it, idx) => {
          const r = size / 2 - strokeWidth / 2 - idx * (strokeWidth + gap);
          if (r <= strokeWidth) return null;
          const circ = 2 * Math.PI * r;
          const percent = Math.max(0, Math.min(1, it.value / maxV));
          const offset = circ - percent * circ;
          return (
            <g key={it.label}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={track}
                strokeWidth={strokeWidth}
              />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={it.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: "stroke-dashoffset 700ms" }}
              />
            </g>
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          paddingTop: 12,
          display: "grid",
          gap: 4,
          fontSize: 11,
        }}
      >
        {items.map((it) => {
          const percent = (it.value / maxV) * 100;
          return (
            <div
              key={it.label}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: it.color,
                  display: "inline-block",
                }}
              />
              <span style={{ color: "rgb(var(--color-text-secondary))" }}>{it.label}</span>
              <span
                style={{
                  marginLeft: "auto",
                  color: "rgb(var(--color-text-primary))",
                  fontFeatureSettings: '"tnum"',
                }}
              >
                {it.value}
              </span>
              <span
                style={{
                  color: "rgb(var(--color-text-tertiary))",
                  fontFeatureSettings: '"tnum"',
                  width: 38,
                  textAlign: "right",
                }}
              >
                {percent.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   GaugeArc — semi-circle gauge 0–100 with ticks
   ============================================================ */
export function GaugeArc({
  value,
  min = 0,
  max = 100,
  size = 260,
  strokeWidth = 16,
  color = "currentColor",
  track = "rgb(var(--color-border) / 0.6)",
  thresholds,
  valueLabel,
  caption,
}: {
  value: number;
  min?: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  track?: string;
  thresholds?: Array<{ at: number; color: string }>;
  valueLabel?: ReactNode;
  caption?: ReactNode;
}) {
  const cx = size / 2;
  const cy = size * 0.7;
  const radius = size / 2 - strokeWidth;
  const circ = Math.PI * radius; // semi-circle arc length
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const offset = circ - pct * circ;

  const needleAngle = Math.PI * pct; // 0 at left, PI at right
  const nx = cx + Math.cos(Math.PI - needleAngle) * (radius - 4);
  const ny = cy - Math.sin(Math.PI - needleAngle) * (radius - 4);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size * 0.78,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <svg
        width={size}
        height={size * 0.78}
        viewBox={`0 0 ${size} ${size * 0.78}`}
        style={{ display: "block" }}
      >
        {/* track */}
        <path
          d={`M ${strokeWidth} ${cy} A ${radius} ${radius} 0 0 1 ${size - strokeWidth} ${cy}`}
          fill="none"
          stroke={track}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* threshold segments */}
        {thresholds &&
          [...thresholds]
            .sort((a, b) => a.at - b.at)
            .map((t, i, arr) => {
              const startPct = i === 0 ? 0 : arr[i - 1].at / 100;
              const endPct = t.at / 100;
              const startAngle = Math.PI - Math.PI * startPct;
              const endAngle = Math.PI - Math.PI * endPct;
              const x1 = cx + radius * Math.cos(startAngle);
              const y1 = cy - radius * Math.sin(startAngle);
              const x2 = cx + radius * Math.cos(endAngle);
              const y2 = cy - radius * Math.sin(endAngle);
              return (
                <path
                  key={i}
                  d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`}
                  fill="none"
                  stroke={t.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="butt"
                  opacity={0.35}
                />
              );
            })}
        {/* active value arc */}
        <path
          d={`M ${strokeWidth} ${cy} A ${radius} ${radius} 0 0 1 ${size - strokeWidth} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 700ms" }}
        />
        {/* needle */}
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke="rgb(var(--color-text-primary))"
          strokeWidth={3}
          strokeLinecap="round"
          style={{ transition: "all 700ms" }}
        />
        <circle cx={cx} cy={cy} r={6} fill="rgb(var(--color-text-primary))" />
        {/* ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const a = Math.PI - Math.PI * t;
          const x1 = cx + (radius - strokeWidth / 2 - 2) * Math.cos(a);
          const y1 = cy - (radius - strokeWidth / 2 - 2) * Math.sin(a);
          const x2 = cx + (radius + strokeWidth / 2 + 2) * Math.cos(a);
          const y2 = cy - (radius + strokeWidth / 2 + 2) * Math.sin(a);
          return (
            <line
              key={t}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgb(var(--color-text-tertiary) / 0.55)"
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          top: cy - 44,
          left: 0,
          right: 0,
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "rgb(var(--color-text-primary))",
            fontFeatureSettings: '"tnum"',
            lineHeight: 1,
          }}
        >
          {valueLabel ?? value}
        </div>
        {caption && (
          <div style={{ fontSize: 11, color: "rgb(var(--color-text-tertiary))", marginTop: 4 }}>
            {caption}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   HeatGrid — rows × cols cell heatmap
   ============================================================ */
export function HeatGrid({
  matrix,
  rowLabels,
  colLabels,
  color = "currentColor",
  cellSize = 20,
  gap = 3,
  max,
}: {
  matrix: number[][];
  rowLabels?: string[];
  colLabels?: string[];
  color?: string;
  cellSize?: number;
  gap?: number;
  max?: number;
}) {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const maxV = max ?? Math.max(1, ...matrix.flat());

  return (
    <div style={{ display: "inline-block" }}>
      {colLabels && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `28px repeat(${cols}, ${cellSize}px)`,
            gap,
            marginBottom: 4,
          }}
        >
          <span />
          {colLabels.map((c, i) =>
            i % Math.max(1, Math.ceil(cols / 6)) === 0 ? (
              <span
                key={i}
                style={{
                  fontSize: 9,
                  color: "rgb(var(--color-text-tertiary))",
                  textAlign: "center",
                  gridColumn: `${i + 2} / span 1`,
                }}
              >
                {c}
              </span>
            ) : (
              <span key={i} />
            ),
          )}
        </div>
      )}
      {matrix.map((row, ri) => (
        <div
          key={ri}
          style={{
            display: "grid",
            gridTemplateColumns: `28px repeat(${cols}, ${cellSize}px)`,
            gap,
            marginBottom: gap,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "rgb(var(--color-text-secondary))",
              display: "flex",
              alignItems: "center",
            }}
          >
            {rowLabels?.[ri] ?? ""}
          </span>
          {row.map((v, ci) => {
            const t = v / maxV;
            const opacity = v === 0 ? 0.06 : 0.12 + t * 0.88;
            return (
              <div
                key={ci}
                title={`${rowLabels?.[ri] ?? ri} · ${colLabels?.[ci] ?? ci} = ${v}`}
                style={{
                  width: cellSize,
                  height: cellSize,
                  borderRadius: 4,
                  background: color,
                  opacity,
                  transition: "opacity 400ms",
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   BalanceScale — SVG see-saw comparing two weights
   ============================================================ */
export function BalanceScale({
  left,
  right,
  leftLabel = "Strengths",
  rightLabel = "Risks",
  leftColor = "rgb(var(--color-success-500))",
  rightColor = "rgb(var(--color-error-500))",
  width = 340,
  height = 180,
}: {
  left: number;
  right: number;
  leftLabel?: string;
  rightLabel?: string;
  leftColor?: string;
  rightColor?: string;
  width?: number;
  height?: number;
}) {
  const diff = left - right;
  const maxSide = Math.max(1, left, right);
  const tiltDeg = Math.max(-12, Math.min(12, (diff / maxSide) * 12));
  const cx = width / 2;
  const pivotY = height * 0.65;
  const beamLen = width * 0.8;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {/* base */}
      <path
        d={`M ${cx - 60} ${height - 6} L ${cx + 60} ${height - 6} L ${cx + 30} ${pivotY + 10} L ${cx - 30} ${pivotY + 10} Z`}
        fill="rgb(var(--color-border) / 0.8)"
      />
      {/* beam pivot */}
      <circle cx={cx} cy={pivotY} r={8} fill="rgb(var(--color-text-primary))" />
      <g transform={`rotate(${tiltDeg} ${cx} ${pivotY})`} style={{ transition: "transform 700ms" }}>
        {/* beam */}
        <rect
          x={cx - beamLen / 2}
          y={pivotY - 4}
          width={beamLen}
          height={8}
          rx={4}
          fill="rgb(var(--color-text-primary))"
        />
        {/* left tray */}
        <line
          x1={cx - beamLen / 2 + 20}
          y1={pivotY}
          x2={cx - beamLen / 2 + 20}
          y2={pivotY + 24}
          stroke="rgb(var(--color-text-secondary))"
          strokeWidth={1.5}
        />
        <rect
          x={cx - beamLen / 2 - 20}
          y={pivotY + 24}
          width={80}
          height={Math.max(10, Math.min(50, left * 4 + 10))}
          rx={4}
          fill={leftColor}
          opacity={0.85}
        />
        <text
          x={cx - beamLen / 2 + 20}
          y={pivotY + 24 + Math.max(10, Math.min(50, left * 4 + 10)) / 2 + 4}
          textAnchor="middle"
          fontSize={13}
          fontWeight={700}
          fill="white"
          fontFamily="inherit"
        >
          {left}
        </text>
        {/* right tray */}
        <line
          x1={cx + beamLen / 2 - 20}
          y1={pivotY}
          x2={cx + beamLen / 2 - 20}
          y2={pivotY + 24}
          stroke="rgb(var(--color-text-secondary))"
          strokeWidth={1.5}
        />
        <rect
          x={cx + beamLen / 2 - 60}
          y={pivotY + 24}
          width={80}
          height={Math.max(10, Math.min(50, right * 4 + 10))}
          rx={4}
          fill={rightColor}
          opacity={0.85}
        />
        <text
          x={cx + beamLen / 2 - 20}
          y={pivotY + 24 + Math.max(10, Math.min(50, right * 4 + 10)) / 2 + 4}
          textAnchor="middle"
          fontSize={13}
          fontWeight={700}
          fill="white"
          fontFamily="inherit"
        >
          {right}
        </text>
      </g>
      {/* labels below base */}
      <text
        x={cx - beamLen / 2 + 20}
        y={height - 14}
        textAnchor="middle"
        fontSize={10}
        fill="rgb(var(--color-text-tertiary))"
        fontFamily="inherit"
      >
        {leftLabel}
      </text>
      <text
        x={cx + beamLen / 2 - 20}
        y={height - 14}
        textAnchor="middle"
        fontSize={10}
        fill="rgb(var(--color-text-tertiary))"
        fontFamily="inherit"
      >
        {rightLabel}
      </text>
    </svg>
  );
}

export type { CSSProperties };
