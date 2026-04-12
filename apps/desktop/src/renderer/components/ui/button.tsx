import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 cursor-default",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:brightness-110",
        secondary: "bg-secondary text-secondary-foreground hover:bg-surface-hover",
        ghost: "hover:bg-surface-hover hover:text-foreground",
        destructive: "bg-destructive text-white shadow-sm hover:opacity-90",
        outline: "border border-border bg-background text-foreground hover:bg-surface-hover",
      },
      size: {
        default: "h-8 px-3.5 text-[13px]",
        sm: "h-7 px-2.5 text-[12px]",
        xs: "h-6 px-1.5 text-[11px]",
        icon: "h-7 w-7",
        "icon-sm": "h-6 w-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
export type { ButtonProps };
