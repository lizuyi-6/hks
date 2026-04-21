/**
 * Empty State Component
 * 空状态组件 - 当没有数据时显示
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";
import { Button } from "./button";

const emptyVariants = cva(
  "flex flex-col items-center justify-center text-center p-8 animate-fade-in",
  {
    variants: {
      size: {
        sm: "p-4",
        md: "p-8",
        lg: "p-12",
      },
      variant: {
        default: "",
        card: "rounded-xl border border-dashed border-border bg-surface/50",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "default",
    },
  }
);

export interface EmptyProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof emptyVariants> {
  /** 图标 */
  icon?: React.ReactNode;
  /** 标题 */
  title?: string;
  /** 描述 */
  description?: string;
  /** 操作按钮文本 */
  actionLabel?: string;
  /** 操作按钮点击回调 */
  onAction?: () => void;
  /** 自定义操作区域 */
  action?: React.ReactNode;
}

const Empty = React.forwardRef<HTMLDivElement, EmptyProps>(
  (
    {
      className,
      size,
      variant,
      icon,
      title,
      description,
      actionLabel,
      onAction,
      action,
      ...props
    },
    ref
  ) => {
    // Default empty icon
    const DefaultIcon = (
      <svg
        className="w-12 h-12 text-text-muted"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
      </svg>
    );

    return (
      <div
        ref={ref}
        className={cn(emptyVariants({ size, variant }), className)}
        role="status"
        aria-live="polite"
        {...props}
      >
        <div className="flex flex-col items-center max-w-sm">
          {icon ? (
            <div className="mb-4 text-text-muted">{icon}</div>
          ) : (
            <div className="mb-4">{DefaultIcon}</div>
          )}

          {title && (
            <h3 className="text-base font-medium text-text-primary mb-1">{title}</h3>
          )}

          {description && (
            <p className="text-sm text-text-secondary mb-4">{description}</p>
          )}

          {action ? (
            <div className="mt-2">{action}</div>
          ) : actionLabel ? (
            <Button variant="secondary" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }
);

Empty.displayName = "Empty";

export { Empty, emptyVariants };
export default Empty;
