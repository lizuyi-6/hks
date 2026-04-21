"use client";

/**
 * OrdersPanel — 「我的委托」。
 * 展示用户在 A1+ 上委托给律师/代理的订单，进度条 + 里程碑 + 可执行动作（签约/支付/验收）。
 * 这是「服务数字化」赛道的落地页。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@a1plus/ui";
import {
  PageHeader,
  SectionHeader,
  EmptyHero,
  IconGlyph,
  type IconName,
  type Accent,
} from "./primitives";
import { ErrorDisplay, request } from "./shared";
import { ApplicationError } from "@/lib/errors";

type Milestone = {
  key: string;
  title: string;
  status: "pending" | "in_progress" | "done" | string;
  amount?: number | null;
  completed_at?: string | null;
  expected_at?: string | null;
  note?: string | null;
};

type Order = {
  id: string;
  order_no: string;
  status: string;
  escrow_status: string;
  amount: number;
  currency: string;
  provider: {
    id: string;
    name: string;
    rating_avg?: number;
    avatar_url?: string | null;
  };
  product?: {
    id: string;
    name: string;
    category: string;
    delivery_days?: number | null;
  } | null;
  milestones: Milestone[];
  contract_envelope_id?: string | null;
  contract_url?: string | null;
  user_rating?: number | null;
  provider_rating?: number | null;
  created_at: string;
  updated_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  pending_quote: "待报价",
  quoted: "已报价",
  signed: "已签约",
  paying: "托管中",
  in_delivery: "交付中",
  delivered: "待验收",
  closed: "已完成",
  refunded: "已退款",
  cancelled: "已取消",
};

const STATUS_ACCENT: Record<string, Accent> = {
  draft: "muted",
  pending_quote: "warning",
  quoted: "info",
  signed: "info",
  paying: "info",
  in_delivery: "primary",
  delivered: "warning",
  closed: "success",
  refunded: "muted",
  cancelled: "muted",
};

const MILESTONE_ICON: Record<string, IconName> = {
  quote: "edit",
  sign: "approval",
  pay: "lock",
  submit: "upload",
  deliver: "download",
  accept: "check",
};

export function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | ApplicationError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await request<Order[]>("/orders");
      setOrders(list);
    } catch (e) {
      if (e instanceof ApplicationError) setError(e);
      else setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (
    id: string,
    action: "quote" | "sign" | "pay" | "deliver" | "accept",
    body: Record<string, unknown> = {},
  ) => {
    setBusyId(id);
    try {
      await request(`/orders/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await load();
    } catch (e) {
      if (e instanceof ApplicationError) setError(e);
      else setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Service Orders"
        title="我的委托"
        icon="contracts"
        accent="primary"
        description="追踪每一笔委托的报价、签约、托管支付、交付与验收。"
        actions={
          <Link
            href="/consult"
            className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary hover:bg-surface-elevated"
          >
            再发起一次咨询
          </Link>
        }
      />

      {error && <ErrorDisplay error={error} />}

      {!loading && orders.length === 0 ? (
        <EmptyHero
          icon="contracts"
          title="还没有委托记录"
          description="当你通过「智能匹配」委托律师/代理时，订单会在这里展示全流程。"
          accent="primary"
          primaryAction={{ label: "去智能匹配", href: "/consult" }}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              busy={busyId === o.id}
              onAct={(action, body) => act(o.id, action, body)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  busy,
  onAct,
}: {
  order: Order;
  busy: boolean;
  onAct: (
    action: "quote" | "sign" | "pay" | "deliver" | "accept",
    body?: Record<string, unknown>,
  ) => void;
}) {
  const statusLabel = STATUS_LABEL[order.status] ?? order.status;
  const statusAccent = STATUS_ACCENT[order.status] ?? "muted";
  const variantMap = {
    primary: "primary",
    success: "success",
    warning: "warning",
    error: "error",
    info: "info",
    muted: "default",
  } as const;

  return (
    <article className="rounded-xl border border-border bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              订单号
            </span>
            <span className="font-mono text-xs text-text-secondary">
              {order.order_no}
            </span>
            <Badge variant={variantMap[statusAccent]} size="sm" dot>
              {statusLabel}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <h3 className="font-serif text-lg font-medium text-text-primary">
              {order.product?.name ?? "专业法律服务"}
            </h3>
            {order.product?.category && (
              <Badge variant="outline" size="sm">
                {order.product.category}
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
            <IconGlyph name="user" size={12} />
            <span>{order.provider.name}</span>
            {order.provider.rating_avg && (
              <span>· 评分 {order.provider.rating_avg.toFixed(1)}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="num-display text-2xl leading-none text-primary-600">
            ¥{order.amount.toLocaleString()}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
            {order.escrow_status === "held"
              ? "已托管"
              : order.escrow_status === "released"
                ? "已放款"
                : "未托管"}
          </div>
        </div>
      </header>

      <DigitizationBadges order={order} />

      <div className="mt-5">
        <Timeline milestones={order.milestones} />
      </div>

      <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
          {order.contract_url && (
            <a
              href={order.contract_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary-600 hover:underline"
            >
              <IconGlyph name="external" size={12} />
              查看电子合同
            </a>
          )}
          <span>更新于 {new Date(order.updated_at).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2">
          {order.status === "pending_quote" && (
            <button
              disabled={busy}
              onClick={() => onAct("quote", { amount: 1800 })}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-elevated disabled:opacity-60"
            >
              （律师）出报价
            </button>
          )}
          {order.status === "quoted" && (
            <button
              disabled={busy}
              onClick={() => onAct("sign")}
              className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-700 disabled:opacity-60"
            >
              电子签约
            </button>
          )}
          {order.status === "signed" && (
            <button
              disabled={busy}
              onClick={() => onAct("pay")}
              className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-700 disabled:opacity-60"
            >
              托管支付
            </button>
          )}
          {order.status === "in_delivery" && (
            <button
              disabled={busy}
              onClick={() =>
                onAct("deliver", {
                  deliverables: [
                    {
                      title: "阶段性交付物",
                      format: "pdf",
                      note: "由服务方上传",
                    },
                  ],
                })
              }
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-elevated disabled:opacity-60"
            >
              （律师）提交交付
            </button>
          )}
          {order.status === "delivered" && (
            <button
              disabled={busy}
              onClick={() => onAct("accept", { rating: 5 })}
              className="rounded-md bg-success-600 px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-success-500 disabled:opacity-60"
            >
              验收并放款
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}

function DigitizationBadges({ order }: { order: Order }) {
  const escrowBadge =
    order.escrow_status === "held"
      ? {
          icon: "lock" as IconName,
          label: "托管支付 · 冻结中",
          desc: `¥${order.amount.toLocaleString()} 在平台托管`,
          wrap: "border-primary-100 bg-primary-50 text-primary-700",
        }
      : order.escrow_status === "released"
        ? {
            icon: "check" as IconName,
            label: "托管支付 · 已放款",
            desc: "验收通过后已结算到服务方",
            wrap: "border-success-100 bg-success-50 text-success-700",
          }
        : {
            icon: "lock" as IconName,
            label: "托管支付 · 未发起",
            desc: "签约后发起资金托管",
            wrap: "border-border bg-surface-elevated text-text-tertiary",
          };

  const signBadge = order.contract_envelope_id
    ? {
        icon: "approval" as IconName,
        label: "电子签 · 已签章",
        desc: `Envelope ${order.contract_envelope_id.slice(0, 10)}…`,
        wrap: "border-success-100 bg-success-50 text-success-700",
      }
    : {
        icon: "edit" as IconName,
        label: "电子签 · 待发起",
        desc: "将生成合同并发起电子签章",
        wrap: "border-border bg-surface-elevated text-text-tertiary",
      };

  const contractBadge = order.contract_url
    ? {
        icon: "external" as IconName,
        label: "合同存证 · 可查阅",
        desc: "PDF 存证可下载",
        wrap: "border-info-100 bg-info-50 text-info-700",
        href: order.contract_url,
      }
    : null;

  const items: Array<{
    icon: IconName;
    label: string;
    desc: string;
    wrap: string;
    href?: string;
  }> = [escrowBadge, signBadge];
  if (contractBadge) items.push(contractBadge);

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      {items.map((b, i) => {
        const content = (
          <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${b.wrap}`}>
            <IconGlyph name={b.icon} size={14} />
            <div className="min-w-0">
              <div className="text-xs font-medium">{b.label}</div>
              <div className="truncate text-[11px] opacity-80">{b.desc}</div>
            </div>
          </div>
        );
        return b.href ? (
          <a key={i} href={b.href} target="_blank" rel="noreferrer" className="hover:opacity-90">
            {content}
          </a>
        ) : (
          <div key={i}>{content}</div>
        );
      })}
    </div>
  );
}

function Timeline({ milestones }: { milestones: Milestone[] }) {
  const done = milestones.filter((m) => m.status === "done").length;
  const pct = milestones.length > 0 ? Math.round((done / milestones.length) * 100) : 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs text-text-secondary">
        <span className="font-medium text-text-primary">交付进度</span>
        <span className="tabular-nums">
          {done} / {milestones.length} · {pct}%
        </span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="relative space-y-3 border-l border-border pl-4">
        {milestones.map((m) => {
          const icon: IconName = MILESTONE_ICON[m.key] ?? "clock";
          const isDone = m.status === "done";
          const isActive = m.status === "in_progress";
          const dot = isDone
            ? "bg-success-500 ring-success-100"
            : isActive
              ? "bg-primary-500 ring-primary-100 animate-pulse-soft"
              : "bg-border ring-surface";
          const title = isDone
            ? "text-text-primary"
            : isActive
              ? "text-primary-600 font-medium"
              : "text-text-tertiary";
          const ts =
            m.completed_at ??
            (isActive ? null : m.expected_at ?? null);
          return (
            <li key={m.key} className="relative">
              <span
                className={`absolute -left-[22px] top-1 h-3 w-3 rounded-full ring-4 ${dot}`}
              />
              <div className="flex items-baseline justify-between gap-2">
                <div className={`flex items-center gap-1.5 text-sm ${title}`}>
                  <IconGlyph name={icon} size={12} />
                  <span>{m.title}</span>
                  {m.amount && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-text-secondary">
                      ¥{m.amount.toLocaleString()}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-text-tertiary">
                  {isDone && ts ? `完成 ${formatShort(ts)}` : null}
                  {!isDone && isActive ? "进行中" : null}
                  {!isDone && !isActive && ts ? `计划 ${formatShort(ts)}` : null}
                </span>
              </div>
              {m.note && (
                <div className="mt-0.5 text-[11px] text-text-tertiary">{m.note}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function formatShort(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

// Minor addition: support success-600 without Tailwind safelisting
// (Tailwind will pick up the class from this file).
