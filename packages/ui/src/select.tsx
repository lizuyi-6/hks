/**
 * Select Component
 * 选择器组件 - 支持下拉选择
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const selectVariants = cva(
  "flex w-full items-center justify-between rounded-lg border bg-surface px-3 py-2 text-sm text-text-primary shadow-sm transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer",
  {
    variants: {
      variant: {
        default: "border-border hover:border-border-strong focus:border-primary-500",
        error:
          "border-error-500 hover:border-error-600 focus:border-error-500 focus:ring-error-500/20",
      },
      size: {
        sm: "h-8 px-2.5 text-xs",
        md: "h-10 px-3 text-sm",
        lg: "h-12 px-4 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size">,
    VariantProps<typeof selectVariants> {
  /** 选项数组 */
  options: SelectOption[];
  /** 错误提示文本 */
  error?: string;
  /** 帮助文本 */
  helperText?: string;
  /** 占位符 */
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      variant,
      size,
      error,
      helperText,
      options,
      placeholder,
      children,
      ...props
    },
    ref
  ) => {
    const inputVariant = error ? "error" : variant;

    return (
      <div className="w-full">
        <div className="relative">
          <select
            className={cn(selectVariants({ variant: inputVariant, size }), className)}
            ref={ref}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${props.id}-error` : helperText ? `${props.id}-helper` : undefined
            }
            {...props}
          >
            {placeholder && (
              <option value="" disabled>{placeholder}</option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
            {children}
          </select>
          {/* Dropdown arrow */}
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
        {error && (
          <p
            id={`${props.id}-error`}
            className="mt-1.5 text-xs text-error-500 animate-fade-in"
            role="alert"
          >
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${props.id}-helper`} className="mt-1.5 text-xs text-text-tertiary">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";

export { Select, selectVariants };
export default Select;
