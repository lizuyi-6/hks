"use client";

import Link from "next/link";
import { useState } from "react";
import { FormInput, SubmitButton } from "@a1plus/ui";
import { trackError } from "@/lib/analytics";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
        }),
      });

      if (!response.ok) {
        let msg = "登录失败，请重试";
        try {
          const data = await response.json();
          msg = data.detail ?? data.message ?? msg;
        } catch {
          msg = (await response.text()) || msg;
        }
        setError(msg);
        return;
      }

      window.location.href = "/dashboard";
    } catch (err) {
      const msg = "网络错误，请检查连接后重试";
      trackError({ event: "error", error_type: "network_error", message: `login network error: ${err}` });
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-serif text-xl font-semibold tracking-tight text-primary-600">A1+</span>
          <h1 className="mt-3 font-serif text-2xl font-medium tracking-tight text-text-primary">登录</h1>
        </div>
        <div className="rounded-lg border border-border bg-surface-elevated p-6 shadow-sm">
          <p className="text-sm text-text-secondary mb-4">
            使用邮箱密码登录，进入诊断、查重、申请书生成、台账和提醒中心。
          </p>
          <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-3">
            <FormInput name="email" type="email" label="邮箱" placeholder="邮箱" required />
            <FormInput name="password" type="password" label="密码" placeholder="密码" required />
            <SubmitButton loading={loading} loadingText="登录中...">登录</SubmitButton>
          </form>
          {error ? <p className="mt-3 text-sm text-error-700">{error}</p> : null}
          <div className="mt-4 space-y-1.5 text-sm text-text-tertiary">
            <p>还没有账户？ <Link href="/register" className="font-medium text-primary-600 hover:text-primary-700">创建账户</Link></p>
            <p>忘记密码？ <Link href="/forgot-password" className="font-medium text-primary-600 hover:text-primary-700">重置密码</Link></p>
          </div>
        </div>
      </div>
    </main>
  );
}
