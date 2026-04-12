import { forwardRef, useEffect, type ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "@base-ui-components/react/dialog";
import { cn } from "../../lib/utils";
import { useSettingsStore } from "../../store/settings-store";
import { releaseNativeFocus } from "../../lib/native-pane-focus";

// ── Root ──────────────────────────────────────────────────────────────────────

type DialogProps = ComponentProps<typeof DialogPrimitive.Root>;

function Dialog(props: DialogProps) {
  const pushOverlay = useSettingsStore((s) => s.pushOverlay);
  const popOverlay = useSettingsStore((s) => s.popOverlay);

  // Hide native views only while the dialog is actually open
  useEffect(() => {
    if (!props.open) return;
    pushOverlay();
    releaseNativeFocus();
    return () => {
      popOverlay();
    };
  }, [props.open, pushOverlay, popOverlay]);

  return <DialogPrimitive.Root {...props} />;
}

// ── Trigger ───────────────────────────────────────────────────────────────────

type DialogTriggerProps = ComponentProps<typeof DialogPrimitive.Trigger>;

const DialogTrigger = forwardRef<HTMLButtonElement, DialogTriggerProps>((props, ref) => (
  <DialogPrimitive.Trigger ref={ref} {...props} />
));
DialogTrigger.displayName = "DialogTrigger";

// ── Close ─────────────────────────────────────────────────────────────────────

type DialogCloseProps = ComponentProps<typeof DialogPrimitive.Close>;

const DialogClose = forwardRef<HTMLButtonElement, DialogCloseProps>((props, ref) => (
  <DialogPrimitive.Close ref={ref} {...props} />
));
DialogClose.displayName = "DialogClose";

// ── Content — floating overlay (blur allowed) ────────────────────────────────

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Popup> {
  /** Hide the default close button */
  hideClose?: boolean;
}

const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, hideClose, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-black/40",
          "transition-all duration-200",
          "data-[starting-style]:opacity-0",
          "data-[ending-style]:opacity-0",
        )}
      />
      <DialogPrimitive.Popup
        ref={ref}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          "w-full max-w-md rounded-xl border border-border bg-popover p-6",
          "shadow-[var(--overlay-shadow)]",
          "text-foreground",
          "transition-all duration-200",
          "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
          "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className={cn(
              "absolute top-3.5 right-3.5 inline-flex h-6 w-6 items-center justify-center rounded-md",
              "text-muted-foreground hover:text-foreground hover:bg-surface-hover",
              "transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" />
            </svg>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  ),
);
DialogContent.displayName = "DialogContent";

// ── Title ─────────────────────────────────────────────────────────────────────

type DialogTitleProps = ComponentProps<typeof DialogPrimitive.Title>;

const DialogTitle = forwardRef<HTMLHeadingElement, DialogTitleProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    />
  ),
);
DialogTitle.displayName = "DialogTitle";

// ── Description ───────────────────────────────────────────────────────────────

type DialogDescriptionProps = ComponentProps<typeof DialogPrimitive.Description>;

const DialogDescription = forwardRef<HTMLParagraphElement, DialogDescriptionProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("mt-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  ),
);
DialogDescription.displayName = "DialogDescription";

// ── Exports ───────────────────────────────────────────────────────────────────

export { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose };
export type { DialogProps, DialogContentProps };
