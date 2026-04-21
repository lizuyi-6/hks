"use client";

/**
 * FloatingAgent — 悬浮 AI 法务大脑入口。
 * 出现在 C/B 端所有页面的右下角，点击后跳转到 /consult。
 * 支持简短输入 → 提交后以 ?prefill=... 的形式带入咨询页。
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@a1plus/ui";

export function FloatingAgent({ hidden = false }: { hidden?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (hidden) return null;

  const submit = () => {
    const q = value.trim();
    const url = q ? `/consult?prefill=${encodeURIComponent(q)}` : "/consult";
    setOpen(false);
    setValue("");
    router.push(url);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[800] flex flex-col items-end gap-3">
      {open && (
        <div className="w-[320px] rounded-xl border border-border bg-surface shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-surface-elevated px-4 py-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-[11px] font-semibold text-text-inverse">
              A1
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-text-primary">A1+ 法务大脑</div>
              <div className="text-[11px] text-text-tertiary">需求画像 · 智能匹配 · 在线咨询</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-text-tertiary hover:text-text-primary"
              aria-label="关闭"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
          <div className="p-3">
            <textarea
              className="w-full min-h-[84px] resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary-500 focus:outline-none"
              placeholder="用一句话描述你的需求，例如：做跨境电商，刚起了产品名字，想尽快注册商标..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-text-tertiary">Enter 发送 · Shift+Enter 换行</span>
              <button
                onClick={submit}
                className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-700"
              >
                唤醒 AI
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {QUICK_STARTERS.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setValue(q);
                  }}
                  className="rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-[11px] text-text-secondary hover:border-primary-500 hover:text-primary-600"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-text-inverse shadow-xl transition-transform hover:scale-105",
          open && "rotate-0",
        )}
        aria-label="打开 AI 法务大脑"
        title="打开 AI 法务大脑"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a7 7 0 0 1 7 7v3l1.5 2.5a1 1 0 0 1-.9 1.5H4.4a1 1 0 0 1-.9-1.5L5 13v-3a7 7 0 0 1 7-7z" />
          <path strokeLinecap="round" d="M9 19a3 3 0 0 0 6 0" />
        </svg>
      </button>
    </div>
  );
}

const QUICK_STARTERS = [
  "帮我找律师",
  "商标被驳回怎么办",
  "合同帮我把关",
  "做一次合规体检",
];
