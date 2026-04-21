/**
 * Badge Component
 * 徽章组件 - 用于显示状态、标签等
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20",
  {
    variants: {
      variant: {
        // 主要变体
        primary: "bg-primary-100 text-primary-700",
        secondary: "bg-neutral-100 text-neutral-700",
        outline: "border border-border bg-transparent text-text-secondary",
        ghost: "bg-transparent text-text-tertiary",

        // 语义变体
        success: "bg-success-100 text-success-700",
        warning: "bg-warning-100 text-warning-700",
        error: "bg-error-100 text-error-700",
        info: "bg-info-100 text-info-700",

        // 状态变体
        default: "bg-neutral-100 text-neutral-700",
        active: "bg-primary-500 text-white",
        inactive: "bg-neutral-200 text-neutral-500",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        md: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** 圆点指示器 */
  dot?: boolean;
  /** 脉冲动画 */
  pulse?: boolean;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, dot, pulse, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      >
        {dot && (
          <span
            className={cn(
              "mr-1.5 h-1.5 w-1.5 rounded-full",
              pulse && "animate-ping",
              variant === "success" && "bg-success-500",
              variant === "warning" && "bg-warning-500",
              variant === "error" && "bg-error-500",
              variant === "info" && "bg-info-500",
              (variant === "default" || variant === "primary") && "bg-primary-500",
              variant === "active" && "bg-white",
            )}
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";

export { Badge, badgeVariants };
export default Badge;
