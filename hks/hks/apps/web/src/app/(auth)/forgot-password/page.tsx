"use client";

import Link from "next/link";
import { useState } from "react";
import { FormInput, SubmitButton } from "@a1plus/ui";

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
    <main className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-serif text-xl font-semibold tracking-tight text-primary-600">A1+</span>
          <h1 className="mt-3 font-serif text-2xl font-medium tracking-tight text-text-primary">忘记密码</h1>
        </div>
        <div className="rounded-lg border border-border bg-surface-elevated p-6 shadow-sm">
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                如果该邮箱已注册，重置链接已发送到您的邮箱。请查收邮件并按照指引重置密码。
              </p>
              <Link
                href="/login"
                className="inline-flex h-8 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse hover:bg-primary-700 transition-colors"
              >
                返回登录
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-text-secondary mb-4">
                输入您的注册邮箱，我们将发送密码重置链接。
              </p>
              <form onSubmit={handleSubmit} className="grid gap-3">
                <FormInput
                  name="email"
                  type="email"
                  label="注册邮箱"
                  placeholder="注册邮箱"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <SubmitButton loading={loading} loadingText="发送中...">发送重置链接</SubmitButton>
              </form>
              {error && <p className="mt-3 text-sm text-error-700">{error}</p>}
              <p className="mt-4 text-sm text-text-tertiary">
                想起密码了？ <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">返回登录</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
