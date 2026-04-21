/**
 * Stepper Component
 * 步骤条组件 - 用于显示多步骤进度
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const stepperVariants = cva("flex w-full", {
  variants: {
    orientation: {
      horizontal: "flex-row items-start",
      vertical: "flex-col",
    },
    size: {
      sm: "gap-1",
      md: "gap-2",
      lg: "gap-4",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
    size: "md",
  },
});

const stepVariants = cva("flex flex-col items-center text-center", {
  variants: {
    orientation: {
      horizontal: "flex-1",
      vertical: "flex-row items-center w-full",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

const stepIndicatorVariants = cva(
  "flex items-center justify-center rounded-full font-semibold transition-all duration-normal",
  {
    variants: {
      status: {
        pending: "bg-neutral-200 text-neutral-500",
        current: "bg-primary-500 text-white ring-4 ring-primary-500/20",
        completed: "bg-success-500 text-white",
        error: "bg-error-500 text-white",
      },
      size: {
        sm: "h-6 w-6 text-xs",
        md: "h-8 w-8 text-sm",
        lg: "h-10 w-10 text-base",
      },
    },
    defaultVariants: {
      status: "pending",
      size: "md",
    },
  }
);

export interface Step {
  /** 步骤名称 */
  name: string;
  /** 步骤描述 */
  description?: string;
  /** 可选图标 */
  icon?: React.ReactNode;
}

export interface StepperProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof stepperVariants> {
  /** 步骤数组 */
  steps: Step[];
  /** 当前步骤索引 */
  currentIndex: number;
  /** 是否有错误 */
  hasError?: boolean;
  /** 错误步骤索引 */
  errorIndex?: number;
}

const Stepper = React.forwardRef<HTMLDivElement, StepperProps>(
  (
    {
      className,
      steps,
      currentIndex,
      hasError,
      errorIndex,
      orientation,
      size,
      ...props
    },
    ref
  ) => {
    const getStepStatus = (index: number): "pending" | "current" | "completed" | "error" => {
      if (hasError && errorIndex === index) return "error";
      if (index < currentIndex) return "completed";
      if (index === currentIndex) return "current";
      return "pending";
    };

    return (
      <div
        ref={ref}
        className={cn(stepperVariants({ orientation, size }), className)}
        {...props}
      >
        {steps.map((step, index) => {
          const status = getStepStatus(index);
          const isLast = index === steps.length - 1;

          return (
            <div
              key={index}
              className={cn(
                stepVariants({ orientation }),
                orientation === "vertical" && !isLast && "pb-4"
              )}
            >
              <div className="flex items-center w-full">
                {/* Step indicator */}
                <div
                  className={cn(
                    stepIndicatorVariants({ status, size }),
                    "shrink-0"
                  )}
                  aria-current={status === "current" ? "step" : undefined}
                >
                  {status === "completed" ? (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : status === "current" ? (
                    step.icon || (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    )
                  ) : status === "error" ? (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>

                {/* Connector line */}
                {!isLast && orientation === "horizontal" && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 mx-2 transition-colors duration-normal",
                      index < currentIndex ? "bg-success-500" : "bg-neutral-200"
                    )}
                  />
                )}

                {/* Connector line for vertical */}
                {!isLast && orientation === "vertical" && (
                  <div
                    className={cn(
                      "w-0.5 h-full ml-4 mt-2 transition-colors duration-normal",
                      index < currentIndex ? "bg-success-500" : "bg-neutral-200"
                    )}
                  />
                )}
              </div>

              {/* Step label */}
              <div
                className={cn(
                  "mt-2",
                  orientation === "vertical" && "ml-3 mt-0 text-left flex-1"
                )}
              >
                <p
                  className={cn(
                    "text-sm font-medium",
                    status === "current" && "text-primary-600",
                    status === "completed" && "text-success-600",
                    status === "error" && "text-error-600",
                    status === "pending" && "text-text-tertiary"
                  )}
                >
                  {step.name}
                </p>
                {step.description && (
                  <p
                    className={cn(
                      "mt-0.5 text-xs",
                      status === "current"
                        ? "text-text-secondary"
                        : "text-text-muted"
                    )}
                  >
                    {step.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);

Stepper.displayName = "Stepper";

export { Stepper, stepperVariants, stepIndicatorVariants };
export default Stepper;
