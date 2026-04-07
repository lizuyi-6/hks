"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SectionCard } from "@a1plus/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        full_name: String(formData.get("fullName") ?? "")
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
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(23,32,51,0.12),_transparent_40%),linear-gradient(180deg,#f4ebdc_0%,#fcfaf6_100%)] px-4">
      <SectionCard title="创建账户" eyebrow="Auth" className="w-full max-w-lg">
        <p className="text-sm leading-7 text-slate-600">
          创建一个演示账户，直接进入全 PRD 骨架工作台。
        </p>
        <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-4">
          <input
            name="fullName"
            placeholder="姓名"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            required
          />
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
          <button type="submit" disabled={loading} className="rounded-full bg-rust px-5 py-3 text-sm font-semibold text-white">
            {loading ? "创建中..." : "注册并进入工作台"}
          </button>
        </form>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <p className="text-sm text-slate-500">
          已有账户？{" "}
          <Link href="/login" className="font-semibold text-ink">
            去登录
          </Link>
        </p>
      </SectionCard>
    </main>
  );
}

