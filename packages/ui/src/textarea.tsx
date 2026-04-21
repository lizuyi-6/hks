/**
 * Textarea Component
 * 文本域组件 - 支持自动调整高度和多种变体
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const textareaVariants = cva(
  "flex w-full rounded-lg border bg-surface px-3 py-2 text-sm text-text-primary shadow-sm transition-all duration-fast placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[80px]",
  {
    variants: {
      variant: {
        default: "border-border hover:border-border-strong focus:border-primary-500",
        error:
          "border-error-500 hover:border-error-600 focus:border-error-500 focus:ring-error-500/20",
        success:
          "border-success-500 hover:border-success-600 focus:border-success-500 focus:ring-success-500/20",
      },
      size: {
        sm: "min-h-[60px] text-xs px-2.5 py-2",
        md: "min-h-[80px] text-sm px-3 py-2",
        lg: "min-h-[120px] text-base px-4 py-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {
  /** 错误提示文本 */
  error?: string;
  /** 帮助文本 */
  helperText?: string;
  /** 是否自动调整高度 */
  autoResize?: boolean;
  /** 最大高度（像素） */
  maxHeight?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      variant,
      size,
      error,
      helperText,
      autoResize = false,
      maxHeight = 400,
      ...props
    },
    ref
  ) => {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const inputVariant = error ? "error" : variant;

    // Auto-resize handler
    const handleInput = React.useCallback(
      (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
        if (autoResize && textareaRef.current) {
          const textarea = textareaRef.current;
          textarea.style.height = "auto";
          const newHeight = Math.min(textarea.scrollHeight, maxHeight);
          textarea.style.height = `${newHeight}px`;
        }
        // Call parent's onInput if provided
        const nativeOnInput = props.onInput as React.FormEventHandler<HTMLTextAreaElement>;
        nativeOnInput?.(e as React.FormEvent<HTMLTextAreaElement>);
      },
      [autoResize, maxHeight, props.onInput]
    );

    // Merge refs
    React.useImperativeHandle(ref, () => textareaRef.current!);

    return (
      <div className="w-full">
        <textarea
          className={cn(textareaVariants({ variant: inputVariant, size }), className)}
          ref={textareaRef}
          onInput={handleInput}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${props.id}-error` : helperText ? `${props.id}-helper` : undefined
          }
          {...props}
        />
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

Textarea.displayName = "Textarea";

export { Textarea, textareaVariants };
export default Textarea;
