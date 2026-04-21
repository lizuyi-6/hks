/**
 * Loading Components
 * 加载状态组件 - Spinner, Dots, Skeleton
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

// ========================================
// Spinner Loading
// ========================================

const spinnerVariants = cva("animate-spin", {
  variants: {
    size: {
      sm: "h-4 w-4",
      md: "h-6 w-6",
      lg: "h-8 w-8",
      xl: "h-12 w-12",
    },
    variant: {
      primary: "text-primary-500",
      secondary: "text-text-secondary",
      muted: "text-text-muted",
      white: "text-white",
    },
  },
  defaultVariants: {
    size: "md",
    variant: "primary",
  },
});

export interface SpinnerProps
  extends React.SVGAttributes<SVGSVGElement>,
    VariantProps<typeof spinnerVariants> {}

const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ className, size, variant, ...props }, ref) => {
    return (
      <svg
        ref={ref}
        className={cn(spinnerVariants({ size, variant }), className)}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
        {...props}
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    );
  }
);

Spinner.displayName = "Spinner";

// ========================================
// Dots Loading
// ========================================

const dotsVariants = cva("flex items-center gap-1", {
  variants: {
    size: {
      sm: "gap-0.5",
      md: "gap-1",
      lg: "gap-1.5",
      xl: "gap-2",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const dotVariants = cva("rounded-full animate-bounce", {
  variants: {
    size: {
      sm: "h-1.5 w-1.5",
      md: "h-2 w-2",
      lg: "h-3 w-3",
      xl: "h-4 w-4",
    },
    variant: {
      primary: "bg-primary-500",
      secondary: "bg-text-secondary",
      muted: "bg-text-muted",
      white: "bg-white",
    },
  },
  defaultVariants: {
    size: "md",
    variant: "primary",
  },
});

export interface DotsProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof dotsVariants>,
    VariantProps<typeof dotVariants> {}

const Dots = React.forwardRef<HTMLDivElement, DotsProps>(
  ({ className, size, variant, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(dotsVariants({ size }), className)}
        aria-label="Loading"
        {...props}
      >
        <span
          className={cn(dotVariants({ size, variant }))}
          style={{ animationDelay: "0ms" }}
        />
        <span
          className={cn(dotVariants({ size, variant }))}
          style={{ animationDelay: "150ms" }}
        />
        <span
          className={cn(dotVariants({ size, variant }))}
          style={{ animationDelay: "300ms" }}
        />
      </div>
    );
  }
);

Dots.displayName = "Dots";

// ========================================
// Skeleton Loading
// ========================================

const skeletonVariants = cva(
  "animate-shimmer bg-gradient-to-r from-neutral-100 via-neutral-200 to-neutral-100 bg-[length:200%_100%]",
  {
    variants: {
      variant: {
        text: "rounded",
        circular: "rounded-full",
        rectangular: "rounded-lg",
      },
    },
    defaultVariants: {
      variant: "text",
    },
  }
);

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {
  /** 宽度 */
  width?: string | number;
  /** 高度 */
  height?: string | number;
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant, width, height, style, ...props }, ref) => {
    const styles: React.CSSProperties = {
      width: width,
      height: height,
      ...style,
    };

    return (
      <div
        ref={ref}
        className={cn(skeletonVariants({ variant }), className)}
        style={styles}
        aria-hidden="true"
        {...props}
      />
    );
  }
);

Skeleton.displayName = "Skeleton";

// ========================================
// Loading Wrapper
// ========================================

export interface LoadingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 是否显示加载状态 */
  loading: boolean;
  /** 加载提示文本 */
  text?: string;
  /** 加载类型 */
  type?: "spinner" | "dots" | "skeleton";
  /** 加载动画大小 */
  size?: "sm" | "md" | "lg" | "xl";
  /** 是否覆盖整个容器 */
  overlay?: boolean;
  /** 子元素 */
  children?: React.ReactNode;
}

const Loading = React.forwardRef<HTMLDivElement, LoadingProps>(
  (
    {
      className,
      loading,
      text,
      type = "spinner",
      size = "md",
      overlay = false,
      children,
      ...props
    },
    ref
  ) => {
    if (!loading) {
      return <>{children}</>;
    }

    const LoadingIcon = type === "dots" ? <Dots size={size} /> : <Spinner size={size} />;

    if (overlay && children) {
      return (
        <div ref={ref} className={cn("relative", className)} {...props}>
          <div className="opacity-50 pointer-events-none">{children}</div>
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/50 backdrop-blur-sm rounded-lg">
            {LoadingIcon}
            {text && <p className="mt-2 text-sm text-text-secondary">{text}</p>}
          </div>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center p-8",
          className
        )}
        {...props}
      >
        {LoadingIcon}
        {text && <p className="mt-3 text-sm text-text-secondary">{text}</p>}
      </div>
    );
  }
);

Loading.displayName = "Loading";

// ========================================
// Exports
// ========================================

export { Spinner, spinnerVariants };
export { Dots, dotsVariants };
export { Skeleton, skeletonVariants };
export { Loading };
