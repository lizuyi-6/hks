/**
 * Modal/Dialog Component
 * 模态框组件 - 基于原生dialog元素
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";
import { Button } from "./button";

const modalVariants = cva(
  "fixed inset-0 z-modal flex items-center justify-center p-4",
  {
    variants: {
      position: {
        center: "items-center",
        top: "items-start pt-[10vh]",
        bottom: "items-end pb-[10vh]",
      },
    },
    defaultVariants: {
      position: "center",
    },
  }
);

const modalContentVariants = cva(
  "relative w-full bg-surface rounded-xl shadow-xl overflow-hidden animate-scale-in",
  {
    variants: {
      size: {
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-lg",
        xl: "max-w-xl",
        "2xl": "max-w-2xl",
        full: "max-w-full mx-4",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

export interface ModalProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof modalVariants>,
    VariantProps<typeof modalContentVariants> {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 点击蒙层是否关闭 */
  closeOnOverlayClick?: boolean;
  /** 按ESC是否关闭 */
  closeOnEsc?: boolean;
  /** 是否显示关闭按钮 */
  showCloseButton?: boolean;
  /** 标题 */
  title?: string;
  /** 描述 */
  description?: string;
}

const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      className,
      position,
      size,
      open,
      onClose,
      closeOnOverlayClick = true,
      closeOnEsc = true,
      showCloseButton = true,
      title,
      description,
      children,
      ...props
    },
    ref
  ) => {
    const overlayRef = React.useRef<HTMLDivElement>(null);

    // Handle ESC key
    React.useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && open && closeOnEsc) {
          onClose();
        }
      };

      if (open) {
        document.addEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "hidden";
      }

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
      };
    }, [open, closeOnEsc, onClose]);

    // Handle overlay click
    const handleOverlayClick = (e: React.MouseEvent) => {
      if (e.target === overlayRef.current && closeOnOverlayClick) {
        onClose();
      }
    };

    if (!open) return null;

    return (
      <div
        ref={overlayRef}
        className={cn(modalVariants({ position }))}
        onClick={handleOverlayClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        aria-describedby={description ? "modal-description" : undefined}
      >
        {/* Backdrop */}
        <div className="fixed inset-0 bg-surface-overlay/50 backdrop-blur-sm animate-fade-in" />

        {/* Modal Content */}
        <div
          ref={ref}
          className={cn(modalContentVariants({ size }), className)}
          {...props}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-border">
              <div className="flex-1">
                {title && (
                  <h3
                    id="modal-title"
                    className="text-lg font-semibold text-text-primary"
                  >
                    {title}
                  </h3>
                )}
                {description && (
                  <p id="modal-description" className="mt-1 text-sm text-text-secondary">
                    {description}
                  </p>
                )}
              </div>
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-text-tertiary hover:text-text-primary hover:bg-neutral-100 transition-colors"
                  aria-label="关闭"
                >
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
                </button>
              )}
            </div>
          )}

          {/* Body */}
          <div className={cn("px-6 py-4", !title && !showCloseButton && "pt-6")}>
            {children}
          </div>
        </div>
      </div>
    );
  }
);

Modal.displayName = "Modal";

// ========================================
// Modal Footer
// ========================================

export interface ModalFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 确认按钮文本 */
  confirmLabel?: string;
  /** 取消按钮文本 */
  cancelLabel?: string;
  /** 确认回调 */
  onConfirm?: () => void;
  /** 取消回调 */
  onCancel?: () => void;
  /** 确认按钮loading状态 */
  confirmLoading?: boolean;
  /** 确认按钮变体 */
  confirmVariant?: "primary" | "danger";
  /** 是否显示取消按钮 */
  showCancel?: boolean;
}

const ModalFooter = React.forwardRef<HTMLDivElement, ModalFooterProps>(
  (
    {
      className,
      confirmLabel = "确认",
      cancelLabel = "取消",
      onConfirm,
      onCancel,
      confirmLoading = false,
      confirmVariant = "primary",
      showCancel = true,
      children,
      ...props
    },
    ref
  ) => {
    if (children) {
      return (
        <div
          ref={ref}
          className={cn(
            "flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-surface-sunken/50",
            className
          )}
          {...props}
        >
          {children}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-surface-sunken/50",
          className
        )}
        {...props}
      >
        {showCancel && (
          <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        )}
        <Button
          variant={confirmVariant}
          loading={confirmLoading}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    );
  }
);

ModalFooter.displayName = "ModalFooter";

// ========================================
// Alert Dialog (for simple confirmations)
// ========================================

export interface AlertDialogProps extends Omit<ModalProps, "children"> {
  /** 确认按钮文本 */
  confirmLabel?: string;
  /** 取消按钮文本 */
  cancelLabel?: string;
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
  /** 类型 */
  type?: "info" | "warning" | "error" | "success";
  /** 确认按钮loading状态 */
  confirmLoading?: boolean;
}

const AlertDialog: React.FC<AlertDialogProps> = ({
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  onConfirm,
  onCancel,
  type = "info",
  confirmLoading = false,
  ...modalProps
}) => {
  const iconConfig = {
    info: {
      color: "text-info-500",
      bg: "bg-info-50",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    warning: {
      color: "text-warning-500",
      bg: "bg-warning-50",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    error: {
      color: "text-error-500",
      bg: "bg-error-50",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    success: {
      color: "text-success-500",
      bg: "bg-success-50",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  };

  const config = iconConfig[type];

  return (
    <Modal
      {...modalProps}
      onClose={onCancel}
      size="sm"
      showCloseButton={false}
    >
      <div className="flex flex-col items-center text-center py-2">
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-full mb-4", config.bg, config.color)}>
          {config.icon}
        </div>
        {title && (
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        )}
        {description && (
          <p className="mt-2 text-sm text-text-secondary">{description}</p>
        )}
      </div>
      <ModalFooter
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmLoading={confirmLoading}
        confirmVariant={type === "error" ? "danger" : "primary"}
      />
    </Modal>
  );
};

export { Modal, modalVariants, modalContentVariants };
export { ModalFooter };
export { AlertDialog };
