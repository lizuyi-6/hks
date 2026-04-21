/**
 * Workspace Shared Components
 * 生产力工作区共享组件 — 基于 Card/Button/Input/Badge/Alert 新设计系统
 */

"use client";

import type { ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./card";
import { Button } from "./button";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Badge } from "./badge";
import { Alert } from "./alert";

// ========================================
// WorkspaceCard — 替代 SectionCard
// ========================================

export function WorkspaceCard({
  title,
  eyebrow,
  actions,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card variant="default" padding="md" className={className}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="mb-1 text-xs font-medium text-text-tertiary">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </Card>
  );
}

// ========================================
// SubmitButton — 带加载态的提交按钮
// ========================================

export function SubmitButton({
  loading,
  loadingText,
  children,
  ...props
}: {
  loading: boolean;
  loadingText?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      variant="primary"
      size="lg"
      loading={loading}
      loadingText={loadingText}
      disabled={loading || props.disabled}
      type={props.type ?? "submit"}
      {...props}
    >
      {children}
    </Button>
  );
}

// ========================================
// FormInput — 带 label 的输入框
// ========================================

export function FormInput(props: {
  label?: string;
  id?: string;
  type?: string;
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  value?: string;
  readOnly?: boolean;
  autoComplete?: string;
  min?: string | number;
  max?: string | number;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
}) {
  const { label, id, ...rest } = props;
  const inputId = id ?? rest.name;
  return (
    <div className="w-full">
      {label && inputId ? (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-text-primary">
          {label}
        </label>
      ) : null}
      <Input id={inputId} size="md" {...rest} />
    </div>
  );
}

// ========================================
// FormTextarea — 带 label 的文本域
// ========================================

export function FormTextarea({
  label,
  id,
  ...props
}: {
  label?: string;
  id?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const inputId = id ?? props.name;
  return (
    <div className="w-full">
      {label && inputId ? (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-text-primary">
          {label}
        </label>
      ) : null}
      <Textarea id={inputId} size="md" {...props} />
    </div>
  );
}

// ========================================
// DisclaimerBox — 免责声明
// ========================================

export function DisclaimerBox({ children }: { children: ReactNode }) {
  return (
    <Alert variant="warning" showIcon={true}>
      {children}
    </Alert>
  );
}

// ========================================
// StreamingPanel — SSE 流式面板
// ========================================

export function StreamingPanel({
  text,
  label = "正在生成...",
}: {
  text: string;
  label?: string;
}) {
  if (!text) return null;
  return (
    <Card variant="outline" padding="md">
      <p className="leading-7 text-text-primary whitespace-pre-wrap">{text}</p>
      <div className="mt-2 flex items-center gap-2 text-sm text-text-tertiary">
        <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-primary-500" />
        {label}
      </div>
    </Card>
  );
}

// ========================================
// TabBar — 统一 tab 栏
// ========================================

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            active === t.key
              ? "border-primary-500 text-primary-500"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ========================================
// DataTag — 数据来源标签（替代 SourceTag）
// ========================================

export function DataTag({ mode, provider }: { mode: string; provider: string }) {
  const modeLabels: Record<string, string> = { real: "真实", mock: "模拟" };
  return (
    <Badge variant="outline" size="sm">
      <span className="font-medium">{modeLabels[mode] ?? mode}</span>
      <span className="mx-1 text-text-muted">·</span>
      <span>{provider}</span>
    </Badge>
  );
}
