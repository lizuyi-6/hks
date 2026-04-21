"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { UserProfile } from "@a1plus/domain";
import {
  WorkspaceCard,
  FormInput,
  FormTextarea,
  SubmitButton,
  Badge,
} from "@a1plus/ui";
import { DonutRing } from "@/components/viz";
import { proxyBaseUrl } from "@/lib/env";
import {
  PageHeader,
  SectionHeader,
  IconGlyph,
  QuickActionGrid,
  accentBgClass,
  type IconName,
  type Accent,
} from "@/components/workspace/primitives";
import { SegmentedRings } from "@/components/workspace/viz-hero";

type IpFocusOption = { value: string; label: string; icon: IconName; accent: Accent };

const IP_FOCUS_OPTIONS: IpFocusOption[] = [
  { value: "trademark", label: "商标", icon: "trademark", accent: "primary" },
  { value: "patent", label: "专利", icon: "patent", accent: "info" },
  { value: "copyright", label: "软著 / 版权", icon: "copyright", accent: "warning" },
  { value: "trade_secret", label: "商业秘密", icon: "shield", accent: "success" },
  { value: "design", label: "外观设计", icon: "sparkle", accent: "info" },
];

type ActivityEntry = {
  id: string;
  type: "login" | "document" | "profile" | "asset" | "security" | string;
  title: string;
  detail: string;
  at: string;
};

const activityMeta: Record<string, { icon: IconName; accent: Accent }> = {
  login: { icon: "user", accent: "info" },
  document: { icon: "download", accent: "primary" },
  profile: { icon: "edit", accent: "warning" },
  asset: { icon: "assets", accent: "success" },
  security: { icon: "lock", accent: "error" },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

export function ProfilePanel() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ipFocus, setIpFocus] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    fetch(`${proxyBaseUrl}/profile`, { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        if (!res.ok) return null;
        return res.json() as Promise<UserProfile>;
      })
      .then((data) => {
        if (!data) return;
        setProfile(data);
        if (data.ipFocus) {
          setIpFocus(data.ipFocus.split(",").filter(Boolean));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch(`${proxyBaseUrl}/profile/activity`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<ActivityEntry[]>) : []))
      .then((data) => setActivity(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const completion = useMemo(() => {
    if (!profile) return 0;
    const fields: Array<keyof UserProfile> = [
      "fullName",
      "businessName",
      "businessDescription",
      "industry",
      "stage",
      "applicantName",
      "applicantType",
    ];
    const filled = fields.filter((k) => {
      const v = profile[k];
      return typeof v === "string" && v.trim().length > 0;
    }).length;
    const extras = [profile.hasTrademark, profile.hasPatent, ipFocus.length > 0].filter(
      Boolean,
    ).length;
    const total = fields.length + 3;
    return Math.round(((filled + extras) / total) * 100);
  }, [profile, ipFocus]);

  function toggleIpFocus(value: string) {
    setIpFocus((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    setError(null);
    setSaved(false);

    const payload: Record<string, string | boolean> = {};
    const fields = [
      "fullName",
      "businessName",
      "businessDescription",
      "industry",
      "stage",
      "applicantType",
      "applicantName",
    ];
    for (const field of fields) {
      const value = String(formData.get(field) ?? "").trim();
      if (value) payload[field] = value;
    }

    payload.hasTrademark = formData.get("hasTrademark") === "on";
    payload.hasPatent = formData.get("hasPatent") === "on";
    payload.ipFocus = ipFocus.join(",");

    try {
      const res = await fetch(`${proxyBaseUrl}/profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      const updated = (await res.json()) as UserProfile;
      setProfile(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const moduleStrengths = useMemo(() => {
    const hasTm = profile?.hasTrademark ? 40 : 0;
    const hasPt = profile?.hasPatent ? 40 : 0;
    const focusTm = ipFocus.includes("trademark") ? 40 : 0;
    const focusPt = ipFocus.includes("patent") ? 40 : 0;
    const focusCr = ipFocus.includes("copyright") ? 45 : 0;
    const focusDesign = ipFocus.includes("design") ? 25 : 0;
    const focusSecret = ipFocus.includes("trade_secret") ? 35 : 0;
    const biz = profile?.businessDescription?.trim() ? 20 : 0;
    const ind = profile?.industry?.trim() ? 20 : 0;
    return [
      {
        label: "商标",
        percent: Math.min(100, hasTm + focusTm + biz),
        color: "rgb(var(--color-primary-500))",
        hint: profile?.hasTrademark ? "已注册" : "未注册",
      },
      {
        label: "专利",
        percent: Math.min(100, hasPt + focusPt + focusDesign + biz),
        color: "rgb(var(--color-info-500))",
        hint: profile?.hasPatent ? "有布局" : "未布局",
      },
      {
        label: "版权",
        percent: Math.min(100, focusCr + focusDesign + ind),
        color: "rgb(var(--color-warning-500))",
        hint: ipFocus.includes("copyright") ? "关注中" : "一般",
      },
      {
        label: "合规",
        percent: Math.min(100, focusSecret + biz + ind + (profile?.applicantType === "company" ? 20 : 0)),
        color: "rgb(var(--color-success-500))",
        hint: profile?.applicantType === "company" ? "企业资料" : "可补充",
      },
    ];
  }, [profile, ipFocus]);

  if (loading) {
    return (
      <WorkspaceCard title="加载中..." eyebrow="Profile">
        <div className="flex items-center justify-center py-8">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary-500" />
        </div>
      </WorkspaceCard>
    );
  }

  const initial = profile?.fullName?.charAt(0) ?? profile?.email?.charAt(0) ?? "?";
  const completionAccent: Accent =
    completion >= 80 ? "success" : completion >= 50 ? "warning" : "error";
  const donutColorClass =
    completion >= 80 ? "text-success-500" : completion >= 50 ? "text-warning-500" : "text-error-500";

  const quickActions: Parameters<typeof QuickActionGrid>[0]["actions"] = [
    {
      title: "修改密码",
      description: "更新账号登录密码",
      icon: "lock",
      accent: "error",
      onClick: () => document.getElementById("change-password")?.scrollIntoView({ behavior: "smooth" }),
    },
    {
      title: "上传营业执照",
      description: "自动识别企业信息",
      icon: "upload",
      accent: "info",
      onClick: () => document.getElementById("license-upload")?.scrollIntoView({ behavior: "smooth" }),
    },
    {
      title: "IP 焦点设置",
      description: "调整关注领域",
      icon: "target",
      accent: "primary",
      onClick: () => document.getElementById("ip-focus")?.scrollIntoView({ behavior: "smooth" }),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="个人中心"
        icon="user"
        accent="info"
        description="完善的资料能显著提升 IP 诊断与商标查重结果的准确度。"
      />

      {/* ===== Identity hero ===== */}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-gradient-to-br from-info-50/60 via-surface to-surface p-5 md:flex-row md:items-center">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-info-500 to-info-700 text-2xl font-semibold text-text-inverse shadow-lg shadow-info-500/20">
            {initial}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-xl font-medium tracking-tight text-text-primary">
                {profile?.fullName || "未命名用户"}
              </h2>
              {profile?.applicantType && (
                <Badge variant={profile.applicantType === "company" ? "primary" : "info"} size="sm">
                  {profile.applicantType === "company" ? "企业账号" : "个人账号"}
                </Badge>
              )}
              {profile?.profileComplete && (
                <Badge variant="success" size="sm" dot>
                  资料齐全
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-text-secondary">{profile?.email}</p>
            {profile?.businessName && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-text-tertiary">
                <IconGlyph name="building" size={12} />
                <span>{profile.businessName}</span>
                {profile.industry && (
                  <>
                    <span className="text-text-muted">·</span>
                    <span>{profile.industry}</span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
            Completion
          </p>
          <div className={`mt-2 ${donutColorClass}`}>
            <DonutRing
              percent={completion}
              color="currentColor"
              track="rgb(var(--color-border) / 0.8)"
              size={120}
              strokeWidth={10}
              valueLabel={
                <span className="num-display text-3xl tracking-tight text-text-primary">
                  {completion}
                  <span className="text-base align-top text-text-tertiary">%</span>
                </span>
              }
            />
          </div>
          <p className="mt-3 text-xs text-text-tertiary">资料完整度</p>
          <span className={`mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${accentBgClass(completionAccent)}`}>
            {completion >= 80 ? "优秀" : completion >= 50 ? "建议补充" : "请尽快完善"}
          </span>
        </div>
      </section>

      {/* ===== Module strength rings ===== */}
      <section className="rounded-lg border border-border bg-surface p-5">
        <SectionHeader
          eyebrow="Module affinity"
          title="四大模块偏好强度"
          description="根据已完成资料 + IP 焦点推算，越高越能精准匹配 AI 建议"
        />
        <div className="mt-5 text-info-500">
          <SegmentedRings items={moduleStrengths} size={86} strokeWidth={8} />
        </div>
      </section>

      {/* ===== Quick actions ===== */}
      <section className="space-y-3">
        <SectionHeader eyebrow="Quick actions" title="常用操作" />
        <QuickActionGrid actions={quickActions} columns={3} />
      </section>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await handleSubmit(new FormData(e.currentTarget));
        }}
        className="space-y-6"
      >
        {/* ===== 基础信息 ===== */}
        <WorkspaceCard title="基础信息" eyebrow="Identity">
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput
              name="fullName"
              label="姓名"
              defaultValue={profile?.fullName ?? ""}
              placeholder="姓名"
            />
            <FormInput
              name="email"
              label="邮箱"
              defaultValue={profile?.email ?? ""}
              placeholder="邮箱"
              disabled
            />
          </div>
        </WorkspaceCard>

        {/* ===== 企业信息 ===== */}
        <WorkspaceCard title="企业信息" eyebrow="Business">
          <div className="grid gap-4">
            <FormInput
              name="businessName"
              label="公司/项目名"
              defaultValue={profile?.businessName ?? ""}
              placeholder="公司名 / 项目名"
            />
            <FormTextarea
              name="businessDescription"
              label="业务描述"
              defaultValue={profile?.businessDescription ?? ""}
              placeholder="描述你的产品、服务、目标客群和商业场景"
              rows={4}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <FormInput
                name="industry"
                label="行业"
                defaultValue={profile?.industry ?? ""}
                placeholder="所属行业，例如：跨境电商 / SaaS"
              />
              <div className="w-full">
                <label htmlFor="stage" className="mb-1.5 block text-sm font-medium text-text-primary">
                  阶段
                </label>
                <select
                  id="stage"
                  name="stage"
                  defaultValue={profile?.stage ?? ""}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
                >
                  <option value="">选择企业阶段</option>
                  <option value="seed">初创期</option>
                  <option value="pre-launch">上线前</option>
                  <option value="growth">成长期</option>
                  <option value="mature">成熟期</option>
                </select>
              </div>
            </div>
            <div id="license-upload">
              <p className="mb-2 text-sm font-medium text-text-primary">上传营业执照自动识别</p>
              <LicenseUploader
                onFields={(fields) => {
                  setProfile((prev) =>
                    prev
                      ? {
                          ...prev,
                          businessName: fields.businessName ?? prev.businessName,
                          industry: fields.industry ?? prev.industry,
                          applicantName: fields.applicantName ?? prev.applicantName,
                        }
                      : prev,
                  );
                }}
              />
            </div>
          </div>
        </WorkspaceCard>

        {/* ===== 申请人 ===== */}
        <WorkspaceCard title="申请人信息" eyebrow="Applicant">
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput
              name="applicantName"
              label="申请人"
              defaultValue={profile?.applicantName ?? ""}
              placeholder="申请人名称（商标注册用）"
            />
            <div className="w-full">
              <label htmlFor="applicantType" className="mb-1.5 block text-sm font-medium text-text-primary">
                类型
              </label>
              <select
                id="applicantType"
                name="applicantType"
                defaultValue={profile?.applicantType ?? ""}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
              >
                <option value="">选择申请人类型</option>
                <option value="company">企业</option>
                <option value="individual">个人</option>
              </select>
            </div>
          </div>
        </WorkspaceCard>

        {/* ===== IP 焦点 ===== */}
        <WorkspaceCard title="知识产权偏好" eyebrow="IP focus" actions={
          <Badge variant="outline" size="sm">已选 {ipFocus.length}</Badge>
        }>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-md border border-border bg-surface-elevated px-3 py-2">
              <input
                type="checkbox"
                name="hasTrademark"
                defaultChecked={profile?.hasTrademark ?? false}
                className="h-4 w-4 rounded border-border text-primary-500 focus:ring-primary-500/20"
              />
              <IconGlyph name="trademark" size={14} className="text-primary-600" />
              <span className="text-sm text-text-primary">已有注册商标</span>
            </label>
            <label className="flex items-center gap-3 rounded-md border border-border bg-surface-elevated px-3 py-2">
              <input
                type="checkbox"
                name="hasPatent"
                defaultChecked={profile?.hasPatent ?? false}
                className="h-4 w-4 rounded border-border text-primary-500 focus:ring-primary-500/20"
              />
              <IconGlyph name="patent" size={14} className="text-info-500" />
              <span className="text-sm text-text-primary">已有专利/软著</span>
            </label>
          </div>

          <div id="ip-focus" className="mt-4">
            <p className="mb-2 text-sm font-medium text-text-primary">主要关注的 IP 领域</p>
            <div className="flex flex-wrap gap-2">
              {IP_FOCUS_OPTIONS.map((opt) => {
                const on = ipFocus.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleIpFocus(opt.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                      on
                        ? `${accentBgClass(opt.accent)} border-transparent`
                        : "border-border bg-surface text-text-secondary hover:bg-surface-elevated"
                    }`}
                  >
                    <IconGlyph name={opt.icon} size={14} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </WorkspaceCard>

        <div className="flex items-center gap-4">
          <SubmitButton loading={saving} loadingText="保存中...">保存资料</SubmitButton>
          {saved && <span className="text-sm text-success-500">保存成功</span>}
          {error && <span className="text-sm text-error-500">{error}</span>}
        </div>
      </form>

      {/* ===== Change password ===== */}
      <div id="change-password">
        <ChangePasswordCard />
      </div>

      {/* ===== Activity timeline ===== */}
      <WorkspaceCard title="账户活动" eyebrow="Activity" actions={
        <Badge variant="outline" size="sm">{activity.length} 条</Badge>
      }>
        {activity.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-tertiary">暂无活动</p>
        ) : (
          <ol className="relative ml-4 border-l-2 border-dashed border-info-200">
            {activity.map((a, idx) => {
              const meta = activityMeta[a.type] ?? { icon: "sparkle" as IconName, accent: "muted" as Accent };
              const isFirst = idx === 0;
              return (
                <li key={a.id} className="relative py-3 pl-7">
                  <span
                    className={`absolute -left-[13px] top-3.5 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-surface ${accentBgClass(meta.accent)} ${
                      isFirst ? "shadow-[0_0_0_4px_rgb(var(--color-info-100)/0.6)]" : ""
                    }`}
                  >
                    <IconGlyph name={meta.icon} size={11} />
                  </span>
                  <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 transition-colors hover:border-info-200">
                    <p className="text-sm font-medium text-text-primary">{a.title}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">{a.detail}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-text-muted">
                      <IconGlyph name="clock" size={10} />
                      {relativeTime(a.at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </WorkspaceCard>
    </div>
  );
}

function ChangePasswordCard() {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const oldPassword = String(fd.get("oldPassword") ?? "");
    const newPassword = String(fd.get("newPassword") ?? "");
    const confirmPassword = String(fd.get("confirmPassword") ?? "");

    if (newPassword !== confirmPassword) {
      setError("两次密码不一致");
      return;
    }
    if (newPassword.length < 6) {
      setError("新密码至少 6 位");
      return;
    }

    setLoading(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      setSaved(true);
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <WorkspaceCard title="修改密码" eyebrow="Security" actions={
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-error-50 text-error-700">
        <IconGlyph name="lock" size={12} />
      </span>
    }>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <FormInput name="oldPassword" type="password" label="当前密码" placeholder="当前密码" required />
        <FormInput name="newPassword" type="password" label="新密码" placeholder="新密码（至少 6 位）" required minLength={6} />
        <FormInput name="confirmPassword" type="password" label="确认新密码" placeholder="确认新密码" required minLength={6} />
        <SubmitButton loading={loading} loadingText="修改中...">修改密码</SubmitButton>
        {saved && <p className="text-sm text-success-500">密码已更新</p>}
        {error && <p className="text-sm text-error-500">{error}</p>}
      </form>
    </WorkspaceCard>
  );
}

function LicenseUploader({
  onFields,
}: {
  onFields: (fields: Record<string, string | null>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setStatus("正在识别...");

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${proxyBaseUrl}/upload/parse-business-license`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setStatus(null);
      } else {
        onFields(data.fields ?? {});
        setStatus(`已识别：${data.fields?.businessName ?? "未知企业"}`);
      }
    } catch {
      setError("识别失败");
      setStatus(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="cursor-pointer rounded-lg border-2 border-dashed border-border bg-surface-elevated px-4 py-6 text-center text-sm text-text-tertiary transition-colors hover:border-primary-500/50 hover:bg-primary-50/40"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
        className="hidden"
      />
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-info-50 text-info-700">
        <IconGlyph name="upload" size={18} />
      </span>
      <div className="mt-2">
        {uploading ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary-500" />
            {status}
          </span>
        ) : status ? (
          <span className="text-success-500">{status}</span>
        ) : (
          <>
            <p className="text-sm font-medium text-text-primary">上传营业执照 PDF / DOCX</p>
            <p className="mt-0.5 text-xs text-text-tertiary">自动识别企业信息，填入下方表单</p>
          </>
        )}
      </div>
      {error && <p className="mt-1 text-error-500">{error}</p>}
    </div>
  );
}
