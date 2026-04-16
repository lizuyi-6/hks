"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SectionCard } from "@a1plus/ui";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(160,74,42,0.18),_transparent_40%),linear-gradient(180deg,#f4ebdc_0%,#fcfaf6_100%)] px-4">
          <SectionCard title="重置密码" eyebrow="Auth" className="w-full max-w-lg">
            <div className="flex items-center justify-center py-8">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            </div>
          </SectionCard>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("两次密码不一致");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }
    if (!token) {
      setError("重置链接无效，请重新申请");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(160,74,42,0.18),_transparent_40%),linear-gradient(180deg,#f4ebdc_0%,#fcfaf6_100%)] px-4">
      <SectionCard title="重置密码" eyebrow="Auth" className="w-full max-w-lg">
        {success ? (
          <div className="space-y-4">
            <p className="text-sm leading-7 text-emerald-600">
              密码重置成功，正在跳转到登录页...
            </p>
          </div>
        ) : (
          <>
            {!token ? (
              <div className="space-y-4">
                <p className="text-sm text-rose-600">重置链接无效或已过期。</p>
                <Link
                  href="/forgot-password"
                  className="inline-flex rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white"
                >
                  重新申请
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="grid gap-4">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="新密码（至少 6 位）"
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  required
                  minLength={6}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="确认新密码"
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  required
                  minLength={6}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loading ? "重置中..." : "重置密码"}
                </button>
              </form>
            )}
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <p className="text-sm text-slate-500">
              <Link href="/login" className="font-semibold text-rust">
                返回登录
              </Link>
            </p>
          </>
        )}
      </SectionCard>
    </main>
  );
}
