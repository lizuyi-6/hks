"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FormInput, SubmitButton } from "@a1plus/ui";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
          <div className="w-full max-w-sm">
            <div className="rounded-md border border-border bg-surface p-6">
              <div className="flex items-center justify-center py-8">
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary-500" />
              </div>
            </div>
          </div>
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
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current !== null) clearTimeout(redirectTimerRef.current);
    };
  }, []);

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
      redirectTimerRef.current = setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-serif text-xl font-semibold tracking-tight text-primary-600">A1+</span>
          <h1 className="mt-3 font-serif text-2xl font-medium tracking-tight text-text-primary">重置密码</h1>
        </div>
        <div className="rounded-lg border border-border bg-surface-elevated p-6 shadow-sm">
          {success ? (
            <p className="text-sm text-success-700">密码重置成功，正在跳转到登录页...</p>
          ) : !token ? (
            <div className="space-y-4">
              <p className="text-sm text-error-700">重置链接无效或已过期。</p>
              <Link
                href="/forgot-password"
                className="inline-flex h-8 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse hover:bg-primary-700 transition-colors"
              >
                重新申请
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-3">
              <FormInput
                name="password"
                type="password"
                label="新密码"
                placeholder="新密码（至少 6 位）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <FormInput
                name="confirmPassword"
                type="password"
                label="确认密码"
                placeholder="确认新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
              <SubmitButton loading={loading} loadingText="重置中...">重置密码</SubmitButton>
            </form>
          )}
          {error && <p className="mt-3 text-sm text-error-700">{error}</p>}
          <p className="mt-4 text-sm text-text-tertiary">
            <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">返回登录</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
