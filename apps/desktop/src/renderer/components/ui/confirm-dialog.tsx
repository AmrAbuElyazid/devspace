import { useEffect } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSettingsStore } from "@/store/settings-store";
import { releaseNativeFocus } from "@/lib/native-pane-focus";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** Visual emphasis of the confirm action. */
  variant?: "default" | "destructive";
}

/**
 * Standard "are you sure?" dialog used for destructive actions across the
 * app. Wraps shadcn's AlertDialog with the surface state plumbing required
 * by Devspace (push/pop overlay so native panes hide; release native pane
 * focus so the dialog actually receives keyboard input).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  variant = "default",
}: ConfirmDialogProps) {
  const pushOverlay = useSettingsStore((s) => s.pushOverlay);
  const popOverlay = useSettingsStore((s) => s.popOverlay);

  useEffect(() => {
    if (!open) return;
    pushOverlay();
    releaseNativeFocus();
    return () => {
      popOverlay();
    };
  }, [open, pushOverlay, popOverlay]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
