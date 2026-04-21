"use client";

/**
 * Lightweight i18n scaffold for the workspace.
 *
 * Real internationalization (per-locale bundles, ICU messages, lazy
 * loading, etc.) is out of scope for the competition build — but hard-
 * coding Chinese strings everywhere makes any future bilingual demo
 * painful. This module gives us:
 *
 *   - a single source of truth (`DEFAULT_MESSAGES`) for the small set of
 *     keys already wired through the UI;
 *   - a `t(key, fallback)` helper that prefers the active locale dict,
 *     then `DEFAULT_MESSAGES`, then the provided fallback;
 *   - a `useLocale()` hook backed by `localStorage.locale` so a future
 *     i18n toggle can live in the topbar without any component rewrite.
 *
 * Components should use it like:
 *
 *     const { t } = useI18n();
 *     t("workspace.empty.leads", "暂无线索")
 *
 * Falling back to the Chinese literal keeps things readable while we
 * gradually extract strings.
 */

import { useEffect, useMemo, useState } from "react";

export type Locale = "zh-CN" | "en-US";

type MessageDict = Record<string, string>;

const DEFAULT_MESSAGES: Record<Locale, MessageDict> = {
  "zh-CN": {
    "common.loading": "加载中…",
    "common.retry": "重试",
    "common.cancel": "取消",
    "common.confirm": "确认",
    "common.save": "保存",
    "common.back": "返回",
    "common.next": "下一步",
    "common.prev": "上一步",
    "common.submit": "提交",
    "common.empty": "暂无数据",
    "common.unknown": "—",

    "workspace.empty.leads": "暂无线索",
    "workspace.empty.push": "暂无推送记录",
    "workspace.empty.orders": "暂无订单",
    "workspace.empty.assets": "暂无 IP 资产",

    "push.wizard.title": "新建场景推送规则",
    "push.wizard.step.template": "选择起点模板",
    "push.wizard.step.trigger": "配置触发",
    "push.wizard.step.content": "编辑推送文案",
    "push.wizard.step.review": "预览并提交",
  },
  "en-US": {
    "common.loading": "Loading…",
    "common.retry": "Retry",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.save": "Save",
    "common.back": "Back",
    "common.next": "Next",
    "common.prev": "Prev",
    "common.submit": "Submit",
    "common.empty": "No data",
    "common.unknown": "—",

    "workspace.empty.leads": "No leads yet",
    "workspace.empty.push": "No pushes yet",
    "workspace.empty.orders": "No orders yet",
    "workspace.empty.assets": "No IP assets yet",

    "push.wizard.title": "New scenario push rule",
    "push.wizard.step.template": "Pick a starting template",
    "push.wizard.step.trigger": "Configure trigger",
    "push.wizard.step.content": "Write push content",
    "push.wizard.step.review": "Review and submit",
  },
};

function detectLocale(): Locale {
  if (typeof window === "undefined") return "zh-CN";
  const saved = window.localStorage.getItem("locale");
  if (saved === "zh-CN" || saved === "en-US") return saved;
  const nav = window.navigator.language?.toLowerCase() ?? "";
  if (nav.startsWith("en")) return "en-US";
  return "zh-CN";
}

export function useLocale(): [Locale, (next: Locale) => void] {
  const [locale, setLocaleState] = useState<Locale>("zh-CN");
  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);
  const setLocale = (next: Locale) => {
    try {
      window.localStorage.setItem("locale", next);
    } catch {
      // ignore storage errors — still update state
    }
    setLocaleState(next);
  };
  return [locale, setLocale];
}

export function useI18n(): {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, fallback?: string) => string;
} {
  const [locale, setLocale] = useLocale();
  const t = useMemo(() => {
    const dict = DEFAULT_MESSAGES[locale] ?? DEFAULT_MESSAGES["zh-CN"];
    const fallbackDict = DEFAULT_MESSAGES["zh-CN"];
    return (key: string, fallback?: string) =>
      dict[key] ?? fallbackDict[key] ?? fallback ?? key;
  }, [locale]);
  return { locale, setLocale, t };
}

/** Non-hook variant for use outside React components. */
export function translate(key: string, fallback?: string): string {
  const locale: Locale =
    typeof window !== "undefined"
      ? ((window.localStorage.getItem("locale") as Locale) || "zh-CN")
      : "zh-CN";
  const dict = DEFAULT_MESSAGES[locale] ?? DEFAULT_MESSAGES["zh-CN"];
  const fallbackDict = DEFAULT_MESSAGES["zh-CN"];
  return dict[key] ?? fallbackDict[key] ?? fallback ?? key;
}
