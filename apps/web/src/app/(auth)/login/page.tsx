"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SectionCard } from "@a1plus/ui";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? "")
      })
    });

    if (!response.ok) {
      setError(await response.text());
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(160,74,42,0.18),_transparent_40%),linear-gradient(180deg,#f4ebdc_0%,#fcfaf6_100%)] px-4">
      <SectionCard title="登录 A1+ IP Coworker" eyebrow="Auth" className="w-full max-w-lg">
        <p className="text-sm leading-7 text-slate-600">
          使用邮箱密码登录，进入诊断、查重、申请书生成、台账和提醒中心。
        </p>
        <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-4">
          <input
            name="email"
            type="email"
            placeholder="邮箱"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            required
          />
          <input
            name="password"
            type="password"
            placeholder="密码"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <p className="text-sm text-slate-500">
          还没有账户？{" "}
          <Link href="/register" className="font-semibold text-rust">
            创建账户
          </Link>
        </p>
      </SectionCard>
    </main>
  );
}

