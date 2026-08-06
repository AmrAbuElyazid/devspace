"use client";

import * as React from "react";

import * as ToolbarPrimitive from "@radix-ui/react-toolbar";
import { type VariantProps, cva } from "class-variance-authority";
import { ChevronDown } from "lucide-react";

import { cn } from "../lib/cn";
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuSeparator } from "./dropdown-menu";
import { Separator } from "./separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function Toolbar({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Root>) {
  return (
    <ToolbarPrimitive.Root
      className={cn("relative flex select-none items-center", className)}
      {...props}
    />
  );
}

export function ToolbarToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.ToolbarToggleGroup>) {
  return (
    <ToolbarPrimitive.ToolbarToggleGroup
      className={cn("flex items-center", className)}
      {...props}
    />
  );
}

export function ToolbarLink({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Link>) {
  return (
    <ToolbarPrimitive.Link
      className={cn("font-medium underline underline-offset-4", className)}
      {...props}
    />
  );
}

export function ToolbarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Separator>) {
  return (
    <ToolbarPrimitive.Separator
      className={cn("mx-2 my-1 w-px shrink-0 bg-border", className)}
      {...props}
    />
  );
}

const toolbarButtonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-ui-sm outline-none transition-[background-color,color] hover:bg-row-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-soft disabled:pointer-events-none disabled:opacity-50 aria-checked:bg-row-active aria-checked:text-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-7 min-w-7 px-2",
        lg: "h-8 min-w-8 px-2.5",
        sm: "h-7 min-w-7 px-1.5",
      },
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent shadow-xs hover:bg-secondary hover:text-secondary-foreground",
      },
    },
  },
);

const dropdownArrowVariants = cva(
  cn(
    "inline-flex items-center justify-center rounded-r-md font-medium text-foreground text-sm transition-colors disabled:pointer-events-none disabled:opacity-50",
  ),
  {
    defaultVariants: {
      size: "sm",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-7 w-5",
        lg: "h-8 w-6",
        sm: "h-7 w-4",
      },
      variant: {
        default:
          "bg-transparent hover:bg-muted hover:text-muted-foreground aria-checked:bg-secondary aria-checked:text-secondary-foreground",
        outline:
          "border border-input border-l-0 bg-transparent hover:bg-secondary hover:text-secondary-foreground",
      },
    },
  },
);

type ToolbarButtonProps = {
  isDropdown?: boolean;
  pressed?: boolean;
} & Omit<React.ComponentPropsWithoutRef<typeof ToolbarToggleItem>, "asChild" | "value"> &
  VariantProps<typeof toolbarButtonVariants>;

export const ToolbarButton = withTooltip(function ToolbarButton({
  children,
  className,
  isDropdown,
  pressed,
  size = "sm",
  variant,
  ...props
}: ToolbarButtonProps) {
  return typeof pressed === "boolean" ? (
    <ToolbarToggleGroup
      value="single"
      type="single"
      {...(props.disabled !== undefined ? { disabled: props.disabled } : {})}
    >
      <ToolbarToggleItem
        className={cn(
          toolbarButtonVariants({ size, variant }),
          isDropdown && "justify-between gap-1 pr-1",
          className,
        )}
        value={pressed ? "single" : ""}
        {...props}
      >
        {isDropdown ? (
          <>
            <div className="flex flex-1 items-center gap-2 whitespace-nowrap">{children}</div>
            <div>
              <ChevronDown className="size-3.5 text-muted-foreground" data-icon />
            </div>
          </>
        ) : (
          children
        )}
      </ToolbarToggleItem>
    </ToolbarToggleGroup>
  ) : (
    <ToolbarPrimitive.Button
      className={cn(toolbarButtonVariants({ size, variant }), isDropdown && "pr-1", className)}
      {...props}
    >
      {children}
    </ToolbarPrimitive.Button>
  );
});

export function ToolbarSplitButton({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ToolbarButton>) {
  return (
    <ToolbarButton
      className={cn("group flex gap-0 px-0 hover:bg-transparent", className)}
      {...props}
    />
  );
}

type ToolbarSplitButtonPrimaryProps = Omit<
  React.ComponentPropsWithoutRef<typeof ToolbarToggleItem>,
  "value"
> &
  VariantProps<typeof toolbarButtonVariants>;

export function ToolbarSplitButtonPrimary({
  children,
  className,
  size = "sm",
  variant,
  ...props
}: ToolbarSplitButtonPrimaryProps) {
  return (
    <span
      className={cn(
        toolbarButtonVariants({ size, variant }),
        "rounded-r-none",
        "group-data-[pressed=true]:bg-secondary group-data-[pressed=true]:text-secondary-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function ToolbarSplitButtonSecondary({
  className,
  size,
  variant,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & VariantProps<typeof dropdownArrowVariants>) {
  return (
    <span
      className={cn(
        dropdownArrowVariants({ size, variant }),
        "group-data-[pressed=true]:bg-secondary group-data-[pressed=true]:text-secondary-foreground",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      role="button"
      {...props}
    >
      <ChevronDown className="size-3.5 text-muted-foreground" data-icon />
    </span>
  );
}

export function ToolbarToggleItem({
  className,
  size = "sm",
  variant,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.ToggleItem> &
  VariantProps<typeof toolbarButtonVariants>) {
  return (
    <ToolbarPrimitive.ToggleItem
      className={cn(toolbarButtonVariants({ size, variant }), className)}
      {...props}
    />
  );
}

export function ToolbarGroup({ children, className }: React.ComponentProps<"div">) {
  return (
    <div className={cn("group/toolbar-group", "relative hidden has-[button]:flex", className)}>
      <div className="flex items-center">{children}</div>

      <div className="group-last/toolbar-group:hidden! mx-1.5 py-0.5">
        <Separator orientation="vertical" />
      </div>
    </div>
  );
}

type TooltipProps<T extends React.ElementType> = {
  tooltip?: React.ReactNode;
  tooltipContentProps?: Omit<React.ComponentPropsWithoutRef<typeof TooltipContent>, "children">;
  tooltipProps?: Omit<React.ComponentPropsWithoutRef<typeof Tooltip>, "children">;
  tooltipTriggerProps?: React.ComponentPropsWithoutRef<typeof TooltipTrigger>;
} & React.ComponentProps<T>;

function withTooltip<T extends React.ElementType>(Component: T) {
  return function ExtendComponent({
    tooltip,
    tooltipContentProps,
    tooltipProps,
    tooltipTriggerProps,
    ...props
  }: TooltipProps<T>) {
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
      setMounted(true);
    }, []);

    const component = <Component {...(props as React.ComponentProps<T>)} />;

    if (tooltip && mounted) {
      return (
        <Tooltip {...tooltipProps}>
          <TooltipTrigger asChild {...tooltipTriggerProps}>
            {component}
          </TooltipTrigger>

          <TooltipContent {...tooltipContentProps}>{tooltip}</TooltipContent>
        </Tooltip>
      );
    }

    return component;
  };
}

export function ToolbarMenuGroup({
  children,
  className,
  label,
  ...props
}: React.ComponentProps<typeof DropdownMenuRadioGroup> & { label?: string }) {
  return (
    <>
      <DropdownMenuSeparator
        className={cn(
          "hidden",
          "mb-0 shrink-0 peer-has-[[role=menuitem]]/menu-group:block peer-has-[[role=menuitemradio]]/menu-group:block peer-has-[[role=option]]/menu-group:block",
        )}
      />

      <DropdownMenuRadioGroup
        {...props}
        className={cn(
          "hidden",
          "peer/menu-group group/menu-group my-1.5 has-[[role=menuitem]]:block has-[[role=menuitemradio]]:block has-[[role=option]]:block",
          className,
        )}
      >
        {label && (
          <DropdownMenuLabel className="px-2 py-1 text-ui-micro font-medium tracking-[0.08em] text-muted-foreground/70 uppercase select-none">
            {label}
          </DropdownMenuLabel>
        )}
        {children}
      </DropdownMenuRadioGroup>
    </>
  );
}
