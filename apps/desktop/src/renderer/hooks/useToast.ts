import { toast as sonnerToast } from "sonner";

type ToastVariant = "default" | "success" | "error" | "warning" | "info";

/**
 * Single entry point for app-wide toasts. Backed by `sonner`. The renderer
 * mounts a `<Toaster>` in App.tsx — calling `addToast` from anywhere queues
 * a notification.
 */
export function addToast(message: string, variant: ToastVariant = "default"): void {
  switch (variant) {
    case "success":
      sonnerToast.success(message);
      return;
    case "error":
      sonnerToast.error(message);
      return;
    case "warning":
      sonnerToast.warning(message);
      return;
    case "info":
      sonnerToast.info(message);
      return;
    default:
      sonnerToast(message);
  }
}
