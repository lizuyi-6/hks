"use client";

import { useEffect, useRef, useState } from "react";
import type { UserProfile } from "@a1plus/domain";
import { SectionCard } from "@a1plus/ui";
import { proxyBaseUrl } from "@/lib/env";

const IP_FOCUS_OPTIONS = [
  { value: "trademark", label: "商标" },
  { value: "patent", label: "专利" },
  { value: "copyright", label: "软著 / 版权" },
  { value: "trade_secret", label: "商业秘密" },
  { value: "design", label: "外观设计" },
];

export function ProfilePanel() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ipFocus, setIpFocus] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${proxyBaseUrl}/profile`, { credentials: "include" })
      .then((res) => res.json() as Promise<UserProfile>)
      .then((data) => {
        setProfile(data);
        if (data.ipFocus) {
          setIpFocus(data.ipFocus.split(",").filter(Boolean));
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

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

  if (loading) {
    return (
      <SectionCard title="加载中..." eyebrow="个人中心">
        <div className="flex items-center justify-center py-8">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
        </div>
      </SectionCard>
    );
  }

  const inputCls =
    "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring";

  return (
    <div className="space-y-6">
      <SectionCard title="个人中心" eyebrow="个人中心">
        <p className="text-sm leading-7 text-slate-600">
          管理您的个人和业务信息。完整的信息有助于更准确的分析和建议。
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleSubmit(new FormData(e.currentTarget));
          }}
          className="mt-4 grid gap-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <input
              name="fullName"
              defaultValue={profile?.fullName ?? ""}
              placeholder="姓名"
              className={inputCls}
            />
            <input
              name="email"
              defaultValue={profile?.email ?? ""}
              placeholder="邮箱"
              className={inputCls}
              disabled
            />
          </div>

          <input
            name="businessName"
            defaultValue={profile?.businessName ?? ""}
            placeholder="公司名 / 项目名"
            className={inputCls}
          />
          <textarea
            name="businessDescription"
            defaultValue={profile?.businessDescription ?? ""}
            placeholder="描述你的产品、服务、目标客群和商业场景"
            rows={4}
            className={inputCls}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <input
              name="industry"
              defaultValue={profile?.industry ?? ""}
              placeholder="所属行业，例如：跨境电商 / SaaS"
              className={inputCls}
            />
            <select
              name="stage"
              defaultValue={profile?.stage ?? ""}
              className={inputCls}
            >
              <option value="">选择企业阶段</option>
              <option value="seed">初创期</option>
              <option value="pre-launch">上线前</option>
              <option value="growth">成长期</option>
              <option value="mature">成熟期</option>
            </select>
          </div>

          <hr className="border-slate-200" />
          <div className="grid gap-4 md:grid-cols-2">
            <input
              name="applicantName"
              defaultValue={profile?.applicantName ?? ""}
              placeholder="申请人名称（商标注册用）"
              className={inputCls}
            />
            <select
              name="applicantType"
              defaultValue={profile?.applicantType ?? ""}
              className={inputCls}
            >
              <option value="">选择申请人类型</option>
              <option value="company">企业</option>
              <option value="individual">个人</option>
            </select>
          </div>

          <hr className="border-slate-200" />
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">知识产权现状</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  name="hasTrademark"
                  defaultChecked={profile?.hasTrademark ?? false}
                  className="h-4 w-4 rounded border-slate-300 text-rust focus:ring-rust"
                />
                已有注册商标
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  name="hasPatent"
                  defaultChecked={profile?.hasPatent ?? false}
                  className="h-4 w-4 rounded border-slate-300 text-rust focus:ring-rust"
                />
                已有专利/软著
              </label>
            </div>
            <p className="mb-2 mt-3 text-sm font-medium text-slate-700">
              主要关注的 IP 领域
            </p>
            <div className="flex flex-wrap gap-2">
              {IP_FOCUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleIpFocus(opt.value)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    ipFocus.includes(opt.value)
                      ? "border-rust bg-rust/10 text-rust"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-slate-200" />
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">上传营业执照自动识别</p>
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

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  保存中...
                </>
              ) : (
                "保存"
              )}
            </button>
            {saved && (
              <span className="text-sm text-emerald-600">保存成功</span>
            )}
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </form>
      </SectionCard>

      <ChangePasswordCard />
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

  const inputCls =
    "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring";

  return (
    <SectionCard title="修改密码" eyebrow="安全设置">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <input
          name="oldPassword"
          type="password"
          placeholder="当前密码"
          className={inputCls}
          required
        />
        <input
          name="newPassword"
          type="password"
          placeholder="新密码（至少 6 位）"
          className={inputCls}
          required
          minLength={6}
        />
        <input
          name="confirmPassword"
          type="password"
          placeholder="确认新密码"
          className={inputCls}
          required
          minLength={6}
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "修改中..." : "修改密码"}
        </button>
        {saved && <p className="text-sm text-emerald-600">密码已更新</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </SectionCard>
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
      className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-4 text-center text-sm text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
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
      {uploading ? (
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          {status}
        </span>
      ) : status ? (
        <span className="text-emerald-600">{status}</span>
      ) : (
        "上传营业执照 PDF/DOCX，自动识别企业信息"
      )}
      {error && <p className="mt-1 text-rose-600">{error}</p>}
    </div>
  );
}
