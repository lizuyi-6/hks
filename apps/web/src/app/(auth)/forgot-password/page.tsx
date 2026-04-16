"use client";

import Link from "next/link";
import { useState } from "react";
import { SectionCard } from "@a1plus/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(160,74,42,0.18),_transparent_40%),linear-gradient(180deg,#f4ebdc_0%,#fcfaf6_100%)] px-4">
      <SectionCard title="忘记密码" eyebrow="Auth" className="w-full max-w-lg">
        {sent ? (
          <div className="space-y-4">
            <p className="text-sm leading-7 text-slate-600">
              如果该邮箱已注册，重置链接已发送到您的邮箱。请查收邮件并按照指引重置密码。
            </p>
            <Link
              href="/login"
              className="inline-flex rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white"
            >
              返回登录
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm leading-7 text-slate-600">
              输入您的注册邮箱，我们将发送密码重置链接。
            </p>
            <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="注册邮箱"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? "发送中..." : "发送重置链接"}
              </button>
            </form>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <p className="text-sm text-slate-500">
              想起密码了？{" "}
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
