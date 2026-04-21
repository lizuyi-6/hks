/**
 * Card Component
 * 卡片组件 - 容器组件，支持多种变体
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const cardVariants = cva(
  // Base styles
  "rounded-md bg-surface text-text-primary transition-all duration-normal",
  {
    variants: {
      variant: {
        default: "border border-border",
        elevated: "border border-border shadow-lg",
        ghost: "border-0 shadow-none bg-transparent",
        outline: "border-2 border-border bg-transparent",
      },
      padding: {
        none: "",
        sm: "p-4",
        md: "p-6",
        lg: "p-8",
      },
      hoverable: {
        true: "cursor-pointer hover:shadow-lg hover:-translate-y-0.5",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
      hoverable: false,
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, hoverable, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant, padding, hoverable }), className)}
        {...props}
      />
    );
  }
);

Card.displayName = "Card";

// ========================================
// Card Header
// ========================================

const cardHeaderVariants = cva("flex flex-col space-y-1.5", {
  variants: {
    padding: {
      none: "",
      sm: "p-4",
      md: "p-6",
      lg: "p-8",
    },
  },
  defaultVariants: {
    padding: "md",
  },
});

export interface CardHeaderProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardHeaderVariants> {}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, padding, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardHeaderVariants({ padding }), className)}
        {...props}
      />
    );
  }
);

CardHeader.displayName = "CardHeader";

// ========================================
// Card Title
// ========================================

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
  return (
    <h3
      ref={ref}
      className={cn(
        "text-lg font-semibold leading-none tracking-tight text-text-primary",
        className
      )}
      {...props}
    />
  );
});

CardTitle.displayName = "CardTitle";

// ========================================
// Card Description
// ========================================

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={cn("text-sm text-text-secondary", className)}
      {...props}
    />
  );
});

CardDescription.displayName = "CardDescription";

// ========================================
// Card Content
// ========================================

const cardContentVariants = cva("", {
  variants: {
    padding: {
      none: "",
      sm: "px-4 pb-4",
      md: "px-6 pb-6",
      lg: "px-8 pb-8",
    },
  },
  defaultVariants: {
    padding: "md",
  },
});

export interface CardContentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardContentVariants> {}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, padding, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardContentVariants({ padding }), className)}
        {...props}
      />
    );
  }
);

CardContent.displayName = "CardContent";

// ========================================
// Card Footer
// ========================================

const cardFooterVariants = cva(
  "flex items-center",
  {
    variants: {
      padding: {
        none: "",
        sm: "px-4 pb-4",
        md: "px-6 pb-6",
        lg: "px-8 pb-8",
      },
      align: {
        start: "justify-start",
        center: "justify-center",
        end: "justify-end",
        between: "justify-between",
      },
    },
    defaultVariants: {
      padding: "md",
      align: "between",
    },
  }
);

export interface CardFooterProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardFooterVariants> {}

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, padding, align, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardFooterVariants({ padding, align }), className)}
        {...props}
      />
    );
  }
);

CardFooter.displayName = "CardFooter";

// ========================================
// Exports
// ========================================

export { Card, cardVariants };
export { CardHeader, cardHeaderVariants };
export { CardTitle };
export { CardDescription };
export { CardContent, cardContentVariants };
export { CardFooter, cardFooterVariants };
