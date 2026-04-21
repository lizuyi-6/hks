"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { IpAsset } from "@a1plus/domain";
import {
  WorkspaceCard,
  DataTag,
  Badge,
  SubmitButton,
  FormInput,
} from "@a1plus/ui";
import {
  PageHeader,
  PillarBanner,
  SectionHeader,
  KpiCard,
  StatTile,
  IconGlyph,
  IconTabBar,
  EmptyHero,
  QuickActionGrid,
  type IconName,
  type Accent,
} from "./primitives";
import { ColumnChart, StackedBar100 } from "./viz-hero";
import { request, ErrorDisplay } from "./shared";

type AssetType = "all" | "trademark" | "patent" | "copyright" | "soft-copyright";

const typeLabel: Record<Exclude<AssetType, "all">, string> = {
  trademark: "商标",
  patent: "专利",
  copyright: "版权",
  "soft-copyright": "软著",
};

const typeIcon: Record<Exclude<AssetType, "all">, IconName> = {
  trademark: "trademark",
  patent: "patent",
  copyright: "copyright",
  "soft-copyright": "soft-copyright",
};

const typeAccent: Record<Exclude<AssetType, "all">, Accent> = {
  trademark: "primary",
  patent: "info",
  copyright: "warning",
  "soft-copyright": "success",
};

type StatusKey = "active" | "pending" | "expired" | "renewed";

const statusLabel: Record<StatusKey, string> = {
  active: "活跃",
  pending: "审查中",
  expired: "已过期",
  renewed: "已续展",
};

const statusVariant: Record<StatusKey, "success" | "warning" | "error" | "info"> = {
  active: "success",
  pending: "warning",
  expired: "error",
  renewed: "info",
};

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.floor(diff / 86_400_000);
}

function formatExpiry(iso?: string): { text: string; tone: "success" | "warning" | "error" | "muted" } {
  if (!iso) return { text: "—", tone: "muted" };
  const d = daysUntil(iso)!;
  const dateText = new Date(iso).toLocaleDateString("zh-CN");
  if (d < 0) return { text: `已过期 · ${dateText}`, tone: "error" };
  if (d < 60) return { text: `${d} 天后到期`, tone: "warning" };
  if (d < 365) return { text: `${Math.round(d / 30)} 个月后`, tone: "success" };
  return { text: dateText, tone: "success" };
}

const toneClass: Record<"success" | "warning" | "error" | "muted", string> = {
  success: "text-success-500",
  warning: "text-warning-500",
  error: "text-error-500",
  muted: "text-text-tertiary",
};

function sparkFor(count: number): number[] {
  if (count === 0) return [0, 0, 0, 0, 0, 0, 0, 0];
  return Array.from({ length: 8 }, (_, i) =>
    Math.max(0, Math.round(count * (0.5 + (i / 7) * 0.5 + Math.sin(i) * 0.1))),
  );
}

export function AssetLedgerPanel() {
  const [assets, setAssets] = useState<IpAsset[]>([]);
  const [forecast, setForecast] = useState<Array<{ label: string; count: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<AssetType>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function loadAssets() {
    try {
      const response = await request<IpAsset[]>("/assets");
      setAssets(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }

  async function loadForecast() {
    try {
      const res = await request<{ data: Array<{ label: string; count: number }> }>(
        "/assets/expiry-forecast?months=12",
      );
      setForecast(res.data);
    } catch {
      /* forecast is nice-to-have */
    }
  }

  useEffect(() => {
    void loadAssets();
    void loadForecast();
  }, []);

  async function handleCreate(formData: FormData) {
    setError(null);
    setCreating(true);
    try {
      await request<IpAsset>("/assets", {
        method: "POST",
        body: JSON.stringify({
          name: String(formData.get("name") ?? ""),
          type: String(formData.get("type") ?? "trademark"),
          registration_number: String(formData.get("registrationNumber") ?? ""),
          expires_at: String(formData.get("expiresAt") ?? ""),
        }),
      });
      await loadAssets();
      await loadForecast();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
      // The backend commits the asset before scheduling reminders, so a
      // transient 5xx may still mean the asset was actually created. Refresh
      // the list so the UI reflects reality rather than appearing "stuck".
      await loadAssets();
      await loadForecast();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(assetId: string) {
    setError(null);
    try {
      await request(`/assets/${assetId}`, { method: "DELETE" });
      await loadAssets();
      await loadForecast();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  const counts = useMemo(() => {
    const c = {
      total: assets.length,
      trademark: 0,
      patent: 0,
      copyright: 0,
      "soft-copyright": 0,
      active: 0,
      pending: 0,
      expired: 0,
      renewed: 0,
      expiringSoon: 0,
    };
    assets.forEach((a) => {
      if (a.type in c) (c as unknown as Record<string, number>)[a.type] += 1;
      if (a.status in c) (c as unknown as Record<string, number>)[a.status] += 1;
      const d = daysUntil(a.expiresAt);
      if (d !== null && d >= 0 && d < 60) c.expiringSoon += 1;
    });
    return c;
  }, [assets]);

  const typeBreakdown = useMemo(
    () =>
      (["trademark", "patent", "copyright", "soft-copyright"] as const).map((k) => ({
        key: k,
        label: typeLabel[k],
        value: counts[k],
        icon: typeIcon[k],
        accent: typeAccent[k],
      })),
    [counts],
  );

  const activeRatio =
    counts.total > 0
      ? Math.round(((counts.active + counts.renewed) / counts.total) * 100)
      : 0;

  const filteredAssets = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (filter !== "all" && a.type !== filter) return false;
      if (lowerSearch && !a.name.toLowerCase().includes(lowerSearch)) return false;
      return true;
    });
  }, [assets, filter, search]);

  const statusDistribution = useMemo(
    () =>
      (["active", "renewed", "pending", "expired"] as StatusKey[]).map((k) => ({
        key: k,
        label: statusLabel[k],
        value: counts[k],
      })),
    [counts],
  );

  const quickActions: Parameters<typeof QuickActionGrid>[0]["actions"] = [
    {
      title: "商标查重",
      description: "上新商标前先查近似",
      icon: "trademark",
      accent: "primary",
      href: "/trademark/check",
    },
    {
      title: "申请书生成",
      description: "一键起草商标申请",
      icon: "edit",
      accent: "info",
      href: "/trademark/application",
    },
    {
      title: "设置提醒",
      description: "到期自动提醒续展",
      icon: "bell",
      accent: "warning",
      href: "/inbox",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IP Ledger"
        title="IP 资产台账"
        icon="assets"
        accent="success"
        description="集中管理商标、专利、软著、版权；自动提醒到期、续展与年费节点。"
        actions={
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
          >
            <IconGlyph name="plus" size={14} />
            {showForm ? "收起表单" : "新增资产"}
          </button>
        }
      />

      <PillarBanner
        pillar="digital"
        hint="资产台账承接订单交付物，是服务数字化的沉淀底座。"
      />

      {/* ===== Create form (collapsible) — placed right under the page title ===== */}
      {showForm && (
        <WorkspaceCard title="新增资产" eyebrow="Manual ledger">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await handleCreate(new FormData(e.currentTarget));
            }}
            className="grid gap-4 md:grid-cols-2"
          >
            <FormInput name="name" label="资产名称" placeholder="资产名称" required />
            <div className="w-full">
              <label htmlFor="assetType" className="mb-1.5 block text-sm font-medium text-text-primary">
                类型
              </label>
              <select
                id="assetType"
                name="type"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
                defaultValue="trademark"
              >
                <option value="trademark">商标</option>
                <option value="patent">专利</option>
                <option value="soft-copyright">软著</option>
                <option value="copyright">版权</option>
              </select>
            </div>
            <FormInput name="registrationNumber" label="注册号" placeholder="注册号（可选）" />
            <FormInput name="expiresAt" label="到期日" type="date" />
            <div className="md:col-span-2">
              <SubmitButton loading={creating}>添加资产</SubmitButton>
            </div>
          </form>
        </WorkspaceCard>
      )}

      {error ? <ErrorDisplay error={error} /> : null}

      {/* ===== KPI ===== */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="资产总数"
          value={counts.total}
          accent="primary"
          icon="assets"
          series={sparkFor(counts.total)}
        />
        <KpiCard
          label="商标"
          value={counts.trademark}
          accent="primary"
          icon="trademark"
          series={sparkFor(counts.trademark)}
        />
        <KpiCard
          label="专利 / 软著"
          value={counts.patent + counts["soft-copyright"]}
          accent="info"
          icon="patent"
          series={sparkFor(counts.patent + counts["soft-copyright"])}
        />
        <KpiCard
          label="60 天内到期"
          value={counts.expiringSoon}
          accent={counts.expiringSoon > 0 ? "warning" : "success"}
          icon="clock"
          trend={counts.expiringSoon > 0 ? "down" : "neutral"}
          delta={counts.expiringSoon > 0 ? `${counts.expiringSoon} 待处理` : "全部已覆盖"}
          series={sparkFor(counts.expiringSoon + 1)}
        />
      </section>

      {/* ===== Expiry ColumnChart + Type StackedBar100 ===== */}
      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-lg border border-border bg-gradient-to-br from-success-50/40 via-surface to-surface p-5">
          <SectionHeader
            eyebrow="Expiry forecast"
            title="未来 12 个月到期分布"
            description="按月汇总即将到期的资产数量，高峰月份提前 90 天排续展"
            actions={
              <span className="rounded-md border border-success-200 bg-success-50 px-2 py-0.5 text-[10px] font-mono font-semibold tracking-wide text-success-700">
                12M
              </span>
            }
          />
          <div className="mt-4 text-success-600">
            {forecast.length > 0 ? (
              <ColumnChart
                data={forecast.map((f) => f.count)}
                labels={forecast.map((f) => f.label)}
                color="currentColor"
                trackColor="rgb(var(--color-border) / 0.4)"
                width={720}
                height={180}
                highlight={
                  forecast.reduce(
                    (iMax, f, i, arr) => (f.count > (arr[iMax]?.count ?? 0) ? i : iMax),
                    0,
                  )
                }
              />
            ) : (
              <div className="flex h-[180px] items-center justify-center text-xs text-text-tertiary">
                暂无到期数据
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-text-tertiary">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm bg-success-500" /> 月度到期量
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm bg-border" /> 未来窗口
            </span>
          </div>
        </div>

        <div className="flex flex-col rounded-lg border border-border bg-surface p-5">
          <SectionHeader
            eyebrow="Portfolio mix"
            title="资产类型分布"
            description={`共 ${counts.total} 项，活跃 + 续展 ${activeRatio}%`}
          />
          <div className="mt-4">
            <StackedBar100
              segments={[
                {
                  label: "商标",
                  value: counts.trademark,
                  color: "rgb(var(--color-primary-500))",
                },
                {
                  label: "专利",
                  value: counts.patent,
                  color: "rgb(var(--color-info-500))",
                },
                {
                  label: "软著",
                  value: counts["soft-copyright"],
                  color: "rgb(var(--color-success-500))",
                },
                {
                  label: "版权",
                  value: counts.copyright,
                  color: "rgb(var(--color-warning-500))",
                },
              ]}
            />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 text-[11px]">
            {statusDistribution.map((s) => (
              <div
                key={s.key}
                className="flex items-center justify-between rounded-md border border-border bg-surface-elevated px-3 py-2"
              >
                <span className="text-text-tertiary">{s.label}</span>
                <span
                  className={`num-display text-base ${
                    s.key === "expired"
                      ? "text-error-500"
                      : s.key === "pending"
                        ? "text-warning-500"
                        : s.key === "renewed"
                          ? "text-info-600"
                          : "text-success-600"
                  }`}
                >
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Type breakdown tiles ===== */}
      <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {typeBreakdown.map((t) => (
          <StatTile
            key={t.key}
            label={t.label}
            value={t.value}
            icon={t.icon}
            accent={t.accent}
            hint={counts.total > 0 ? `占比 ${Math.round((t.value / counts.total) * 100)}%` : "—"}
          />
        ))}
      </section>

      {/* ===== Asset list with filters ===== */}
      <section className="rounded-lg border border-border bg-surface">
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
          <IconTabBar<AssetType>
            active={filter}
            onChange={setFilter}
            tabs={[
              { key: "all", label: "全部", icon: "assets", count: counts.total },
              { key: "trademark", label: "商标", icon: "trademark", count: counts.trademark },
              { key: "patent", label: "专利", icon: "patent", count: counts.patent },
              { key: "soft-copyright", label: "软著", icon: "soft-copyright", count: counts["soft-copyright"] },
              { key: "copyright", label: "版权", icon: "copyright", count: counts.copyright },
            ]}
          />
          <div className="relative w-full md:w-64">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-tertiary">
              <IconGlyph name="search" size={14} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索资产名称"
              className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
            />
          </div>
        </div>

        <div className="p-2">
          {filteredAssets.length === 0 ? (
            assets.length === 0 ? (
              <EmptyHero
                icon="assets"
                title="还没有资产记录"
                description="完成商标查重 / 申请书生成后会自动入台账，也可以手动添加已有资产。"
                primaryAction={{ label: "去商标查重", href: "/trademark/check" }}
                secondaryAction={{ label: "手动添加", onClick: () => setShowForm(true) }}
              />
            ) : (
              <EmptyHero
                icon="search"
                title="没有匹配的资产"
                description="尝试更换关键字或切换类型筛选。"
                secondaryAction={{ label: "清除筛选", onClick: () => { setSearch(""); setFilter("all"); } }}
                accent="muted"
              />
            )
          ) : (
            <ul className="divide-y divide-border">
              {filteredAssets.map((asset) => {
                const key = (asset.type as Exclude<AssetType, "all">) ?? "trademark";
                const exp = formatExpiry(asset.expiresAt);
                const status = (asset.status as StatusKey) ?? "pending";
                return (
                  <li
                    key={asset.id}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-surface-elevated md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                          typeAccent[key] === "primary"
                            ? "bg-primary-50 text-primary-600"
                            : typeAccent[key] === "info"
                              ? "bg-info-50 text-info-700"
                              : typeAccent[key] === "warning"
                                ? "bg-warning-50 text-warning-700"
                                : "bg-success-50 text-success-700"
                        }`}
                      >
                        <IconGlyph name={typeIcon[key]} size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">{asset.name}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                          <span>{typeLabel[key]}</span>
                          {asset.registrationNumber && (
                            <>
                              <span className="text-text-muted">·</span>
                              <span className="font-mono">{asset.registrationNumber}</span>
                            </>
                          )}
                          <span className="text-text-muted">·</span>
                          <Badge variant={statusVariant[status]} size="sm" dot>
                            {statusLabel[status]}
                          </Badge>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <IconGlyph name="calendar" size={12} className={toneClass[exp.tone]} />
                        <span className={toneClass[exp.tone]}>{exp.text}</span>
                      </div>
                      {asset.nextMilestone && (
                        <span className="hidden rounded-md border border-border bg-surface-elevated px-2 py-0.5 text-text-secondary md:inline">
                          {asset.nextMilestone}
                        </span>
                      )}
                      <DataTag mode={asset.sourceMode} provider="ledger" />
                      <button
                        type="button"
                        onClick={() => void handleDelete(asset.id)}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-text-secondary transition-colors hover:border-error-500 hover:text-error-500"
                        aria-label="删除"
                      >
                        <IconGlyph name="trash" size={12} />
                        <span>删除</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ===== Related quick actions ===== */}
      <section className="space-y-3">
        <SectionHeader eyebrow="Quick actions" title="常用 IP 动作" description="台账背后的下一步操作" />
        <QuickActionGrid actions={quickActions} columns={3} />
      </section>

      <p className="text-[11px] text-text-tertiary">
        ※ 仅供参考，以官方为准。到期日、续展建议需结合官方查询核验。
      </p>
    </div>
  );
}
