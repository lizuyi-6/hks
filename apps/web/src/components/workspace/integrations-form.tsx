"use client";

/**
 * 集成配置的表单 / 字段元数据：每个 provider 一张表，render 时按 schema 生成。
 *
 * 设计要点：
 * - secrets 字段（api_key / password）固定用 <input type="password"> 渲染，
 *   占位符 **直接显示已配置的掩码** (`sk_…abcd`)，空提交 = 保留原值。
 * - config 字段用纯文本/数字/开关；默认值来自后端 `PROVIDER_SCHEMAS`。
 * - 这里只关心"什么字段、怎么校验"——真实的 PUT 请求在 enterprise.tsx 里。
 */

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";

export type ProviderSchema = {
  providerKey: string;
  label: string;
  description: string;
  secretKeys: string[];
  configKeys: string[];
  configDefaults: Record<string, unknown>;
  primarySecret: string;
};

export type IntegrationSummary = {
  providerKey: string;
  configured: boolean;
  scope: "tenant" | "global" | null;
  label: string | null;
  keyHint: string;
  lastUsedAt: string | null;
  config: Record<string, unknown>;
};

// UI 文案：每个 provider → 每个字段的中文标签 + 额外提示。
// 不在 schema 字段里的 key 会用 ``fieldKey`` 兜底。
const FIELD_META: Record<string, Record<string, { label: string; hint?: string; type?: "password" | "number" | "text" | "switch" }>> = {
  bing_search: {
    api_key: { label: "Bing 订阅密钥", hint: "Azure Bing Search 控制台 → Subscription Key", type: "password" },
    endpoint: { label: "接入端点", hint: "默认 https://api.bing.microsoft.com/v7.0/search" },
    market: { label: "市场 (mkt)", hint: "例如 zh-CN" },
    set_lang: { label: "语言 (setLang)", hint: "例如 zh-Hans" },
  },
  tianyancha: {
    api_key: { label: "天眼查 Token", hint: "登录天眼查开发者控制台复制 Authorization 头的值", type: "password" },
  },
  doubao_llm: {
    api_key: { label: "豆包 API Key", hint: "Volcengine Ark 控制台 → 密钥管理", type: "password" },
    base_url: { label: "Base URL", hint: "默认 https://ark.cn-beijing.volces.com/api/coding/v3" },
    model: { label: "模型名", hint: "例如 Doubao-Seed-2.0-pro" },
  },
  smtp: {
    password: { label: "邮箱密码 / 授权码", type: "password" },
    host: { label: "SMTP 主机" },
    port: { label: "端口", type: "number" },
    username: { label: "用户名（邮箱）" },
    from_addr: { label: "发件人 From" },
    use_tls: { label: "启用 STARTTLS", type: "switch" },
  },
};

function metaFor(schemaKey: string, fieldKey: string) {
  return FIELD_META[schemaKey]?.[fieldKey] ?? { label: fieldKey };
}

export type IntegrationFormValues = {
  secrets: Record<string, string>;
  config: Record<string, unknown>;
  label: string;
};

function initialValues(
  schema: ProviderSchema,
  current: IntegrationSummary | undefined,
): IntegrationFormValues {
  const config: Record<string, unknown> = {};
  for (const key of schema.configKeys) {
    const fromCurrent = current?.config?.[key];
    const fallback = (schema.configDefaults ?? {})[key];
    config[key] = fromCurrent !== undefined && fromCurrent !== null && fromCurrent !== ""
      ? fromCurrent
      : (fallback ?? "");
  }
  const secrets: Record<string, string> = {};
  for (const key of schema.secretKeys) secrets[key] = "";
  return {
    secrets,
    config,
    label: current?.label ?? "",
  };
}

export function IntegrationForm({
  schema,
  current,
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
}: {
  schema: ProviderSchema;
  current?: IntegrationSummary;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (values: IntegrationFormValues) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<IntegrationFormValues>(() =>
    initialValues(schema, current),
  );

  // Schema / current 切换时同步重置；否则在同一 Modal 里切不同 provider 会带脏状态。
  useEffect(() => {
    setValues(initialValues(schema, current));
  }, [schema, current]);

  const handleSecret = (key: string) => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, secrets: { ...v.secrets, [key]: e.target.value } }));
  };

  const handleConfig = (key: string, type: string | undefined) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = type === "switch"
        ? e.target.checked
        : type === "number"
          ? (e.target.value === "" ? "" : Number(e.target.value))
          : e.target.value;
      setValues((v) => ({ ...v, config: { ...v.config, [key]: raw } }));
    };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm text-text-secondary">{schema.description}</p>
      </div>

      {/* Label */}
      <label className="block">
        <span className="text-[11px] uppercase tracking-wider text-text-tertiary">备注（可选）</span>
        <input
          type="text"
          value={values.label}
          onChange={(e) => setValues((v) => ({ ...v, label: e.target.value }))}
          placeholder="例如：生产环境主密钥"
          className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
        />
      </label>

      {/* Secrets */}
      {schema.secretKeys.map((key) => {
        const meta = metaFor(schema.providerKey, key);
        const placeholder =
          current?.configured && current.keyHint
            ? `${current.keyHint}（留空保留原值）`
            : "请输入";
        return (
          <label key={key} className="block">
            <span className="text-[11px] uppercase tracking-wider text-text-tertiary">
              {meta.label}
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={values.secrets[key]}
              onChange={handleSecret(key)}
              placeholder={placeholder}
              className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
            />
            {meta.hint ? (
              <span className="mt-1 block text-[11px] text-text-tertiary">{meta.hint}</span>
            ) : null}
          </label>
        );
      })}

      {/* Config */}
      {schema.configKeys.map((key) => {
        const meta = metaFor(schema.providerKey, key);
        const type = meta.type ?? "text";
        const current = values.config[key];
        if (type === "switch") {
          return (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(current)}
                onChange={handleConfig(key, type)}
              />
              <span className="text-sm text-text-primary">{meta.label}</span>
            </label>
          );
        }
        return (
          <label key={key} className="block">
            <span className="text-[11px] uppercase tracking-wider text-text-tertiary">
              {meta.label}
            </span>
            <input
              type={type}
              value={(current ?? "") as string | number}
              onChange={handleConfig(key, type)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
            />
            {meta.hint ? (
              <span className="mt-1 block text-[11px] text-text-tertiary">{meta.hint}</span>
            ) : null}
          </label>
        );
      })}

      {errorMessage ? (
        <p className="rounded-md border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated disabled:opacity-60"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-700 disabled:opacity-60"
        >
          {submitting ? "保存中…" : "保存"}
        </button>
      </div>
    </form>
  );
}

export const FIELD_META_FOR_TESTS = FIELD_META;
