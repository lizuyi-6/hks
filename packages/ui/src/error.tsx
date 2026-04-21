/**
 * Error State Component
 * 错误状态组件 - 当发生错误时显示
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";
import { Button } from "./button";

const errorVariants = cva(
  "flex flex-col items-center justify-center text-center p-8 animate-fade-in",
  {
    variants: {
      size: {
        sm: "p-4 gap-2",
        md: "p-8 gap-3",
        lg: "p-12 gap-4",
      },
      variant: {
        default: "",
        card: "rounded-xl border border-error-200 bg-error-50/50",
        inline: "flex-row p-0 text-left items-start",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "default",
    },
  }
);

export interface ErrorProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof errorVariants> {
  /** 错误标题 */
  title?: string;
  /** 错误描述 */
  description?: string;
  /** 错误代码/详情 */
  code?: string;
  /** 重试按钮文本 */
  retryLabel?: string;
  /** 重试回调 */
  onRetry?: () => void;
  /** 自定义操作区域 */
  action?: React.ReactNode;
}

const Error = React.forwardRef<HTMLDivElement, ErrorProps>(
  (
    {
      className,
      size,
      variant,
      title = "出错了",
      description = "抱歉，发生了一些问题。请稍后重试。",
      code,
      retryLabel = "重试",
      onRetry,
      action,
      ...props
    },
    ref
  ) => {
    // Error icon
    const ErrorIcon = (
      <svg
        className="w-12 h-12 text-error-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    );

    const InlineIcon = (
      <svg
        className="w-5 h-5 text-error-500 flex-shrink-0 mt-0.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );

    if (variant === "inline") {
      return (
        <div
          ref={ref}
          className={cn(errorVariants({ size, variant }), className)}
          role="alert"
          aria-live="assertive"
          {...props}
        >
          {InlineIcon}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-error-700">{title}</p>
            {description && (
              <p className="text-sm text-error-600 mt-0.5">{description}</p>
            )}
            {code && (
              <code className="mt-1 text-xs text-error-500 font-mono">{code}</code>
            )}
          </div>
          {(onRetry || action) && (
            <div className="flex-shrink-0">
              {action || (
                <Button variant="ghost" size="sm" onClick={onRetry}>
                  {retryLabel}
                </Button>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(errorVariants({ size, variant }), className)}
        role="alert"
        aria-live="assertive"
        {...props}
      >
        <div className="mb-4">{ErrorIcon}</div>

        <h3 className="text-lg font-medium text-error-700">{title}</h3>

        {description && (
          <p className="mt-1 text-sm text-error-600 max-w-xs">{description}</p>
        )}

        {code && (
          <code className="mt-3 px-2 py-1 rounded bg-error-100 text-error-700 text-xs font-mono">
            {code}
          </code>
        )}

        {(onRetry || action) && (
          <div className="mt-4">
            {action || (
              <Button variant="secondary" onClick={onRetry}>
                {retryLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }
);

Error.displayName = "Error";

export { Error, errorVariants };
export default Error;
