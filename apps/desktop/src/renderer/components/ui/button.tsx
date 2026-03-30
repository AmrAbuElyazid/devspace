import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 cursor-default",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground font-medium hover:brightness-110",
        secondary: "bg-secondary text-secondary-foreground hover:brightness-105",
        ghost: "hover:bg-accent/10 hover:text-foreground",
        destructive: "bg-destructive text-white hover:opacity-90",
        outline: "border border-border bg-background hover:bg-accent/10",
      },
      size: {
        default: "h-8 px-3 text-[13px]",
        sm: "h-7 px-2 text-[12px]",
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
