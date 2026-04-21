"use client";

/**
 * ProviderSpace — B 端律师 / 代理工作台。
 * 整合 Dashboard / Leads / Products / Orders / CRM 五个子页面为 Tab 化界面，
 * 覆盖「精准获客 + 智能匹配」赛道关键词。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@a1plus/ui";
import {
  PageHeader,
  SectionHeader,
  IconTabBar,
  KpiCard,
  StatTile,
  EmptyHero,
  IconGlyph,
  type Accent,
} from "./primitives";
import { BarRow, DonutRing } from "@/components/viz";
import { ErrorDisplay, request } from "./shared";
import { ApplicationError } from "@/lib/errors";

type Tab = "dashboard" | "leads" | "funnel" | "team" | "products" | "orders" | "crm";

type FirmMember = {
  id: string;
  providerId: string;
  userId: string | null;
  displayName: string;
  role: string;
  specialties: string[];
  email: string | null;
  avatarUrl: string | null;
  activeLeads: number;
  closedLeads: number;
  active: boolean;
  createdAt: string;
};

type Funnel = {
  windowDays: number;
  stages: Array<{ key: string; label: string; count: number; vsTotal: number; vsPrev: number }>;
  temperatures: Record<string, number>;
  intentBreakdown: Record<string, number>;
  avgClaimMinutes: number | null;
  revenueClosed: number;
  ordersClosed: number;
};

type RoiReport = {
  windowDays: number;
  leads: { total: number; claimed: number; won: number; claimRate: number; winRate: number };
  orders: { total: number; closed: number; revenue: number };
  byCategory: Record<string, { count: number; revenue: number }>;
  ratingAvg: number;
};

type AttributionBucket = {
  orders: number;
  closed: number;
  revenue: number;
  avgDealSize: number;
  closeRate: number;
  revenueShare: number;
};

type RoiAttribution = {
  windowDays: number;
  totals: { orders: number; closed: number; revenue: number; avgDealSize: number };
  byIntent: Record<string, AttributionBucket>;
  byTemperature: Record<string, AttributionBucket>;
  byRegion: Record<string, AttributionBucket>;
  bySource: Record<string, AttributionBucket>;
  byCategory: Record<string, AttributionBucket>;
  topClients: Array<{
    userId: string;
    name: string;
    businessName?: string | null;
    orders: number;
    revenue: number;
    revenueShare: number;
  }>;
  scorecard: {
    topIntent?: string | null;
    topTemperature?: string | null;
    topRegion?: string | null;
    topSource?: string | null;
    topCategory?: string | null;
  };
};

type Lead = {
  id: string;
  score: number;
  temperature: "hot" | "warm" | "cool" | "cold" | string;
  temperatureSignals?: {
    composite?: number;
    components?: {
      score?: number;
      urgency?: number;
      budget?: number;
      recency?: number;
      activity?: number;
    };
    updated_at?: string;
  } | null;
  status: string;
  snapshot: {
    industry?: string;
    stage?: string;
    intent?: string;
    urgency?: string;
    budget?: string | null;
    region?: string | null;
    tags?: string[];
    query_excerpt?: string;
    reasons?: string[];
  };
  user: { id: string; name: string; industry?: string; stage?: string; businessName?: string };
  matching: { id: string; intentCategory: string; urgency: string; region?: string | null };
  createdAt: string;
  expiresAt?: string | null;
};

type Product = {
  id: string;
  providerId: string;
  category: string;
  name: string;
  summary?: string | null;
  price?: number | null;
  priceMode: string;
  deliveryDays?: number | null;
  soldCount?: number;
  ratingAvg?: number;
  status: string;
};

type ProviderProfile = {
  id: string;
  name: string;
  ratingAvg: number;
  ordersCount: number;
  practiceAreas: string[];
  featuredTags: string[];
};

type ClientProfile = {
  user: { id: string; name: string; email?: string; businessName?: string; industry?: string; stage?: string; ipFocus?: string };
  tagsByCategory: Record<string, Array<{ value: string; confidence: number; source: string }>>;
  leads: Lead[];
  orders: Array<{ id: string; orderNo: string; status: string; amount: number; createdAt: string }>;
  lifetimeValue: number;
  intentCategories: string[];
};

const TEMPERATURE_LABEL: Record<string, string> = {
  hot: "高意向",
  warm: "关注",
  cool: "观察",
  unknown: "未分温",
};

const TEMPERATURE_ACCENT: Record<string, Accent> = {
  hot: "error",
  warm: "warning",
  cool: "info",
};

export function ProviderSpace() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Provider Workspace"
        title="律师 / 代理工作台"
        icon="user"
        accent="info"
        description="新线索、我的产品、委托订单、客户 360° 画像 —— 精准获客从这里开始。"
      />
      <IconTabBar<Tab>
        tabs={[
          { key: "dashboard", label: "工作台", icon: "dashboard" },
          { key: "leads", label: "线索池", icon: "target" },
          { key: "funnel", label: "获客漏斗", icon: "chart" },
          { key: "team", label: "团队成员", icon: "user" },
          { key: "products", label: "我的产品", icon: "assets" },
          { key: "orders", label: "委托订单", icon: "contracts" },
          { key: "crm", label: "客户 CRM", icon: "building" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "dashboard" && <Dashboard />}
      {tab === "leads" && <LeadsPool />}
      {tab === "funnel" && <FunnelTab />}
      {tab === "team" && <TeamTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "orders" && <OrdersTab />}
      {tab === "crm" && <CrmTab />}
    </div>
  );
}

/* ============ Sub Tabs ============ */

function Dashboard() {
  const [roi, setRoi] = useState<RoiReport | null>(null);
  const [attribution, setAttribution] = useState<RoiAttribution | null>(null);
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [error, setError] = useState<string | ApplicationError | null>(null);

  useEffect(() => {
    Promise.all([
      request<RoiReport>("/provider-leads/roi").catch((e) => {
        setError(e instanceof ApplicationError ? e : String(e));
        return null;
      }),
      request<ProviderProfile>("/providers/me").catch(() => null),
      request<RoiAttribution>("/provider-leads/roi/attribution").catch(() => null),
    ]).then(([r, p, a]) => {
      if (r) setRoi(r);
      if (p) setProfile(p);
      if (a) setAttribution(a);
    });
  }, []);

  const series = useMemo(
    () => [6, 8, 11, 9, 14, 12, 16, 13, 18, 17, 22, 24],
    [],
  );

  return (
    <div className="space-y-6">
      {error && <ErrorDisplay error={error} />}

      {profile && (
        <section className="flex items-center gap-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-info-600 text-base font-semibold text-text-inverse">
            {profile.name.charAt(0)}
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-text-primary">{profile.name}</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span>评分 {profile.ratingAvg.toFixed(1)}</span>
              <span>·</span>
              <span>已交付 {profile.ordersCount} 单</span>
              <span>·</span>
              {profile.practiceAreas.slice(0, 3).map((p) => (
                <Badge key={p} variant="outline" size="sm">
                  {p}
                </Badge>
              ))}
            </div>
          </div>
        </section>
      )}

      {roi && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <KpiCard
            label="近 30 天线索"
            value={roi.leads.total}
            delta={`${roi.leads.claimRate.toFixed(0)}% 认领率`}
            trend="up"
            accent="primary"
            icon="target"
            series={series}
          />
          <KpiCard
            label="成交订单"
            value={roi.orders.closed}
            delta={`${roi.leads.winRate.toFixed(0)}% 转化率`}
            trend="up"
            accent="success"
            icon="check"
            series={series.map((s) => Math.floor(s / 2))}
          />
          <KpiCard
            label="成交金额"
            value={`¥${roi.orders.revenue.toLocaleString()}`}
            delta="+18%"
            trend="up"
            accent="warning"
            icon="chart"
          />
          <KpiCard
            label="客户评分"
            value={roi.ratingAvg.toFixed(1)}
            delta="满分 5.0"
            trend="neutral"
            accent="info"
            icon="sparkle"
          />
        </section>
      )}

      {roi && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.5fr]">
          <div className="rounded-xl border border-border bg-surface p-5">
            <SectionHeader
              eyebrow="Distribution"
              title="收入品类"
              description="近 30 天分品类成交情况"
            />
            <div className="mt-4 space-y-2">
              {Object.entries(roi.byCategory).map(([cat, data]) => (
                <BarRow
                  key={cat}
                  label={cat}
                  value={data.revenue}
                  max={Math.max(...Object.values(roi.byCategory).map((d) => d.revenue))}
                  color="var(--color-primary-500)"
                  suffix={`¥${(data.revenue / 1000).toFixed(1)}k`}
                />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <SectionHeader
              eyebrow="Funnel"
              title="线索 → 成交漏斗"
              description="意向线索 → 认领 → 成交的转化情况"
            />
            <div className="mt-4 grid grid-cols-3 gap-4">
              <StatTile label="总线索" value={roi.leads.total} icon="target" accent="primary" />
              <StatTile label="已认领" value={roi.leads.claimed} icon="bolt" accent="warning" />
              <StatTile label="已成交" value={roi.leads.won} icon="check" accent="success" />
            </div>
            <div className="mt-4 flex items-center gap-4">
              <DonutRing
                percent={roi.leads.claimRate}
                label={`${roi.leads.claimRate.toFixed(0)}%`}
                color="rgb(var(--color-primary-500))"
                size={96}
              />
              <div className="text-xs text-text-secondary">
                <p className="font-medium text-text-primary">认领率 {roi.leads.claimRate.toFixed(0)}%</p>
                <p className="mt-1 text-text-tertiary">
                  建议 3 小时内响应高温线索，可提升成交率 2~3 倍。
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {attribution && attribution.totals.revenue > 0 && (
        <RoiAttributionPanel attribution={attribution} />
      )}
    </div>
  );
}

const ATTRIBUTION_LABELS: Record<string, string> = {
  trademark: "商标",
  patent: "专利",
  copyright: "版权",
  contract: "合同",
  litigation: "诉讼",
  due_diligence: "尽调",
  compliance: "合规",
  general: "综合",
  hot: "热线索",
  warm: "温线索",
  cool: "凉线索",
  cold: "冷线索",
  unknown: "未评级",
  matching: "智能匹配",
  consult: "AI 咨询",
  direct: "直接下单",
  other: "其他",
};

function RoiAttributionPanel({ attribution }: { attribution: RoiAttribution }) {
  const cards: Array<{
    key: keyof Pick<RoiAttribution, "byIntent" | "byTemperature" | "byRegion" | "bySource">;
    title: string;
    eyebrow: string;
  }> = [
    { key: "byIntent", title: "按需求意图", eyebrow: "Intent" },
    { key: "byTemperature", title: "按线索温度", eyebrow: "Temperature" },
    { key: "bySource", title: "按获客来源", eyebrow: "Source" },
    { key: "byRegion", title: "按客户地区", eyebrow: "Region" },
  ];

  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="ROI Attribution"
        title={`成交归因 · 近 ${attribution.windowDays} 天`}
        description="回答「这 ¥X 来自哪里」——按意图、温度、来源、地区拆解，辅助调优投放与排班。"
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <AttributionCard
            key={card.key}
            eyebrow={card.eyebrow}
            title={card.title}
            buckets={attribution[card.key]}
          />
        ))}
      </div>
      {attribution.topClients.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <SectionHeader eyebrow="Top Clients" title="高价值客户 Top 5" />
          <table className="mt-3 w-full text-xs">
            <thead className="text-text-tertiary">
              <tr>
                <th className="py-1 text-left">客户</th>
                <th className="py-1 text-right">订单</th>
                <th className="py-1 text-right">成交额</th>
                <th className="py-1 text-right">收入占比</th>
              </tr>
            </thead>
            <tbody>
              {attribution.topClients.map((c) => (
                <tr key={c.userId} className="border-t border-border text-text-primary">
                  <td className="py-2">
                    <span className="font-medium">{c.name}</span>
                    {c.businessName && (
                      <span className="ml-1 text-text-tertiary">· {c.businessName}</span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{c.orders}</td>
                  <td className="py-2 text-right tabular-nums">
                    ¥{c.revenue.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-secondary">
                    {c.revenueShare.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AttributionCard({
  eyebrow,
  title,
  buckets,
}: {
  eyebrow: string;
  title: string;
  buckets: Record<string, AttributionBucket>;
}) {
  const rows = Object.entries(buckets)
    .filter(([, v]) => v.orders > 0)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <SectionHeader eyebrow={eyebrow} title={title} />
        <p className="mt-3 text-xs text-text-tertiary">暂无数据。</p>
      </div>
    );
  }
  const maxRevenue = Math.max(...rows.map(([, v]) => v.revenue), 1);
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <SectionHeader eyebrow={eyebrow} title={title} />
      <div className="mt-3 space-y-2">
        {rows.map(([key, bucket]) => {
          const label = ATTRIBUTION_LABELS[key] ?? key;
          const width = Math.max(4, (bucket.revenue / maxRevenue) * 100);
          return (
            <div key={key} className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-primary">{label}</span>
                <span className="num-display tabular-nums text-text-secondary">
                  ¥{bucket.revenue.toLocaleString()}
                  <span className="ml-1 text-[10px] text-text-tertiary">
                    {bucket.revenueShare.toFixed(0)}%
                  </span>
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary-500"
                  style={{ width: `${width}%` }}
                />
              </div>
              <div className="text-[10px] text-text-tertiary">
                成交 {bucket.closed} / {bucket.orders} 单 · 客单价 ¥
                {bucket.avgDealSize.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadsPool() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | ApplicationError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await request<Lead[]>("/provider-leads");
      setLeads(list);
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markViewed = useCallback(async (id: string) => {
    try {
      await request(`/provider-leads/${id}/view`, { method: "POST" });
    } catch {
      // 查看上报失败不影响主流程 —— 漏斗数据延迟更新即可。
    }
  }, []);

  const claim = async (id: string) => {
    setBusy(id);
    try {
      await request(`/provider-leads/${id}/claim`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorDisplay error={error} />;
  if (leads.length === 0) {
    return (
      <EmptyHero
        icon="target"
        title="暂无线索"
        description="AI 会在匹配命中你时自动派发新线索。"
        accent="info"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {leads.map((lead) => {
        const tempLabel = TEMPERATURE_LABEL[lead.temperature] ?? lead.temperature;
        const tempAccent = TEMPERATURE_ACCENT[lead.temperature] ?? "muted";
        const statusBadge =
          lead.status === "new"
            ? { variant: "primary" as const, label: "新" }
            : lead.status === "claimed"
              ? { variant: "info" as const, label: "已认领" }
              : lead.status === "won"
                ? { variant: "success" as const, label: "已成交" }
                : { variant: "default" as const, label: lead.status };
        return (
          <article key={lead.id} className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <header className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">
                    {lead.user.name}
                  </span>
                  <Badge
                    variant={tempAccent === "error" ? "error" : tempAccent === "warning" ? "warning" : "info"}
                    size="sm"
                    dot
                  >
                    {tempLabel}
                  </Badge>
                  <Badge variant={statusBadge.variant} size="sm">
                    {statusBadge.label}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-text-tertiary">
                  {lead.user.businessName ?? lead.snapshot.industry ?? "—"}
                </p>
              </div>
              <div className="text-right">
                <div className="num-display text-lg leading-none text-primary-600">
                  {lead.score}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
                  SCORE
                </div>
              </div>
            </header>
            <p className="line-clamp-2 rounded-md bg-surface-elevated px-3 py-2 text-xs text-text-secondary">
              {lead.snapshot.query_excerpt ?? "—"}
            </p>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {lead.snapshot.tags?.slice(0, 4).map((t) => (
                <Badge key={t} variant="outline" size="sm">
                  #{t}
                </Badge>
              ))}
            </div>
            {lead.snapshot.reasons && lead.snapshot.reasons.length > 0 && (
              <ul className="space-y-0.5 text-[11px] text-text-secondary">
                {lead.snapshot.reasons.slice(0, 2).map((r, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <IconGlyph name="check" size={10} className="mt-0.5 text-success-500" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
            {lead.temperatureSignals?.components && (
              <TemperatureSignalBar signals={lead.temperatureSignals} />
            )}
            <div className="flex items-center gap-2">
              {lead.status === "new" ? (
                <button
                  disabled={busy === lead.id}
                  onClick={() => claim(lead.id)}
                  className="flex-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-700 disabled:opacity-60"
                >
                  立即认领
                </button>
              ) : (
                <span className="flex-1 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-center text-xs text-text-tertiary">
                  已认领
                </span>
              )}
              <button
                onClick={() => markViewed(lead.id)}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-elevated"
              >
                客户画像
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function TemperatureSignalBar({
  signals,
}: {
  signals: NonNullable<Lead["temperatureSignals"]>;
}) {
  const components = signals.components ?? {};
  const entries: Array<{ key: keyof typeof components; label: string }> = [
    { key: "score", label: "匹配" },
    { key: "urgency", label: "紧急" },
    { key: "budget", label: "预算" },
    { key: "recency", label: "新鲜" },
    { key: "activity", label: "活跃" },
  ];
  const composite = signals.composite ?? 0;
  return (
    <details className="group rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-[10px]">
      <summary className="flex cursor-pointer items-center justify-between text-text-tertiary">
        <span className="uppercase tracking-wider">热度分解</span>
        <span className="num-display tabular-nums text-text-secondary">
          {(composite * 100).toFixed(0)}%
        </span>
      </summary>
      <div className="mt-1 space-y-1">
        {entries.map(({ key, label }) => {
          const v = Number(components[key] ?? 0);
          const pct = Math.max(0, Math.min(100, v * 100));
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-text-tertiary">{label}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right tabular-nums text-text-secondary">
                {pct.toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function ProductsTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | ApplicationError | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);

  useEffect(() => {
    request<ProviderProfile | null>("/providers/me")
      .then((prof) => {
        if (!prof) {
          setProfileMissing(true);
          return [] as Product[];
        }
        return request<Product[]>(`/providers/${prof.id}/products`);
      })
      .then(setProducts)
      .catch((e) => setError(e instanceof ApplicationError ? e : String(e)));
  }, []);

  if (error) return <ErrorDisplay error={error} />;
  if (profileMissing) {
    return (
      <EmptyHero
        icon="user"
        title="尚未创建服务商档案"
        description="在 基本信息 标签页保存律师/机构档案后，即可在此上架和管理服务产品。"
        accent="info"
      />
    );
  }
  if (products.length === 0) {
    return (
      <EmptyHero
        icon="assets"
        title="还没有上架服务产品"
        description="创建你的第一个标准化服务产品，让用户可以一键下单。"
        accent="info"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {products.map((p) => (
        <article key={p.id} className="rounded-xl border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between">
            <Badge variant="outline" size="sm">
              {p.category}
            </Badge>
            <Badge variant={p.status === "active" ? "success" : "default"} size="sm" dot>
              {p.status === "active" ? "在售" : "下架"}
            </Badge>
          </div>
          <h3 className="font-medium text-text-primary">{p.name}</h3>
          {p.summary && (
            <p className="line-clamp-2 text-xs text-text-tertiary">{p.summary}</p>
          )}
          <div className="flex items-baseline gap-2">
            {p.price ? (
              <span className="num-display text-lg text-primary-600">
                ¥{p.price.toLocaleString()}
              </span>
            ) : (
              <span className="text-sm text-text-tertiary">面议</span>
            )}
            <span className="text-[11px] text-text-tertiary">
              · {p.priceMode === "fixed" ? "固定价" : "按次报价"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
            <span>交付 {p.deliveryDays ?? "—"} 天</span>
            <span>·</span>
            <span>售出 {p.soldCount ?? 0}</span>
            {p.ratingAvg && (
              <>
                <span>·</span>
                <span>评分 {p.ratingAvg.toFixed(1)}</span>
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function OrdersTab() {
  return (
    <EmptyHero
      icon="contracts"
      title="订单视图（B 端）"
      description="B 端订单视图复用 /orders 页面组件，展示交付里程碑与客户确认记录。此处为占位，演示时跳转 /orders 即可。"
      accent="info"
      primaryAction={{ label: "切到 C 端订单视图", href: "/orders" }}
    />
  );
}

const INTENT_LABEL: Record<string, string> = {
  trademark: "商标",
  patent: "专利",
  copyright: "版权/软著",
  contract: "合同",
  litigation: "诉讼维权",
  compliance: "合规",
  dueDiligence: "融资尽调",
  general: "综合",
};

const ROLE_LABEL: Record<string, string> = {
  partner: "合伙人",
  associate: "律师 / 代理人",
  paralegal: "律师助理",
  admin: "行政",
};

const ROLE_ACCENT: Record<string, Accent> = {
  partner: "primary",
  associate: "info",
  paralegal: "muted",
  admin: "muted",
};

function TeamTab() {
  const [members, setMembers] = useState<FirmMember[] | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | ApplicationError | null>(null);
  const [savingFor, setSavingFor] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    displayName: string;
    role: string;
    email: string;
    specialties: string;
  }>({ displayName: "", role: "associate", email: "", specialties: "" });

  const load = useCallback(async () => {
    try {
      const [m, l] = await Promise.all([
        request<FirmMember[]>("/provider-leads/firm-members"),
        request<Lead[]>("/provider-leads"),
      ]);
      setMembers(m);
      setLeads(l);
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const assign = async (leadId: string, memberId: string | null) => {
    setSavingFor(leadId);
    try {
      await request(`/provider-leads/${leadId}/assign`, {
        method: "POST",
        body: JSON.stringify({ memberId }),
      });
      await load();
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    } finally {
      setSavingFor(null);
    }
  };

  const createMember = async () => {
    if (!form.displayName.trim()) return;
    setSavingFor("__new__");
    try {
      await request("/provider-leads/firm-members", {
        method: "POST",
        body: JSON.stringify({
          displayName: form.displayName,
          role: form.role,
          email: form.email || undefined,
          specialties: form.specialties
            ? form.specialties.split(/[，,;、]/).map((s) => s.trim()).filter(Boolean)
            : [],
        }),
      });
      setForm({ displayName: "", role: "associate", email: "", specialties: "" });
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    } finally {
      setSavingFor(null);
    }
  };

  if (error) return <ErrorDisplay error={error} />;
  if (!members || !leads)
    return <div className="py-12 text-center text-sm text-text-tertiary">加载团队成员…</div>;

  const activeMembers = members.filter((m) => m.active);
  const unassignedLeads = leads.filter((l) => !(l as unknown as { assigneeId?: string }).assigneeId);

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Firm Members"
        title="律所多账号 · 组内分配"
        description="多人席位登录同一家律所账号，组长可把线索分派到擅长的律师 / 代理 / 助理，降低流失。"
        actions={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-700"
          >
            {showForm ? "取消" : "+ 邀请成员"}
          </button>
        }
      />

      {showForm && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledTextField
              label="姓名 · 职级"
              value={form.displayName}
              onChange={(v) => setForm((f) => ({ ...f, displayName: v }))}
              placeholder="如：林子涵 · 专利代理人"
            />
            <div>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                角色
              </span>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-text-primary focus:border-primary-500 focus:outline-none"
              >
                <option value="partner">合伙人</option>
                <option value="associate">律师 / 代理人</option>
                <option value="paralegal">律师助理</option>
                <option value="admin">行政</option>
              </select>
            </div>
            <LabeledTextField
              label="工作邮箱"
              value={form.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))}
              placeholder="name@firm.com"
            />
            <LabeledTextField
              label="擅长领域（逗号分隔）"
              value={form.specialties}
              onChange={(v) => setForm((f) => ({ ...f, specialties: v }))}
              placeholder="商标, 跨境品牌, 诉讼"
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={createMember}
              disabled={savingFor === "__new__"}
              className="rounded-md bg-primary-600 px-4 py-2 text-xs font-medium text-text-inverse hover:bg-primary-700 disabled:opacity-60"
            >
              {savingFor === "__new__" ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard label="在职成员" value={activeMembers.length} accent="primary" icon="user" />
        <KpiCard
          label="进行中线索"
          value={activeMembers.reduce((s, m) => s + (m.activeLeads || 0), 0)}
          accent="info"
          icon="target"
        />
        <KpiCard
          label="累计成交"
          value={activeMembers.reduce((s, m) => s + (m.closedLeads || 0), 0)}
          accent="success"
          icon="check"
        />
        <KpiCard label="待分配线索" value={unassignedLeads.length} accent="warning" icon="alert" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {activeMembers.map((m) => (
          <article key={m.id} className="rounded-xl border border-border bg-surface p-4">
            <header className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-text-inverse">
                    {m.displayName.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium text-text-primary">{m.displayName}</div>
                    <div className="text-[11px] text-text-tertiary">{m.email ?? "未绑定邮箱"}</div>
                  </div>
                </div>
              </div>
              <Badge
                variant={
                  ROLE_ACCENT[m.role] === "primary"
                    ? "primary"
                    : ROLE_ACCENT[m.role] === "info"
                      ? "info"
                      : "default"
                }
                size="sm"
              >
                {ROLE_LABEL[m.role] ?? m.role}
              </Badge>
            </header>
            {m.specialties.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {m.specialties.map((s) => (
                  <Badge key={s} variant="outline" size="sm">
                    #{s}
                  </Badge>
                ))}
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-border bg-surface-elevated p-2 text-[11px]">
              <div className="flex flex-col items-center">
                <span className="tabular-nums text-text-primary">{m.activeLeads}</span>
                <span className="text-text-tertiary">进行中</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="tabular-nums text-text-primary">{m.closedLeads}</span>
                <span className="text-text-tertiary">已成交</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="tabular-nums text-text-primary">
                  {m.activeLeads + m.closedLeads}
                </span>
                <span className="text-text-tertiary">总承接</span>
              </div>
            </div>
          </article>
        ))}
      </div>

      <SectionHeader
        title="线索分配"
        description="每条线索可指派给团队内不同成员；AI 会按擅长领域给出优先建议。"
      />

      <div className="rounded-xl border border-border bg-surface p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wider text-text-tertiary">
              <th className="py-2 text-left">线索</th>
              <th className="py-2 text-left">意图 / 温度</th>
              <th className="py-2 text-left">匹配分</th>
              <th className="py-2 text-left">指派给</th>
            </tr>
          </thead>
          <tbody>
            {leads.slice(0, 10).map((l) => {
              const assigneeId =
                (l as unknown as { assigneeId?: string | null }).assigneeId ?? null;
              return (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="py-2">
                    <div className="font-medium text-text-primary">
                      {l.user?.businessName ?? l.user?.name ?? "—"}
                    </div>
                    <div className="text-[11px] text-text-tertiary">
                      {l.snapshot.query_excerpt ?? "—"}
                    </div>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" size="sm">
                        {l.matching?.intentCategory ?? l.snapshot.intent ?? "—"}
                      </Badge>
                      <span className="text-[11px] text-text-tertiary">
                        {TEMPERATURE_LABEL[l.temperature] ?? l.temperature}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 font-mono tabular-nums">{l.score.toFixed(0)}</td>
                  <td className="py-2">
                    <select
                      value={assigneeId ?? ""}
                      disabled={savingFor === l.id}
                      onChange={(e) => assign(l.id, e.target.value || null)}
                      className="h-8 rounded-md border border-border bg-surface px-2 text-xs"
                    >
                      <option value="">未分配</option>
                      {activeMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LabeledTextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:border-primary-500 focus:outline-none"
      />
    </label>
  );
}

function FunnelTab() {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [error, setError] = useState<string | ApplicationError | null>(null);
  const [windowDays, setWindowDays] = useState<number>(30);

  useEffect(() => {
    request<Funnel>(`/provider-leads/funnel?window_days=${windowDays}`)
      .then(setFunnel)
      .catch((e) => setError(e instanceof ApplicationError ? e : String(e)));
  }, [windowDays]);

  if (error) return <ErrorDisplay error={error} />;
  if (!funnel) return <div className="py-12 text-center text-sm text-text-tertiary">加载漏斗中…</div>;

  const maxCount = Math.max(1, ...funnel.stages.map((s) => s.count));
  const tempEntries = Object.entries(funnel.temperatures);
  const intentEntries = Object.entries(funnel.intentBreakdown).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionHeader
          eyebrow="Acquisition Funnel"
          title="五段获客漏斗"
          description="匹配分发 → 律师查看 → 认领 → 报价 → 成交，用于一眼看出哪一段掉率最高。"
        />
        <select
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs"
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
        >
          <option value={7}>近 7 天</option>
          <option value={30}>近 30 天</option>
          <option value={90}>近 90 天</option>
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard
          label="已成交订单"
          value={`${funnel.ordersClosed} 单`}
          accent="success"
          icon="check"
        />
        <KpiCard
          label="成交 GMV"
          value={`¥${funnel.revenueClosed.toLocaleString()}`}
          accent="primary"
          icon="assets"
        />
        <KpiCard
          label="平均响应"
          value={funnel.avgClaimMinutes !== null ? `${funnel.avgClaimMinutes} 分钟` : "—"}
          accent="warning"
          icon="clock"
        />
        <KpiCard
          label="线索供应"
          value={`${funnel.stages[0]?.count ?? 0} 条`}
          accent="info"
          icon="target"
        />
      </div>

      {/* 漏斗图 */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="space-y-3">
          {funnel.stages.map((s, i) => {
            const widthPct = Math.round((s.count / maxCount) * 100);
            return (
              <div key={s.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-text-primary">
                    {i + 1}. {s.label}
                  </span>
                  <span className="font-mono tabular-nums text-text-secondary">
                    {s.count}
                    <span className="ml-2 text-xs text-text-tertiary">
                      {s.vsPrev.toFixed(0)}%↓prev · {s.vsTotal.toFixed(0)}%↓total
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-8 w-full overflow-hidden rounded-md bg-muted">
                  <div
                    className="flex h-full items-center justify-end bg-gradient-to-r from-indigo-400 to-indigo-600 px-3 text-xs font-medium text-white transition-all"
                    style={{ width: `${Math.max(4, widthPct)}%` }}
                  >
                    {widthPct}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 温度 / 意图分布 */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <SectionHeader
            title="线索温度分布"
            description="匹配分自动按 hot / warm / cool 三档分温，优先响应热线索。"
          />
          <div className="mt-3 space-y-2">
            {tempEntries.length === 0 && (
              <p className="text-sm text-text-tertiary">暂无线索数据</p>
            )}
            {tempEntries.map(([t, count]) => (
              <div key={t} className="flex items-center gap-3 text-sm">
                <span className="w-20 text-text-secondary">{TEMPERATURE_LABEL[t] ?? t}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      t === "hot"
                        ? "h-full bg-rose-500"
                        : t === "warm"
                        ? "h-full bg-amber-500"
                        : "h-full bg-sky-500"
                    }
                    style={{
                      width: `${
                        (count / Math.max(1, ...tempEntries.map(([, c]) => c))) * 100
                      }%`,
                    }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-xs text-text-primary">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <SectionHeader
            title="意图分布"
            description="哪些类型的需求在为你持续供血。"
          />
          <div className="mt-3 space-y-2">
            {intentEntries.length === 0 && (
              <p className="text-sm text-text-tertiary">暂无意图数据</p>
            )}
            {intentEntries.map(([k, count]) => {
              const max = Math.max(1, ...intentEntries.map(([, c]) => c));
              return (
                <div key={k} className="flex items-center gap-3 text-sm">
                  <span className="w-20 text-text-secondary">{INTENT_LABEL[k] ?? k}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-indigo-500"
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-xs text-text-primary">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CrmTab() {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [error, setError] = useState<string | ApplicationError | null>(null);

  useEffect(() => {
    // 演示环境用一个 demo 客户 ID
    request<ClientProfile>(`/provider-leads/clients/u-1`)
      .then(setProfile)
      .catch((e) => setError(e instanceof ApplicationError ? e : String(e)));
  }, []);

  if (error) return <ErrorDisplay error={error} />;
  if (!profile) return null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg font-medium text-text-primary">
              {profile.user.businessName ?? profile.user.name}
            </h3>
            <p className="text-xs text-text-tertiary">
              {profile.user.industry} · {profile.user.stage}
            </p>
          </div>
          <div className="text-right">
            <div className="num-display text-2xl leading-none text-primary-600">
              ¥{profile.lifetimeValue.toLocaleString()}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
              LIFETIME VALUE
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(profile.tagsByCategory).map(([cat, items]) => (
            <div key={cat} className="rounded-lg border border-border bg-surface-elevated p-3">
              <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
                {cat}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {items.slice(0, 4).map((t, i) => (
                  <Badge key={i} variant="outline" size="sm">
                    {t.value}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <SectionHeader eyebrow="Orders" title="历史订单" />
      {profile.orders.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface divide-y divide-border">
          {profile.orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <span className="font-mono text-xs text-text-secondary">{o.orderNo}</span>
                <Badge variant="outline" size="sm" className="ml-2">
                  {o.status}
                </Badge>
              </div>
              <span className="num-display text-primary-600">
                ¥{o.amount.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyHero icon="contracts" title="暂无历史订单" accent="muted" />
      )}
    </div>
  );
}
